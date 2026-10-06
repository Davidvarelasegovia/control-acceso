/**
 * Cliente de autenticacion.
 *
 * Guarda el token en localStorage y lo envia en cada peticion a la API.
 * Los paneles de administracion exigen este token; las pantallas de escaneo
 * de acceso funcionan sin el.
 */
import { useState, useEffect, useCallback } from 'react'

const BASE = import.meta.env.VITE_API_URL || '/api'
const CLAVE_TOKEN = 'control_acceso_token'
const CLAVE_USUARIO = 'control_acceso_usuario'

export function guardarSesion({ token, usuario }) {
  localStorage.setItem(CLAVE_TOKEN, token)
  localStorage.setItem(CLAVE_USUARIO, JSON.stringify(usuario))
}

export function leerToken() {
  return localStorage.getItem(CLAVE_TOKEN)
}

export function leerUsuario() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_USUARIO) || 'null')
  } catch {
    return null
  }
}

export function borrarSesion() {
  localStorage.removeItem(CLAVE_TOKEN)
  localStorage.removeItem(CLAVE_USUARIO)
}

/** Peticion autenticada. Lanza error 401 si la sesion no vale. */
export async function pedirAutenticada(ruta, opciones = {}) {
  const token = leerToken()

  const res = await fetch(`${BASE}${ruta}`, {
    ...opciones,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opciones.headers || {}),
    },
  })

  const cuerpo = await res.json().catch(() => ({}))

  if (res.status === 401) {
    borrarSesion()
    throw Object.assign(new Error(cuerpo.error || 'Sesión no válida'), { status: 401 })
  }
  if (!res.ok) {
    throw Object.assign(new Error(cuerpo.error || `Error ${res.status}`), { status: res.status })
  }

  return cuerpo.data
}

export const apiAuth = {
  login: (usuario, clave) =>
    fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, clave }),
    }).then(async (res) => {
      const cuerpo = await res.json().catch(() => ({}))
      if (!cuerpo.ok) throw new Error(cuerpo.error || 'No se pudo ingresar')
      return cuerpo.data
    }),

  logout: () => pedirAutenticada('/auth/logout', { method: 'POST', body: '{}' }).catch(() => {}),

  yo: () => pedirAutenticada('/auth/yo'),

  usuarios: () => pedirAutenticada('/auth/usuarios'),
  crearUsuario: (datos) =>
    pedirAutenticada('/auth/usuarios', { method: 'POST', body: JSON.stringify(datos) }),
  actualizarUsuario: (id, datos) =>
    pedirAutenticada(`/auth/usuarios/${id}`, { method: 'PUT', body: JSON.stringify(datos) }),
  eliminarUsuario: (id) => pedirAutenticada(`/auth/usuarios/${id}`, { method: 'DELETE' }),

  accesos: () => pedirAutenticada('/auth/accesos'),
  borrarAccesos: () => pedirAutenticada('/auth/accesos', { method: 'DELETE' }),
}

/**
 * Hook con el estado de la sesion.
 * `cargando` arranca en true porque siempre verificamos el token guardado
 * contra el servidor antes de dar porGood que la sesion existe.
 */
export function useSesion() {
  const [usuario, setUsuario] = useState(() => leerUsuario())
  const [cargando, setCargando] = useState(true)

  const verificar = useCallback(async () => {
    if (!leerToken()) {
      setUsuario(null)
      setCargando(false)
      return null
    }
    try {
      const u = await apiAuth.yo()
      localStorage.setItem(CLAVE_USUARIO, JSON.stringify(u))
      setUsuario(u)
      return u
    } catch {
      borrarSesion()
      setUsuario(null)
      return null
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    verificar()
  }, [verificar])

  const ingresar = useCallback(async ({ usuario: u, clave }) => {
    const data = await apiAuth.login(u, clave)
    guardarSesion(data)
    setUsuario(data.usuario)
    return data.usuario
  }, [])

  const salir = useCallback(async () => {
    await apiAuth.logout()
    borrarSesion()
    setUsuario(null)
  }, [])

  return {
    usuario,
    cargando,
    ingresar,
    salir,
    esAdmin: usuario?.rol === 'admin',
    esAgente: usuario?.rol === 'agente',
  }
}
