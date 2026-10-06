/**
 * Crea una credencial de DEMOSTRACION para probar la instalacion en el celular.
 *   node scripts/crear-demo-widget.js
 *
 * Deja una credencial con foto y logo, para que la pagina se vea completa en
 * el telefono. Imprime el link y los pasos para instalarla.
 */
import { DatabaseSync } from 'node:sqlite'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as cred from '../server/credenciales.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ruta = process.env.DB_PATH || join(__dirname, '..', 'data', 'control-acceso.db')

const db = new DatabaseSync(ruta)

// Foto de ejemplo: un busto en SVG, para que se vea que la imagen se adapta
const FOTO = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="300" height="340" viewBox="0 0 300 340">
  <defs>
    <linearGradient id="f" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2a2a3a"/><stop offset="100%" stop-color="#12121a"/>
    </linearGradient>
  </defs>
  <rect width="300" height="340" fill="url(#f)"/>
  <circle cx="150" cy="130" r="52" fill="#4b5563"/>
  <path d="M150 195c-62 0-104 34-112 96h224c-8-62-50-96-112-96z" fill="#4b5563"/>
  <text x="150" y="325" font-family="sans-serif" font-size="17" fill="#6b7280" text-anchor="middle">FOTO DE PRUEBA</text>
</svg>
`)}`

// Logo de ejemplo
const LOGO = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60" viewBox="0 0 200 60">
  <rect width="200" height="60" rx="8" fill="#062a33"/>
  <circle cx="32" cy="30" r="16" fill="none" stroke="#00f0ff" stroke-width="4"/>
  <rect x="24" y="30" width="16" height="12" fill="#00f0ff"/>
  <text x="58" y="26" font-family="sans-serif" font-size="15" font-weight="bold" fill="#ffffff">ANDES</text>
  <text x="58" y="44" font-family="sans-serif" font-size="11" fill="#00f0ff">SERVICIOS</text>
</svg>
`)}`

// Borrar credenciales de demo anteriores, para no acumular
const viejas = db.prepare("DELETE FROM credenciales WHERE cargo LIKE 'DEMO%'").run().changes
if (viejas) console.log(`Borradas ${viejas} demo anteriores\n`)

const persona = db
  .prepare("SELECT * FROM personas WHERE rut LIKE '10.017%' OR rut LIKE '10017328%' LIMIT 1")
  .get() || db.prepare('SELECT * FROM personas LIMIT 1').get()

db.prepare(
  "INSERT INTO config (clave, valor) VALUES ('logo', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor"
).run(LOGO)

const c = cred.crear({
  persona_id: persona.id,
  cargo: 'DEMO Instalacion',
  foto: FOTO,
  autorizaciones: ['Acceso general', 'Sala de servidores', 'Acceso vehicular'],
  licencias: ['B - Automovil', 'C - Camion'],
  vehiculos: ['Camioneta', 'Automovil'],
  vigente_hasta: '2027-12-31',
  notas: 'Credencial de demostracion para probar la instalacion como widget.',
})

console.log('Credencial de demostración creada\n')
console.log(`  Código     : ${c.codigo}`)
console.log(`  Persona    : ${c.nombres} ${c.apellidos}`)
console.log(`  RUT        : ${c.rut || persona.rut}`)
console.log(`  ID barra   : ${c.codigo}`)
console.log('')
console.log('  DESDE ESTE COMPUTADOR')
console.log(`    http://localhost:5173/cred/${c.codigo}`)
console.log('')
console.log('  DESDE UN CELULAR (misma red Wi-Fi)')
console.log(`    http://192.168.50.148:5173/cred/${c.codigo}`)
console.log('')
console.log('  Para borrarla despues:')
console.log(`    node scripts/limpiar-credenciales.js ${c.codigo}`)

db.close()