/**
 * Simula la pistola laser: toma los codigos de barras generados y los manda
 * al servidor TAL COMO los leeria el lector, para comprobar que el sistema
 * encuentra a la persona.
 *
 *   node scripts/probar-escaneo-codigos.js "C:\ruta\planilla.xlsx"
 *
 * Ojo: cada intento cuenta como un ingreso real si la persona no estaba
 * antes en el servicio. Por eso abre un servicio de prueba propio, para no
 * ensuciar los contadores del servicio que este en curso.
 */
import { readFileSync } from 'node:fs'
import * as XLSX from 'xlsx'
import { normalizar } from '../server/identificador.js'

const entrada = process.argv[2]
const API = process.env.API_URL || 'http://localhost:3001'

const libro = XLSX.read(readFileSync(entrada), { type: 'buffer' })
const crudos = XLSX.utils.sheet_to_json(libro.Sheets[libro.SheetNames[0]], {
  header: 1,
  defval: '',
})
const cab = crudos[0].map((c) => String(c ?? '').trim().toLowerCase())
const colRut = cab.indexOf('rut')
const colNombres = cab.indexOf('nombres')
const colApellidos = cab.indexOf('apellidos')

const lista = crudos
  .slice(1)
  .filter((f) => String(f[colRut] ?? '').trim())
  .map((f) => ({
    codigo: normalizar(f[colRut]),
    esperado: [f[colNombres], f[colApellidos]].filter(Boolean).join(' ').trim(),
  }))

const post = async (ruta, cuerpo) => {
  const r = await fetch(`${API}${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo ?? {}),
  })
  return r.json()
}

// Servicio aparte, para no tocar los contadores del que esta en curso
const horarios = (await (await fetch(`${API}/api/horarios`)).json()).data
if (!horarios?.length) {
  console.log('No hay horarios: crea uno primero en Horarios.')
  process.exit(1)
}

console.log(`Probando ${lista.length} codigos contra ${API}`)
console.log('')

const creado = await post('/api/servicios', {
  nombre: 'PRUEBA CODIGOS',
  hora_inicio: '00:00',
  hora_fin: '23:59',
})
if (!creado.ok) {
  console.log('No pude crear el servicio de prueba:', creado.error)
  process.exit(1)
}
const servicioId = creado.data.servicio.id
console.log(`Servicio de prueba #${servicioId} (los contadores reales no se tocan)`)
console.log('')

let aciertos = 0
const fallos = []
const duplicados = []

for (const item of lista) {
  const r = await post('/api/escaneo', { rut: item.codigo, dispositivo: 'PRUEBA PDF' })

  if (!r.ok) {
    fallos.push({ ...item, motivo: r.error })
    continue
  }

  const d = r.data
  const persona = d.persona

  if (persona) {
    const nombre = `${persona.nombres} ${persona.apellidos}`.trim()
    if (nombre === item.esperado) {
      aciertos++
      if (d.resultado === 'duplicado') duplicados.push(item.codigo)
    } else {
      fallos.push({ ...item, motivo: `encontro a "${nombre}" en vez de "${item.esperado}"` })
    }
  } else {
    fallos.push({ ...item, motivo: `resultado "${d.resultado}": ${d.mensaje}` })
  }
}

console.log(`Aciertos      : ${aciertos} de ${lista.length}`)
console.log(`Fallos        : ${fallos.length}`)
console.log(`Duplicados    : ${duplicados.length} (misma persona dos veces en el mismo servicio)`)

if (fallos.length) {
  console.log('')
  console.log('Fallos:')
  for (const f of fallos.slice(0, 20)) {
    console.log(`  ${String(f.codigo).padEnd(12)} esperado "${f.esperado}" -> ${f.motivo}`)
  }
}

// Limpieza: borrar los registros que creo esta prueba
const { db } = await import('../server/db.js')
const borrados = db.prepare('DELETE FROM registros WHERE servicio_id = ?').run(servicioId).changes
const servicios = db.prepare('DELETE FROM servicios WHERE id = ?').run(servicioId).changes
console.log('')
console.log(`Limpieza: ${borrados} registros y ${servicios} servicio de prueba eliminados`)

console.log('')
console.log(
  fallos.length === 0
    ? 'RESULTADO: los codigos funcionan con la pistola laser'
    : 'RESULTADO: hay codigos que no encuentran a la persona, mira la lista de arriba'
)