import { useState, useEffect, useCallback } from 'react'
import { apiAuth } from '../utils/auth'

/**
 * Bitacora de ingresos al sistema.
 * Solo visible para el administrador. Registra cada intento de entrada
 * (exitoso o fallido) de las personas que el administrador autorizo.
 */
export default function AccessLogPanel() {
  const [accesos, setAccesos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [buscar, setBuscar] = useState('')

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      setAccesos(await apiAuth.accesos())
      setError('')
    } catch (e) {
      setError(e.message)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const borrar = async () => {
    if (!confirm('¿Borrar todo el historial de ingresos? Esta acción no se puede deshacer.')) return
    try {
      await apiAuth.borrarAccesos()
      await cargar()
    } catch (e) {
      setError(e.message)
    }
  }

  const filtrados = accesos.filter((a) => {
    const coincideFiltro = filtro === 'todos' || (filtro === 'exito' ? a.exito : !a.exito)
    const texto = buscar.toLowerCase()
    const coincideBusqueda =
      a.usuario.toLowerCase().includes(texto) || a.accion.toLowerCase().includes(texto)
    return coincideFiltro && coincideBusqueda
  })

  const exitosos = accesos.filter((a) => a.exito).length
  const fallidos = accesos.length - exitosos

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Bitácora de Ingresos</h2>
          <p className="text-gray-400 text-sm mt-1">
            Registro de quién entró al sistema, con qué resultado y qué hizo.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={cargar} className="gamer-btn text-sm">
            Actualizar
          </button>
          {accesos.length > 0 && (
            <button onClick={borrar} className="gamer-btn-danger text-sm">
              Borrar historial
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="gamer-card p-4 border-gamer-danger/50 bg-gamer-danger/5 text-gamer-danger text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="gamer-card p-4 text-center">
          <div className="text-2xl font-bold text-white">{accesos.length}</div>
          <div className="text-xs text-gray-400 uppercase tracking-wider">Eventos</div>
        </div>
        <div className="gamer-card p-4 text-center border-gamer-success/30">
          <div className="text-2xl font-bold text-gamer-success">{exitosos}</div>
          <div className="text-xs text-gray-400 uppercase tracking-wider">Ingresos OK</div>
        </div>
        <div className="gamer-card p-4 text-center border-gamer-danger/30">
          <div className="text-2xl font-bold text-gamer-danger">{fallidos}</div>
          <div className="text-xs text-gray-400 uppercase tracking-wider">Fallidos</div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar por usuario o acción..."
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            className="gamer-input pl-12"
          />
        </div>
        <div className="flex gap-2">
          {[
            ['todos', 'Todos'],
            ['exito', 'Exitosos'],
            ['fallo', 'Fallidos'],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFiltro(id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filtro === id
                  ? 'bg-gamer-accent/20 text-gamer-accent border border-gamer-accent/30'
                  : 'bg-gamer-gray/50 text-gray-400 border border-gamer-light-gray/30 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="gamer-card overflow-hidden">
        <div className="overflow-x-auto max-h-[65vh]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gamer-darker">
              <tr className="border-b border-gamer-light-gray/50">
                {['Fecha y hora', 'Usuario', 'Rol', 'Acción', 'Resultado'].map((h) => (
                  <th key={h} className="text-left p-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrados.map((a) => (
                <tr key={a.id} className="border-b border-gamer-light-gray/20 hover:bg-gamer-light-gray/10">
                  <td className="p-3 text-gray-400 text-xs whitespace-nowrap">
                    {new Date(a.fecha).toLocaleString('es-CL')}
                  </td>
                  <td className="p-3 text-white font-mono">{a.usuario}</td>
                  <td className="p-3">
                    <span
                      className={`text-xs font-semibold ${
                        a.rol === 'admin' ? 'text-gamer-danger' : 'text-gamer-accent'
                      }`}
                    >
                      {a.rol}
                    </span>
                  </td>
                  <td className="p-3 text-gray-300">{a.accion}</td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        a.exito
                          ? 'bg-gamer-success/20 text-gamer-success'
                          : 'bg-gamer-danger/20 text-gamer-danger'
                      }`}
                    >
                      {a.exito ? 'Correcto' : 'Fallido'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!cargando && filtrados.length === 0 && (
          <div className="p-8 text-center text-gray-500">Sin registros para mostrar</div>
        )}
        {cargando && <div className="p-8 text-center text-gray-500">Cargando…</div>}
      </div>
    </div>
  )
}
