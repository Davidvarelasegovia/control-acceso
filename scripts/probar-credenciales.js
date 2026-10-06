/**
 * Prueba de credenciales: genera, verifica el codigo y escanea.
 *   node scripts/probar-credenciales.js
 */
import { db } from '../server/db.js'
import * as cred from '../server/credenciales.js'

console.log('--- Generacion de codigos ---')
const codigos = []
for (let i = 0; i < 2000; i++) codigos.push(cred.generarCodigo())

const unicos = new Set(codigos).size
console.log(`  2000 codigos generados -> ${unicos} distintos (esperado 2000)`)
console.log(`  todos de 10 caracteres: ${codigos.every((c) => c.length === 10)}`)
console.log(`  patron L###L#####     : ${codigos.every((c) => /^[A-Z][0-9]{3}[A-Z][0-9]{5}$/.test(c))}`)
console.log(`  sin O, I ni 0         : ${codigos.every((c) => !/[OI0]/.test(c))}`)
console.log(`  ejemplos: ${codigos.slice(0, 6).join('  ')}`)
console.log('')

console.log('--- Creacion de credencial de prueba ---')
const persona = db.prepare("SELECT * FROM personas WHERE rut LIKE '10.017%' OR rut LIKE '10017328%' LIMIT 1").get()
  || db.prepare('SELECT * FROM personas LIMIT 1').get()

const c = cred.crear({
  persona_id: persona?.id ?? null,
  nombres: persona?.nombres ?? 'Persona Prueba',
  apellidos: persona?.apellidos ?? 'Credencial',
  empresa: 'Empresa de Prueba',
  cargo: 'Supervisor de Turno',
  autorizaciones: ['Acceso general', 'Sala de servidores'],
  licencias: ['B - Automovil', 'C - Camion'],
  vehiculos: ['Camioneta', 'Automovil'],
  notas: 'Credencial de prueba',
})
console.log(`  codigo    : ${c.codigo}  (${c.codigo.length} caracteres)`)
console.log(`  persona   : ${persona ? `#${persona.id} ${persona.nombres} ${persona.apellidos}` : '(ninguna)'}`)
console.log(`  empresa   : ${c.empresa}`)
console.log(`  cargo     : ${c.cargo}`)
console.log(`  autoriz.  : ${c.autorizaciones.join(', ')}`)
console.log(`  licencias : ${c.licencias.join(', ')}`)
console.log(`  vehiculos : ${c.vehiculos.join(', ')}`)
console.log('')

console.log('--- Resolucion a persona ---')
const resuelta = cred.resolverPersona(c.codigo)
console.log(`  por codigo "${c.codigo}" -> ${resuelta ? `${resuelta.nombres} ${resuelta.apellidos}` : 'NO ENCONTRADA'}`)
const resueltaMinus = cred.resolverPersona(c.codigo.toLowerCase())
console.log(`  en minusculas          -> ${resueltaMinus ? `${resueltaMinus.nombres} ${resueltaMinus.apellidos}` : 'NO ENCONTRADA'}`)
console.log('')

console.log('--- Consulta de codigo duplicado ---')
try {
  cred.crear({ nombres: 'Otro', apellidos: 'Test', codigo: c.codigo })
  console.log('  PROBLEMA: deberia haber rechazado el duplicado')
} catch (e) {
  console.log(`  rechazado correctamente: ${e.message}`)
}
console.log('')

console.log('--- Edicion ---')
const editada = cred.actualizar(c.id, { cargo: 'Jefe de Planta', licencias: ['A1 - Motocicleta'] })
console.log(`  cargo nuevo  : ${editada.cargo}`)
console.log(`  licencias    : ${editada.licencias.join(', ')}`)
console.log('')

console.log('--- Resumen ---')
const r = cred.resumen()
console.log(`  ${JSON.stringify(r)}`)
console.log('')

console.log('--- Limpieza ---')
cred.eliminar(c.id)
console.log(`  eliminada la credencial ${c.codigo}`)
console.log(`  quedan: ${cred.resumen().total}`)
db.close()