/**
 * Revision de la base de datos: que hay, que se puede perder al cambiar de
 * equipo y que conviene respaldar.
 *
 * Solo lectura.
 * Uso: node scripts/revisar-datos.js
 */
import { DatabaseSync } from 'node:sqlite'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const ruta = process.env.DB_PATH || join(raiz, 'data', 'control-acceso.db')
const db = new DatabaseSync(ruta, { readOnly: true })

console.log('Base:', ruta)
console.log('')

/* --- Tablas y cantidad de filas --- */
console.log('1. CONTENIDO')
const tablas = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all()
let total = 0
for (const { name } of tablas) {
  let n = 0
  try {
    n = db.prepare(`SELECT COUNT(*) n FROM "${name}"`).get().n
  } catch {
    console.log(`   ${name.padEnd(14)} (no se pudo leer)`)
    continue
  }
  total += n
  const marca = ['personas', 'registros', 'credenciales', 'usuarios', 'config', 'accesos_log'].includes(name)
    ? '  <-- se lleva al otro equipo'
    : ''
  console.log(`   ${name.padEnd(14)} ${String(n).padStart(6)}${marca}`)
}
console.log(`   ${'TOTAL'.padEnd(14)} ${String(total).padStart(6)} filas`)

/* --- Datos personales --- */
console.log('')
console.log('2. DATOS PERSONALES')
try {
  const conFoto = db.prepare('SELECT COUNT(*) n FROM personas WHERE foto IS NOT NULL AND foto <> ""').get().n
  console.log(`   personas con foto (base64 dentro de la BD): ${conFoto}`)
  const credConFoto = db
    .prepare('SELECT COUNT(*) n FROM credenciales WHERE foto IS NOT NULL AND foto <> ""')
    .get().n
  console.log(`   credenciales con foto: ${credConFoto}`)
} catch (e) {
  console.log('   (sin columna foto)', e.message)
}

/* --- Usuarios --- */
console.log('')
console.log('3. USUARIOS')
const cols = db.prepare('PRAGMA table_info(usuarios)').all().map((c) => c.name)
console.log('   columnas:', cols.join(', '))
const usuarios = db.prepare('SELECT * FROM usuarios').all()
for (const u of usuarios) {
  const copia = { ...u }
  if (copia.clave) copia.clave = '***' + String(copia.clave).slice(-3)
  if (copia.password) copia.password = '***'
  if (copia.hash) copia.hash = String(copia.hash).slice(0, 12) + '...'
  console.log('  ', JSON.stringify(copia))
}

/* --- Configuracion --- */
console.log('')
console.log('4. CONFIGURACION')
for (const f of db.prepare('SELECT clave, valor FROM config').all()) {
  const v = String(f.valor ?? '')
  const corta = v.length > 70 ? `${v.slice(0, 70)}... (${v.length} caracteres)` : v
  console.log(`   ${f.clave.padEnd(18)} ${corta}`)
}

/* --- Sesiones --- */
try {
  const s = db.prepare('SELECT COUNT(*) n FROM sesiones').get().n
  console.log('')
  console.log('5. SESIONES')
  console.log(`   ${s} sesiones abiertas (se pueden borrar sin riesgo, es solo la sesion del navegador)`)
} catch {}

/* --- Lo que hay que respaldar --- */
console.log('')
console.log('6. PARA LLEVAR A OTRO EQUIPO')
console.log('   indispensable : data/control-acceso.db   (personas, registros, credenciales, usuarios, logo)')
console.log('   opcional      : data/codigos/           (PDF de codigos de barras ya generados)')
console.log('   descartable   : data/demo.db, data/respaldo-antes.db  (datos de prueba)')

db.close()