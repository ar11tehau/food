// Service worker : l'appli s'ouvre sans réseau avec ce qui a déjà été consulté.
// Interface : réseau d'abord (une mise à jour s'affiche tout de suite), cache si hors ligne.
// API : les données Ciqual ne changent qu'au déploiement → réponse du cache tout de suite, rafraîchie en arrière-plan.
const CACHE = 'food-v5';
const SHELL = ['/', '/style.css', '/app.js', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/api/meta'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname === '/api/health') return;
  const key = req.mode === 'navigate' ? '/' : req;
  const reseau = fetch(req, { cache: 'no-cache' }).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(key, copy)); }
    return res;
  });
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(caches.match(key).then((hit) => {
      if (hit) { e.waitUntil(reseau.catch(() => {})); return hit; }
      return reseau.catch(() => Response.json({ error: 'Hors ligne' }, { status: 503 }));
    }));
    return;
  }
  e.respondWith(reseau.catch(() => caches.match(key).then((r) => r || Response.error())));
});
