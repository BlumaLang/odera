// Staytup Service Worker for PWA
const CACHE_NAME = 'staytup-pwa-v5';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Never intercept non-GET requests
  if (event.request.method !== 'GET') return;

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

  // NEVER intercept API calls, dynamic routes, home feeds, or streaming
  if (
    p.startsWith('/api') ||
    p.startsWith('/stream') ||
    p.startsWith('/home') ||
    p.startsWith('/search') ||
    p.startsWith('/suggest') ||
    p.startsWith('/lyrics') ||
    p.startsWith('/favorites') ||
    p.startsWith('/personalized') ||
    p.startsWith('/playlists') ||
    p.startsWith('/qr-login') ||
    p.startsWith('/user-qr') ||
    p.startsWith('/referral') ||
    p.startsWith('/artists') ||
    p.startsWith('/play-event') ||
    p.startsWith('/favorite') ||
    p.startsWith('/track-info') ||
    p.includes('/health')
  ) {
    return; // Pass through to browser natively without Service Worker interception
  }

  // Handle SPA navigation requests
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', clone)).catch(() => {});
          }
          return response;
        })
        .catch(async () => {
          try {
            const cached = (await caches.match('/index.html')) || (await caches.match('/'));
            if (cached) return cached;
          } catch (_) {}
          return new Response(
            '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Staytup</title></head><body style="background:#000;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><div><h2>Staytup is offline</h2><p>Please check your connection and refresh.</p></div></body></html>',
            { status: 200, headers: { 'Content-Type': 'text/html' } }
          );
        })
    );
    return;
  }

  // Only handle static asset files
  const isStatic = /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|webp|json|map)(\?.*)?$/i.test(p);
  if (!isStatic) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        fetch(event.request).then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
          }
        }).catch(() => {});
        return cached;
      }
      return fetch(event.request).then((networkRes) => {
        if (networkRes && networkRes.status === 200) {
          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
        }
        return networkRes;
      }).catch(() => {
        return new Response('', { status: 404, statusText: 'Not Found' });
      });
    }).catch(() => {
      return new Response('', { status: 404, statusText: 'Not Found' });
    })
  );
});
