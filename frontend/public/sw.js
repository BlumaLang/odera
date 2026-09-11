// Staytup Service Worker for PWA
const CACHE_NAME = 'staytup-pwa-v35';

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
];

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

// Activate: purge stale caches
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

  // Handle SPA navigation requests (e.g. /, /home, /search, /friends, /library)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          // Fetch /index.html from network (SPA app shell)
          const networkRes = await fetch('/index.html');
          if (networkRes && networkRes.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            cache.put('/index.html', networkRes.clone()).catch(() => {});
            return networkRes;
          }
        } catch (_) {
          // Network failed or offline - fall back to cache
        }

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
        return networkRes;
      } catch (err) {
        return new Response('', { status: 404, statusText: 'Not Found' });
      }
    })()
  );
});
