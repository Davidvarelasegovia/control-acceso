// Service worker del Control de Acceso.
// Estrategia: NETWORK-FIRST para navegacion (HTML) y APP SHELL, para que una
// version nueva siempre se sirva al instante. CACHE-FIRST solo para recursos
// estaticos pesados (imagenes, fuentes), que no cambian de nombre.
const CACHE_NAME = 'control-acceso-v2';

const PRECACHE = ['/', '/index.html', '/manifest.json'];
const STATIC_CACHE = 'control-acceso-estatico-v2';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name !== CACHE_NAME && name !== STATIC_CACHE)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navegacion -> siempre red primero, cache como respaldo sin conexion
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/index.html').then((cached) => cached || caches.match('/')))
    );
    return;
  }

  // Recursos estaticos con hash en el nombre -> cache primero
  const isImmutableAsset =
    /\.(?:js|css|woff2?|ttf|svg|png|jpe?g|webp|ico)$/i.test(url.pathname) &&
    url.pathname.startsWith('/assets/');

  if (isImmutableAsset) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            return response;
          })
      )
    );
    return;
  }

  // Resto (JSON, manifest, etc.) -> red primero
  event.respondWith(
    fetch(request).catch(() => caches.match(request).then((cached) => cached || Response.error()))
  );
});
