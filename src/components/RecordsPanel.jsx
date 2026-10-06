import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import * as XLSX from 'xlsx'
import api from '../utils/api'

export default function RecordsPanel() {
  const [records, setRecords] = useState([])
  const [eventos, setEventos] = useState([])
  const [servicios, setServicios] = useState([])
  const [servicioActual, setServicioActual] = useState(null)
  const [venue, setVenue] = useState({ nombre: 'Control de Acceso' })
  const [alcance, setAlcance] = useState('actual') // 'actual' | 'todos' | id
  const [filter, setFilter] = useState('todos')
  const [search, setSearch] = useState('')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const params =
        alcance === 'todos'
          ? '?limite=1000'
          : alcance === 'actual'
          ? '?servicio=actual&limite=1000'
          : `?servicio_id=${alcance}&limite=1000`

      const [rs, es, ss, estado] = await Promise.all([
        api.registros(params),
        api.eventos(alcance === 'todos' ? '?limite=1000' : alcance === 'actual' ? '?servicio=actual&limite=1000' : `?servicio_id=${alcance}&limite=1000`),
        api.servicios(),
        api.estado(),
      ])
      setRecords(rs)
      setEventos(es)
      setServicios(ss)
      setServicioActual(estado.servicio)
      setVenue(estado.venue)
      setError('')
    } catch (e) {
      setError(e.offline ? 'Sin conexión con el servidor de base de datos.' : e.message)
    } finally {
      setCargando(false)
    }
  }, [alcance])

  useEffect(() => {
    cargar()
  }, [cargar])

  const filtrados = records.filter((r) => {
    const coincideFiltro = filter === 'todos' || r.estado === filter
    const texto = search.toLowerCase()
    const coincideBusqueda =
      `${r.nombres} ${r.apellidos}`.toLowerCase().includes(texto) || r.rut.toLowerCase().includes(texto)
    return coincideFiltro && coincideBusqueda
  })

  // Los duplicados son intentos rechazados: viven aparte, no son ingresos.
  // El total cuenta SOLO los ingresos autorizados.
  const duplicados = eventos.filter((e) => e.tipo === 'duplicado').length
  const autorizados = records.filter((r) => r.estado === 'autorizado').length

  const stats = {
    total: autorizados,
    autorizados,
    duplicados,
    noEncontrados: records.filter((r) => r.estado === 'no-encontrado').length,
  }

  const nombreAlcance = () => {
    if (alcance === 'todos') return 'Historial completo'
    if (alcance === 'actual')
      return servicioActual
        ? `Servicio #${servicioActual.id} ${servicioActual.nombre}`
        : 'Sin servicio activo'
    const s = servicios.find((x) => String(x.id) === String(alcance))
    return s ? `Servicio #${s.id} ${s.nombre}` : `Servicio ${alcance}`
  }

  const estadoTexto = (e) =>
    e === 'autorizado' ? 'Autorizado' : e === 'duplicado' ? 'Duplicado' : 'No Encontrado'

  const estadoBadge = (e) =>
    e === 'autorizado'
      ? 'bg-gamer-success/20 text-gamer-success'
      : e === 'duplicado'
      ? 'bg-gamer-warning/20 text-gamer-warning'
      : 'bg-gamer-danger/20 text-gamer-danger'

  const fmtFecha = (iso) =>
    new Date(iso).toLocaleString('es-CL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  const fmtHora = (iso) =>
    new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })

  const exportarExcel = () => {
    const titulo = `Informe de Accesos - ${venue.nombre}`
    const subtitulo = `${nombreAlcance()} · ${servicioActual?.fecha ?? ''} ${
      servicioActual ? `${servicioActual.hora_inicio} - ${servicioActual.hora_fin}` : ''
    }`.trim()
    const generado = new Date().toLocaleString('es-CL')

    const filas = [
      [titulo],
      [subtitulo],
      [`Generado: ${generado}`],
      [
        `Total: ${stats.total}  |  Autorizados: ${stats.autorizados}  |  Duplicados: ${stats.duplicados}  |  No encontrados: ${stats.noEncontrados}`,
      ],
      [],
      ['Nombres', 'Apellidos', 'RUT', 'Empresa', 'Hora de Ingreso', 'Punto de acceso', 'Estado', 'Servicio'],
      ...filtrados.map((r) => [
        r.nombres,
        r.apellidos,
        r.rut,
        r.empresa || 'N/A',
        fmtHora(r.hora),
        r.dispositivo || 'N/A',
        estadoTexto(r.estado),
        r.servicio_nombre ? `#${r.servicio_id} ${r.servicio_nombre}` : 'Sin servicio',
      ]),
    ]

    const ws = XLSX.utils.aoa_to_sheet(filas)

    // Encabezados con formato
    const headRow = 6
    for (let c = 0; c < 8; c++) {
      const ref = XLSX.utils.encode_cell({ r: headRow - 1, c })
      if (ws[ref]) {
        ws[ref].s = {
          font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 12 },
          fill: { fgColor: { rgb: '111827' } },
          alignment: { horizontal: 'center' },
        }
      }
    }
    ws['!cols'] = [
      { wch: 20 }, { wch: 24 }, { wch: 15 }, { wch: 26 },
      { wch: 17 }, { wch: 26 }, { wch: 15 }, { wch: 28 },
    ]
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 7 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 7 } },
      { s: { r: 3, c: 0 }, e: { r: 3, c: 7 } },
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Registros')
    XLSX.writeFile(wb, `informe_${(venue.nombre || 'acceso').replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="gamer-title">Registro de Accesos</h2>
          <p className="text-gray-400 text-sm mt-1">Mostrando: <span className="text-white">{nombreAlcance()}</span></p>
        </div>
        <button onClick={exportarExcel} className="gamer-btn-success flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Exportar a Excel
        </button>
      </div>

      {error && (
        <div className="gamer-card p-4 border-gamer-danger/50 bg-gamer-danger/5 text-gamer-danger text-sm">
          {error}
        </div>
      )}

      {/* Selector de alcance */}
      <div className="gamer-card p-4">
        <label className="block text-xs uppercase tracking-wider text-gray-400 mb-2">
          Periodo del informe
        </label>
        <select value={alcance} onChange={(e) => setAlcance(e.target.value)} className="gamer-input">
          <option value="actual">Servicio en curso</option>
          <option value="todos">Historial completo (todos los servicios)</option>
          {servicios.map((s) => (
            <option key={s.id} value={s.id}>
              #{s.id} {s.nombre} — {s.fecha} ({s.estado})
            </option>
          ))}
        </select>
      </div>

      {/* Informes y estadisticas */}
      <div className="gamer-card p-5 border-gamer-accent/30">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <svg
              className="w-6 h-6 text-gamer-accent shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
            <div>
              <h3 className="text-white font-semibold">Informes y estadísticas</h3>
              <p className="text-gray-400 text-sm mt-0.5">
                Gráficos por servicio, evolución diaria/semanal/mensual y control de flujo por
                franjas de 30 minutos
              </p>
            </div>
          </div>

          <Link to="/informes" className="gamer-btn flex items-center gap-2 shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
              />
            </svg>
            Ver informes
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="gamer-card p-4 text-center">
          <div className="text-3xl font-bold text-white">{stats.total}</div>
          <div className="text-sm text-gray-400">Total Autorizados</div>
        </div>
        <div className="gamer-card p-4 text-center border-gamer-success/30">
          <div className="text-3xl font-bold text-gamer-success">{stats.autorizados}</div>
          <div className="text-sm text-gray-400">Autorizados</div>
        </div>
        <div className="gamer-card p-4 text-center border-gamer-warning/30">
          <div className="text-3xl font-bold text-gamer-warning">{stats.duplicados}</div>
          <div className="text-sm text-gray-400">Duplicados</div>
        </div>
        <div className="gamer-card p-4 text-center border-gamer-danger/30">
          <div className="text-3xl font-bold text-gamer-danger">{stats.noEncontrados}</div>
          <div className="text-sm text-gray-400">No Encontrados</div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar por nombre o RUT..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="gamer-input pl-12"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {['todos', 'autorizado', 'duplicado', 'no-encontrado'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                filter === f
                  ? 'bg-gamer-accent/20 text-gamer-accent border border-gamer-accent/30'
                  : 'bg-gamer-gray/50 text-gray-400 border border-gamer-light-gray/30 hover:text-white'
              }`}
            >
              {f === 'todos' ? 'Todos' : f === 'no-encontrado' ? 'No Encontrados' : estadoTexto(f)}
            </button>
          ))}
        </div>
      </div>

      {/* Intentos de reingreso rechazados */}
      {eventos.length > 0 && (
        <div className="gamer-card p-6 border-gamer-warning/30">
          <h3 className="text-lg font-semibold text-white mb-1">
            Reintentos de ingreso rechazados <span className="text-gamer-warning">({eventos.length})</span>
          </h3>
          <p className="text-gray-400 text-sm mb-4">
            Personas que intentaron volver a entrar durante el mismo servicio. No cuentan como
            ingresos, pero queda constancia de en qué acceso ya estaban registradas.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gamer-light-gray/50 text-left text-gray-400">
                  <th className="py-2 px-3 uppercase tracking-wider text-xs">Hora</th>
                  <th className="py-2 px-3 uppercase tracking-wider text-xs">Persona</th>
                  <th className="py-2 px-3 uppercase tracking-wider text-xs">RUT</th>
                  <th className="py-2 px-3 uppercase tracking-wider text-xs">Intento en</th>
                  <th className="py-2 px-3 uppercase tracking-wider text-xs">Ya registrado en</th>
                </tr>
              </thead>
              <tbody>
                {eventos.map((e) => (
                  <tr key={e.id} className="border-b border-gamer-light-gray/20 last:border-0">
                    <td className="py-2 px-3 text-gray-400 whitespace-nowrap">{fmtFecha(e.hora)}</td>
                    <td className="py-2 px-3 text-white">{e.nombres}</td>
                    <td className="py-2 px-3 text-gray-300 font-mono text-xs">{e.rut}</td>
                    <td className="py-2 px-3 text-gamer-warning whitespace-nowrap">{e.dispositivo}</td>
                    <td className="py-2 px-3 text-gamer-danger whitespace-nowrap">
                      {e.acceso_previo || 'otro punto de acceso'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="gamer-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gamer-light-gray/50">
                {['Fecha/Hora', 'Nombre', 'RUT', 'Empresa', 'Servicio', 'Punto de acceso', 'Estado'].map((h) => (
                  <th key={h} className="text-left p-4 text-sm font-semibold text-gray-400 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrados.map((r) => (
                <tr key={r.id} className="border-b border-gamer-light-gray/30 hover:bg-gamer-light-gray/20 transition-colors">
                  <td className="p-4 text-gray-400 text-sm whitespace-nowrap">{fmtFecha(r.hora)}</td>
                  <td className="p-4 text-white whitespace-nowrap">
                    {r.nombres} {r.apellidos}
                  </td>
                  <td className="p-4 text-gray-300 font-mono text-sm">{r.rut}</td>
                  <td className="p-4 text-gray-400 text-sm">{r.empresa || '—'}</td>
                  <td className="p-4 text-gray-400 text-sm whitespace-nowrap">
                    {r.servicio_nombre ? `#${r.servicio_id} ${r.servicio_nombre}` : '—'}
                  </td>
                  <td className="p-4 text-gamer-accent text-sm whitespace-nowrap">
                    {r.dispositivo || '—'}
                  </td>
                  <td className="p-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${estadoBadge(r.estado)}`}>
                      {estadoTexto(r.estado)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!cargando && filtrados.length === 0 && (
          <div className="p-8 text-center text-gray-500">No hay registros para mostrar</div>
        )}
        {cargando && <div className="p-8 text-center text-gray-500">Cargando…</div>}
      </div>
    </div>
  )
}
