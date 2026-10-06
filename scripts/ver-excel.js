/**
 * Lee un Excel y muestra su contenido: hojas, encabezados y primeras filas.
 *   node scripts/ver-excel.js "C:\ruta\archivo.xlsx"
 */
import { readFileSync } from 'node:fs'
import * as XLSX from 'xlsx'

const ruta = process.argv[2]
if (!ruta) {
  console.error('Uso: node scripts/ver-excel.js "ruta\\archivo.xlsx"')
  process.exit(1)
}

const libro = XLSX.read(readFileSync(ruta), { type: 'buffer' })

console.log(`Archivo: ${ruta}`)
console.log(`Hojas  : ${libro.SheetNames.join(', ')}`)
console.log('')

for (const nombre of libro.SheetNames) {
  const filas = XLSX.utils.sheet_to_json(libro.Sheets[nombre], { header: 1, defval: '' })
  console.log(`--- ${nombre} --- (${filas.length} filas)`)
  filas.slice(0, 12).forEach((f, i) => console.log(`  ${String(i).padStart(2)}: ${JSON.stringify(f)}`))
  if (filas.length > 12) console.log(`  ... y ${filas.length - 12} más`)
  console.log('')
}