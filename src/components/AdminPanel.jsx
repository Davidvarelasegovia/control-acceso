/**
 * Panel de administracion de la base de datos.
 *
 * Ruta: /admin  (accesible desde el servidor Node en :3001 o via Vite en :5173)
 * TODO lo que hace aqui escribe de verdad en SQLite, no en el navegador.
 */
import { useState, useEffect, useCallback } from 'react'
import { clave as claveId } from '../utils/identificador'
import UsersPanel from './UsersPanel'
import AccessLogPanel from './AccessLogPanel'
import ImportPeople from './ImportPeople'
import { apiAuth } from '../utils/auth'

const vacio = { nombres: '', apellidos: '', rut: '', empresa: '' }

export default function AdminPanel({ usuario, onSalir }) {
  const [tab, setTab] = useState('personas')
  const [personas, setPersonas] = useState([])
  const [registros, setRegistros] = useState([])
  const [servicios, setServicios] = useState([])
  const [horarios, setHorarios] = useState([])
  const [estado, setEstado] = useState(null)
  const [sql, setSql] = useState('SELECT * FROM personas LIMIT 20;')
  const [sqlResult, setSqlResult] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [form, setForm] = useState(vacio)
  const [editando, setEditando] = useState(null)

  const API = import.meta.env.VITE_API_URL || '/api'

  const pedir = useCallback(
    async (ruta, opciones = {}) => {
      const token = apiAuth.leerToken?.() ?? localStorage.getItem('control_acceso_token')

      const res = await fetch(`${API}${ruta}`, {
        ...opciones,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(opciones.headers || {}),
        },
      })

      const cuerpo = await res.json().catch(() => ({}))

      if (res.status === 401) {
        localStorage.removeItem('control_acceso_token')
        localStorage.removeItem('control_acceso_usuario')
        throw new Error('Sesión no válida. Vuelve a ingresar.')
      }
      if (!cuerpo.ok) throw new Error(cuerpo.error || `Error ${res.status}`)
      return cuerpo.data
    },
    [API]
  )

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const [p, r, s, h, e] = await Promise.all([
        pedir('/personas'),
        pedir('/registros?limite=200'),
        pedir('/servicios'),
        pedir('/horarios'),
        pedir('/estado'),
      ])
      setPersonas(p)
      setRegistros(r)
      setServicios(s)
      setHorarios(h)
      setEstado(e)
      setError('')
    } catch (err) {
      setError(
        err instanceof TypeError
          ? 'Sin conexión con el servidor de base de datos. Levanta con: npm run server'
          : err.message
      )
    } finally {
      setCargando(false)
    }
  }, [pedir])

  useEffect(() => {
    cargar()
  }, [cargar])

  const avisar = (texto) => {
    setAviso(texto)
    setTimeout(() => setAviso(''), 3000)
  }

  /* ------------------------------ Personas ------------------------------ */

  const guardarPersona = async (e) => {
    e.preventDefault()
    try {
      if (editando) {
        await pedir(`/personas/${editando.id}`, {
          method: 'PUT',
          body: JSON.stringify(form),
        })
        avisar('Persona actualizada en la base de datos')
      } else {
        await pedir('/personas', { method: 'POST', body: JSON.stringify(form) })
        avisar('Persona agregada a la base de datos')
      }
      setForm(vacio)
      setEditando(null)
      await cargar()
    } catch (err) {
      setError(err.message)
    }
  }

  const eliminarPersona = async (p) => {
    if (!confirm(`¿Eliminar a ${p.nombres} ${p.apellidos}?\n\nRUT: ${p.rut}\n\nLos registros de sus ingresos se conservan.`))
      return
    try {
      await pedir(`/personas/${p.id}`, { method: 'DELETE' })
      avisar('Registro eliminado de la base de datos')
      await cargar()
    } catch (err) {
      setError(err.message)
    }
  }

  const alternarActivo = async (p) => {
    try {
      await pedir(`/personas/${p.id}`, {
        method: 'PUT',
        body: JSON.stringify({ activo: !p.activo }),
      })
      await cargar()
    } catch (err) {
      setError(err.message)
    }
  }

  /* -------------------------------- SQL --------------------------------- */

  const ejecutarSql = async () => {
    try {
      const data = await pedir('/admin/sql', { method: 'POST', body: JSON.stringify({ sql }) })
      setSqlResult(data)
      setError('')
      await cargar()
    } catch (err) {
      setSqlResult({ error: err.message })
    }
  }

  /* ---------------------- Base de datos (archivo) --------------------- */

  const [dbInfo, setDbInfo] = useState(null)
  const [compactando, setCompactando] = useState(false)

  const leerDb = useCallback(async () => {
    try {
      setDbInfo(await pedir('/admin/estado-db'))
    } catch {
      setDbInfo(null)
    }
  }, [pedir])

  useEffect(() => {
    leerDb()
  }, [leerDb])

  const compactar = async () => {
    setCompactando(true)
    try {
      const r = await pedir('/admin/compactar', { method: 'POST', body: '{}' })
      avisar(`Base compactada: ${(r.bytes / 1024).toFixed(0)} KB`)
      await leerDb()
    } catch (err) {
      setError(
        `${err.message}. Cierra DB Browser o DBeaver si la base está abierta ahí.`
      )
    } finally {
      setCompactando(false)
    }
  }

  /* ------------------------------ Render -------------------------------- */

  /* ver AdminPanel: sin validacion de identificador */

  if (cargando) {
    return <div className="p-8 text-center text-gray-400">Conectando con la base de datos…</div>
  }

  return (
    <div className="min-h-screen bg-gamer-darker p-6 max-w-7xl mx-auto">
      {/* Barra de navegacion fija */}
      <header className="sticky top-0 z-40 -mx-6 -mt-6 px-6 py-3 mb-6 bg-gamer-darker/90 backdrop-blur-md border-b border-gamer-light-gray/30">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={() => history.back()} className="gamer-btn p-2" title="Volver">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-xl font-bold text-white tracking-wider uppercase">
                Panel de Base de Datos
              </h1>
              <p className="text-xs text-gray-400 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-gamer-success animate-pulse" />
                {estado ? 'Conectado a SQLite' : 'Sin conexión'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {usuario && (
              <div className="px-3 py-1.5 rounded-lg bg-gamer-darker/70 border border-gamer-light-gray/30">
                <span className="text-xs text-white">{usuario.nombre}</span>
                <span className="ml-2 text-[10px] uppercase tracking-wider font-bold text-gamer-danger">
                  {usuario.rol}
                </span>
              </div>
            )}
            <a href="/agente" className="gamer-btn text-sm">
              Horarios y servicios
            </a>
            <a href="/" className="gamer-btn-success text-sm">
              Pantalla principal
            </a>
            <button onClick={cargar} className="gamer-btn text-sm">
              Actualizar
            </button>
            {onSalir && (
              <button onClick={onSalir} className="gamer-btn-danger text-sm">
                Cerrar sesión
              </button>
            )}
          </div>
        </div>
      </header>

      {error && (
        <div className="gamer-card p-4 mb-4 border-gamer-danger/50 bg-gamer-danger/5 text-gamer-danger text-sm">
          {error}
        </div>
      )}
      {aviso && (
        <div className="gamer-card p-4 mb-4 border-gamer-success/50 bg-gamer-success/5 text-gamer-success text-sm">
          {aviso}
        </div>
      )}

      {/* Archivo de base de datos */}
      {dbInfo && (
        <div className="gamer-card p-4 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="text-sm">
              <span className="text-gray-400">Archivo: </span>
              <span className="font-mono text-gamer-accent">{dbInfo.archivo}</span>
              <span className="text-gray-500 ml-3">
                {(dbInfo.bytes / 1024).toFixed(0)} KB · modo {dbInfo.journal_mode}
              </span>
            </div>
            <div className="flex gap-2">
              <button onClick={leerDb} className="gamer-btn text-sm">
                Ver archivo
              </button>
              <button onClick={compactar} disabled={compactando} className="gamer-btn text-sm">
                {compactando ? 'Compactando…' : 'Compactar base'}
              </button>
            </div>
          </div>
          <p className="text-gray-500 text-xs mt-2">
            Para verla con DB Browser for SQLite: cierra ese programa, pulsa{' '}
            <strong className="text-gray-400">Compactar base</strong> y abre{' '}
            <span className="font-mono">data\control-acceso.db</span>. Con eso verás todos los datos.
          </p>
        </div>
      )}

      {/* Métricas */}
      {estado && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {[
            ['Personas', personas.length, 'text-white'],
            ['Registros', estado.total_global, 'text-gamer-accent'],
            ['Servicios', servicios.length, 'text-white'],
            ['Horarios', horarios.length, 'text-white'],
            [
              'Servicio',
              estado.servicio ? `#${estado.servicio.id}` : '—',
              estado.servicio ? 'text-gamer-success' : 'text-gamer-warning',
            ],
          ].map(([titulo, valor, color]) => (
            <div key={titulo} className="gamer-card p-4 text-center">
              <div className={`text-2xl font-bold ${color}`}>{valor}</div>
              <div className="text-xs text-gray-400 uppercase tracking-wider">{titulo}</div>
            </div>
          ))}
        </div>
      )}

      {/* Pestañas */}
      <div className="flex gap-2 mb-6 flex-wrap border-b border-gamer-light-gray/30 pb-3">
        {[
          ['personas', 'Personas'],
          ['registros', 'Registros'],
          ['eventos', 'Eventos'],
          ['servicios', 'Servicios'],
          ['horarios', 'Horarios'],
          ['usuarios', 'Usuarios y Agentes'],
          ['importar', 'Importar desde Excel'],
          ['accesos', 'Bitácora de Ingresos'],
          ['sql', 'Consola SQL'],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === id
                ? 'bg-gamer-accent/20 text-gamer-accent border border-gamer-accent/40'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ------------------------------ USUARIOS ----------------------------- */}
      {tab === 'usuarios' && <UsersPanel />}

      {/* ------------------------------- BITACORA ---------------------------- */}
      {tab === 'accesos' && <AccessLogPanel />}

      {/* ----------------------------- IMPORTAR ------------------------------ */}
      {tab === 'importar' && (
        <ImportPeople
          onCancelar={() => setTab('personas')}
          onImportar={async (personas) => {
            const r = await pedir('/personas/importar', {
              method: 'POST',
              body: JSON.stringify({ personas }),
              timeout: 60000,
            })
            await cargar()
            return r
          }}
        />
      )}

      {/* ------------------------------ PERSONAS ------------------------------ */}
      {tab === 'personas' && (
        <div className="space-y-6">
          <div className="gamer-card p-6">
            <h2 className="text-lg font-semibold text-white mb-4">
              {editando ? `Editar: ${editando.nombres} ${editando.apellidos}` : 'Agregar persona'}
            </h2>
            <form onSubmit={guardarPersona} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Nombres</label>
                <input
                  required
                  value={form.nombres}
                  onChange={(e) => setForm({ ...form, nombres: e.target.value })}
                  className="gamer-input"
                  placeholder="Juan Carlos"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Apellidos</label>
                <input
                  required
                  value={form.apellidos}
                  onChange={(e) => setForm({ ...form, apellidos: e.target.value })}
                  className="gamer-input"
                  placeholder="Pérez González"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Identificador / RUT</label>
                <input
                  required
                  value={form.rut}
                  onChange={(e) => setForm({ ...form, rut: e.target.value })}
                  className="gamer-input"
                  placeholder="12.345.678-5 · 13874809-K · 123"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {form.rut.trim()
                    ? `Clave de búsqueda: ${claveId(form.rut) || '(vacía)'}`
                    : 'Sin validación: cualquier formato sirve'}
                </p>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Empresa</label>
                <input
                  value={form.empresa}
                  onChange={(e) => setForm({ ...form, empresa: e.target.value })}
                  className="gamer-input"
                  placeholder="Nombre de la empresa"
                />
              </div>
              <div className="lg:col-span-4 flex gap-2 justify-end">
                {editando && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditando(null)
                      setForm(vacio)
                    }}
                    className="gamer-btn-danger"
                  >
                    Cancelar
                  </button>
                )}
                <button type="submit" className="gamer-btn-success">
                  {editando ? 'Guardar cambios' : 'Agregar a la base de datos'}
                </button>
              </div>
            </form>
          </div>

          <div className="gamer-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gamer-light-gray/50">
                    {['Nombres', 'Apellidos', 'RUT', 'Empresa', 'Estado', 'Acciones'].map((h) => (
                      <th key={h} className="text-left p-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {personas.map((p) => (
                    <tr key={p.id} className="border-b border-gamer-light-gray/20 hover:bg-gamer-light-gray/10">
                      <td className="p-3 text-white">{p.nombres}</td>
                      <td className="p-3 text-white">{p.apellidos}</td>
                      <td className="p-3 text-gray-300 font-mono text-sm">{p.rut}</td>
                      <td className="p-3 text-gray-400 text-sm">{p.empresa || '—'}</td>
                      <td className="p-3">
                        <button
                          onClick={() => alternarActivo(p)}
                          className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            p.activo
                              ? 'bg-gamer-success/20 text-gamer-success'
                              : 'bg-gamer-gray/30 text-gray-500'
                          }`}
                        >
                          {p.activo ? 'Activo' : 'Inactivo'}
                        </button>
                      </td>
                      <td className="p-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setEditando(p)
                              setForm({
                                nombres: p.nombres,
                                apellidos: p.apellidos,
                                rut: p.rut,
                                empresa: p.empresa || '',
                              })
                              window.scrollTo({ top: 0, behavior: 'smooth' })
                            }}
                            className="p-2 rounded-lg bg-gamer-accent/10 text-gamer-accent hover:bg-gamer-accent/25"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => eliminarPersona(p)}
                            className="p-2 rounded-lg bg-gamer-danger/10 text-gamer-danger hover:bg-gamer-danger/25"
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {personas.length === 0 && (
              <div className="p-8 text-center text-gray-500">No hay personas registradas</div>
            )}
          </div>
        </div>
      )}

      {/* ----------------------------- REGISTROS ----------------------------- */}
      {tab === 'registros' && (
        <div className="gamer-card overflow-hidden">
          <div className="overflow-x-auto max-h-[70vh]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gamer-darker">
                <tr className="border-b border-gamer-light-gray/50">
                  {['Fecha', 'Servicio', 'Nombre', 'RUT', 'Acceso', 'Estado'].map((h) => (
                    <th key={h} className="text-left p-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {registros.map((r) => (
                  <tr key={r.id} className="border-b border-gamer-light-gray/20">
                    <td className="p-3 text-gray-400 text-xs whitespace-nowrap">
                      {new Date(r.hora).toLocaleString('es-CL')}
                    </td>
                    <td className="p-3 text-gray-400 text-xs">#{r.servicio_id} {r.servicio_nombre}</td>
                    <td className="p-3 text-white">{r.nombres} {r.apellidos}</td>
                    <td className="p-3 text-gray-300 font-mono text-xs">{r.rut}</td>
                    <td className="p-3 text-gamer-accent text-xs">{r.dispositivo}</td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          r.estado === 'autorizado'
                            ? 'bg-gamer-success/20 text-gamer-success'
                            : 'bg-gamer-danger/20 text-gamer-danger'
                        }`}
                      >
                        {r.estado}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ------------------------------ EVENTOS ------------------------------ */}
      {tab === 'eventos' && (
        <EventosTab API={API} pedir={pedir} />
      )}

      {/* ----------------------------- SERVICIOS ----------------------------- */}
      {tab === 'servicios' && (
        <div className="gamer-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gamer-light-gray/50">
                {['#', 'Servicio', 'Fecha', 'Horario', 'Origen', 'Estado'].map((h) => (
                  <th key={h} className="text-left p-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {servicios.map((s) => (
                <tr key={s.id} className="border-b border-gamer-light-gray/20">
                  <td className="p-3 font-mono text-gamer-accent">{s.id}</td>
                  <td className="p-3 text-white">{s.nombre}</td>
                  <td className="p-3 text-gray-300 font-mono text-sm">{s.fecha}</td>
                  <td className="p-3 text-gray-300 font-mono text-sm">
                    {s.hora_inicio} - {s.hora_fin}
                  </td>
                  <td className="p-3 text-gray-400 text-sm">{s.origen}</td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        s.estado === 'abierto'
                          ? 'bg-gamer-success/20 text-gamer-success'
                          : 'bg-gamer-gray/30 text-gray-400'
                      }`}
                    >
                      {s.estado}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ------------------------------ HORARIOS ----------------------------- */}
      {tab === 'horarios' && (
        <div className="gamer-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gamer-light-gray/50">
                {['Nombre', 'Inicio', 'Fin', 'Descripción', 'Estado'].map((h) => (
                  <th key={h} className="text-left p-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {horarios.map((h) => (
                <tr key={h.id} className="border-b border-gamer-light-gray/20">
                  <td className="p-3 text-white">{h.nombre}</td>
                  <td className="p-3 text-gamer-accent font-mono">{h.hora_inicio}</td>
                  <td className="p-3 text-gamer-accent font-mono">{h.hora_fin}</td>
                  <td className="p-3 text-gray-400 text-sm">{h.descripcion || '—'}</td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        h.activo ? 'bg-gamer-success/20 text-gamer-success' : 'bg-gamer-gray/30 text-gray-400'
                      }`}
                    >
                      {h.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* -------------------------------- SQL --------------------------------- */}
      {tab === 'sql' && (
        <div className="space-y-4">
          <div className="gamer-card p-4 border-gamer-warning/40">
            <p className="text-gamer-warning text-xs">
              ⚠ Solo consultas de lectura (SELECT / PRAGMA). Cualquier cosa que modifique datos se
              rechaza para proteger la base.
            </p>
          </div>
          <div className="gamer-card p-4">
            <textarea
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              rows={4}
              className="w-full gamer-input font-mono text-sm resize-y"
              spellCheck={false}
            />
            <div className="flex gap-2 mt-3">
              <button onClick={ejecutarSql} className="gamer-btn-success">
                Ejecutar
              </button>
              <button
                onClick={() => setSql('SELECT * FROM registros ORDER BY id DESC LIMIT 20;')}
                className="gamer-btn"
              >
                Ver últimos registros
              </button>
              <button onClick={() => setSql('PRAGMA table_info(registros);')} className="gamer-btn">
                Estructura de registros
              </button>
            </div>
          </div>
          {sqlResult && (
            <div className="gamer-card overflow-hidden">
              {sqlResult.error ? (
                <div className="p-4 text-gamer-danger text-sm">{sqlResult.error}</div>
              ) : (
                <>
                  <div className="p-3 text-gray-400 text-xs border-b border-gamer-light-gray/30">
                    {sqlResult.filas} fila(s) · {sqlResult.columnas?.length || 0} columna(s)
                  </div>
                  <div className="overflow-x-auto max-h-[60vh]">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-gamer-darker">
                        <tr className="border-b border-gamer-light-gray/50">
                          {sqlResult.columnas?.map((c) => (
                            <th key={c} className="text-left p-2 text-gray-400 font-semibold">
                              {c}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sqlResult.datos?.map((fila, i) => (
                          <tr key={i} className="border-b border-gamer-light-gray/10">
                            {sqlResult.columnas?.map((c) => (
                              <td key={c} className="p-2 text-gray-300">
                                {String(fila[c] ?? '')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Reintentos de acceso rechazados */
function EventosTab({ API, pedir }) {
  const [eventos, setEventos] = useState([])
  const [cargando, setCargando] = useState(true)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      setEventos(await pedir('/eventos?limite=500'))
    } finally {
      setCargando(false)
    }
  }, [pedir])

  useEffect(() => {
    cargar()
  }, [cargar])

  if (cargando) return <div className="p-8 text-center text-gray-400">Cargando…</div>

  return (
    <div className="gamer-card overflow-hidden">
      <div className="p-3 text-gray-400 text-xs border-b border-gamer-light-gray/30">
        {eventos.length} reintento(s) de ingreso rechazados
      </div>
      <div className="overflow-x-auto max-h-[70vh]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gamer-darker">
            <tr className="border-b border-gamer-light-gray/50">
              {['Fecha', 'Persona', 'RUT', 'Intento en', 'Ya registrado en'].map((h) => (
                <th key={h} className="text-left p-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {eventos.map((e) => (
              <tr key={e.id} className="border-b border-gamer-light-gray/20">
                <td className="p-3 text-gray-400 text-xs whitespace-nowrap">
                  {new Date(e.hora).toLocaleString('es-CL')}
                </td>
                <td className="p-3 text-white">{e.nombres}</td>
                <td className="p-3 text-gray-300 font-mono text-xs">{e.rut}</td>
                <td className="p-3 text-gamer-warning text-xs">{e.dispositivo}</td>
                <td className="p-3 text-gamer-danger text-xs">{e.acceso_previo || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {eventos.length === 0 && (
          <div className="p-8 text-center text-gray-500">Sin reintentos rechazados</div>
        )}
      </div>
    </div>
  )
}
