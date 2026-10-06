/**
 * Revisa un PDF generado: paginas, imagenes embebidas y textos.
 *   node scripts/ver-pdf.js data\codigos\codigos-code128.pdf
 */
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'

const ruta = process.argv[2]
const buf = readFileSync(ruta)
const bruto = buf.toString('latin1')

const paginas = (bruto.match(/\/Type\s*\/Page[^s]/g) || []).length
// pdfkit crea DOS XObjects por imagen con canal alfa: la imagen RGB y su
// mascara. Por eso el conteo real de codigos es la mitad.
const xobjects = bruto.match(/\/Subtype\s*\/Image(?![BCI])/g) || []
const conAlfa = bruto.match(/\/ColorSpace\s*\/DeviceGray/g) || []
const codigos = xobjects.length - conAlfa.length
const fuentes = (bruto.match(/\/BaseFont/g) || []).length

console.log(`Archivo : ${ruta}`)
console.log(`Paginas : ${paginas}`)
console.log(`Imagenes: ${xobjects.length} XObjects = ${codigos} codigos + ${conAlfa.length} canal(es) alfa`)
console.log(`Fuentes : ${fuentes}`)

// Descomprimir los flujos de contenido para ver el texto real
const textos = []
for (const marca of bruto.matchAll(/stream\r?\n/g)) {
  const i = marca.index + marca[0].length
  const fin = bruto.indexOf('endstream', i)
  if (fin < 0) continue
  try {
    const datos = inflateSync(buf.subarray(i, fin)).toString('latin1')
    for (const m of datos.matchAll(/\(((?:[^()\\]|\\.)*)\)\s*Tj/g)) {
      textos.push(m[1])
    }
  } catch {
    /* no es un flujo comprimido */
  }
}

console.log('')
console.log(`Textos rotulados: ${textos.length}`)
console.log('Primeros 18:')
for (const t of textos.slice(0, 18)) console.log(`  "${t}"`)

console.log('')
// Cruce: los RUT codificados deben aparecer rotulados
const esperados = process.argv.slice(3)
for (const e of esperados) {
  const aparece = textos.some((t) => t.includes(e))
  console.log(`  ${aparece ? 'OK   ' : 'FALTA'}  ${e}`)
}