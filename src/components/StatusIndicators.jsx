import { useState, useEffect } from 'react'
import {
  getPendientes,
  alCambiarConexion,
  estaConectado,
  verificarServidor,
} from '../utils/api'

/**
 * Indicadores de estado:
 *  - arriba izquierda: ONLINE (verde) / OFFLINE (rojo)
 *  - abajo izquierda: datos sincronizados / falta sincronización
 */
export default function StatusIndicators() {
  const [conServidor, setConServidor] = useState(estaConectado())
  const [pendientes, setPendientes] = useState(getPendientes())

  useEffect(() => {
    const off = alCambiarConexion(setConServidor)
    const onSync = () => setPendientes(getPendientes())
    const onOnline = () => setPendientes(getPendientes())

    window.addEventListener('syncStatusChanged', onSync)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOnline)

    const t = setInterval(() => setPendientes(getPendientes()), 5000)

    return () => {
      off()
      clearInterval(t)
      window.removeEventListener('syncStatusChanged', onSync)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOnline)
    }
  }, [])

  const online = conServidor
  // Solo avisamos cuando hay internet pero la base no responde: si no hay
  // red, el aviso de "Offline" alcanza y no hay nada que hacer en el servidor.
  const sinServidor = !estaConectado() && navigator.onLine

  return (
    <>
      <div className="fixed top-4 left-4 z-50 flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-gamer-gray/90 backdrop-blur-sm border border-gamer-light-gray/50">
          <div
            className={`w-3 h-3 rounded-full ${online ? 'bg-gamer-success' : 'bg-gamer-danger'} animate-pulse`}
          />
          <span
            className={`text-xs font-semibold uppercase tracking-wider ${
              online ? 'text-gamer-success' : 'text-gamer-danger'
            }`}
          >
            {online ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>

      <div className="fixed bottom-4 left-4 z-50">
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-lg backdrop-blur-sm border ${
            pendientes === 0
              ? 'bg-gamer-success/10 border-gamer-success/30'
              : 'bg-gamer-warning/10 border-gamer-warning/30'
          }`}
        >
          <div
            className={`w-2 h-2 rounded-full ${
              pendientes === 0 ? 'bg-gamer-success' : 'bg-gamer-warning'
            } animate-pulse`}
          />
          <span
            className={`text-xs font-medium ${
              pendientes === 0 ? 'text-gamer-success' : 'text-gamer-warning'
            }`}
          >
            {pendientes === 0 ? 'Datos sincronizados' : 'Falta sincronización'}
          </span>
          {pendientes > 0 && <span className="text-xs text-gray-400">({pendientes})</span>}
        </div>
      </div>

      {/* Cuando el servidor de base de datos no esta, el aviso dice que
          hacer: casi siempre es que se levanto `npm run dev` en vez de
          `npm run dev:full`, que es solo el frontend. */}
      {sinServidor && (
        <div className="fixed inset-x-0 bottom-0 z-[60] px-4 pb-4 pointer-events-none">
          <div className="max-w-xl mx-auto pointer-events-auto">
            <div className="gamer-card p-4 border-gamer-danger/60 bg-gamer-darker/95 shadow-2xl">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-gamer-danger/20 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-gamer-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white">
                    La base de datos no responde
                  </div>
                  <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                    El servidor de base de datos no está corriendo, así que no se pueden leer ni
                    guardar ingresos.
                  </p>
                  <div className="mt-2 bg-gamer-darker border border-gamer-light-gray/40 rounded-lg px-3 py-2">
                    <code className="text-xs text-gamer-accent font-mono">
                      npm run dev:full
                    </code>
                    <p className="text-[11px] text-gray-500 mt-1">
                      Con <strong className="text-gray-400">dev:full</strong> levantan la base y la
                      web. Con <strong className="text-gray-400">dev</strong> solamente la web, y
                      por eso esto falla.
                    </p>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">
                    Esta pantalla se reconecta sola apenas la base vuelva.
                  </p>
                </div>
                <button
                  onClick={() => verificarServidor()}
                  className="gamer-btn text-xs shrink-0"
                  title="Volver a intentar ahora"
                >
                  Reintentar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
