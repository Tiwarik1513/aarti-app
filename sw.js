/* आरती संग्रह - offline service worker. Precaches the whole app on install and
   serves cache-first, so the installed app works fully without network. */
const CACHE = 'aarti-pwa-v2';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './aartis.json',
  './manifest.webmanifest',
  './shankh.mp3',
  './qr.png',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
        }
        return res;
      }).catch((err) => {
        if (request.mode === 'navigate') {
          return caches.match('./index.html').then((shell) => shell || Promise.reject(err));
        }
        throw err;
      });
    })
  );
});
