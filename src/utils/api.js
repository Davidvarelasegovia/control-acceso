/**
 * Cliente de la API con soporte offline.
 *
 * Estrategia:
 *  - Si hay servidor disponible, la API SQLite es la fuente de verdad.
 *  - Si no hay servidor, la app sigue funcionando con la cache local
 *    (localStorage) y encola los escaneos para subirlos al volver la conexion.
 *
 * La UI nunca se queda pegada esperando: cada llamada tiene timeout.
 */

const BASE = import.meta.env.VITE_API_URL || '/api'
const TIMEOUT = 4000
const CLAVE_MODO = 'control_acceso_modo'
const CLAVE_COLA = 'control_acceso_cola'

/* ------------------------------------------------------------------ */
/* Estado de conexion                                                  */
/* ------------------------------------------------------------------ */

let servidorDisponible = false
const suscriptores = new Set()

export function estaConectado() {
  return navigator.onLine && servidorDisponible
}

export function modoServidor() {
  return servidorDisponible
}

export function alCambiarConexion(cb) {
  suscriptores.add(cb)
  return () => suscriptores.delete(cb)
}

function notificar() {
  suscriptores.forEach((cb) => {
    try {
      cb(estaConectado())
    } catch {
      /* ignorar */
    }
  })
}

/* ------------------------------------------------------------------ */
/* Peticion base                                                       */
/* ------------------------------------------------------------------ */

async function pedir(ruta, opciones = {}) {
  const control = new AbortController()
  const t = setTimeout(() => control.abort(), opciones.timeout ?? TIMEOUT)

  // Si hay sesion iniciada, mandamos el token. La app principal funciona
  // sin sesion; el panel del agente y el de admin la usan.
  const token = localStorage.getItem('control_acceso_token')

  try {
    const res = await fetch(`${BASE}${ruta}`, {
      ...opciones,
      signal: control.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(opciones.headers || {}),
      },
    })

    if (!res.ok) {
      const cuerpo = await res.json().catch(() => ({}))
      const err = new Error(cuerpo.error || `Error ${res.status}`)
      err.status = res.status

      // 502/503/504: el servidor no esta. 500: contesto pero fallo, para el
      // operador es lo mismo que estar caido, porque no se puede escanear.
      if (res.status >= 500 || res.status === 408) {
        marcarServidor(false)
        throw Object.assign(new Error('Sin conexion con el servidor'), { offline: true })
      }

      throw err
    }

    const cuerpo = await res.json()
    marcarServidor(true)
    return cuerpo.data
  } catch (error) {
    // Abort/network error -> servidor no disponible
    if (error.name === 'AbortError' || error instanceof TypeError) {
      marcarServidor(false)
      throw Object.assign(new Error('Sin conexion con el servidor'), { offline: true })
    }
    throw error
  } finally {
    clearTimeout(t)
  }
}

function marcarServidor(valor) {
  if (servidorDisponible === valor) return
  const estabaCaido = !servidorDisponible
  servidorDisponible = valor
  localStorage.setItem(CLAVE_MODO, valor ? 'servidor' : 'local')
  notificar()

  // Aviso de que la base de datos volvio a estar disponible, para que las
  // pantallas recarguen solas lo que estaban mostrando.
  if (valor && estabaCaido && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('servidorRestablecido'))
  }
}

/** Comprueba si el servidor responde. Se llama al arrancar y al recuperar conexion. */
export async function verificarServidor() {
  try {
    const res = await fetch(`${BASE}/estado`, { signal: AbortSignal.timeout(2000) })
    // OJO: hay que mirar el codigo, no solo que la promesa no reviente.
    // Cuando el servidor esta caido, el navegador/proxy responde con un 502
    // en vez de tirar error de red, asi que un fetch "exitoso" puede
    // estar disfrazado de caida.
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    marcarServidor(true)
  } catch {
    marcarServidor(false)
  }
  return servidorDisponible
}

/* ------------------------------------------------------------------ */
/* Vigilancia: el sistema se recupera solo                             */
/* ------------------------------------------------------------------ */

/**
 * Sondea el servidor periodicamente.
 *
 * Sin esto, si la API se cae con la pantalla abierta, el indicador se queda
 * en verde aunque el servidor este caido: solo se revisaba al abrir la
 * aplicacion o al cambiar la red. Con esto, el sistema se recupera solo.
 */
let vigilante = null

export function iniciarVigilancia() {
  if (vigilante) return vigilante

  const picar = async () => {
    // Rapido cuando esta caido (para reponerse pronto), lento cuando todo
    // anda bien (para no gastar CPU).
    const espera = estaConectado() ? 10000 : 2500
    try {
      const res = await fetch(`${BASE}/estado`, { signal: AbortSignal.timeout(2500) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      marcarServidor(true)
    } catch {
      marcarServidor(false)
    }
    vigilante = setTimeout(picar, espera)
  }

  vigilante = setTimeout(picar, 1500)
  return vigilante
}

export function detenerVigilancia() {
  if (vigilante) {
    clearTimeout(vigilante)
    vigilante = null
  }
}

/* ------------------------------------------------------------------ */
/* Cola de escaneos pendientes (modo offline)                           */
/* ------------------------------------------------------------------ */

export function getCola() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_COLA) || '[]')
  } catch {
    return []
  }
}

export function getPendientes() {
  return getCola().length
}

function guardarCola(cola) {
  localStorage.setItem(CLAVE_COLA, JSON.stringify(cola))
  window.dispatchEvent(new Event('syncStatusChanged'))
}

export function encolar(item) {
  guardarCola([...getCola(), { ...item, cola_en: Date.now() }])
}

/** Sube la cola al servidor. Devuelve cuantos se aplicaron. */
export async function subirCola() {
  const cola = getCola()
  if (!cola.length) return { aplicados: 0, cola: 0 }

  const data = await pedir('/sync', {
    method: 'POST',
    body: JSON.stringify({ cola }),
    timeout: 8000,
  })

  guardarCola([])
  return { aplicados: data.aplicados, ...data }
}

export function limpiarCola() {
  guardarCola([])
}

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

export const api = {
  estado: () => pedir('/estado', { timeout: 2000 }),
  personas: () => pedir('/personas'),
  crearPersona: (p) => pedir('/personas', { method: 'POST', body: JSON.stringify(p) }),
  actualizarPersona: (id, p) => pedir(`/personas/${id}`, { method: 'PUT', body: JSON.stringify(p) }),
  eliminarPersona: (id) => pedir(`/personas/${id}`, { method: 'DELETE' }),

  horarios: () => pedir('/horarios'),
  crearHorario: (h) => pedir('/horarios', { method: 'POST', body: JSON.stringify(h) }),
  actualizarHorario: (id, h) => pedir(`/horarios/${id}`, { method: 'PUT', body: JSON.stringify(h) }),
  eliminarHorario: (id) => pedir(`/horarios/${id}`, { method: 'DELETE' }),

  servicios: () => pedir('/servicios'),
  generarServicio: (horarioId) => pedir('/servicios', { method: 'POST', body: JSON.stringify({ horario_id: horarioId }) }),
  crearServicio: (datos) => pedir('/servicios', { method: 'POST', body: JSON.stringify(datos) }),
  cerrarServicio: () => pedir('/servicios/cerrar', { method: 'POST', body: '{}' }),

  registros: (params = '') => pedir(`/registros${params}`),
  eventos: (params = '') => pedir(`/eventos${params}`),

  urls: () => pedir('/urls'),
  crearUrl: (u) => pedir('/urls', { method: 'POST', body: JSON.stringify(u) }),
  actualizarUrl: (id, u) => pedir(`/urls/${id}`, { method: 'PUT', body: JSON.stringify(u) }),
  eliminarUrl: (id) => pedir(`/urls/${id}`, { method: 'DELETE' }),

  config: () => pedir('/config'),
  guardarConfig: (c) => pedir('/config', { method: 'PUT', body: JSON.stringify(c) }),

  escaneo: (rut, dispositivo = '') =>
    pedir('/escaneo', {
      method: 'POST',
      body: JSON.stringify({ rut, dispositivo, hora: new Date().toISOString() }),
      timeout: 8000,
    }),

  validarRut: (rut) => pedir('/validar/rut', { method: 'POST', body: JSON.stringify({ rut }), timeout: 3000 }),
  auditarRuts: () => pedir('/validar/ruts'),

  /* ------------------------------ Informes ----------------------------- */

  /** @param {string} query  "desde=...&hasta=...&granularidad=...&servicio_id=..." */
  informes: (query = '') => pedir(`/informes?${query}`, { timeout: 20000 }),

  /** Servicios con su total, para el selector de informes. */
  informesServicios: () => pedir('/informes/servicios'),

  /** Quien paso en un servicio puntual. */
  informePersonas: (servicioId) => pedir(`/informes/personas?servicio_id=${servicioId}`, { timeout: 20000 }),

  /* ---------------------------- Credenciales ---------------------------- */

  credenciales: () => pedir('/credenciales'),
  credencial: (id) => pedir(`/credenciales/${id}`),
  crearCredencial: (datos) =>
    pedir('/credenciales', { method: 'POST', body: JSON.stringify(datos), timeout: 20000 }),
  actualizarCredencial: (id, datos) =>
    pedir(`/credenciales/${id}`, { method: 'PUT', body: JSON.stringify(datos), timeout: 20000 }),
  eliminarCredencial: (id) => pedir(`/credenciales/${id}`, { method: 'DELETE' }),
  marcarCredencialEnviada: (id) =>
    pedir(`/credenciales/${id}/enviar`, { method: 'POST', timeout: 8000 }),
  guardarUrlQr: (url) =>
    pedir('/credenciales/qr', { method: 'PUT', body: JSON.stringify({ url }), timeout: 8000 }),

  guardarConfig: (datos) => pedir('/config', { method: 'PUT', body: JSON.stringify(datos) }),
}

export default api
