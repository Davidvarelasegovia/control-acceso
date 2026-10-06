import { ANCHO, credencialSvg, altoDe, PAPEL_POR_OMISION } from '../../shared/credencialSvg.js'

/**
 * Convierte la credencial en un PNG de alta resolucion.
 *
 * **No dibuja nada**: toma el mismo SVG que muestra el panel y el mismo que
 * imprime la pagina del celular, y solo lo convierte en imagen. Por eso no hay
 * forma de que lo que se ve en pantalla y lo que sale de la impresora sean
 * distintos: son el mismo dibujo.
 *
 * El SVG se arma a la medida final que se pide (1200 px de ancho por omision),
 * no a una medida grande que despues se achique. Asi el texto sale nitido a
 * cualquier resolucion, en vez de perder detalle al reducir.
 *
 * Sirve para una prensa de sublimacion o una imprenta: necesita miles de
 * pixeles y bordes limpios, no una foto de la pantalla.
 */

/** Texto a data URL, para meter el SVG en un `<img>`. */
const aDataUrl = (svg) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}`

/** Carga un data URL y espera a que la imagen este lista. */
function cargarImagen(src) {
  return new Promise((resolver, rechazar) => {
    const img = new Image()
    img.onload = () => resolver(img)
    img.onerror = () => rechazar(new Error('No se pudo dibujar la credencial'))
    img.src = src
  })
}

/**
 * Una cara de la credencial en PNG.
 *
 * @param {'frente'|'reverso'} lado
 * @param {object} datos  { cred, logo, foto, qrUrl, escala }
 * @returns {Promise<string>} data URL del PNG
 */
export async function generarImagen({
  lado = 'frente',
  cred = {},
  logo = '',
  foto = '',
  qrUrl = '',
  escala = 1,
  papel = PAPEL_POR_OMISION,
} = {}) {
  const W = Math.max(1, Math.round(ANCHO * escala))
  const H = Math.max(1, Math.round(altoDe(papel, W)))

  const svg = credencialSvg({ lado, cred, logo, foto, qrUrl, papel }, W)
  const img = await cargarImagen(aDataUrl(svg))

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H

  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, W, H)

  return canvas.toDataURL('image/png')
}

/** Descarga un PNG al computador. */
export function descargar(dataUrl, nombreArchivo) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = nombreArchivo
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

/** Nombre base de los archivos de una credencial. */
export function nombreArchivo(cred, lado) {
  return `credencial-${cred?.codigo || 'sin-codigo'}-${lado}.png`
}

/** SVG de una cara, tal como lo usa el panel. */
export { credencialSvg }