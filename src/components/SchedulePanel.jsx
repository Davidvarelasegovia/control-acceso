import { useState, useEffect, useCallback } from 'react'
import api, { estaConectado } from '../utils/api'

export default function SchedulePanel({ onServicioCambiado }) {
  const [horarios, setHorarios] = useState([])
  const [servicios, setServicios] = useState([])
  const [servicioActual, setServicioActual] = useState(null)
  const [estadisticas, setEstadisticas] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editando, setEditando] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    nombre: '',
    hora_inicio: '',
    hora_fin: '',
    descripcion: '',
  })

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const [hs, ss, estado] = await Promise.all([
        api.horarios(),
        api.servicios(),
        api.estado(),
      ])
      setHorarios(hs)
      setServicios(ss)
      setServicioActual(estado.servicio)
      setEstadisticas(estado.estadisticas)
      setError('')
    } catch (e) {
      setError(
        e.offline
          ? 'Sin conexión con el servidor. Los horarios se administran desde el servidor Node.'
          : e.message
      )
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      if (editando) {
        await api.actualizarHorario(editando.id, formData)
      } else {
        await api.crearHorario(formData)
      }
      resetForm()
      await cargar()
    } catch (err) {
      setError(err.message)
    }
  }

  const resetForm = () => {
    setFormData({ nombre: '', hora_inicio: '', hora_fin: '', descripcion: '' })
    setShowForm(false)
    setEditando(null)
  }

  const handleEdit = (h) => {
    setFormData({
      nombre: h.nombre,
      hora_inicio: h.hora_inicio,
      hora_fin: h.hora_fin,
      descripcion: h.descripcion || '',
    })
    setEditando(h)
    setShowForm(true)
  }

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar este horario? Los servicios ya generados y sus registros se conservan.')) return
    try {
      await api.eliminarHorario(id)
      await cargar()
    } catch (err) {
      setError(err.message)
    }
  }

  const generarServicio = async (horarioId, nombre) => {
    const ok = confirm(
      `¿Generar el servicio "${nombre}"?\n\n` +
        `Se abrir\u00EDa un servicio nuevo: los CONTADORES se reinician en cero.\n` +
        `Los registros del servicio anterior NO se borran, quedan en el historial.`
    )
    if (!ok) return
    try {
      await api.generarServicio(horarioId)
      await cargar()
      onServicioCambiado?.()
    } catch (err) {
      setError(err.message)
    }
  }

  const cerrarServicio = async () => {
    try {
      await api.cerrarServicio()
      await cargar()
      onServicioCambiado?.()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="gamer-title">Gestión de Horarios</h2>
          <p className="text-gray-400 text-sm mt-1">
            Cada horario genera un <strong className="text-white">servicio</strong> por día. Al iniciar un
            servicio nuevo los contadores se reinician sin borrar los registros anteriores.
          </p>
        </div>
        <button onClick={() => setShowForm(true)} className="gamer-btn-success flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nuevo Horario
        </button>
      </div>

      {error && (
        <div className="gamer-card p-4 border-gamer-danger/50 bg-gamer-danger/5 text-gamer-danger text-sm">
          {error}
        </div>
      )}

      {/* Servicio vigente */}
      <div className="gamer-card p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-gray-400 mb-1">
              Servicio en curso
            </div>
            {servicioActual ? (
              <>
                <div className="text-2xl font-bold text-white">
                  #{servicioActual.id} · {servicioActual.nombre}
                </div>
                <div className="text-gamer-accent font-mono text-sm mt-1">
                  {servicioActual.fecha} · {servicioActual.hora_inicio} - {servicioActual.hora_fin}
                  <span className="ml-2 text-gray-500">
                    ({servicioActual.origen === 'manual' ? 'iniciado a mano' : 'automático'})
                  </span>
                </div>
                {estadisticas && (
                  <div className="flex flex-wrap gap-4 mt-3 text-sm">
                    <span className="text-white">Total <strong>{estadisticas.total}</strong></span>
                    <span className="text-gamer-success">Aut. <strong>{estadisticas.autorizados}</strong></span>
                    <span className="text-gamer-warning">Dup. <strong>{estadisticas.duplicados}</strong></span>
                    <span className="text-gamer-danger">No enc. <strong>{estadisticas.noEncontrados}</strong></span>
                  </div>
                )}
              </>
            ) : (
              <div className="text-gamer-warning font-semibold">
                Fuera de horario — ningún servicio activo
              </div>
            )}
          </div>
          {servicioActual && (
            <button onClick={cerrarServicio} className="gamer-btn-danger shrink-0">
              Cerrar Servicio
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <div className="gamer-card p-6 fade-in">
          <h3 className="text-lg font-semibold text-white mb-4">
            {editando ? 'Editar Horario' : 'Nuevo Horario'}
          </h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm text-gray-400 mb-2">Nombre del Servicio</label>
              <input
                type="text"
                required
                value={formData.nombre}
                onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                className="gamer-input"
                placeholder="Ej: Turno Noche"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">Hora de Inicio</label>
              <input
                type="time"
                required
                value={formData.hora_inicio}
                onChange={(e) => setFormData({ ...formData, hora_inicio: e.target.value })}
                className="gamer-input"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">Hora de Término</label>
              <input
                type="time"
                required
                value={formData.hora_fin}
                onChange={(e) => setFormData({ ...formData, hora_fin: e.target.value })}
                className="gamer-input"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-gray-400 mb-2">Descripción</label>
              <input
                type="text"
                value={formData.descripcion}
                onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                className="gamer-input"
                placeholder="Opcional"
              />
            </div>
            <div className="md:col-span-2 text-xs text-gray-500">
              Si la hora de término es menor que la de inicio, el horario se entiende que cruza la
              medianoche (ej: 22:00 a 06:00).
            </div>
            <div className="md:col-span-2 flex gap-3 justify-end">
              <button type="button" onClick={resetForm} className="gamer-btn-danger">
                Cancelar
              </button>
              <button type="submit" className="gamer-btn-success">
                {editando ? 'Actualizar' : 'Guardar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Horarios */}
      {cargando ? (
        <div className="gamer-card p-8 text-center text-gray-500">Cargando…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {horarios.map((h) => {
            const esActual = servicioActual?.horario_id === h.id
            return (
              <div
                key={h.id}
                className={`gamer-card p-5 relative overflow-hidden ${esActual ? 'border-gamer-success/50' : ''}`}
              >
                {esActual && (
                  <div className="absolute top-3 right-3">
                    <span className="px-2 py-1 bg-gamer-success/20 text-gamer-success text-xs font-semibold rounded-full animate-pulse">
                      EN CURSO
                    </span>
                  </div>
                )}
                <h3 className="text-lg font-semibold text-white mb-2">{h.nombre}</h3>
                <div className="flex items-center gap-2 text-gamer-accent font-mono text-lg mb-2">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {h.hora_inicio} - {h.hora_fin}
                </div>
                {h.descripcion && <p className="text-gray-400 text-sm mb-4">{h.descripcion}</p>}
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => generarServicio(h.id, h.nombre)}
                    disabled={esActual}
                    className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${
                      esActual
                        ? 'bg-gamer-gray/20 text-gray-500 cursor-not-allowed'
                        : 'bg-gamer-success/10 text-gamer-success hover:bg-gamer-success/20'
                    }`}
                  >
                    {esActual ? 'Ya está en curso' : 'Generar Servicio'}
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(h)}
                      className="flex-1 py-2 rounded-lg bg-gamer-accent/10 text-gamer-accent hover:bg-gamer-accent/20 transition-colors text-sm font-medium"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDelete(h.id)}
                      className="flex-1 py-2 rounded-lg bg-gamer-danger/10 text-gamer-danger hover:bg-gamer-danger/20 transition-colors text-sm font-medium"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {horarios.length === 0 && !cargando && (
        <div className="gamer-card p-8 text-center text-gray-500">No hay horarios configurados</div>
      )}

      {/* Historial de servicios */}
      <div className="gamer-card p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Historial de Servicios</h3>
        {servicios.length === 0 ? (
          <p className="text-gray-500 text-sm">Todavía no se ha generado ningún servicio.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gamer-light-gray/30 text-left text-gray-400">
                  <th className="py-2 px-3">#</th>
                  <th className="py-2 px-3">Servicio</th>
                  <th className="py-2 px-3">Fecha</th>
                  <th className="py-2 px-3">Horario</th>
                  <th className="py-2 px-3">Origen</th>
                  <th className="py-2 px-3">Estado</th>
                </tr>
              </thead>
              <tbody>
                {servicios.map((s) => (
                  <tr key={s.id} className="border-b border-gamer-light-gray/20 last:border-0">
                    <td className="py-2 px-3 font-mono text-gamer-accent">{s.id}</td>
                    <td className="py-2 px-3 text-white">{s.nombre}</td>
                    <td className="py-2 px-3 font-mono text-gray-300">{s.fecha}</td>
                    <td className="py-2 px-3 font-mono text-gray-300">
                      {s.hora_inicio} - {s.hora_fin}
                    </td>
                    <td className="py-2 px-3 text-gray-400">{s.origen}</td>
                    <td className="py-2 px-3">
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
      </div>
    </div>
  )
}
