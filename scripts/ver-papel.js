/**
 * Muestra los dos papeles de la credencial.
 * Uso: node scripts/ver-papel.js
 */
import { credencialSvg, PAPELES, ANCHO, altoDe } from '../shared/credencialSvg.js'

const cred = {
  codigo: 'A972Q66464',
  nombres: 'Carolina Andrea',
  apellidos: 'Muñoz Martínez',
  empresa: 'Inversiones Coquimbo SA',
  cargo: 'Recursos Laborables Inspeccion',
  rut: '10.121.254-8',
  foto: '',
  autorizaciones: ['Acceso general', 'Sala de servidores', 'Laboratorio', 'Planta'],
  licencias: ['A2', 'B', 'D'],
  vehiculos: ['Camioneta', 'Sprinter'],
  notas: 'Personal registrado como "Visita"',
}

console.log('Ancho de referencia:', ANCHO, 'px')
console.log('')

for (const q of Object.values(PAPELES)) {
  const alto = altoDe(q.id, ANCHO)
  const razon = alto / ANCHO
  console.log(`${q.nombre}  (${q.medida})`)
  console.log(`  ${ANCHO} x ${alto} px   proporcion 400:${Math.round(razon * 400)}   ${q.para}`)
  for (const lado of ['frente', 'reverso']) {
    const svg = credencialSvg({ lado, cred, logo: '', foto: '', qrUrl: 'https://x.cl', papel: q.id }, ANCHO)
    const m = /width="([\d.]+)" height="([\d.]+)"/.exec(svg)
    const ok = Number(m[2]) === alto
    console.log(`    ${lado.padEnd(8)} ${m[1]} x ${m[2]} px  ${ok ? 'OK' : '*** MAL'}   ${Math.round(svg.length / 1024)} KB`)
  }
  console.log('')
}

console.log('Con la pantalla de un Galaxy S22 Ultra (1440 x 3088):')
for (const q of Object.values(PAPELES)) {
  const ancho = 1440
  console.log(`  ${q.nombre.padEnd(11)} ${ancho} x ${altoDe(q.id, ancho)} px`)
}