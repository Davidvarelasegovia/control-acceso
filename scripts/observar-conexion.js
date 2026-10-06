/**
 * Observa el indicador de conexion mientras la API se cae y vuelve.
 * Se usa desde la consola del navegador.
 */
window.__observarConexion = function (milisegundos = 22000) {
  return new Promise((res) => {
    const t0 = Date.now()
    const cambios = []
    const iv = setInterval(() => {
      const t = document.body.innerText
      const estado = /OFFLINE/i.test(t) ? 'OFFLINE' : 'ONLINE'
      const aviso = t.indexOf('no responde') >= 0
      const previo = cambios[cambios.length - 1]
      if (!previo || previo.estado !== estado) {
        cambios.push({ ms: Date.now() - t0, estado, aviso })
      }
      if (Date.now() - t0 > milisegundos) {
        clearInterval(iv)
        const t2 = document.body.innerText
        res({
          cambios: cambios.map((c) => `${c.ms}ms ${c.estado}`).join(', '),
          final: /OFFLINE/i.test(t2) ? 'OFFLINE' : 'ONLINE',
          aviso: t2.indexOf('no responde') >= 0 ? 'SI' : 'no',
          comando: t2.indexOf('dev:full') >= 0 ? 'SI' : 'no',
        })
      }
    }, 200)
  })
}
'observar listo'