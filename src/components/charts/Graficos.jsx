/**
 * Graficos SVG hechos a mano.
 *
 * No se usa ninguna libreria externa: asi los colores, las barras y las
 * etiquetas quedan con la misma estetica del resto de la aplicacion
 * y el bundle no crece.
 */

/** "1.234" -> "1.234" ; "12345" -> "12.345" (formato chileno) */
export function numero(n) {
  return Number(n || 0).toLocaleString('es-CL')
}

/** Escala de valores a "bonitos" para el eje: 0, 10, 20, 25, 50, 100… */
export function escalaEje(max, pasos = 4) {
  if (max <= 0) return [0]
  const bruto = max / pasos
  const magnitud = Math.pow(10, Math.floor(Math.log10(bruto)))
  const norm = bruto / magnitud
  const paso = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * magnitud
  const ticks = []
  for (let v = 0; v <= max + paso * 0.5; v += paso) ticks.push(Math.round(v))
  return ticks
}

/* ------------------------------------------------------------------ */
/* Barras horizontales: ingresos por servicio                         */
/* ------------------------------------------------------------------ */

/**
 * @param {Array<{nombre, ingresos, franja}>} datos
 */
export function BarrasServicios({ datos }) {
  if (!datos || datos.length === 0) {
    return <Vacio mensaje="Sin ingresos en el rango elegido" />
  }

  const max = Math.max(...datos.map((d) => d.ingresos))
  const total = datos.reduce((s, d) => s + d.ingresos, 0)

  return (
    <div className="space-y-3">
      {datos.map((d) => {
        const pct = max > 0 ? (d.ingresos / max) * 100 : 0
        const delTotal = total > 0 ? (d.ingresos / total) * 100 : 0

        return (
          <div key={d.nombre}>
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <div className="flex items-baseline gap-2 min-w-0">
                <span className="text-sm text-white font-medium truncate">{d.nombre}</span>
                {d.franja && (
                  <span className="text-xs text-gray-500 font-mono shrink-0">{d.franja}</span>
                )}
              </div>
              <div className="flex items-baseline gap-2 shrink-0">
                <span className="text-sm text-gamer-accent font-bold tabular-nums">
                  {numero(d.ingresos)}
                </span>
                <span className="text-xs text-gray-500 tabular-nums w-11 text-right">
                  {delTotal.toFixed(0)}%
                </span>
              </div>
            </div>

            <div className="h-6 bg-gamer-darker rounded overflow-hidden relative">
              <div
                className="h-full rounded transition-all duration-500"
                style={{
                  width: `${Math.max(pct, d.ingresos > 0 ? 2 : 0)}%`,
                  background: 'linear-gradient(90deg, #0080ff 0%, #00f0ff 100%)',
                  boxShadow: '0 0 12px rgba(0,240,255,0.35)',
                }}
              />
            </div>

            <div className="text-xs text-gray-500 mt-0.5">
              {numero(d.personas)} personas · {numero(d.servicios)}{' '}
              {d.servicios === 1 ? 'servicio' : 'servicios'}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Linea / area: evolucion por dia, semana o mes                      */
/* ------------------------------------------------------------------ */

export function GraficoSerie({ serie, granularidad }) {
  if (!serie || serie.length === 0) {
    return <Vacio mensaje="Sin datos en el rango elegido" />
  }

  const ancho = 720
  const alto = 220
  const pad = { top: 16, right: 16, bottom: 28, left: 44 }
  const w = ancho - pad.left - pad.right
  const h = alto - pad.top - pad.bottom

  const max = Math.max(...serie.map((s) => s.autorizados), 1)
  const ticks = escalaEje(max)
  const tope = ticks[ticks.length - 1] || 1

  const px = (i) => pad.left + (serie.length === 1 ? w / 2 : (i / (serie.length - 1)) * w)
  const py = (v) => pad.top + h - (v / tope) * h

  const puntos = serie.map((s, i) => `${px(i)},${py(s.autorizados)}`)
  const linea = puntos.length > 1 ? `M ${puntos.join(' L ')}` : ''
  const area = puntos.length > 1 ? `${linea} L ${px(serie.length - 1)},${py(0)} L ${px(0)},${py(0)} Z` : ''

  // No se dibuja un punto por cada etiqueta si hay muchas: se saltea
  const salto = Math.ceil(serie.length / 12)

  return (
    <div>
      <svg viewBox={`0 0 ${ancho} ${alto}`} className="w-full h-auto" role="img">
        {/* Cuadricula y eje Y */}
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={pad.left}
              x2={ancho - pad.right}
              y1={py(t)}
              y2={py(t)}
              stroke="#2a2a3a"
              strokeWidth="1"
              strokeDasharray={t === 0 ? '0' : '3 3'}
            />
            <text
              x={pad.left - 8}
              y={py(t) + 4}
              textAnchor="end"
              fontSize="11"
              fill="#6b7280"
            >
              {numero(t)}
            </text>
          </g>
        ))}

        {/* Area bajo la curva */}
        {area && (
          <>
            <defs>
              <linearGradient id="degradadoSerie" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#00f0ff" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={area} fill="url(#degradadoSerie)" />
          </>
        )}

        {/* Linea */}
        {linea && (
          <path
            d={linea}
            fill="none"
            stroke="#00f0ff"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {/* Puntos y etiquetas */}
        {serie.map((s, i) => (
          <g key={s.periodo}>
            <circle
              cx={px(i)}
              cy={py(s.autorizados)}
              r="3.5"
              fill="#050508"
              stroke="#00f0ff"
              strokeWidth="2"
            >
              <title>
                {s.etiqueta}: {numero(s.autorizados)} ingresos
                {s.noEncontrados > 0 ? ` · ${s.noEncontrados} no encontrados` : ''}
              </title>
            </circle>
            {i % salto === 0 && (
              <text
                x={px(i)}
                y={alto - 8}
                textAnchor="middle"
                fontSize="11"
                fill="#6b7280"
              >
                {s.etiqueta}
              </text>
            )}
          </g>
        ))}
      </svg>

      <p className="text-xs text-gray-500 mt-1 text-center">
        {granularidad === 'dia'
          ? 'Evolucion diaria'
          : granularidad === 'semana'
            ? 'Evolucion semanal'
            : 'Evolucion mensual'}{' '}
        · pasa el mouse sobre cada punto para ver el detalle
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Flujo: barras verticales por franja de 30 minutos                   */
/* ------------------------------------------------------------------ */

/**
 * @param {Array<{franja, ingresos}>} datos  franjas ordenadas por hora
 * @param {{franja, ingresos}|null} pico     franja con mas ingresos
 */
export function GraficoFlujo({ datos, pico }) {
  if (!datos || datos.length === 0) {
    return <Vacio mensaje="Sin ingresos en el rango elegido" />
  }

  const ancho = 720
  const alto = 240
  // Mas espacio arriba para que la etiqueta del pico no se corte
  const pad = { top: 26, right: 16, bottom: 34, left: 44 }
  const w = ancho - pad.left - pad.right
  const h = alto - pad.top - pad.bottom

  const max = Math.max(...datos.map((d) => d.ingresos), 1)
  const ticks = escalaEje(max)
  const tope = ticks[ticks.length - 1] || 1

  const anchoBarra = Math.max(6, Math.min(48, (w / datos.length) * 0.72))
  const px = (i) => pad.left + (i + 0.5) * (w / datos.length)

  const salto = Math.ceil(datos.length / 14)

  return (
    <div>
      <svg viewBox={`0 0 ${ancho} ${alto}`} className="w-full h-auto" role="img">
        {ticks.map((t) => {
          const y = pad.top + h - (t / tope) * h
          return (
            <g key={t}>
              <line
                x1={pad.left}
                x2={ancho - pad.right}
                y1={y}
                y2={y}
                stroke="#2a2a3a"
                strokeDasharray={t === 0 ? '0' : '3 3'}
              />
              <text x={pad.left - 8} y={y + 4} textAnchor="end" fontSize="11" fill="#6b7280">
                {numero(t)}
              </text>
            </g>
          )
        })}

        {datos.map((d, i) => {
          const alturaBarra = (d.ingresos / tope) * h
          const x = px(i) - anchoBarra / 2
          const y = pad.top + h - alturaBarra
          const esPico = pico && pico.franja === d.franja

          return (
            <g key={d.franja}>
              <rect
                x={x}
                y={d.ingresos > 0 ? y : pad.top + h - 2}
                width={anchoBarra}
                height={Math.max(d.ingresos > 0 ? 2 : 2, alturaBarra)}
                rx="2"
                fill={esPico ? '#ffaa00' : '#00f0ff'}
                opacity={d.ingresos > 0 ? (esPico ? 0.95 : 0.7) : 0.15}
              >
                <title>{`Entre las ${d.desde} y las ${d.hasta}: ${numero(d.ingresos)} ingresos`}</title>
              </rect>

              {esPico && d.ingresos > 0 && (
                <text
                  x={px(i)}
                  y={Math.max(y - 6, 11)}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="bold"
                  fill="#ffaa00"
                >
                  {numero(d.ingresos)}
                </text>
              )}

              {i % salto === 0 && (
                <text x={px(i)} y={alto - 12} textAnchor="middle" fontSize="10" fill="#6b7280">
                  {d.franja.slice(0, 5)}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      <p className="text-xs text-gray-500 mt-1 text-center">
        Flujo de ingresos por franja de 30 minutos · la barra naranja es el pico
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ */

export function Vacio({ mensaje }) {
  return (
    <div className="h-40 flex items-center justify-center text-sm text-gray-500 border border-dashed border-gamer-light-gray/40 rounded-lg">
      {mensaje}
    </div>
  )
}