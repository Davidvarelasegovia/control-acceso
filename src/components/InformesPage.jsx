import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../utils/api'
import {
  BarrasServicios,
  GraficoSerie,
  GraficoFlujo,
  numero,
} from './charts/Graficos'

/**
 * Pagina de Informes.
 *
 * Dashboard con:
 *  - tarjetas de resumen (total, autorizados, no encontrados, duplicados)
 *  - comparacion contra el periodo anterior
 *  - ingresos por tipo de servicio (desayuno / almuerzo / cena...)
 *  - evolucion diaria, semanal o mensual
 *  - flujo por franjas de 30 minutos, con tabla al lado
 *
 * Todo se arma en el servidor con SQL sobre los datos guardados, asi que
 * cualquier servicio nuevo aparece solo, sin tocar nada.
 */

const HOY = new Date().toISOString().slice(0, 10)

function haceDias(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

const RANGOS = [
  { id: 'hoy', texto: 'Hoy', desde: () => HOY, hasta: () => HOY },
  { id: '7d', texto: '7 días', desde: () => haceDias(6), hasta: () => HOY },
  { id: '30d', texto: '30 días', desde: () => haceDias(29), hasta: () => HOY },
  { id: 'mes', texto: 'Este mes', desde: () => HOY.slice(0, 8) + '01', hasta: () => HOY },
]

const GRANULARIDADES = [
  { id: 'dia', texto: 'Diario' },
  { id: 'semana', texto: 'Semanal' },
  { id: 'mes', texto: 'Mensual' },
]

export default function InformesPage() {
  const navigate = useNavigate()

  const [datos, setDatos] = useState(null)
  const [servicios, setServicios] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const [rango, setRango] = useState('30d')
  const [desde, setDesde] = useState(haceDias(29))
  const [hasta, setHasta] = useState(HOY)
  const [manual, setManual] = useState(false)
  const [granularidad, setGranularidad] = useState('dia')
  const [servicioId, setServicioId] = useState('')
  const [detalle, setDetalle] = useState(null)
  const [viendoDetalle, setViendoDetalle] = useState(false)

  /* ----------------------------- Carga ----------------------------- */

  const cargar = useCallback(async () => {
    setCargando(true)
    setError('')
    try {
      const q = new URLSearchParams({ desde, hasta, granularidad })
      if (servicioId) q.set('servicio_id', servicioId)
      const [inf, svcs] = await Promise.all([
        api.informes(q.toString()),
        api.informesServicios(),
      ])
      setDatos(inf)
      setServicios(svcs)
    } catch (e) {
      setError(e.offline ? 'Sin conexión con el servidor.' : e.message)
    } finally {
      setCargando(false)
    }
  }, [desde, hasta, granularidad, servicioId])

  useEffect(() => {
    cargar()
  }, [cargar])

  /* --------------------- Cambio de rango rápido -------------------- */

  const elegirRango = (id) => {
    setRango(id)
    setManual(false)
    const r = RANGOS.find((x) => x.id === id)
    if (r) {
      setDesde(r.desde())
      setHasta(r.hasta())
    }
  }

  const cambiarFechas = (que, valor) => {
    setManual(true)
    setRango('')
    if (que === 'desde') setDesde(valor)
    else setHasta(valor)
  }

  /* --------------------- Detalle de un servicio -------------------- */

  const verPersonas = async (id) => {
    setViendoDetalle(true)
    setDetalle(null)
    try {
      setDetalle(await api.informePersonas(id))
    } catch (e) {
      setError(e.message)
      setViendoDetalle(false)
    }
  }

  /* ---------------------------- Exportar ---------------------------- */

  const exportar = async () => {
    if (!datos) return
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()

    const encabezado = [
      ['Control de Acceso — Informe de ingresos'],
      ['Generado', new Date().toLocaleString('es-CL')],
      ['Rango', `${datos.filtro.desde} a ${datos.filtro.hasta}`],
      ['Filtro servicio', servicioId ? `#${servicioId}` : 'Todos los servicios'],
      [],
    ]

    // Hoja 1: ingresos por servicio (el gráfico de barras, en números)
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ...encabezado,
        ['Servicio', 'Horario', 'Ingresos', 'Personas distintas', 'Servicios'],
        ...datos.porServicio.map((s) => [s.nombre, s.franja, s.ingresos, s.personas, s.servicios]),
        [],
        ['TOTAL', '', datos.resumen.total, datos.resumen.personasDistintas, datos.resumen.servicios],
      ]),
      'Por servicio'
    )

    // Hoja 2: flujo por franja de 30 min (la tabla del jefe)
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ...encabezado,
        ['Periodo', 'Franja', 'Ingresos'],
        ...datos.flujo.franjas.map((f) => [f.periodo_etiqueta, f.franja, f.ingresos]),
      ]),
      'Flujo 30 min'
    )

    // Hoja 3: evolución
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ...encabezado,
        ['Periodo', 'Etiqueta', 'Autorizados', 'No encontrados'],
        ...datos.serie.map((s) => [s.periodo, s.etiqueta, s.autorizados, s.noEncontrados]),
      ]),
      'Evolución'
    )

    // Hoja 4: listado de servicios
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ...encabezado,
        ['#', 'Servicio', 'Fecha', 'Horario', 'Ingresos', 'No encontrados', 'Duplicados'],
        ...servicios.map((s) => [
          s.id,
          s.nombre,
          s.fecha,
          `${s.hora_inicio}-${s.hora_fin}`,
          s.ingresos,
          s.noEncontrados,
          s.duplicados,
        ]),
      ]),
      'Servicios'
    )

    // Si hay un servicio elegido, agregar el detalle de personas
    if (detalle) {
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([
          ...encabezado,
          ['Nombre', 'RUT', 'Empresa', 'Punto de acceso', 'Hora', 'Estado'],
          ...detalle.personas.map((p) => [
            `${p.nombres} ${p.apellidos}`,
            p.rut,
            p.empresa,
            p.dispositivo,
            new Date(p.hora).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
            p.estado,
          ]),
        ]),
        'Personas del servicio'
      )
    }

    XLSX.writeFile(wb, `informe-acceso-${datos.filtro.desde}_${datos.filtro.hasta}.xlsx`)
  }

  /* ----------------------------- Render ----------------------------- */

  const r = datos?.resumen
  const pico = datos?.flujo?.pico
  const comparativaVar = datos?.comparativa?.variacion

  const etiquetaRango = useMemo(() => {
    if (manual) return `${desde} → ${hasta}`
    return RANGOS.find((x) => x.id === rango)?.texto || 'Personalizado'
  }, [manual, desde, hasta, rango])

  return (
    <div className="min-h-screen bg-gamer-darker">
      {/* ---------------------------- Cabecera ---------------------------- */}
      <header className="sticky top-0 z-40 bg-gamer-darker/90 backdrop-blur-md border-b border-gamer-light-gray/30">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')} className="gamer-btn p-2" title="Volver">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-base font-bold text-white tracking-wider uppercase">
                Informes y Estadísticas
              </h1>
              <p className="text-xs text-gray-400">
                Ingresos por servicio, evolución y flujo de acceso
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={cargar} className="gamer-btn text-sm" disabled={cargando}>
              {cargando ? 'Cargando…' : 'Actualizar'}
            </button>
            <button onClick={exportar} className="gamer-btn-success text-sm" disabled={!datos}>
              Descargar Excel
            </button>
            <a href="/" className="gamer-btn text-sm">
              Volver
            </a>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* --------------------------- Filtros --------------------------- */}
        <div className="gamer-card p-5">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs uppercase tracking-wider text-gray-400 mb-2">
                Período
              </label>
              <div className="flex gap-1.5">
                {RANGOS.map((x) => (
                  <button
                    key={x.id}
                    onClick={() => elegirRango(x.id)}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all ${
                      rango === x.id
                        ? 'bg-gamer-accent/20 border border-gamer-accent/60 text-gamer-accent'
                        : 'bg-gamer-darker/60 border border-gamer-light-gray/40 text-gray-400 hover:text-white'
                    }`}
                  >
                    {x.texto}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider text-gray-400 mb-2">
                Desde
              </label>
              <input
                type="date"
                value={desde}
                max={hasta}
                onChange={(e) => cambiarFechas('desde', e.target.value)}
                className="gamer-input text-sm py-2"
              />
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider text-gray-400 mb-2">
                Hasta
              </label>
              <input
                type="date"
                value={hasta}
                min={desde}
                onChange={(e) => cambiarFechas('hasta', e.target.value)}
                className="gamer-input text-sm py-2"
              />
            </div>

            <div className="grow min-w-56">
              <label className="block text-xs uppercase tracking-wider text-gray-400 mb-2">
                Servicio
              </label>
              <select
                value={servicioId}
                onChange={(e) => setServicioId(e.target.value)}
                className="gamer-input text-sm py-2"
              >
                <option value="">Todos los servicios</option>
                {servicios.map((s) => (
                  <option key={s.id} value={s.id}>
                    #{s.id} · {s.nombre} · {s.fecha} {s.hora_inicio}-{s.hora_fin} ({s.ingresos})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider text-gray-400 mb-2">
                Agrupar por
              </label>
              <div className="flex gap-1.5">
                {GRANULARIDADES.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => setGranularidad(g.id)}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all ${
                      granularidad === g.id
                        ? 'bg-gamer-accent/20 border border-gamer-accent/60 text-gamer-accent'
                        : 'bg-gamer-darker/60 border border-gamer-light-gray/40 text-gray-400 hover:text-white'
                    }`}
                  >
                    {g.texto}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="gamer-card p-4 border-gamer-danger/50 bg-gamer-danger/5 text-gamer-danger text-sm">
            {error}
          </div>
        )}

        {cargando && !datos && (
          <div className="text-center py-20 text-gamer-accent animate-pulse">Calculando informes…</div>
        )}

        {r && (
          <>
            {/* ------------------------- Tarjetas KPI ------------------------- */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Kpi
                valor={numero(r.total)}
                etiqueta="Ingresos totales"
                pie="Personas que pasaron"
                color="text-gamer-accent"
                variacion={comparativaVar}
                comparativa={datos.comparativa}
              />
              <Kpi valor={numero(r.autorizados)} etiqueta="Autorizados" pie="Entradas válidas" color="text-gamer-success" />
              <Kpi valor={numero(r.noEncontrados)} etiqueta="No encontrados" pie="Identificador sin registro" color="text-gamer-warning" />
              <Kpi valor={numero(r.duplicados)} etiqueta="Duplicados" pie="Reingresos rechazados" color="text-gamer-danger" />
            </div>

            {/* ---------------------------- Avisos ---------------------------- */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Aviso
                titulo="Pico de acceso"
                valor={pico ? `${pico.franja}` : '—'}
                detalle={pico ? `${numero(pico.ingresos)} ingresos en esa franja` : 'Sin ingresos en el rango'}
                color="text-gamer-warning"
              />
              <Aviso
                titulo="Servicios en el rango"
                valor={numero(r.servicios)}
                detalle={`${numero(datos.porServicio.length)} tipos distintos · ${numero(r.personasDistintas)} personas`}
                color="text-gamer-accent"
              />
              <Aviso
                titulo="Rango analizado"
                valor={etiquetaRango}
                detalle={`${datos.comparativa.dias} días de historial`}
                color="text-gray-300"
                textoGrande={false}
              />
            </div>

            {/* ------------------- Gráfico: por servicio -------------------- */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Seccion
                titulo="Ingresos por servicio"
                subtitulo="Desayuno, almuerzo, cena… Los servicios con el mismo nombre se suman entre sí"
              >
                <BarrasServicios datos={datos.porServicio} />
              </Seccion>

              <Seccion
                titulo={`Evolución ${granularidad === 'dia' ? 'diaria' : granularidad === 'semana' ? 'semanal' : 'mensual'}`}
                subtitulo="Cómo se mueven los ingresos a lo largo del tiempo"
              >
                <GraficoSerie serie={datos.serie} granularidad={granularidad} />
              </Seccion>
            </div>

            {/* -------------------------- Flujo ----------------------------- */}
            <Seccion
              titulo="Control de flujo por franja de 30 minutos"
              subtitulo="En qué horarios se concentran los ingresos"
              extra={
                pico && (
                  <span className="text-xs text-gamer-warning">
                    Pico: {pico.franja} · {numero(pico.ingresos)} ingresos
                  </span>
                )
              }
            >
              <GraficoFlujo datos={datos.flujo.flujoConsolidado} pico={pico} />

              <TablaFlujo franjas={datos.flujo.franjas} />
            </Seccion>

            {/* ------------------ Tabla de servicios ------------------------ */}
            <Seccion
              titulo="Informes por servicio"
              subtitulo="Haz clic en “Ver personas” para el detalle de quién pasó en ese servicio"
            >
              <TablaServicios
                servicios={servicios}
                servicioId={servicioId}
                onElegir={setServicioId}
                onVerPersonas={verPersonas}
              />
            </Seccion>
          </>
        )}

        {/* ---------------------- Detalle de personas --------------------- */}
        {(viendoDetalle || detalle) && (
          <DetalleServicio
            detalle={detalle}
            cargando={viendoDetalle && !detalle}
            onCerrar={() => {
              setDetalle(null)
              setViendoDetalle(false)
            }}
          />
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Piezas de la pagina                                                */
/* ------------------------------------------------------------------ */

function Kpi({ valor, etiqueta, pie, color, variacion, comparativa }) {
  return (
    <div className="gamer-card p-5">
      <div className="text-xs uppercase tracking-wider text-gray-400">{etiqueta}</div>
      <div className={`text-4xl font-bold mt-1 tabular-nums ${color}`}>{valor}</div>
      <div className="text-xs text-gray-500 mt-1">{pie}</div>

      {variacion !== undefined && (
        <div
          className={`text-xs mt-2 font-medium ${
            variacion > 0 ? 'text-gamer-success' : variacion < 0 ? 'text-gamer-danger' : 'text-gray-500'
          }`}
        >
          {variacion === null
            ? 'Sin periodo anterior'
            : `${variacion > 0 ? '▲' : variacion < 0 ? '▼' : '='} ${Math.abs(variacion).toFixed(1)}% vs ${comparativa.anterior}`}
        </div>
      )}
    </div>
  )
}

function Aviso({ titulo, valor, detalle, color, textoGrande = true }) {
  return (
    <div className="gamer-card p-4">
      <div className="text-xs uppercase tracking-wider text-gray-400">{titulo}</div>
      <div className={`${textoGrande ? 'text-2xl' : 'text-base'} font-bold mt-1 ${color}`}>
        {valor}
      </div>
      <div className="text-xs text-gray-500 mt-0.5">{detalle}</div>
    </div>
  )
}

function Seccion({ titulo, subtitulo, children, extra }) {
  return (
    <div className="gamer-card p-6">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider">{titulo}</h2>
          {subtitulo && <p className="text-xs text-gray-500 mt-0.5">{subtitulo}</p>}
        </div>
        {extra}
      </div>
      {children}
    </div>
  )
}

/** Tabla del flujo: "entre las 13:30 y las 14:00 ingresaron 420" */
function TablaFlujo({ franjas }) {
  if (!franjas || franjas.length === 0) {
    return <p className="text-sm text-gray-500 mt-4">Sin datos de flujo en este rango.</p>
  }

  const max = Math.max(...franjas.map((f) => f.ingresos), 1)
  // Si hay muchas franjas se muestran las de mayor flujo primero, igual que el grafico
  const orden = [...franjas].sort((a, b) => b.ingresos - a.ingresos)

  return (
    <div className="mt-6 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-gray-400 border-b border-gamer-light-gray/40">
            <th className="p-2">Periodo</th>
            <th className="p-2">Franja horaria</th>
            <th className="p-2 text-right">Ingresos</th>
            <th className="p-2 w-1/3">Proporción</th>
          </tr>
        </thead>
        <tbody>
          {orden.map((f) => (
            <tr
              key={`${f.periodo}-${f.franja}`}
              className="border-b border-gamer-light-gray/20 last:border-0 hover:bg-gamer-light-gray/10"
            >
              <td className="p-2 text-gray-400 whitespace-nowrap">{f.periodo_etiqueta}</td>
              <td className="p-2 text-white whitespace-nowrap">
                <span className="text-gamer-accent font-mono">{f.desde}</span>
                <span className="text-gray-500"> → </span>
                <span className="text-gamer-accent font-mono">{f.hasta}</span>
              </td>
              <td className="p-2 text-right font-semibold text-white tabular-nums">
                {numero(f.ingresos)}
              </td>
              <td className="p-2">
                <div className="h-2 bg-gamer-darker rounded overflow-hidden">
                  <div
                    className="h-full rounded"
                    style={{
                      width: `${(f.ingresos / max) * 100}%`,
                      background: 'linear-gradient(90deg, #0080ff 0%, #00f0ff 100%)',
                    }}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TablaServicios({ servicios, servicioId, onElegir, onVerPersonas }) {
  if (!servicios || servicios.length === 0) {
    return <p className="text-sm text-gray-500">Todavía no hay servicios generados.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-gray-400 border-b border-gamer-light-gray/40">
            <th className="p-2">#</th>
            <th className="p-2">Servicio</th>
            <th className="p-2">Fecha</th>
            <th className="p-2">Horario</th>
            <th className="p-2 text-right">Ingresos</th>
            <th className="p-2 text-right">No enc.</th>
            <th className="p-2 text-right">Dup.</th>
            <th className="p-2 text-right">Personas</th>
          </tr>
        </thead>
        <tbody>
          {servicios.map((s) => (
            <tr
              key={s.id}
              onClick={() => onElegir(String(s.id) === servicioId ? '' : String(s.id))}
              className={`border-b border-gamer-light-gray/20 last:border-0 cursor-pointer hover:bg-gamer-light-gray/10 ${
                String(s.id) === servicioId ? 'bg-gamer-accent/10' : ''
              }`}
            >
              <td className="p-2 text-gray-500">{s.id}</td>
              <td className="p-2 text-white">{s.nombre}</td>
              <td className="p-2 text-gray-400 font-mono text-xs">{s.fecha}</td>
              <td className="p-2 text-gray-400 font-mono text-xs">
                {s.hora_inicio}-{s.hora_fin}
              </td>
              <td className="p-2 text-right text-gamer-success font-semibold tabular-nums">
                {numero(s.ingresos)}
              </td>
              <td className="p-2 text-right text-gamer-warning tabular-nums">{s.noEncontrados}</td>
              <td className="p-2 text-right text-gamer-danger tabular-nums">{s.duplicados}</td>
              <td className="p-2 text-right">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onVerPersonas(s.id)
                  }}
                  className="text-xs px-2 py-1 rounded bg-gamer-accent/10 border border-gamer-accent/30 text-gamer-accent hover:bg-gamer-accent/20 transition-colors"
                >
                  Ver personas
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Detalle de quien paso en un servicio puntual. */
function DetalleServicio({ detalle, cargando, onCerrar }) {
  return (
    <div className="gamer-card p-6 border-gamer-accent/40">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
            Personas que pasaron
          </h2>
          {detalle && (
            <p className="text-xs text-gray-500 mt-0.5">
              Servicio #{detalle.servicio.id} · {detalle.servicio.nombre} ·{' '}
              {detalle.servicio.fecha} {detalle.servicio.hora_inicio}-{detalle.servicio.hora_fin} ·{' '}
              <span className="text-gamer-success">{numero(detalle.total)} ingresos</span>
              {detalle.noEncontrados > 0 && (
                <>
                  {' '}
                  · <span className="text-gamer-warning">
                      {numero(detalle.noEncontrados)} no encontrados
                  </span>
                </>
              )}
            </p>
          )}
        </div>
        <button onClick={onCerrar} className="gamer-btn text-xs">
          Cerrar
        </button>
      </div>

      {cargando ? (
        <div className="text-gamer-accent animate-pulse py-8 text-center">Cargando personas…</div>
      ) : (
        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gamer-gray">
              <tr className="text-left text-xs uppercase tracking-wider text-gray-400">
                <th className="p-2">Nombre</th>
                <th className="p-2">Identificador</th>
                <th className="p-2">Empresa</th>
                <th className="p-2">Punto de acceso</th>
                <th className="p-2">Hora</th>
                <th className="p-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {detalle.personas.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-gamer-light-gray/20 last:border-0 hover:bg-gamer-light-gray/10"
                >
                  <td className="p-2 text-white">
                    {p.nombres} {p.apellidos}
                  </td>
                  <td className="p-2 text-gamer-accent font-mono text-xs">{p.rut}</td>
                  <td className="p-2 text-gray-400 text-xs">{p.empresa || '—'}</td>
                  <td className="p-2 text-gray-400 text-xs">{p.dispositivo || '—'}</td>
                  <td className="p-2 text-gray-400 font-mono text-xs">
                    {new Date(p.hora).toLocaleTimeString('es-CL', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="p-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        p.estado === 'autorizado'
                          ? 'bg-gamer-success/15 text-gamer-success'
                          : 'bg-gamer-warning/15 text-gamer-warning'
                      }`}
                    >
                      {p.estado}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}