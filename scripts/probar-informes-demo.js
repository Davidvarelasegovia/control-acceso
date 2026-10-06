/**
 * Verifica los informes contra la base de DEMOSTRACION (data/demo.db).
 *   DB_PATH=data/demo.db node scripts/probar-informes-demo.js
 */
import { rango, resumen, comparativa, porServicio, serieTemporal, flujoPorFranjas } from '../server/informes.js'

const f = { granularidad: 'dia' }
const { desde, hasta } = rango(f)

console.log(`Rango: ${desde} .. ${hasta}`)
console.log('')

const r = resumen(f)
console.log('RESUMEN')
console.log(`  Total autorizados : ${r.autorizados}`)
console.log(`  No encontrados    : ${r.noEncontrados}`)
console.log(`  Duplicados        : ${r.duplicados}`)
console.log(`  Personas distintas: ${r.personasDistintas}`)
console.log(`  Servicios         : ${r.servicios}`)
console.log('')

const c = comparativa(f)
console.log('COMPARATIVA')
console.log(`  actual ${c.actual} vs anterior ${c.anterior} → ${c.variacion?.toFixed(1)}%`)
console.log('')

console.log('INGRESOS POR SERVICIO  (el ejemplo del jefe: desayuno / almuerzo / cena...)')
const ps = porServicio(f)
for (const s of ps) {
  console.log(`  ${s.nombre.padEnd(14)}${s.franja.padEnd(14)}${String(s.ingresos).padStart(6)}  ${s.personas} personas`)
}
console.log('')

console.log('EVOLUCION')
for (const g of ['dia', 'semana', 'mes']) {
  const serie = serieTemporal({ ...f, granularidad: g })
  console.log(`  ${g}:`)
  for (const s of serie) {
    const barra = '#'.repeat(Math.round((s.autorizados / Math.max(...serie.map((x) => x.autorizados))) * 40))
    console.log(`    ${s.etiqueta.padEnd(12)}${String(s.autorizados).padStart(6)}  ${barra}`)
  }
  console.log('')
}

console.log('FLUJO POR FRANJAS DE 30 MIN (consolidado en las 24 horas)')
const fl = flujoPorFranjas(f)
const max = Math.max(...fl.flujoConsolidado.map((x) => x.ingresos), 1)
for (const x of fl.flujoConsolidado) {
  const pico = picoEs(x, fl.pico)
  console.log(`  ${x.franja}  ${String(x.ingresos).padStart(6)}  ${'█'.repeat(Math.round((x.ingresos / max) * 45))}${pico}`)
}
console.log('')
console.log(`  PICO: ${fl.pico.franja} con ${fl.pico.ingresos} ingresos`)
console.log(`  Filas de la tabla: ${fl.franjas.length}  |  maximo por fila: ${fl.maximo}`)
console.log('')

// Un solo servicio: el caso "ver todas las personas que pasaron en la cena del dia 1"
const conIngresos = (await import('../server/informes.js')).serviciosConTotales(200).filter((s) => s.ingresos > 0)
const uno = conIngresos[0]
console.log(`FILTRANDO UN SOLO SERVICIO: #${uno.id} ${uno.nombre} ${uno.fecha} ${uno.hora_inicio}-${uno.hora_fin}`)
const r2 = resumen({ ...f, servicio_id: uno.id })
const fl2 = flujoPorFranjas({ ...f, servicio_id: uno.id })
console.log(`  autorizados=${r2.total} noEnc=${r2.noEncontrados} dup=${r2.duplicados}`)
console.log(`  pico de ese servicio: ${fl2.pico.franja} = ${fl2.pico.ingresos}`)
console.log('')
console.log('  Primeras filas de la tabla de flujo:')
for (const fila of fl2.franjas.slice(0, 5)) {
  console.log(`    ${fila.periodo_etiqueta.padEnd(12)}${fila.franja}  ${fila.ingresos}`)
}

function picoEs(x, pico) {
  return pico && pico.franja === x.franja ? '   ← PICO' : ''
}