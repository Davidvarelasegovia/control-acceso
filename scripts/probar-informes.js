/**
 * Prueba de los calculos de informes contra la base real.
 *   node scripts/probar-informes.js
 */
import {
  rango,
  resumen,
  comparativa,
  porServicio,
  serieTemporal,
  flujoPorFranjas,
  serviciosConTotales,
} from '../server/informes.js'

const f = { granularidad: 'dia' }
const { desde, hasta } = rango(f)

console.log(`Rango por defecto: ${desde} .. ${hasta}`)
console.log('')

console.log('RESUMEN')
console.log(' ', JSON.stringify(resumen(f)))
console.log('')

console.log('COMPARATIVA vs periodo anterior')
const c = comparativa(f)
console.log(`  actual ${c.actual} | anterior ${c.anterior} | variacion ${c.variacion?.toFixed(1)}%`)
console.log(`  (rango anterior ${c.periodoAnterior.desde} .. ${c.periodoAnterior.hasta}, ${c.dias} dias)`)
console.log('')

console.log('INGRESOS POR SERVICIO (agrupado por nombre)')
const ps = porServicio(f)
if (ps.length === 0) console.log('  (sin datos)')
for (const s of ps) {
  console.log(`  ${s.nombre.padEnd(20)}${s.franja.padEnd(14)}${String(s.ingresos).padStart(4)} ingresos · ${s.personas} personas · ${s.servicios} servicios`)
}
console.log('')

console.log('SERIE TEMPORAL')
for (const g of ['dia', 'semana', 'mes']) {
  const serie = serieTemporal({ ...f, granularidad: g })
  console.log(`  ${g.padEnd(8)}${serie.length} periodos: ` + (serie.map((s) => `${s.etiqueta}=${s.autorizados}`).join('  ') || '(vacio)'))
}
console.log('')

console.log('FLUJO POR FRANJAS DE 30 MIN')
const fl = flujoPorFranjas(f)
console.log(`  ${fl.franjas.length} filas | maximo por franja: ${fl.maximo}`)
console.log(`  pico: ${fl.pico ? `${fl.pico.franja} con ${fl.pico.ingresos}` : '(sin datos)'}`)
console.log('  consolidado 24h:')
for (const x of fl.flujoConsolidado.slice(0, 10)) {
  console.log(`    ${x.franja}  ${String(x.ingresos).padStart(4)} ${'#'.repeat(Math.min(50, x.ingresos))}`)
}
console.log('')

console.log('SERVICIOS CON TOTAL (selector de informes)')
const sv = serviciosConTotales(10)
for (const s of sv) {
  console.log(
    `  #${String(s.id).padEnd(4)}${String(s.nombre).padEnd(18)}${s.fecha} ${s.hora_inicio}-${s.hora_fin}  ${String(s.ingresos).padStart(3)} ingresos · ${s.noEncontrados} no enc. · ${s.duplicados} dup.`
  )
}
console.log('')

// Un servicio puntual, como pide el jefe
const conDatos = sv.find((s) => s.ingresos > 0)
if (conDatos) {
  console.log(`Filtrando solo el servicio #${conDatos.id} (${conDatos.nombre}):`)
  const r = resumen({ ...f, servicio_id: conDatos.id })
  const pp = porServicio({ ...f, servicio_id: conDatos.id })
  const ff = flujoPorFranjas({ ...f, servicio_id: conDatos.id })
  console.log(`  resumen : ${JSON.stringify(r)}`)
  console.log(`  servicios: ${pp.map((x) => `${x.nombre}=${x.ingresos}`).join(', ')}`)
  console.log(`  pico    : ${ff.pico ? ff.pico.franja + ' = ' + ff.pico.ingresos : '(nada)'}`)
}