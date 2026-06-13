// OMNI AGENT Service Worker
const CACHE = 'omni-agent-v1';
const ASSETS = [
  '/loading.html',
  '/login.html',
  '/index.html',
  '/icon-192.png',
  '/icon-512.png',
  '/manifest.json',
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS).catch(() => {})));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // API isteklerini asla cache'leme — her zaman ağdan
  if (url.pathname.startsWith('/api/') || e.request.method !== 'GET') {
    return;
  }
  // Statik dosyalar: önce ağ, başarısızsa cache (offline)
  e.respondWith(
    fetch(e.request)
      .then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return resp;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('/loading.html')))
  );
});
