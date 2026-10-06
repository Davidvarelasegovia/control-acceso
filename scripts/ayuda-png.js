import { deflateSync } from 'node:zlib'

/**
 * Arma un PNG de un solo color, para usar de logo o de foto en las pruebas.
 *
 * Sirve para probar credenciales con imagenes de formas distintas (ancha,
 * alta, cuadrada, panoramica) sin tener que guardar archivos en el disco.
 *
 * Uso: pngDePrueba(800, 100)  ->  'data:image/png;base64,...'
 */

const crcTabla = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = crcTabla[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

/** Une campos PNG de 4 bytes. */
const cuatroBytes = (n) => Buffer.from([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255])

function trozo(tipo, datos) {
  const largo = Buffer.alloc(4)
  largo.writeUInt32BE(datos.length)
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'latin1'), datos])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(cuerpo))
  return Buffer.concat([largo, cuerpo, crc])
}

/**
 * PNG solido de `ancho` x `alto`.
 * @returns {string} data URL base64
 */
export function pngDePrueba(ancho = 8, alto = 8, color = [0, 240, 255, 255]) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(ancho, 0)
  ihdr.writeUInt32BE(alto, 4)
  ihdr[8] = 8 // bits por canal
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  // Una fila: filtro 0 + los pixeles
  const fila = Buffer.alloc(1 + ancho * 4)
  for (let x = 0; x < ancho; x++) {
    fila[1 + x * 4] = color[0]
    fila[2 + x * 4] = color[1]
    fila[3 + x * 4] = color[2]
    fila[4 + x * 4] = color[3]
  }

  const raw = Buffer.concat(Array.from({ length: alto }, () => fila))
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    trozo('IHDR', ihdr),
    trozo('IDAT', deflateSync(raw)),
    trozo('IEND', Buffer.alloc(0)),
  ])

  return `data:image/png;base64,${png.toString('base64')}`
}