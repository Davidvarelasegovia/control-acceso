/**
 * Muestra el estado actual de la base de datos.
 *   node scripts/estado.js
 */
import { DatabaseSync } from 'node:sqlite'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ruta = process.env.DB_PATH || join(__dirname, '..', 'data', 'control-acceso.db')

const db = new DatabaseSync(ruta, { readOnly: true })

console.log('journal_mode:', db.prepare('PRAGMA journal_mode').get().journal_mode)
console.log('')

console.log('PERSONAS')
for (const p of db.prepare('SELECT nombres, apellidos, rut, empresa FROM personas ORDER BY id').all()) {
  console.log(
    `  ${String(p.rut).padEnd(16)}${`${p.nombres} ${p.apellidos}`.padEnd(32)}${p.empresa || ''}`
  )
}

console.log('')
console.log('SERVICIOS ABIERTOS')
const abiertos = db
  .prepare("SELECT id, nombre, fecha, hora_inicio, hora_fin, origen FROM servicios WHERE estado = 'abierto'")
  .all()
if (abiertos.length === 0) console.log('  (ninguno)')
for (const s of abiertos) {
  console.log(`  #${s.id} ${s.nombre} · ${s.fecha} · ${s.hora_inicio}-${s.hora_fin} (${s.origen})`)
}

console.log('')
console.log('HORARIOS')
for (const h of db.prepare('SELECT nombre, hora_inicio, hora_fin FROM horarios WHERE activo = 1 ORDER BY hora_inicio').all()) {
  console.log(`  ${h.nombre.padEnd(18)}${h.hora_inicio}-${h.hora_fin}`)
}

console.log('')
console.log('USUARIOS')
for (const u of db.prepare('SELECT usuario, nombre, rol, activo FROM usuarios ORDER BY rol, usuario').all()) {
  console.log(
    `  ${u.usuario.padEnd(12)}${u.nombre.padEnd(16)}${u.rol.padEnd(8)}${u.activo ? 'activo' : 'INACTIVO'}`
  )
}

console.log('')
const n = (t) => db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c
console.log(`REGISTROS: ${n('registros')} | eventos: ${n('eventos')} | servicios: ${n('servicios')}`)

db.close()
