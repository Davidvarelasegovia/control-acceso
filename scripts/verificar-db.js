/**
 * Verificacion de la base de datos: tablas, filas e indices.
 *   node scripts/verificar-db.js
 */
import { DatabaseSync } from 'node:sqlite'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ruta = process.env.DB_PATH || join(__dirname, '..', 'data', 'control-acceso.db')

if (!existsSync(ruta)) {
  console.error('No existe la base de datos en', ruta)
  console.error('Levanta el servidor con: npm run server')
  process.exit(1)
}

const db = new DatabaseSync(ruta, { readOnly: true })

console.log('\nBase de datos:', ruta, '\n')

console.log('TABLAS')
const tablas = db
  .prepare(
    `SELECT name FROM sqlite_master
     WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
     ORDER BY name`
  )
  .all()

for (const t of tablas) {
  const n = db.prepare(`SELECT COUNT(*) AS c FROM ${t.name}`).get().c
  console.log(`  ${t.name.padEnd(14)} ${String(n).padStart(4)} filas`)
}

console.log('\nINDICES')
const indices = db
  .prepare(
    `SELECT name FROM sqlite_master
     WHERE type = 'index' AND name NOT LIKE 'sqlite_%'
     ORDER BY name`
  )
  .all()
for (const i of indices) console.log(`  ${i.name}`)

console.log('\nESQUEMA DETALLADO')
for (const t of tablas) {
  const cols = db.prepare(`PRAGMA table_info(${t.name})`).all()
  console.log(`\n  ${t.name}`)
  for (const c of cols) {
    const flags = [c.pk ? 'PK' : '', c.notnull ? 'NOT NULL' : '', c.unique ? 'UNIQUE' : '']
      .filter(Boolean)
      .join(' ')
    console.log(`    ${c.name.padEnd(14)} ${c.type.padEnd(12)} ${flags}`)
  }
}

db.close()
console.log('')
