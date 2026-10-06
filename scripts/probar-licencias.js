/**
 * Comprueba el recorte de las licencias: "A1 - Motocicleta" -> "A1",
 * pero "Permiso especial" se deja como esta.
 *
 * Uso: node scripts/probar-licencias.js
 */
import { claseLicencia, OPCIONES } from '../server/credenciales.js'

const casos = [
  ['A1 - Motocicleta', 'A1'],
  ['B - Automovil', 'B'],
  ['D - Omnibus', 'D'],
  ['F - Vehiculo especial', 'F'],
  ['A2 - Motocicleta mayor 350cc', 'A2'],
  ['b', 'B'],
  ['A1', 'A1'],
  [' A4 ', 'A4'],
  // No se tocan los textos escritos a mano
  ['Permiso especial interno', 'Permiso especial interno'],
  ['Traslado nocturno', 'Traslado nocturno'],
  ['Interno', 'Interno'],
  ['', ''],
]

let fallos = 0
for (const [entrada, esperado] of casos) {
  const salida = claseLicencia(entrada)
  const ok = salida === esperado
  if (!ok) fallos++
  console.log(
    `${ok ? 'OK   ' : 'FALLA'} "${entrada}" -> "${salida}"` +
      (ok ? '' : `   (se esperaba "${esperado}")`)
  )
}

console.log('')
console.log('Opciones de licencia:', OPCIONES.licencias.join('  '))
const conDescripcion = OPCIONES.licencias.filter((l) => l.includes('-'))
console.log(
  conDescripcion.length
    ? `FALLA: ${conDescripcion.length} opcion(es) con descripcion`
    : 'Ninguna opcion trae descripcion'
)
if (conDescripcion.length) fallos++

console.log(fallos ? `${fallos} fallo(s)` : 'Todo correcto')
process.exit(fallos ? 1 : 0)