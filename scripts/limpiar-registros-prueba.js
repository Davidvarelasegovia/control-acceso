/**
 * Borra los registros que dejaron las pruebas, sin tocar los reales.
 *   node scripts/limpiar-registros-prueba.js
 *
 * Solo elimina los que tienen el dispositivo de prueba ("PRUEBA", "PDF",
 * "CREDENCIAL"), para no borrar entradas de verdad por error.
 */
import { DatabaseSync } from 'node:sqlite'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ruta = process.env.DB_PATH || join(__dirname, '..', 'data', 'control-acceso.db')

const db = new DatabaseSync(ruta)

const MARCADORES = ['%PRUEBA%', '%CREDENCIAL%', '%PRUEBA PDF%']

const esPrueba = MARCADORES.map(() => 'dispositivo LIKE ?').join(' OR ')

const registros = db
  .prepare(`SELECT id, rut, dispositivo FROM registros WHERE ${esPrueba}`)
  .all(...MARCADORES)

const eventos = db
  .prepare(
    `SELECT id, rut, dispositivo FROM eventos
     WHERE ${MARCADORES.map(() => 'dispositivo LIKE ?').join(' OR ')}`
  )
  .all(...MARCADORES)

if (!registros.length && !eventos.length) {
  console.log('No hay registros de prueba.')
} else {
  console.log('Borrando:')
  for (const r of registros) console.log(`  registro #${r.id}  ${r.rut}  ${r.dispositivo}`)
  for (const e of eventos) console.log(`  evento   #${e.id}  ${e.rut}  ${e.dispositivo}`)

  db.exec('BEGIN')
  const r1 = db.prepare(`DELETE FROM registros WHERE ${esPrueba}`).run(...MARCADORES).changes
  const r2 = db.prepare(
    `DELETE FROM eventos WHERE ${MARCADORES.map(() => 'dispositivo LIKE ?').join(' OR ')}`
  ).run(...MARCADORES).changes
  db.exec('COMMIT')

  console.log('')
  console.log(`Registros borrados: ${r1}`)
  console.log(`Eventos borrados  : ${r2}`)
}

console.log('')
console.log(`Registros que quedan: ${db.prepare('SELECT COUNT(*) AS n FROM registros').get().n}`)
db.close()