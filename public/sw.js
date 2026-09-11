// Staytup Service Worker for PWA
const CACHE_NAME = 'staytup-pwa-v38';

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
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

// Activate: purge stale caches and claim all clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
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
          const networkRes = await fetch(event.request);
          if (networkRes && networkRes.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            cache.put('/index.html', networkRes.clone()).catch(() => {});
            return networkRes;
          }
        } catch (_) {
          // Network failed - try index.html shell
        }

        try {
          const appShell = await fetch('/index.html');
          if (appShell && appShell.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            cache.put('/index.html', appShell.clone()).catch(() => {});
            return appShell;
          }
        } catch (_) {}

        try {
          const cached = (await caches.match('/index.html')) || (await caches.match('/'));
          if (cached) {
            return cached;
          }
        } catch (_) {}

        // Ultimate safe fallback: always returns a valid Response object
        return new Response(
          '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Staytup</title></head><body style="background:#000;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><div><h2>Staytup</h2><p>Loading application...</p><script>window.location.reload();</script></div></body></html>',
          { status: 200, headers: { 'Content-Type': 'text/html' } }
        );
      })()
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
        const cached = await caches.match(event.request);
        if (cached) return cached;
        return new Response('', { status: 404, statusText: 'Not Found' });
      })()
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
    })()
  );
});
