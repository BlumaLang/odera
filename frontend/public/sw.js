// Staytup Service Worker for PWA
const CACHE_NAME = 'staytup-pwa-v2';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Never intercept non-GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // NEVER intercept cross-origin API calls, streaming servers, Render, Google video, or YouTube
  if (
    url.origin !== self.location.origin ||
    url.hostname.includes('onrender.com') ||
    url.hostname.includes('googlevideo.com') ||
    url.hostname.includes('youtube.com') ||
    url.pathname.startsWith('/stream') ||
    url.pathname.startsWith('/api') ||
    url.pathname.includes('/health')
  ) {
    return;
  }

  // Only handle same-origin static assets
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        return new Response('', { status: 408, statusText: 'Request timed out' });
      })
  );
});
