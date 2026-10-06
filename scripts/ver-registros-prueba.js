/**
 * Lista los registros creados por pruebas (por nombre de dispositivo).
 *   node scripts/ver-registros-prueba.js
 */
import { DatabaseSync } from 'node:sqlite'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ruta = process.env.DB_PATH || join(__dirname, '..', 'data', 'control-acceso.db')

const db = new DatabaseSync(ruta, { readOnly: true })

const registros = db
  .prepare(
    `SELECT r.id, r.rut, r.dispositivo, r.estado, r.hora,
            s.nombre AS servicio, s.estado AS servicio_estado
     FROM registros r
     LEFT JOIN servicios s ON s.id = r.servicio_id
     WHERE r.dispositivo LIKE '%PRUEBA%' OR r.dispositivo LIKE '%CREDENCIAL%'
     ORDER BY r.id DESC`
  )
  .all()

console.log(`Registros de prueba: ${registros.length}`)
for (const r of registros) {
  console.log(
    `  #${r.id}  ${String(r.rut).padEnd(14)} ${r.dispositivo.padEnd(22)} ${r.estado.padEnd(14)} servicio "${r.servicio}" (${r.servicio_estado})`
  )
}

const credenciales = db
  .prepare("SELECT COUNT(*) AS n FROM credenciales")
  .get().n

console.log('')
console.log(`Credenciales en la base: ${credenciales}`)

db.close()