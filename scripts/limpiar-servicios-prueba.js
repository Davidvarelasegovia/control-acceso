/**
 * Borra los servicios creados para pruebas, con sus registros y eventos.
 *   node scripts/limpiar-servicios-prueba.js
 */
import { DatabaseSync } from 'node:sqlite'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ruta = process.env.DB_PATH || join(__dirname, '..', 'data', 'control-acceso.db')

const db = new DatabaseSync(ruta)

// Buscar por nombre en vez de por id, para no depender del ultimo generado
const servicios = db
  .prepare("SELECT id, nombre FROM servicios WHERE nombre LIKE '%PRUEBA%'")
  .all()

if (servicios.length === 0) {
  console.log('No hay servicios de prueba.')
} else {
  db.exec('BEGIN')
  let registros = 0
  let eventos = 0

  for (const s of servicios) {
    registros += db.prepare('DELETE FROM registros WHERE servicio_id = ?').run(s.id).changes
    eventos += db.prepare('DELETE FROM eventos WHERE servicio_id = ?').run(s.id).changes
    db.prepare('DELETE FROM servicios WHERE id = ?').run(s.id)
    console.log(`  borrado #${s.id} "${s.nombre}"`)
  }

  db.exec('COMMIT')
  console.log('')
  console.log(`Servicios eliminados: ${servicios.length}`)
  console.log(`Registros eliminados: ${registros}`)
  console.log(`Eventos eliminados  : ${eventos}`)
}

db.close()