// =====================================================
//  Burger Oila — Service Worker (oflayn ishlash uchun)
//  Kodni o'zgartirganingizda VERSION raqamini oshiring.
// =====================================================
const VERSION = 'bo-v1';
const FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png'
];

// O'rnatish: barcha fayllarni keshga olamiz
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

// Faollashish: eski versiya keshlarini o'chiramiz
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// So'rovlar: avval keshdan beramiz (tez va internetsiz ishlaydi),
// orqa fonda yangisini yuklab keshni yangilaymiz.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

  e.respondWith(
    caches.open(VERSION).then(async cache => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const fresh = fetch(req)
        .then(res => { if (res.ok) cache.put(req, res.clone()); return res; })
        .catch(() => null);
      if (cached) { e.waitUntil(fresh); return cached; }
      const res = await fresh;
      if (res) return res;
      // Internet yo'q va keshda ham yo'q: sahifa so'ralgan bo'lsa index.html'ni beramiz
      if (req.mode === 'navigate') return cache.match('./index.html');
      return new Response('', { status: 504 });
    })
  );
});