/* Service worker: permite instalar o site como app e abrir o "casco" sem internet.
   Os dados NÃO são guardados aqui: chamadas ao Supabase (outro domínio) passam direto pela rede. */
const CACHE = 'docctrl-shell-v5';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'js/config.js', 'js/merge.js', 'js/store.js', 'js/ui.js', 'js/export.js', 'js/pages.js', 'js/cloud.js', 'js/app.js', 'js/pwa.js',
  'js/vendor/exceljs.min.js', 'js/vendor/supabase.js',
  'img/favicon.svg', 'img/favicon.ico', 'img/favicon-32.png', 'img/apple-touch-icon.png', 'img/icon-192.png', 'img/icon-512.png', 'img/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Rede primeiro (sempre a versão mais nova do site); sem internet, usa a cópia guardada.
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(req, { cache: 'no-cache' }).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
