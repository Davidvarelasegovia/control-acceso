import { useEffect, useState } from 'react'
import { getMenuItems } from '../utils/storage'

/**
 * Menu lateral.
 *
 * En la parte de abajo incluye el acceso al Panel de Base de Datos, que
 * pide credenciales. Ese enlace no aparece si el usuario es un agente.
 */
export default function Menu({
  currentView,
  onNavigate,
  isOpen,
  onClose,
  usuario = null,
  onAbrirPanel,
}) {
  const [menuItems, setMenuItems] = useState([])

  useEffect(() => {
    const cargar = () => setMenuItems(getMenuItems())
    cargar()
    window.addEventListener('menuUpdated', cargar)
    window.addEventListener('storage', cargar)
    return () => {
      window.removeEventListener('menuUpdated', cargar)
      window.removeEventListener('storage', cargar)
    }
  }, [])

  const activeItems = menuItems.filter((item) => item.activo)

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={onClose} />
      )}

      <aside
        className={`
        fixed top-0 left-0 h-full w-72 bg-gamer-gray/95 backdrop-blur-md border-r border-gamer-light-gray/50 z-50
        transform transition-transform duration-300 ease-out flex flex-col
        ${isOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0
      `}
      >
        <div className="p-6 border-b border-gamer-light-gray/50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gamer-accent/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-gamer-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Control Acceso</h1>
              <p className="text-xs text-gray-500">Sistema de Seguridad</p>
            </div>
          </div>
        </div>

        <nav className="p-4 space-y-2 flex-1 overflow-y-auto">
          {activeItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                onNavigate(item.ruta)
                onClose()
              }}
              className={`
                w-full flex items-center gap-4 px-4 py-3 rounded-lg transition-all duration-200
                ${
                  currentView === item.ruta
                    ? 'bg-gamer-accent/15 text-gamer-accent border border-gamer-accent/30'
                    : 'text-gray-400 hover:bg-gamer-light-gray/50 hover:text-white border border-transparent'
                }
              `}
            >
              <span className="text-xl">{item.icono}</span>
              <span className="font-medium">{item.nombre}</span>
            </button>
          ))}
        </nav>

        {/* Credenciales: pagina independiente, siempre visible */}
        <div className="px-4 pb-3 flex-shrink-0">
          <button
            onClick={() => {
              onClose()
              onAbrirPanel?.('/credenciales')
            }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-gradient-to-r from-gamer-accent/20 to-gamer-accent-dim/10 border border-gamer-accent/40 text-gamer-accent hover:from-gamer-accent/30 hover:border-gamer-accent/70 transition-all"
          >
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <rect x="2" y="5" width="20" height="14" rx="2" strokeWidth={2} />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2 10h20M6 15h4" />
            </svg>
            <span className="font-medium text-sm">Credenciales</span>
          </button>
        </div>

        {/* Acceso al panel de base de datos */}
        <div className="p-4 border-t border-gamer-light-gray/50 flex-shrink-0 space-y-3">
          {usuario ? (
            <div className="space-y-2">
              <div className="px-3 py-2 rounded-lg bg-gamer-darker/60 border border-gamer-light-gray/30">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      usuario.rol === 'admin' ? 'bg-gamer-danger' : 'bg-gamer-accent'
                    }`}
                  />
                  <span className="text-xs text-white font-medium truncate">{usuario.nombre}</span>
                </div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">
                  {usuario.rol === 'admin' ? 'Administrador' : 'Agente'}
                </div>
              </div>

              <button
                onClick={() => {
                  onClose()
                  onAbrirPanel?.(usuario.rol === 'admin' ? '/admin' : '/agente')
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg bg-gamer-accent/10 text-gamer-accent border border-gamer-accent/30 hover:bg-gamer-accent/20 transition-all"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2 3.582 3 8 3s8-1 8-3V7M4 7c0 2 3.582 3 8 3s8-1 8-3-3.582-3-8-3-8 1-8 3z" />
                </svg>
                <span className="font-medium text-sm">
                  {usuario.rol === 'admin' ? 'Base de Datos' : 'Mi Panel'}
                </span>
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                onClose()
                onAbrirPanel?.('/login')
              }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-gamer-accent/10 text-gamer-accent border border-gamer-accent/30 hover:bg-gamer-accent/20 transition-all"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7h5a2 2 0 012 2v6a2 2 0 01-2 2h-5m-9 0H6a2 2 0 01-2-2V9a2 2 0 012-2h3m4 0l-4 4m0 0l4 4" />
              </svg>
              <span className="font-medium text-sm">Ingresar al panel</span>
            </button>
          )}

          <div className="text-xs text-gray-600 text-center">v1.0.0 — Sistema Local</div>
        </div>
      </aside>
    </>
  )
}
