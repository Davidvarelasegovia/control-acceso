/**
 * Genera los iconos PNG de la credencial.
 *   node scripts/generar-iconos.js
 *
 * Se escriben a public/cred/ y el navegador los usa para instalar la
 * credencial como aplicacion (Android e iPhone los exigen en PNG).
 *
 * Los dibuja a mano: no hay librerias de imagen instaladas, asi que se arma el
 * PNG a bajo nivel (IHDR + IDAT con zlib + IEND).
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const destino = join(__dirname, '..', 'public', 'cred')

/* ------------------------------------------------------------------ */
/* Escritor de PNG                                                     */
/* ------------------------------------------------------------------ */

function crc32(buf) {
  let c
  const tabla = []
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    tabla[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (const byte of buf) crc = tabla[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function trozo(tipo, datos) {
  const largo = Buffer.alloc(4)
  largo.writeUInt32BE(datos.length)
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'latin1'), datos])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(cuerpo))
  return Buffer.concat([largo, cuerpo, crc])
}

/** @param {number} w @param {number} h @param {Buffer} rgba  w*h*4 bytes */
function png(w, h, rgba) {
  const cabecera = Buffer.alloc(13)
  cabecera.writeUInt32BE(w, 0)
  cabecera.writeUInt32BE(h, 4)
  cabecera[8] = 8 // bits por canal
  cabecera[9] = 6 // RGBA
  cabecera[10] = 0
  cabecera[11] = 0
  cabecera[12] = 0

  // Cada fila lleva un byte de filtro (0 = ninguno)
  const crudo = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) {
    const desde = y * w * 4
    crudo[y * (w * 4 + 1)] = 0
    rgba.copy(crudo, y * (w * 4 + 1) + 1, desde, desde + w * 4)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo('IHDR', cabecera),
    trozo('IDAT', deflateSync(crudo, { level: 9 })),
    trozo('IEND', Buffer.alloc(0)),
  ])
}

/* ------------------------------------------------------------------ */
/* Dibujo                                                              */
/* ------------------------------------------------------------------ */

const FONDO = [5, 5, 8]
const CIAN = [0, 240, 255]
const VERDE = [0, 255, 136]

/**
 * Icono: fondo oscuro, marco cian y una tarjeta de credencial en el centro
 * con dos lineas de codigo de barras.
 * @param {boolean} maskable deja aire al rededor (lo exige Android)
 */
function dibujarIcono(tam, maskable = false) {
  const rgba = Buffer.alloc(tam * tam * 4)

  // margen: en los iconos maskable el recorte puede comerse hasta un 20%
  const margen = maskable ? tam * 0.2 : tam * 0.08
  const area = tam - margen * 2

  // Proporciones de la tarjeta
  const wTarjeta = area * 0.68
  const hTarjeta = area * 0.88
  const x0 = Math.round(margen + (area - wTarjeta) / 2)
  const y0 = Math.round(margen + (area - hTarjeta) / 2)
  const x1 = x0 + wTarjeta
  const y1 = y0 + hTarjeta

  const grosor = Math.max(2, tam * 0.03)
  const radio = Math.round(tam * 0.06)

  // Barras del codigo: anchos que se alternan barra / espacio / barra...
  const barraY0 = Math.round(y0 + hTarjeta * 0.62)
  const barraAlto = Math.round(hTarjeta * 0.2)
  const barraX0 = x0 + wTarjeta * 0.12
  const barraX1 = x1 - wTarjeta * 0.12
  const ANCHOS = [0.1, 0.05, 0.07, 0.05, 0.14, 0.06, 0.05, 0.09, 0.05, 0.12, 0.05, 0.07]
  // Escalados a 1 y marcados con true si es barra
  const total = ANCHOS.reduce((a, b) => a + b, 0)
  const segmentos = ANCHOS.map((w, i) => ({ desde: i, ancho: w / total, barra: i % 2 === 0 }))

  const dentroTarjeta = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1
  const cercaBorde = (x, y) => {
    const dx = Math.min(x - x0, x1 - x)
    const dy = Math.min(y - y0, y1 - y)
    return dx < grosor || dy < grosor
  }

  for (let y = 0; y < tam; y++) {
    for (let x = 0; x < tam; x++) {
      const i = (y * tam + x) * 4
      let color = FONDO

      if (dentroTarjeta(x + 0.5, y + 0.5)) {
        // tarjeta blanca con marco cian
        color = [18, 18, 26]
        if (cercaBorde(x + 0.5, y + 0.5)) color = CIAN

        // franja superior (como la cinta de la credencial)
        if (y + 0.5 < y0 + hTarjeta * 0.16) color = CIAN

        // texto simulado (dos lineas)
        const linea1 = y > y0 + hTarjeta * 0.3 && y < y0 + hTarjeta * 0.34 &&
          x > x0 + wTarjeta * 0.2 && x < x1 - wTarjeta * 0.2
        const linea2 = y > y0 + hTarjeta * 0.38 && y < y0 + hTarjeta * 0.41 &&
          x > x0 + wTarjeta * 0.28 && x < x1 - wTarjeta * 0.35
        if (linea1 || linea2) color = VERDE

        // codigo de barras
        if (y + 0.5 > barraY0 && y + 0.5 < barraY0 + barraAlto && x + 0.5 > barraX0 && x + 0.5 < barraX1) {
          const rel = (x + 0.5 - barraX0) / (barraX1 - barraX0)
          let acum = 0
          let esBarra = false
          for (const s of segmentos) {
            if (rel >= acum && rel < acum + s.ancho) {
              esBarra = s.barra
              break
            }
            acum += s.ancho
          }
          color = esBarra ? [255, 255, 255] : [18, 18, 26]
        }
      }

      // esquinas redondeadas del marco
      const cx = Math.min(Math.max(x + 0.5, x0 + radio), x1 - radio)
      const cy = Math.min(Math.max(y + 0.5, y0 + radio), y1 - radio)
      if (dentroTarjeta(x + 0.5, y + 0.5)) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
        if (d > radio) color = FONDO
      }

      rgba[i] = color[0]
      rgba[i + 1] = color[1]
      rgba[i + 2] = color[2]
      rgba[i + 3] = 255
    }
  }

  return png(tam, tam, rgba)
}

/* ------------------------------------------------------------------ */

mkdirSync(destino, { recursive: true })

const archivos = [
  ['icono-192.png', 192, false],
  ['icono-512.png', 512, false],
  ['icono-180.png', 180, false],
  ['icono-maskable.png', 512, true],
]

for (const [nombre, tam, maskable] of archivos) {
  const buffer = dibujarIcono(tam, maskable)
  writeFileSync(join(destino, nombre), buffer)
  console.log(`  ${nombre.padEnd(22)} ${tam}x${tam}  ${(buffer.length / 1024).toFixed(1)} KB`)
}

console.log('')
console.log(`Iconos en: ${destino}`)