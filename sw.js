// يخزّن واجهة التطبيق ليفتح فوراً حتى مع ضعف الشبكة. البث نفسه لا يُخزَّن.
const VERSION = 'ar-radio-v1';
const SHELL = ['./', 'index.html', 'app.css', 'app.js', 'stations.json', 'vendor/hls.min.js',
  'manifest.webmanifest', 'icons/icon-64.png', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;   // البث والأعلام: من الشبكة مباشرة
  // الشبكة أولاً (لتصل التحديثات)، ثم النسخة المخزّنة عند انقطاع الاتصال
  e.respondWith(fetch(e.request).then(r => {
    const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return r;
  }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});
