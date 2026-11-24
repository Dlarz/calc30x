// Offline support: answer from the cache at once, refresh the cache from the network in the
// background (stale-while-revalidate), so updates arrive on the next start.
const CACHE = 'calc30x';
const FILES = ['./', 'index.html', 'engine.js', 'ui.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const net = caches.open(CACHE).then(c => fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }));
  e.waitUntil(net.catch(() => {}));
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || net));
});
