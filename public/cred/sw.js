/**
 * Service worker de las credenciales.
 *
 * Guarda la credencial en el celular para que se abra aunque no haya internet:
 * la puerta controla el acceso, no la red del trabajador.
 *
 * Estrategia, y por que NO es "cache primero" para todo:
 *
 *  - /cred/CODIGO -> RED PRIMERO, y si no hay red, lo guardado.
 *  - iconos, manifiesto, este mismo archivo -> CACHE PRIMERO.
 *
 * Antes era cache primero para todo. Eso hacia que el celular guardara para
 * siempre la primera credencial que abrio, con el diseno de ese dia: despues de
 * cambiar el diseno, editar una credencial o anularla, el telefono seguia
 * mostrando la version vieja, sin forma de actualizarla sola. Para un icono no
 * pasa nada, pero para una credencial si: es informacion que cambia.
 *
 * Con red primero, cuando hay internet se ve siempre la version al dia, y sin
 * internet sigue apareciendo la ultima que se guardo. Las dos cosas.
 *
 * IMPORTANTE: al cambiar el diseno hay que subir el numero de CACHE (v1, v2...).
 * Es lo que hace que el activate borre lo guardado del telefono y se vuelva a
 * bajar todo. Sin eso, los celulares que ya tenian instalada la credencial
 * seguirian con lo viejo.
 */

const CACHE = 'credencial-v2'
const PRECALCACHE = [
  '/cred/icono-192.png',
  '/cred/icono-512.png',
  '/cred/icono-180.png',
  '/cred/icono-maskable.png',
]

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECALCACHE))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nombres) =>
        Promise.all(nombres.filter((n) => n !== CACHE).map((n) => caches.delete(n)))
      )
      .then(() => self.clients.claim())
  )
})

/** Si una URL de /cred/ es un archivo que no cambia. */
function esEstatico(url) {
  return (
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.json') || // el manifiesto
    url.pathname.endsWith('/sw.js')
  )
}

self.addEventListener('fetch', (evento) => {
  const url = new URL(evento.request.url)

  // Solo nos interesa lo nuestro
  if (url.origin !== self.location.origin) return
  if (evento.request.method !== 'GET') return
  if (!url.pathname.startsWith('/cred/')) return

  evento.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const guardada = await cache.match(evento.request)

      // Archivos que no cambian: cache primero, ni se vuelve a pedir.
      if (esEstatico(url)) {
        if (guardada) return guardada
        const respuesta = await fetch(evento.request)
        if (respuesta.ok) cache.put(evento.request, respuesta.clone())
        return respuesta
      }

      // La credencial: primero la red, para que salga al dia.
      try {
        const respuesta = await fetch(evento.request)
        if (respuesta.ok) cache.put(evento.request, respuesta.clone())
        return respuesta
      } catch {
        // Sin red: lo ultimo que se guardo.
        if (guardada) return guardada
        return new Response(
          '<!doctype html><meta charset="utf-8">' +
            '<meta name="viewport" content="width=device-width,initial-scale=1">' +
            '<body style="background:#050508;color:#9ca3af;font:16px system-ui;' +
            'display:grid;place-items:center;height:100vh;margin:0;text-align:center">' +
            '<div><div style="font-size:40px">📡</div>' +
            '<p>Sin conexion a internet.</p>' +
            '<p style="font-size:13px;color:#6b7280">La credencial se actualiza sola ' +
            'cuando vuelve la red.</p></div>',
          { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        )
      }
    })
  )
})