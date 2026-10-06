/**
 * Borra las personas de prueba creadas durante las verificaciones
 * (identificadores que empiezan con 555).
 *   node scripts/limpiar-pruebas.js
 */
import { DatabaseSync } from 'node:sqlite'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ruta = process.env.DB_PATH || join(__dirname, '..', 'data', 'control-acceso.db')

const db = new DatabaseSync(ruta)
const r = db.prepare("DELETE FROM personas WHERE rut LIKE '555%'").run()
console.log(`Personas de prueba eliminadas: ${r.changes}`)
console.log(`Quedan ${db.prepare('SELECT COUNT(*) AS n FROM personas').get().n} personas reales`)
db.close()
