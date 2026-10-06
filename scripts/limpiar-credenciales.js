/**
 * Borra credenciales de prueba.
 *   node scripts/limpiar-credenciales.js CODIGO [CODIGO...]
 *   node scripts/limpiar-credenciales.js --todas     (borra todas)
 *   node scripts/limpiar-credenciales.js --listar    (solo muestra)
 *
 * SIN argumentos NO borra nada: se niega a correr. Un script de limpieza que
 * vacia la tabla cuando se le olvida el codigo es un peligro.
 */
import { DatabaseSync } from 'node:sqlite'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ruta = process.env.DB_PATH || join(__dirname, '..', 'data', 'control-acceso.db')

const db = new DatabaseSync(ruta)

const argumentos = process.argv.slice(2)
const listar = argumentos.includes('--listar')
const todas = argumentos.includes('--todas')
const filtros = argumentos.filter((a) => !a.startsWith('--'))

if (!listar && filtros.length === 0 && !todas) {
  console.log('Sin codigos: no se borra nada (es a proposito).')
  console.log('')
  console.log('  Para verlas     : node scripts/limpiar-credenciales.js --listar')
  console.log('  Para borrar una : node scripts/limpiar-credenciales.js A123B45678')
  console.log('  Para borrar todas: node scripts/limpiar-credenciales.js --todas')
  db.close()
  process.exit(0)
}

const where = todas || !filtros.length ? '' : `WHERE codigo IN (${filtros.map(() => '?').join(',')})`

// Ojo: hay que pasar los filtros a .all(), si no el placeholder queda en
// NULL y la consulta nunca encuentra nada.
const antes = db
  .prepare(`SELECT codigo, nombres, apellidos, estado, persona_id FROM credenciales ${where}`)
  .all(...filtros)

console.log(`Credenciales a ${listar ? 'listar' : 'borrar'}: ${antes.length}`)
for (const c of antes) {
  console.log(`  ${c.codigo}  ${c.nombres} ${c.apellidos}  (${c.estado}, persona ${c.persona_id ?? '—'})`)
}

if (listar || !antes.length) {
  console.log('')
  console.log(`Quedan: ${db.prepare('SELECT COUNT(*) AS n FROM credenciales').get().n}`)
  db.close()
  process.exit(0)
}

db.exec('BEGIN')
const borradas = db.prepare(`DELETE FROM credenciales ${where}`).run(...filtros).changes
db.exec('COMMIT')

console.log('')
console.log(`Borradas: ${borradas}`)
console.log(`Quedan: ${db.prepare('SELECT COUNT(*) AS n FROM credenciales').get().n}`)
db.close()