/**
 * Comprueba que el valor impreso en cada codigo de barras es EXACTAMENTE
 * el identificador que busca el sistema.
 *
 *   node scripts/verificar-codigos.js "C:\ruta\plantilla.xlsx"
 *
 * Si el codigo y la clave no coinciden, la pistola laser leeria algo que
 * el sistema no encuentra y el ingreso saldria como "Persona no encontrada".
 */
import { readFileSync } from 'node:fs'
import * as XLSX from 'xlsx'
import { normalizar, clave, mismo } from '../server/identificador.js'

const entrada = process.argv[2]
if (!entrada) {
  console.error('Uso: node scripts/verificar-codigos.js "ruta\\plantilla.xlsx"')
  process.exit(1)
}

/**
 * Lo que se imprime dentro del codigo de barras.
 * Se usa la MISMA funcion que generar-codigos.js, para que no se separen.
 */
function impreso(rut) {
  return normalizar(rut)
}

const libro = XLSX.read(readFileSync(entrada), { type: 'buffer' })
const crudos = XLSX.utils.sheet_to_json(libro.Sheets[libro.SheetNames[0]], {
  header: 1,
  defval: '',
})

const cab = crudos[0].map((c) => String(c ?? '').trim().toLowerCase())
const colRut = cab.indexOf('rut')
const colNombres = cab.indexOf('nombres')
const colApellidos = cab.indexOf('apellidos')

console.log(`Planilla: ${entrada}`)
console.log('')
console.log('  RUT en la lista      codigo impreso    clave que busca el sistema   estado')
console.log('  ' + '-'.repeat(88))

let ok = 0
const problemas = []
const vistos = new Map()

for (let i = 1; i < crudos.length; i++) {
  const f = crudos[i]
  const rut = String(f[colRut] ?? '').trim()
  if (!rut) continue

  const codigo = impreso(rut)
  const claveSistema = clave(rut)

  // La comprobacion que importa: si la pistola lee el codigo, el sistema
  // tiene que encontrar a la persona que esta guardada con ese RUT.
  const coincide = mismo(codigo, rut)

  const nombre = [f[colNombres], f[colApellidos]].filter(Boolean).join(' ').trim()

  if (coincide) ok++
  else problemas.push({ rut, codigo, claveSistema, nombre })

  if (vistos.has(codigo)) {
    problemas.push({
      rut,
      codigo,
      claveSistema,
      nombre,
      repetido: true,
      otro: vistos.get(codigo),
    })
  } else {
    vistos.set(codigo, nombre)
  }

  console.log(
    `  ${rut.padEnd(20)} ${codigo.padEnd(18)} ${claveSistema.padEnd(26)} ${coincide ? 'OK' : 'NO COINCIDE'}`
  )
}

console.log('')
console.log(`Correctos: ${ok} de ${ok + problemas.filter((p) => !p.repetido).length}`)

const repetidos = problemas.filter((p) => p.repetido)
const incompatibles = problemas.filter((p) => !p.repetido)

if (problemas.length === 0) {
  console.log('')
  console.log('Todo listo: al escanear cualquiera de estos codigos, el sistema')
  console.log('encontra a la persona de la lista.')
} else {
  console.log('')
  console.log('PROBLEMAS:')
  for (const p of incompatibles) {
    console.log(
      `  - ${p.rut}: el codigo imprime ${p.codigo} pero el sistema busca ${p.claveSistema}. NO coincidirian al escanear.`
    )
  }
  for (const p of repetidos) {
    console.log(
      `  - ${p.rut}: repite el identificador de "${p.otro}". Al importar, la segunda fila se omite por duplicada.`
    )
  }
}

console.log('')
console.log('Ejemplo de extremo a extremo:')
const conRut = crudos.slice(1).find((f) => String(f[colRut] ?? '').trim())
if (conRut) {
  const rut = String(conRut[colRut]).trim()
  console.log(`  como esta en la lista : "${rut}"`)
  console.log(`  escaneado (pistola)   : ${impreso(rut)}`)
  console.log(`  clave en la base      : ${clave(rut)}`)
  console.log(`  clave de lo escaneado : ${clave(impreso(rut))}`)
  console.log(
    `  -> ${mismo(impreso(rut), rut) ? 'la pistola encuentra a la persona' : 'NO la encuentra'}`
  )
}