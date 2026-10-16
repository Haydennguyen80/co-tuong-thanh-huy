// Service worker: lưu app để mở được cả khi không có mạng (trừ phần đánh online).
const VERSION = 'co-tien-v1.4.0';
const CORE = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/app.js', './js/xiangqi.js', './js/engine.js', './js/engine-worker.js', './js/engine-client.js',
  './js/notation.js', './js/game.js', './js/coach.js', './js/board.js', './js/clock.js', './js/storage.js',
  './js/sound.js', './js/scene.js', './js/zen-music.js', './js/install.js', './js/vendor/qrcode.mjs', './js/online.js', './js/puzzles.js', './js/vendor/peerjs.min.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/favicon-64.png',
  './icons/logo-ngang-toi.png', './icons/logo-ngang-sang.png', './icons/logo-symbol.svg', './icons/thanh-huy-logo-160.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Phông chữ Google: dùng bản đã lưu, cập nhật ngầm
  if (url.hostname.endsWith('googleapis.com') || url.hostname.endsWith('gstatic.com')) {
    e.respondWith(caches.open(VERSION).then(async (c) => {
      const hit = await c.match(req);
      const net = fetch(req).then((r) => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  // Trang chính: ưu tiên mạng để luôn có bản mới, mất mạng thì dùng bản lưu
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put('./index.html', copy)); return r; })
      .catch(() => caches.match('./index.html')));
    return;
  }
  // Tệp của app: trả bản đã lưu ngay, đồng thời tải bản mới về cho lần mở sau
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => {
    const net = fetch(req).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return r;
    });
    if (hit) { e.waitUntil(net.catch(() => null)); return hit; }
    return net;
  }));
});
