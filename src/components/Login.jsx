import { useState, useCallback } from 'react'

/**
 * Pantalla de ingreso al sistema.
 * Solo para los paneles de administracion (base de datos y bitacora).
 * Las pantallas de escaneo de acceso NO piden credenciales.
 */
export default function Login({ onIngresar, error: errorExterno, cargando }) {
  const [usuario, setUsuario] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState('')
  const [verClave, setVerClave] = useState(false)

  const enviar = useCallback(
    (e) => {
      e.preventDefault()
      setError('')

      if (!usuario.trim()) {
        setError('Escribe tu nombre de usuario')
        return
      }
      if (!clave) {
        setError('Escribe tu contraseña')
        return
      }
      onIngresar({ usuario: usuario.trim(), clave })
    },
    [usuario, clave, onIngresar]
  )

  const mensaje = error || errorExterno

  return (
    <div className="min-h-screen bg-gamer-darker flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Cabecera */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gamer-accent/10 border border-gamer-accent/40 mb-4">
            <svg className="w-8 h-8 text-gamer-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-wider uppercase">
            Panel de Control
          </h1>
          <p className="text-gray-400 text-sm mt-1">Ingresa con tus credenciales</p>
        </div>

        {/* Formulario */}
        <form onSubmit={enviar} className="gamer-card p-6 space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wider text-gray-400 mb-2">
              Usuario
            </label>
            <input
              type="text"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              className="gamer-input"
              placeholder="David"
              autoComplete="username"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-gray-400 mb-2">
              Contraseña
            </label>
            <div className="relative">
              <input
                type={verClave ? 'text' : 'password'}
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                className="gamer-input pr-12"
                placeholder="••••••"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setVerClave((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                title={verClave ? 'Ocultar' : 'Mostrar'}
              >
                {verClave ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18M10.58 10.58a2 2 0 002.83 2.83M9.9 4.24A9.79 9.79 0 0112 4c7 0 10 8 10 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M6.61 6.61A18.15 18.15 0 002 12s3 8 10 8a9.74 9.74 0 005.39-1.61" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {mensaje && (
            <div className="p-3 rounded-lg bg-gamer-danger/10 border border-gamer-danger/40 text-gamer-danger text-sm flex items-start gap-2">
              <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <span>{mensaje}</span>
            </div>
          )}

          <button type="submit" disabled={cargando} className="gamer-btn-success w-full py-3.5 text-base">
            {cargando ? 'Verificando…' : 'Ingresar'}
          </button>
        </form>

        <div className="mt-6 flex flex-col sm:flex-row gap-2">
          <a href="/" className="gamer-btn flex-1 text-center py-3">
            Volver al sistema
          </a>
          <a href="/agente" className="gamer-btn flex-1 text-center py-3">
            Entrar como Agente
          </a>
        </div>

        <p className="text-center text-gray-600 text-xs mt-6">
          Las pantallas de escaneo de acceso no requieren credenciales
        </p>
      </div>
    </div>
  )
}
