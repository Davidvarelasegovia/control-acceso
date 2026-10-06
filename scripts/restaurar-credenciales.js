/**
 * Recrea las credenciales que se borraron por error.
 *   node scripts/restaurar-credenciales.js
 *
 * Datos tomados de los bytes que quedaron en las paginas libres del archivo.
 * Lo que NO se pudo recuperar son las fotos (quedaron truncadas) ni las
 * casillas marcadas, asi que se dejan vacias para que se reingresen.
 */
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as cred from '../server/credenciales.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ruta = process.env.DB_PATH || join(__dirname, '..', 'data', 'control-acceso.db')

const db = new DatabaseSync(ruta)

// Datos tomados de los bytes libres del archivo, mas el persona_id que
// habia quedado registrado al listarlas antes del borrado.
const A_RECUPERAR = [
  {
    codigo: 'J517D38561',
    persona_id: 1033,
    empresa: 'Construcciones XYZ',
    cargo: '',
  },
  {
    codigo: 'S887K76526',
    persona_id: 1038,
    empresa: 'Inversiones Coquimbo SA',
    cargo: 'Planificadora rrhh',
  },
]

const existentes = db.prepare('SELECT codigo FROM credenciales').all().map((r) => r.codigo)
console.log(`Credenciales actuales: ${existentes.length ? existentes.join(', ') : '(ninguna)'}`)
console.log('')

for (const item of A_RECUPERAR) {
  if (existentes.includes(item.codigo)) {
    console.log(`${item.codigo}: ya existe, no se toca`)
    continue
  }

  // Hay varias personas con el mismo nombre, asi que se usa el id exacto
  const persona = db.prepare('SELECT * FROM personas WHERE id = ?').get(item.persona_id)

  if (!persona) {
    console.log(`${item.codigo}: la persona #${item.persona_id} ya no esta en la base`)
    continue
  }

  const c = cred.crear({
    codigo: item.codigo,
    persona_id: persona.id,
    nombres: persona.nombres,
    apellidos: persona.apellidos,
    empresa: item.empresa,
    cargo: item.cargo,
    // Foto y casillas no se pudieron recuperar
    autorizaciones: [],
    licencias: [],
    vehiculos: [],
    notas: 'Restaurada tras un borrado accidental. Reingresar foto y casillas.',
  })

  console.log(`${item.codigo}: restaurada`)
  console.log(`  persona    : #${persona.id} ${persona.nombres} ${persona.apellidos} (${persona.rut})`)
  console.log(`  empresa    : ${item.empresa}`)
  console.log(`  cargo      : ${item.cargo || '(sin cargo)'}`)
  console.log(`  link       : http://localhost:5173/cred/${c.codigo}`)
  console.log('  foto       : FALTA (estaba, pero quedo truncada al borrarla)')
  console.log('  casillas   : FALTAN (no se pudieron leer)')
  console.log('')
}

db.close()