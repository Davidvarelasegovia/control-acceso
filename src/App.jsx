import { useState, useEffect, useCallback } from 'react'
import { BrowserRouter, Routes, Route, useLocation, useNavigate, Navigate } from 'react-router-dom'
import Menu from './components/Menu'
import ScanScreen from './components/ScanScreen'
import PeoplePanel from './components/PeoplePanel'
import SchedulePanel from './components/SchedulePanel'
import RecordsPanel from './components/RecordsPanel'
import ConfigPanel from './components/ConfigPanel'
import AdminPanel from './components/AdminPanel'
import InformesPage from './components/InformesPage'
import CredencialesPanel from './components/CredencialesPanel'
import StatusIndicators from './components/StatusIndicators'
import Login from './components/Login'
import api, {
  verificarServidor,
  subirCola,
  getPendientes,
  iniciarVigilancia,
} from './utils/api'
import { useSesion } from './utils/auth'
import { playOnlineSound, playOfflineSound } from './utils/sounds'

function AppContent() {
  const [currentView, setCurrentView] = useState('inicio')
  const [menuOpen, setMenuOpen] = useState(false)
  const [accessUrls, setAccessUrls] = useState([])
  const { usuario } = useSesion()
  const navigate = useNavigate()
  const location = useLocation()

  const cargarUrls = useCallback(async () => {
    try {
      setAccessUrls(await api.urls())
    } catch {
      /* sin servidor */
    }
  }, [])

  useEffect(() => {
    verificarServidor().then((ok) => {
      if (ok) {
        playOnlineSound()
        subirCola().catch(() => {})
      }
    })
    // Sondeo permanente: si la API se cae, se levanta sola y la pantalla
    // vuelve a pintar por su cuenta sin que haya que recargar.
    iniciarVigilancia()
  }, [])

  useEffect(() => {
    /** Se ejecuta cuando vuelve la conexion, por cualquier via. */
    const alVolver = () => {
      verificarServidor().then((ok) => {
        if (ok) {
          playOnlineSound()
          subirCola().catch(() => {})
          cargarUrls()
        } else {
          playOfflineSound()
        }
      })
    }
    const alMenu = () => cargarUrls()

    window.addEventListener('online', alVolver)
    window.addEventListener('offline', alVolver)
    window.addEventListener('menuUpdated', alMenu)
    // La API se levanto sola: recuperamos sin que el operador haga nada.
    window.addEventListener('servidorRestablecido', alVolver)

    return () => {
      window.removeEventListener('online', alVolver)
      window.removeEventListener('offline', alVolver)
      window.removeEventListener('menuUpdated', alMenu)
      window.removeEventListener('servidorRestablecido', alVolver)
    }
  }, [cargarUrls])

  // Si el usuario cambia de vista, el path no cambia; evitamos que el router
  // reescriba la URL de acceso mientras escanea
  useEffect(() => {
    if (location.pathname !== '/' && currentView === 'inicio') return
  }, [location.pathname, currentView])

  const renderView = () => {
    switch (currentView) {
      case 'personas':
        return <PeoplePanel />
      case 'horarios':
        return <SchedulePanel onServicioCambiado={cargarUrls} />
      case 'registros':
        return <RecordsPanel />
      case 'configuracion':
        return <ConfigPanel />
      default:
        return <ScanScreen />
    }
  }

  return (
    <div className="min-h-screen bg-gamer-darker">
      <StatusIndicators />

      <Menu
        currentView={currentView}
        onNavigate={setCurrentView}
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        usuario={usuario}
        onAbrirPanel={(ruta) => navigate(ruta)}
      />

      <div className="lg:ml-72">
        <header className="sticky top-0 z-30 bg-gamer-darker/80 backdrop-blur-md border-b border-gamer-light-gray/30">
          <div className="flex items-center justify-between px-6 py-4">
            <button
              onClick={() => setMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg bg-gamer-gray/50 text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="hidden lg:block">
              <span className="text-gray-400 text-sm uppercase tracking-wider">
                {currentView === 'inicio'
                  ? 'Panel Principal'
                  : currentView.charAt(0).toUpperCase() + currentView.slice(1)}
              </span>
            </div>
          </div>
        </header>

        <main className="p-6">{renderView()}</main>
      </div>
    </div>
  )
}

/** Pantalla de acceso diferenciada (ej: /acceso-1, /acceso-2, ...) */
function AccessRoute() {
  const location = useLocation()
  const [urls, setUrls] = useState(null)

  useEffect(() => {
    api
      .urls()
      .then(setUrls)
      .catch(() => setUrls([]))
  }, [])

  if (urls === null) {
    return (
      <div className="min-h-screen bg-gamer-darker flex items-center justify-center">
        <div className="text-gamer-accent animate-pulse">Cargando…</div>
      </div>
    )
  }

  const acceso = urls.find((u) => u.url === location.pathname && u.activo)

  if (!acceso) return <Navigate to="/" replace />

  return (
    <div className="min-h-screen bg-gamer-darker">
      <StatusIndicators />
      <ScanScreen accessName={acceso.nombre} />
    </div>
  )
}

/** Puerta de entrada: pide credenciales antes de dejar ver el panel. */
function ProtectedRoute({ requiereAdmin, children }) {
  const { usuario, cargando, ingresar, salir } = useSesion()
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const manejarIngreso = async (credenciales) => {
    setError('')
    setEnviando(true)
    try {
      await ingresar(credenciales)
    } catch (e) {
      setError(e.message)
    } finally {
      setEnviando(false)
    }
  }

  if (cargando) {
    return (
      <div className="min-h-screen bg-gamer-darker flex items-center justify-center">
        <div className="text-gamer-accent animate-pulse">Verificando sesión…</div>
      </div>
    )
  }

  if (!usuario) {
    return (
      <Login onIngresar={manejarIngreso} error={error} cargando={enviando} />
    )
  }

  if (requiereAdmin && usuario.rol !== 'admin') {
    return <PanelAgente usuario={usuario} onSalir={salir} />
  }

  return children(usuario, salir)
}

/** Panel del agente: solo horarios y servicios. */
function PanelAgente({ usuario, onSalir }) {
  return (
    <div className="min-h-screen bg-gamer-darker">
      {/* Barra de navegacion fija */}
      <header className="sticky top-0 z-40 bg-gamer-darker/90 backdrop-blur-md border-b border-gamer-light-gray/30">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={() => history.back()} className="gamer-btn p-2" title="Volver">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-base font-bold text-white tracking-wider uppercase">
                Panel de Horarios y Servicios
              </h1>
              <p className="text-xs text-gray-400">
                {usuario.nombre} ·{' '}
                <span className={usuario.rol === 'admin' ? 'text-gamer-danger' : 'text-gamer-accent'}>
                  {usuario.rol === 'admin' ? 'Administrador' : 'Agente'}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {usuario.rol === 'admin' && (
              <a href="/admin" className="gamer-btn text-sm">
                Base de datos
              </a>
            )}
            <a href="/" className="gamer-btn-success text-sm">
              Pantalla principal
            </a>
            <button onClick={onSalir} className="gamer-btn-danger text-sm">
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto p-6">
        <div className="gamer-card p-4 mb-5 text-sm text-gray-400 flex items-start gap-3">
          <svg className="w-5 h-5 text-gamer-accent shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            Desde aquí puedes <strong className="text-white">crear y editar horarios</strong>,{' '}
            <strong className="text-white">generar servicios</strong> y cerrar el servicio en
            curso. Generar un servicio reinicia los contadores sin borrar los registros anteriores.
          </span>
        </div>

        <SchedulePanel />
      </div>
    </div>
  )
}

function AdminRoute() {
  return (
    <ProtectedRoute requiereAdmin>
      {(usuario, salir) => <AdminPanel usuario={usuario} onSalir={salir} />}
    </ProtectedRoute>
  )
}

/** Panel del agente: el que se usa cuando el usuario es agente. */
function AgentRoute() {
  return (
    <ProtectedRoute requiereAdmin={false}>
      {(usuario, salir) => <PanelAgente usuario={usuario} onSalir={salir} />}
    </ProtectedRoute>
  )
}

/** Panel de credenciales virtuales: pagina aparte, pide credenciales. */
function CredencialesRoute() {
  return (
    <ProtectedRoute requiereAdmin>
      {(usuario, salir) => (
        <CredencialesPanel usuario={usuario} onSalir={() => salir()} />
      )}
    </ProtectedRoute>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppContent />} />
        <Route path="/login" element={<AdminRoute />} />
        <Route path="/admin" element={<AdminRoute />} />
        <Route path="/agente" element={<AgentRoute />} />
        <Route path="/credenciales" element={<CredencialesRoute />} />
        {/* Informes: pagina propia, antes de la ruta dinamica */}
        <Route path="/informes" element={<InformesPage />} />
        {/* Ruta dinamica: cualquier URL de acceso configurada */}
        <Route path="*" element={<AccessRoute />} />
      </Routes>
    </BrowserRouter>
  )
}
