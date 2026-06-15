// Omni.Ai Service Worker — otomatik güncellenir
const CACHE = 'omni-ai-v7';
const ASSETS = [
  '/loading.html',
  '/login.html',
  '/index.html',
  '/omni-config.js',
  '/icon-192.png',
  '/icon-512.png',
  '/manifest.json',
];

self.addEventListener('install', (e) => {
  // Yeni sürüm hazır olur olmaz devral — bekleme yok
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS).catch(() => {})));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // API ve GET olmayan istekleri asla yakalama
  if (url.pathname.startsWith('/api/') || e.request.method !== 'GET') {
    return;
  }
  // HER ZAMAN önce ağ; başarısızsa (offline) cache'e düş
  e.respondWith(
    fetch(e.request)
      .then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return resp;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('/index.html')))
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
