/**
 * Muestra las personas de la base, para ligar bien las credenciales.
 *   node scripts/ver-personas-buscar.js [texto]
 */
import { DatabaseSync } from 'node:sqlite'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ruta = process.env.DB_PATH || join(__dirname, '..', 'data', 'control-acceso.db')

const texto = (process.argv[2] || '').trim()

const db = new DatabaseSync(ruta, { readOnly: true })

const todas = db
  .prepare('SELECT id, nombres, apellidos, rut, empresa FROM personas ORDER BY id')
  .all()

const filtradas = texto
  ? todas.filter((p) =>
      `${p.nombres} ${p.apellidos} ${p.rut} ${p.empresa}`.toLowerCase().includes(texto.toLowerCase())
    )
  : todas

console.log(`Personas: ${filtradas.length}${texto ? ` que coinciden con "${texto}"` : ' en total'}`)
for (const p of filtradas) {
  console.log(
    `  #${String(p.id).padEnd(5)} ${(p.nombres + ' ' + p.apellidos).padEnd(34)}${String(p.rut).padEnd(16)}${p.empresa || ''}`
  )
}

db.close()