const CACHE_NAME = 'raga-v20260730';
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-192-maskable.png',
  './icon-512-maskable.png',
  // CDN dependencies — cached so the app works offline after the first load
  'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.0/lame.min.js',
  'https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js',
  'https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSansMono.ttf',
  'https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSansMono-Bold.ttf'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      // Cache each resource independently instead of cache.addAll(), which fails the ENTIRE
      // install if even one URL fails — a real risk here since several of these are third-party
      // CDN resources (network hiccup, temporary CDN outage, etc.). Promise.allSettled means one
      // failing resource just means that one resource isn't cached yet; everything else still is,
      // and the app still installs and works.
      const results = await Promise.allSettled(PRECACHE_URLS.map(url => cache.add(url)));
      const failed = results.filter(r => r.status === 'rejected');
      if (failed.length) {
        console.warn('Service worker: ' + failed.length + ' of ' + PRECACHE_URLS.length + ' precache resource(s) failed — continuing anyway, they\'ll be cached on first successful fetch instead');
      }
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Google APIs (Drive, OAuth) — always network, never cache
  if (url.hostname.includes('googleapis.com') || url.hostname.includes('google.com')) return;

  // App shell (index.html, manifest, icons) — network-first, fall back to cache
  if (url.origin === location.origin) {
    event.respondWith(
      fetch(event.request).then(resp => {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return resp;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // CDN resources — cache-first (they're versioned URLs, content never changes)
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(resp => {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return resp;
      });
    })
  );
});
