/**
 * Prueba de importacion masiva.
 * Genera 1000 personas, las sube por la API y verifica que queden guardadas.
 *   node scripts/probar-importacion.js [cantidad]
 */
import { importarPersonas, db } from '../server/db.js'

const CANTIDAD = Number(process.argv[2]) || 1000

// Genera personas de prueba con identificadores unicos
const filas = []
for (let i = 1; i <= CANTIDAD; i++) {
  const id = String(70000000 + i)
  filas.push({
    nombres: `Persona${String(i).padStart(4, '0')}`,
    apellidos: `Apellido Prueba ${i % 37}`,
    rut: id,
    empresa: `Empresa ${i % 12} Ltda.`,
  })
}

console.log(`Generando ${filas.length} filas...`)

const antes = db.prepare('SELECT COUNT(*) AS n FROM personas').get().n
console.log(`Personas antes: ${antes}`)

const inicio = Date.now()
const r = importarPersonas(filas)
const ms = Date.now() - inicio

const despues = db.prepare('SELECT COUNT(*) AS n FROM personas').get().n
const muestra = db
  .prepare('SELECT nombres, apellidos, rut, empresa FROM personas ORDER BY id DESC LIMIT 3')
  .all()

console.log('')
console.log('--- Resultado ---')
console.log(`  Insertados : ${r.insertados}`)
console.log(`  Omitidos   : ${r.omitidos}`)
console.log(`  Total      : ${r.total}`)
console.log(`  Tiempo     : ${ms} ms  (${(r.insertados / (ms / 1000 || 1)).toFixed(0)} por segundo)`)
console.log('')
console.log(`Personas despues: ${despues}  (diferencia: ${despues - antes})`)
console.log('')
console.log('Ultimas 3 guardadas:')
for (const p of muestra) {
  console.log(`  ${String(p.rut).padEnd(12)} ${p.nombres} ${p.apellidos} | ${p.empresa}`)
}

// Limpieza
const borrar = db.prepare('DELETE FROM personas WHERE CAST(rut AS INTEGER) BETWEEN 70000001 AND 79999999')
const borrados = borrar.run().changes
console.log('')
console.log(`Limpieza: ${borrados} personas de prueba eliminadas`)
