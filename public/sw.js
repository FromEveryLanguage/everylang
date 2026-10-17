// Simple service worker for PWA functionality
const CACHE_NAME = 'live-notes-v1';
const urlsToCache = [
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        return cache.addAll(urlsToCache);
      })
  );
});


// Navigations are deliberately NOT intercepted. An earlier version answered them
// network-first with `caches.match('/')` as the fallback, but '/' is never cached (see the
// install list above), so a single failed fetch made respondWith() resolve to undefined —
// WebKit's "Returned response is null" — and the home-screen app opened to a blank page
// with no way to reload. Left alone, the browser shows its own error page with a Retry.
// Offline support would be pointless anyway: nothing under /assets/ is ever cached here,
// so a cached index.html would only reference bundles that need the network.
self.addEventListener('fetch', function(event) {
  if (event.request.mode === 'navigate') {
    return;
  }
  event.respondWith(
    caches.match(event.request)
      .then(function(response) {
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});

// Update service worker
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});