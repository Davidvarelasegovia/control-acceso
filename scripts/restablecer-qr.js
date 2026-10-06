/**
 * Restaura la URL de prueba del codigo QR y deja el logo limpio.
 *   node scripts/restablecer-qr.js
 *
 * Se usa despues de las pruebas, que cambian la URL configurada.
 */
import { DatabaseSync } from 'node:sqlite'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ruta = process.env.DB_PATH || join(__dirname, '..', 'data', 'control-acceso.db')

const db = new DatabaseSync(ruta)

const QR_PRUEBA = 'https://ejemplo.com/control-acceso/credenciales'

const qr = db.prepare("SELECT valor FROM config WHERE clave = 'qr_url'").get()
if (qr) {
  db.prepare("DELETE FROM config WHERE clave = 'qr_url'").run()
  console.log(`URL del QR quitada (era "${qr.valor}")`)
} else {
  console.log('La URL del QR ya estaba en la de prueba')
}
console.log(`QR de prueba: ${QR_PRUEBA}`)

const logo = db.prepare("SELECT valor FROM config WHERE clave = 'logo'").get()
if (logo) {
  db.prepare("DELETE FROM config WHERE clave = 'logo'").run()
  console.log('Logo quitado')
}

db.close()