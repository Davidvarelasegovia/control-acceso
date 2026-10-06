import { useState, useEffect, useRef, useCallback } from 'react'
import Clock from './Clock'
import ManualEntryModal from './ManualEntryModal'
import api, { encolar, estaConectado, subirCola, getPendientes } from '../utils/api'
import {
  playAuthorizedSound,
  playDuplicateSound,
  playNotFoundSound,
  playAlarmSound,
  playScanSound,
  playSyncSound,
} from '../utils/sounds'
import { clave as claveId } from '../utils/identificador'

const VENTANA_DUPLICADO_MIN = 5

/**
 * Pantalla de escaneo.
 *
 * Fuente de verdad: API SQLite del servidor.
 * Respaldo: si el servidor no responde, se resuelve en local y el escaneo
 * queda encolado para subirlo automaticamente al volver la conexion.
 */
export default function ScanScreen({ onScan, accessName }) {
  const [resultado, setResultado] = useState(null)
  const [procesando, setProcesando] = useState(false)
  const [historial, setHistorial] = useState([])
  const [venue, setVenue] = useState({ nombre: 'Control de Acceso', direccion: '' })
  const [servicio, setServicio] = useState(null)
  const [stats, setStats] = useState({ total: 0, autorizados: 0, duplicados: 0, noEncontrados: 0 })
  const [pendientes, setPendientes] = useState(getPendientes())
  const [sincronizando, setSincronizando] = useState(false)
  const [sinServidor, setSinServidor] = useState(!estaConectado())
  const [errorRut, setErrorRut] = useState('')
  const [modalAbierto, setModalAbierto] = useState(false)
  const inputRef = useRef(null)

  const cargarEstado = useCallback(async () => {
    try {
      const estado = await api.estado()
      setVenue(estado.venue)
      setServicio(estado.servicio)
      setStats(estado.estadisticas)
      setSinServidor(false)
      return estado
    } catch {
      setSinServidor(true)
      return null
    }
  }, [])

  useEffect(() => {
    inputRef.current?.focus()
    cargarEstado()
    // refresca el servicio por si el horario cambia mientras la pantalla está abierta
    const t = setInterval(cargarEstado, 20000)
    // si la API se cayó y volvió a levantar, recargamos al instante
    const alVolver = () => cargarEstado()
    window.addEventListener('servidorRestablecido', alVolver)
    return () => {
      clearInterval(t)
      window.removeEventListener('servidorRestablecido', alVolver)
    }
  }, [cargarEstado])

  /* ------------------------ Sincronización ------------------------ */

  const sincronizar = useCallback(
    async (sonido = true) => {
      if (getPendientes() === 0) {
        await cargarEstado()
        return
      }
      setSincronizando(true)
      try {
        const r = await subirCola()
        if (sonido && r.aplicados > 0) playSyncSound()
        // Escaneos rechazados por validacion offline: no se pierden en silencio
        if (r.rechazados > 0) {
          console.warn('Escaneos rechazados por RUT inválido:', r.detalle_rechazos)
        }
        setPendientes(getPendientes())
        const estado = await api.estado()
        setServicio(estado.servicio)
        setStats(estado.estadisticas)
        setSinServidor(false)
      } catch {
        setSinServidor(true)
      } finally {
        setSincronizando(false)
      }
    },
    [cargarEstado]
  )

  // Al recuperar la conexion, sube solo lo pendiente
  useEffect(() => {
    const alVolver = () => {
      if (navigator.onLine) sincronizar()
    }
    window.addEventListener('online', alVolver)
    return () => window.removeEventListener('online', alVolver)
  }, [sincronizar])

  /* --------------------------- Escaneo ---------------------------- */

  const resolverLocal = (id) => {
    // Respaldo sin servidor: usa la cache de personas del navegador.
    // Compara por la clave (identificador sin digito verificador).
    try {
      const personas = JSON.parse(localStorage.getItem('access_control_people') || '[]')
      const n = claveId(id)
      return personas.find((p) => claveId(p.rut) === n) || null
    } catch {
      return null
    }
  }

  /**
   * NO se reformatea el campo mientras se escribe.
   * Una pistola laser tipea muy rapido: insertar puntos en cada tecla corria
   * los digitos y el identificador quedaba mal.
   */
  const alEscribir = () => {
    const valor = inputRef.current?.value || ''
    setErrorRut(valor.trim() ? '' : '')
  }

  /** Nucleo del escaneo, compartido por la pistola laser y el modal manual. */
  const procesarEscaneo = useCallback(async (idCrudo, cerrarModal) => {
    const id = String(idCrudo || '').trim()

    // Sin validacion: solo se rechaza el identificador vacio
    if (!id) {
      setResultado({ resultado: 'error', mensaje: 'Ingrese un identificador' })
      if (inputRef.current) inputRef.current.value = ''
      inputRef.current?.focus()
      return
    }

    setProcesando(true)
    setResultado(null)
    setErrorRut('')
    playScanSound()

    try {
      let r

      const accesoActual = accessName || 'pantalla principal'

      if (estaConectado()) {
        r = await api.escaneo(id, accesoActual)
      } else {
        // Modo sin servidor: duplicados por servicio, igual que el servidor
        const persona = resolverLocal(id)
        const hora = new Date().toISOString()
        const servicioId = servicio?.id ?? 0

        const registros = JSON.parse(localStorage.getItem('access_control_records') || '[]')
        const n = claveId(id)

        const previo = registros.find(
          (x) => claveId(x.rut) === n && (x.servicio_id ?? 0) === servicioId
        )

        let tipo = 'autorizado'
        let detalle = null

        if (!persona) {
          tipo = 'no-encontrado'
        } else if (previo) {
          tipo = 'duplicado'
          const donde = previo.dispositivo || 'otro punto de acceso'
          detalle = `Usted ya tiene registro en ${donde} durante este servicio`
        }

        const item = {
          rut: persona?.rut || id,
          nombres: persona?.nombres || 'DESCONOCIDO',
          apellidos: persona?.apellidos || '',
          empresa: persona?.empresa || '',
          estado: tipo,
          hora,
          servicio_id: servicioId,
          dispositivo: accesoActual,
          acceso_previo: previo?.dispositivo || '',
        }

        // Un duplicado no es un ingreso: va a la cola como "evento"
        encolar({ ...item, es_evento: tipo === 'duplicado' })

        // Cache local: los duplicados no inflan los registros
        if (tipo !== 'duplicado') {
          registros.unshift({ ...item, id: Date.now(), timestamp: hora })
          localStorage.setItem('access_control_records', JSON.stringify(registros))
        } else {
          setStats((prev) => ({ ...prev, duplicados: prev.duplicados + 1 }))
        }

        r = {
          resultado: tipo,
          mensaje:
            tipo === 'autorizado'
              ? 'Acceso Autorizado'
              : tipo === 'duplicado'
              ? 'Se repite el ingreso, no puede pasar'
              : 'Persona no encontrada',
          detalle,
          // En duplicado no registramos un evento nuevo: ya existe uno previo
          sinRegistroNuevo: tipo === 'duplicado',
          persona,
          servicio,
          estadisticas: null,
        }
        setSinServidor(true)
      }

      // Sonido segun estado
      if (r.resultado === 'autorizado') playAuthorizedSound()
      else if (r.resultado === 'duplicado') playDuplicateSound()
      else playNotFoundSound()

      // Alerta sonora adicional cuando se niega el paso
      if (r.resultado === 'no-encontrado') playAlarmSound()

      setResultado(r)
      setServicio(r.servicio ?? servicio)

      // Contadores: en modo servidor vienen del servidor; en local los contamos aqui
      if (r.estadisticas) {
        setStats(r.estadisticas)
      } else {
        setStats((prev) => {
          const total = prev.total + 1
          const base = { total, autorizados: 0, duplicados: 0, noEncontrados: 0 }
          base[
            r.resultado === 'no-encontrado'
              ? 'noEncontrados'
              : r.resultado === 'duplicado'
              ? 'duplicados'
              : 'autorizados'
          ] = 1
          return base
        })
      }

      setHistorial((prev) =>
        [
          {
            rut: idCrudo,
            nombre: r.persona ? `${r.persona.nombres} ${r.persona.apellidos}` : 'DESCONOCIDO',
            estado: r.resultado,
            acceso: accessName || 'principal',
            hora: new Date().toLocaleTimeString('es-CL'),
          },
          ...prev,
        ].slice(0, 10)
      )

      setPendientes(getPendientes())
      if (cerrarModal) setModalAbierto(false)
      onScan?.()
    } catch (err) {
      setResultado({ resultado: 'error', mensaje: err.message, rut: idCrudo })
    } finally {
      setProcesando(false)
      if (inputRef.current) inputRef.current.value = ''
      if (!cerrarModal) inputRef.current?.focus()
    }
  }, [
    accessName,
    cargarEstado,
    onScan,
    servicio,
    sinServidor,
  ])

  const handleScan = (e) => {
    e.preventDefault()
    const rut = inputRef.current?.value.trim()
    if (!rut || procesando) return
    procesarEscaneo(rut, false)
  }

  /* ---------------------------- Estilos --------------------------- */

  const colorResultado = () => {
    if (!resultado) return ''
    switch (resultado.resultado) {
      case 'autorizado':
        return 'text-gamer-success border-gamer-success/50'
      case 'duplicado':
        return 'text-gamer-warning border-gamer-warning/50'
      case 'no-encontrado':
      case 'rut-invalido':
        return 'text-gamer-danger border-gamer-danger/50'
      default:
        return 'text-gamer-danger border-gamer-danger/50'
    }
  }

  const fondoResultado = () => {
    if (!resultado) return ''
    switch (resultado.resultado) {
      case 'autorizado':
        return 'bg-gamer-success/5'
      case 'duplicado':
        return 'bg-gamer-warning/5'
      case 'no-encontrado':
      case 'rut-invalido':
        return 'bg-gamer-danger/5'
      default:
        return 'bg-gamer-danger/5'
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)] gap-6">      <div className="text-center">
        <h1 className="text-4xl font-bold text-white mb-2 tracking-wider uppercase">
          {venue.nombre}
        </h1>
        {venue.direccion && <p className="text-gray-400 text-sm">{venue.direccion}</p>}
        {accessName && (
          <div className="inline-flex items-center gap-2 mt-3 px-4 py-1.5 rounded-full bg-gamer-accent/10 border border-gamer-accent/40">
            <span className="text-gamer-accent text-xs font-bold uppercase tracking-wider">
              {accessName}
            </span>
          </div>
        )}
      </div>

      {/* Servicio en curso */}
      <div
        className={`px-5 py-2.5 rounded-full border text-sm font-medium ${
          servicio
            ? 'bg-gamer-accent/10 border-gamer-accent/40 text-gamer-accent'
            : 'bg-gamer-warning/10 border-gamer-warning/40 text-gamer-warning'
        }`}
      >
        {servicio ? (
          <>
            Servicio #{servicio.id} · {servicio.nombre} · {servicio.hora_inicio}-{servicio.hora_fin}
          </>
        ) : (
          'Fuera de horario — ningún servicio activo'
        )}
      </div>

      <Clock />

      <div className="w-full max-w-2xl">
        <form onSubmit={handleScan} className="relative">
          <div className="gamer-card p-8 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-gamer-accent/5 to-transparent pointer-events-none" />

            <div className="relative z-10">
              <div className="text-center mb-6">
                <h2 className="gamer-title mb-2">Escanear Identificación</h2>
                <p className="text-gray-400 text-sm">
                  Ingrese RUT, código de barras o QR con la pistola láser
                </p>
              </div>

              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  inputMode="numeric"
                  onInput={alEscribir}
                  className={`gamer-input text-center text-2xl font-mono tracking-widest py-6 ${
                    errorRut ? 'border-gamer-danger' : ''
                  }`}
                  placeholder="ESCANEAR AQUÍ..."
                  autoComplete="off"
                  autoFocus
                />
                {procesando && <div className="scan-line" />}
              </div>

              {errorRut && (
                <p className="text-center text-gamer-danger text-xs mt-2 animate-pulse">
                  {errorRut}
                </p>
              )}

              <div className="flex flex-col sm:flex-row justify-center items-stretch sm:items-center gap-3 mt-6">
                <button
                  type="submit"
                  disabled={procesando}
                  className="gamer-btn flex items-center justify-center gap-3 px-10 py-4 text-lg"
                >
                  {procesando ? (
                    <>
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Procesando...
                    </>
                  ) : (
                    <>
                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 002-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                      </svg>
                      Escanear
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setModalAbierto(true)}
                  disabled={procesando}
                  className="gamer-btn flex items-center justify-center gap-3 px-8 py-4 text-lg"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                  </svg>
                  Ingreso Manual
                </button>
              </div>
            </div>
          </div>
        </form>

        {resultado && (
          <div className={`mt-6 gamer-card p-6 border-2 ${colorResultado()} ${fondoResultado()} fade-in`}>
            <div className="text-center">
              <div className="text-3xl font-bold mb-2">{resultado.mensaje}</div>

              {/* Punto de acceso donde ya estaba registrado */}
              {resultado.detalle && (
                <div className="mt-3 inline-flex items-start gap-2 px-4 py-2.5 rounded-lg bg-gamer-danger/15 border border-gamer-danger/40 max-w-lg mx-auto">
                  <svg className="w-5 h-5 text-gamer-danger shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                  <span className="text-gamer-danger text-sm font-semibold text-left">
                    {resultado.detalle}
                  </span>
                </div>
              )}

              {resultado.persona ? (
                <div className="space-y-1 mt-3">
                  <div className="text-xl text-white">
                    {resultado.persona.nombres} {resultado.persona.apellidos}
                  </div>
                  <div className="text-gray-400">{resultado.persona.empresa}</div>
                  <div className="text-sm text-gray-500 font-mono">
                    RUT: {resultado.persona.rut}
                  </div>
                  {servicio && (
                    <div className="text-sm text-gamer-accent mt-2">
                      Servicio #{servicio.id} {servicio.nombre} ({servicio.hora_inicio} - {servicio.hora_fin})
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-gray-400 font-mono mt-3">{resultado.rut}</div>
              )}
            </div>
          </div>
        )}

        {/* Contadores del servicio en curso */}
        <div className="mt-6 gamer-card p-6">
          <div className="text-center mb-4">
            <div className="text-5xl font-bold text-white">{stats.total}</div>
            <div className="text-sm text-gray-400 uppercase tracking-wider">
              Ingresos autorizados {servicio ? `· Servicio #${servicio.id}` : ''}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 rounded-lg bg-gamer-success/10 border border-gamer-success/30">
              <div className="text-2xl font-bold text-gamer-success">{stats.autorizados}</div>
              <div className="text-xs text-gray-400 uppercase tracking-wider">Autorizados</div>
            </div>
            <div className="text-center p-4 rounded-lg bg-gamer-warning/10 border border-gamer-warning/30">
              <div className="text-2xl font-bold text-gamer-warning">{stats.duplicados}</div>
              <div className="text-xs text-gray-400 uppercase tracking-wider">Duplicados</div>
            </div>
            <div className="text-center p-4 rounded-lg bg-gamer-danger/10 border border-gamer-danger/30">
              <div className="text-2xl font-bold text-gamer-danger">{stats.noEncontrados}</div>
              <div className="text-xs text-gray-400 uppercase tracking-wider">No Encontrados</div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-center gap-3 flex-wrap">
          <button
            onClick={() => sincronizar()}
            disabled={sincronizando}
            className="gamer-btn flex items-center gap-2"
          >
            {sincronizando ? (
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            Sincronizar {pendientes > 0 && `(${pendientes})`}
          </button>

          <button onClick={cargarEstado} className="gamer-btn flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Actualizar
          </button>
        </div>

        <ManualEntryModal
          abierto={modalAbierto}
          busy={procesando}
          onCerrar={() => setModalAbierto(false)}
          onIngresar={(rut) => procesarEscaneo(rut, true)}
        />

        {historial.length > 0 && (
          <div className="mt-6 gamer-card p-4">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Últimos Escaneos
            </h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {historial.map((item, idx) => (
                <div
                  key={idx}
                  className="flex justify-between items-center text-sm py-2 border-b border-gamer-light-gray/30 last:border-0"
                >
                  <div>
                    <span className="text-white">{item.nombre}</span>
                    <span className="text-gray-500 ml-2 font-mono text-xs">{item.rut}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-2 py-1 rounded text-xs font-semibold ${
                        item.estado === 'autorizado'
                          ? 'bg-gamer-success/20 text-gamer-success'
                          : item.estado === 'duplicado'
                          ? 'bg-gamer-warning/20 text-gamer-warning'
                          : 'bg-gamer-danger/20 text-gamer-danger'
                      }`}
                    >
                      {item.estado === 'autorizado'
                        ? 'Autorizado'
                        : item.estado === 'duplicado'
                        ? 'Duplicado'
                        : 'No encontrado'}
                    </span>
                    <span className="text-gray-500 text-xs">{item.hora}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
