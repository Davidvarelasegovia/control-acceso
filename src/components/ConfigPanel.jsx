import { useState, useEffect, useCallback } from 'react'
import api, { estaConectado, getCola, getPendientes } from '../utils/api'

export default function ConfigPanel() {
  const [menuItems, setMenuItems] = useState([])
  const [venue, setVenue] = useState({ nombre: '', direccion: '' })
  const [urls, setUrls] = useState([])
  const [saved, setSaved] = useState(false)
  const [showUrlForm, setShowUrlForm] = useState(false)
  const [editingUrl, setEditingUrl] = useState(null)
  const [urlForm, setUrlForm] = useState({ nombre: '', url: '' })
  const [error, setError] = useState('')
  const [info, setInfo] = useState(null)

  const cargar = useCallback(async () => {
    try {
      const [cfg, us] = await Promise.all([api.config(), api.urls()])
      setVenue(cfg.venue)
      setMenuItems(cfg.menu)
      setUrls(us)
      setError('')
    } catch (e) {
      setError(e.offline ? 'Sin conexión con el servidor de base de datos.' : e.message)
    }
  }, [])

  useEffect(() => {
    cargar()
    api.estado().then(setInfo).catch(() => {})
  }, [cargar])

  const showSaved = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const guardarVenue = async (e) => {
    e.preventDefault()
    try {
      const cfg = await api.guardarConfig({ venue })
      setVenue(cfg.venue)
      showSaved()
    } catch (err) {
      setError(err.message)
    }
  }

  const toggleMenu = async (id) => {
    const items = menuItems.map((i) => (i.id === id ? { ...i, activo: !i.activo } : i))
    setMenuItems(items)
    try {
      await api.guardarConfig({ menu: items })
      showSaved()
      window.dispatchEvent(new Event('menuUpdated'))
    } catch (err) {
      setError(err.message)
    }
  }

  const submitUrl = async (e) => {
    e.preventDefault()
    try {
      if (editingUrl) await api.actualizarUrl(editingUrl.id, urlForm)
      else await api.crearUrl(urlForm)
      resetUrlForm()
      await cargar()
      showSaved()
    } catch (err) {
      setError(err.message)
    }
  }

  const resetUrlForm = () => {
    setUrlForm({ nombre: '', url: '' })
    setShowUrlForm(false)
    setEditingUrl(null)
  }

  const editUrl = (u) => {
    setUrlForm({ nombre: u.nombre, url: u.url })
    setEditingUrl(u)
    setShowUrlForm(true)
  }

  const deleteUrl = async (u) => {
    if (!confirm(`¿Eliminar "${u.nombre}"?`)) return
    try {
      await api.eliminarUrl(u.id)
      await cargar()
    } catch (err) {
      setError(err.message)
    }
  }

  const toggleUrl = async (u) => {
    try {
      await api.actualizarUrl(u.id, { activo: !u.activo })
      await cargar()
    } catch (err) {
      setError(err.message)
    }
  }

  /* Exportar todo (para respaldo / migracion) */
  const exportar = async () => {
    try {
      const [personas, horarios, us, registros, servicios] = await Promise.all([
        api.personas(),
        api.horarios(),
        api.urls(),
        api.registros('?limite=100000'),
        api.servicios(),
      ])
      const data = {
        exportado: new Date().toISOString(),
        venue,
        personas,
        horarios,
        urls: us,
        registros,
        servicios,
        menu: menuItems,
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `backup_control_acceso_${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="gamer-title">Configuración</h2>
        {saved && <span className="text-gamer-success text-sm animate-pulse">Guardado ✓</span>}
      </div>

      {error && (
        <div className="gamer-card p-4 border-gamer-danger/50 bg-gamer-danger/5 text-gamer-danger text-sm">
          {error}
        </div>
      )}

      {/* Estado de la base de datos */}
      <div className="gamer-card p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Base de Datos</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-gray-400 text-xs uppercase tracking-wider">Estado</div>
            <div className={`font-semibold ${info ? 'text-gamer-success' : 'text-gamer-danger'}`}>
              {info ? 'Conectada (SQLite)' : 'Sin conexión'}
            </div>
          </div>
          <div>
            <div className="text-gray-400 text-xs uppercase tracking-wider">Registros totales</div>
            <div className="text-white font-semibold">{info?.total_global ?? '—'}</div>
          </div>
          <div>
            <div className="text-gray-400 text-xs uppercase tracking-wider">Servicio</div>
            <div className="text-white font-semibold">
              {info?.servicio ? `#${info.servicio.id} ${info.servicio.nombre}` : 'Fuera de horario'}
            </div>
          </div>
          <div>
            <div className="text-gray-400 text-xs uppercase tracking-wider">Pendientes de subir</div>
            <div className={`font-semibold ${getPendientes() ? 'text-gamer-warning' : 'text-gamer-success'}`}>
              {getPendientes()}
            </div>
          </div>
        </div>
      </div>

      {/* Recinto */}
      <div className="gamer-card p-6">
        <h3 className="text-lg font-semibold text-white mb-4">🏢 Configuración del Lugar</h3>
        <form onSubmit={guardarVenue} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-2">Nombre del Lugar</label>
            <input
              type="text"
              value={venue.nombre}
              onChange={(e) => setVenue({ ...venue, nombre: e.target.value })}
              className="gamer-input"
              placeholder="Ej: Hospital Sur, Casino Norte"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">Dirección</label>
            <input
              type="text"
              value={venue.direccion}
              onChange={(e) => setVenue({ ...venue, direccion: e.target.value })}
              className="gamer-input"
              placeholder="Dirección del lugar"
            />
          </div>
          <div className="flex justify-end">
            <button type="submit" className="gamer-btn-success">Guardar Configuración</button>
          </div>
        </form>
      </div>

      {/* URLs de acceso */}
      <div className="gamer-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">🔗 URLs de Acceso</h3>
          <button onClick={() => setShowUrlForm(true)} className="gamer-btn-success flex items-center gap-2 text-sm">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nueva URL
          </button>
        </div>
        <p className="text-gray-400 text-sm mb-4">
          Cada URL es una pantalla de escaneo independiente (ej: Puerta Norte, Puerta Sur, Camiones).
        </p>

        {showUrlForm && (
          <form onSubmit={submitUrl} className="gamer-card p-4 mb-4 fade-in space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Nombre del Acceso</label>
                <input
                  type="text"
                  required
                  value={urlForm.nombre}
                  onChange={(e) => setUrlForm({ ...urlForm, nombre: e.target.value })}
                  className="gamer-input"
                  placeholder="Acceso 1 - Puerta Norte"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Ruta URL</label>
                <input
                  type="text"
                  required
                  value={urlForm.url}
                  onChange={(e) => setUrlForm({ ...urlForm, url: e.target.value })}
                  className="gamer-input"
                  placeholder="/acceso-1"
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={resetUrlForm} className="gamer-btn-danger">Cancelar</button>
              <button type="submit" className="gamer-btn-success">
                {editingUrl ? 'Actualizar' : 'Crear'}
              </button>
            </div>
          </form>
        )}

        <div className="space-y-2">
          {urls.map((u) => (
            <div key={u.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-gamer-gray/30 border border-gamer-light-gray/30">
              <div className="min-w-0">
                <div className="text-white font-medium truncate">{u.nombre}</div>
                <div className="text-gray-400 font-mono text-sm truncate">
                  {location.origin}
                  {u.url}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={u.url}
                  target="_blank"
                  rel="noreferrer"
                  className="p-2 rounded-lg bg-gamer-accent/10 text-gamer-accent hover:bg-gamer-accent/20 transition-colors"
                  title="Abrir pantalla"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7m0 0l-7 7m7-7H6" />
                  </svg>
                </a>
                <button
                  onClick={() => toggleUrl(u)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    u.activo
                      ? 'bg-gamer-success/20 text-gamer-success hover:bg-gamer-success/30'
                      : 'bg-gamer-gray/40 text-gray-400 hover:bg-gamer-gray/60'
                  }`}
                >
                  {u.activo ? 'Activa' : 'Inactiva'}
                </button>
                <button
                  onClick={() => editUrl(u)}
                  className="p-2 rounded-lg bg-gamer-accent/10 text-gamer-accent hover:bg-gamer-accent/20 transition-colors"
                  title="Editar"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  onClick={() => deleteUrl(u)}
                  className="p-2 rounded-lg bg-gamer-danger/10 text-gamer-danger hover:bg-gamer-danger/20 transition-colors"
                  title="Eliminar"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
          {urls.length === 0 && (
            <p className="text-gray-500 text-sm py-4">No hay URLs de acceso configuradas</p>
          )}
        </div>
      </div>

      {/* Menú */}
      <div className="gamer-card p-6">
        <h3 className="text-lg font-semibold text-white mb-4">📋 Menú</h3>
        <div className="space-y-2">
          {menuItems.map((item) => (
            <div key={item.id} className="flex items-center justify-between p-3 rounded-lg bg-gamer-gray/30">
              <span className="text-white">
                {item.icono} {item.nombre}
              </span>
              <button
                onClick={() => toggleMenu(item.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                  item.activo
                    ? 'bg-gamer-success/20 text-gamer-success'
                    : 'bg-gamer-gray/40 text-gray-400'
                }`}
              >
                {item.activo ? 'Visible' : 'Oculto'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Respaldo */}
      <div className="gamer-card p-6">
        <h3 className="text-lg font-semibold text-white mb-4">💾 Respaldo</h3>
        <p className="text-gray-400 text-sm mb-4">
          Descarga un archivo .json con personas, horarios, servicios, registros y configuración.
        </p>
        <button onClick={exportar} className="gamer-btn flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
          </svg>
          Exportar datos (JSON)
        </button>
      </div>
    </div>
  )
}
