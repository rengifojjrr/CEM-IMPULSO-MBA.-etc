const CACHE = 'forestal-shell-v2';
const SHELL = ['./registrador.html', './supervisor.html', './administrador.html', './arbol.html', './manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Cascaron estatico: red primero (para que cualquier actualizacion se vea de
// inmediato), y solo se usa la copia en cache si no hay conexion. Las llamadas
// a Supabase (datos, fotos, funciones) nunca pasan por aqui: siempre van a la red.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE).then((c) => c.put(event.request, resClone));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
