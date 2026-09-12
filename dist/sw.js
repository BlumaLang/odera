// Staytup Service Worker for PWA
const CACHE_NAME = 'staytup-pwa-v66';

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/manifest.webmanifest',
  '/favicon.png',
  '/favicon.ico',
  '/staytup_logo.png'
];

// Handle instant update message from clients
self.addEventListener('message', (event) => {
  if (event.data && (event.data.type === 'SKIP_WAITING' || event.data === 'skipWaiting')) {
    self.skipWaiting();
  }
});

// Install: precache core app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[SW] Pre-caching non-fatal warning:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate: purge stale caches while preserving offline audio, and claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && !k.includes('offline-audio'))
          .map((k) => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: smart network-first for SPA routes, cache-first for static assets
self.addEventListener('fetch', (event) => {
  // Never intercept non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  let url;
  try {
    url = new URL(event.request.url);
  } catch (_) {
    return;
  }

  // NEVER intercept cross-origin requests
  if (url.origin !== self.location.origin) {
    return;
  }

  const p = url.pathname.toLowerCase();

  // NEVER intercept backend API calls or audio streaming
  if (p.startsWith('/api') || p.startsWith('/stream') || p.includes('/health')) {
    return; // Pass through to server directly
  }

  // Detect HTML / SPA navigation requests (e.g. /, /home, /search, /friends, /library)
  const isNav =
    event.request.mode === 'navigate' ||
    event.request.destination === 'document' ||
    (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html'));

  if (isNav) {
    event.respondWith(
      (async () => {
        try {
          // 1. Network-first with 2.5s timeout for navigation to ensure fresh index.html
          try {
            const fetchPromise = fetch(event.request);
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Network timeout')), 2500)
            );
            const networkRes = await Promise.race([fetchPromise, timeoutPromise]);
            if (networkRes && (networkRes.status === 200 || networkRes.type === 'opaqueredirect')) {
              try {
                const cache = await caches.open(CACHE_NAME);
                await cache.put('/index.html', networkRes.clone());
              } catch (_) {}
              return networkRes;
            }
          } catch (_) {
            // Network failed or timed out - fall back to cached shell
          }

          // 2. Fetch /index.html directly from network if possible
          try {
            const appShell = await fetch('/index.html');
            if (appShell && (appShell.status === 200 || appShell.type === 'opaqueredirect')) {
              try {
                const cache = await caches.open(CACHE_NAME);
                await cache.put('/index.html', appShell.clone());
              } catch (_) {}
              return appShell;
            }
          } catch (_) {}

          // 3. Fall back to cached app shell
          try {
            const cached = (await caches.match('/index.html')) || (await caches.match('/'));
            if (cached) {
              return cached;
            }
          } catch (_) {}

          // 4. Safe offline fallback: never auto-reload in a loop
          return new Response(
            '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Staytup - Offline</title></head><body style="background:#000;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;"><div style="padding:20px;"><h2>Staytup</h2><p style="color:#aaa;margin-bottom:20px;">Connection unavailable. Please check your network.</p><button onclick="window.location.reload()" style="background:#1DB954;color:#000;border:none;padding:12px 24px;border-radius:24px;font-weight:700;cursor:pointer;font-size:15px;">Retry Connection</button></div></body></html>',
            { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        } catch (_) {
          return new Response(
            '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Staytup</title></head><body style="background:#000;color:#fff;"><p>Loading...</p><script>window.location.reload();</script></body></html>',
            { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        }
      })().catch(() => new Response('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Staytup</title></head><body style="background:#000;color:#fff;"><script>window.location.reload();</script></body></html>', { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }))
    );
    return;
  }

  // Only handle static asset files
  const isStatic = /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|webp|json|map)(\?.*)?$/i.test(p);
  if (!isStatic) {
    return;
  }

  // Application JS bundles: network-first to ensure instant deployment updates
  if (p.includes('/_expo/static/js/web/index-')) {
    event.respondWith(
      (async () => {
        try {
          const networkRes = await fetch(event.request);
          if (networkRes && networkRes.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(event.request, networkRes.clone()).catch(() => {});
            return networkRes;
          }
        } catch (_) {}
        try {
          const cached = await caches.match(event.request);
          if (cached) return cached;
        } catch (_) {}
        return new Response('', { status: 404, statusText: 'Not Found' });
      })().catch(() => new Response('', { status: 404, statusText: 'Not Found' }))
    );
    return;
  }

  event.respondWith(
    (async () => {
      try {
        const cached = await caches.match(event.request);
        if (cached) {
          // Revalidate in background
          fetch(event.request).then(async (networkRes) => {
            if (networkRes && networkRes.status === 200) {
              const cache = await caches.open(CACHE_NAME);
              cache.put(event.request, networkRes.clone()).catch(() => {});
            }
          }).catch(() => {});
          return cached;
        }

        const networkRes = await fetch(event.request);
        if (networkRes && networkRes.status === 200) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, networkRes.clone()).catch(() => {});
        }
        return networkRes || new Response('', { status: 404, statusText: 'Not Found' });
      } catch (err) {
        return new Response('', { status: 404, statusText: 'Not Found' });
      }
    })().catch(() => new Response('', { status: 404, statusText: 'Not Found' }))
  );
});
