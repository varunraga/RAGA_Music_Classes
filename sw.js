// RAGA Music Classes — service worker
// Bump this version string on every deploy so the app shell actually refreshes.
const CACHE_NAME = 'raga-shell-v1';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-192-maskable.png',
  './icon-512-maskable.png',
  './apple-touch-icon.png',
  './favicon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  // Deliberately NOT calling skipWaiting() here — the new version sits ready-but-idle
  // until the person actually taps "Update" in the app. No silent takeover mid-session.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// The update banner (in index.html) posts this once the person taps "Update now".
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // never intercept cross-origin (Google sign-in, ExcelJS CDN, etc.)

  const isAppDocument = event.request.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/');

  if (isAppDocument) {
    // Network-first for the app itself: always try to get the latest version when online,
    // and only fall back to the cached copy when there's genuinely no connectivity.
    event.respondWith(
      fetch(event.request)
        .then(async (res) => {
          const compareClone = res.clone();
          const cacheClone = res.clone();
          const cache = await caches.open(CACHE_NAME);
          const previous = await cache.match(event.request);
          const [newText, oldText] = await Promise.all([
            compareClone.text(),
            previous ? previous.text() : Promise.resolve(null)
          ]);
          await cache.put(event.request, cacheClone);
          // The service worker file itself hasn't changed here — only the app's own content
          // has. The browser's native update mechanism only watches sw.js byte-for-byte, so
          // without this explicit check, replacing index.html alone would never be noticed.
          if (oldText !== null && newText !== oldText) {
            const clientsList = await self.clients.matchAll({ type: 'window' });
            clientsList.forEach((client) => client.postMessage({ type: 'CONTENT_UPDATED' }));
          }
          return res;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // Cache-first for the static shell pieces (icons, manifest) — they rarely change,
  // and serving them instantly from cache is what makes the app feel fast on reopen.
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
