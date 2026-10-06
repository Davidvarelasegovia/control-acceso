/**
 * Autenticacion y permisos.
 *
 * Dos roles:
 *   admin -> acceso total (personas, horarios, servicios, registros, base de datos,
 *            gestion de usuarios y bitacora)
 *   agente -> solo puede editar HORARIOS y SERVICIOS
 *
 * Las contrasenas se guardan con scrypt (modulo nativo de Node, sin dependencias).
 */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { db, ahoraISO, plain, plainAll } from './db.js'

const HORAS_SESION = 12
const ROLES = ['admin', 'agente']

/* ------------------------------------------------------------------ */
/* Contrasenas                                                         */
/* ------------------------------------------------------------------ */

/** Genera "saldo:hash" con scrypt. */
export function hashClave(clave) {
  const sal = randomBytes(16).toString('hex')
  const hash = scryptSync(String(clave), sal, 64).toString('hex')
  return `${sal}:${hash}`
}

/** Compara en tiempo constante. */
export function verificarClave(clave, guardado) {
  try {
    const [sal, hash] = String(guardado).split(':')
    if (!sal || !hash) return false
    const calculado = scryptSync(String(clave), sal, 64)
    const esperado = Buffer.from(hash, 'hex')
    if (calculado.length !== esperado.length) return false
    return timingSafeEqual(calculado, esperado)
  } catch {
    return false
  }
}

/* ------------------------------------------------------------------ */
/* Usuarios                                                            */
/* ------------------------------------------------------------------ */

export function crearUsuario({ usuario, nombre, clave, rol }) {
  const u = String(usuario || '').trim().toLowerCase()
  const r = String(rol || 'agente').toLowerCase()

  if (!u) throw Object.assign(new Error('El nombre de usuario es obligatorio'), { status: 400 })
  if (!ROLES.includes(r)) {
    throw Object.assign(new Error('Rol inválido: use "admin" o "agente"'), { status: 400 })
  }
  if (!clave || String(clave).length < 4) {
    throw Object.assign(new Error('La contraseña debe tener al menos 4 caracteres'), { status: 400 })
  }

  const existe = db.prepare('SELECT id FROM usuarios WHERE usuario = ?').get(u)
  if (existe) {
    throw Object.assign(new Error('Ese nombre de usuario ya existe'), { status: 409 })
  }

  const info = db
    .prepare(
      `INSERT INTO usuarios (usuario, nombre, clave_hash, rol, activo, created_at)
       VALUES (?, ?, ?, ?, 1, ?)`
    )
    .run(u, nombre || u, hashClave(clave), r, ahoraISO())

  return plain(db.prepare('SELECT id, usuario, nombre, rol, activo, created_at FROM usuarios WHERE id = ?').get(Number(info.lastInsertRowid)))
}

export function listarUsuarios() {
  return plainAll(
    db
      .prepare(
        'SELECT id, usuario, nombre, rol, activo, created_at, ultimo_acceso FROM usuarios ORDER BY rol, usuario'
      )
      .all()
  )
}

export function actualizarUsuario(id, { nombre, rol, activo, clave }) {
  const actual = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id)
  if (!actual) return null

  const nuevoRol = rol ? String(rol).toLowerCase() : actual.rol
  if (!ROLES.includes(nuevoRol)) {
    throw Object.assign(new Error('Rol inválido'), { status: 400 })
  }

  // No dejar al sistema sin administradores
  if (actual.rol === 'admin' && (nuevoRol !== 'admin' || activo === 0)) {
    const otros = db
      .prepare("SELECT COUNT(*) AS n FROM usuarios WHERE rol = 'admin' AND activo = 1 AND id <> ?")
      .get(id).n
    if (otros === 0) {
      throw Object.assign(
        new Error('Debe quedar al menos un administrador activo'),
        { status: 400 }
      )
    }
  }

  if (clave) {
    db.prepare('UPDATE usuarios SET clave_hash = ? WHERE id = ?').run(hashClave(clave), id)
  }

  db.prepare('UPDATE usuarios SET nombre = ?, rol = ?, activo = ? WHERE id = ?').run(
    nombre ?? actual.nombre,
    nuevoRol,
    activo === undefined ? actual.activo : Number(activo),
    id
  )

  return plain(
    db.prepare('SELECT id, usuario, nombre, rol, activo FROM usuarios WHERE id = ?').get(id)
  )
}

export function eliminarUsuario(id) {
  const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id)
  if (!u) return false

  if (u.rol === 'admin') {
    const otros = db
      .prepare("SELECT COUNT(*) AS n FROM usuarios WHERE rol = 'admin' AND activo = 1 AND id <> ?")
      .get(id).n
    if (otros === 0) {
      throw Object.assign(new Error('Debe quedar al menos un administrador activo'), { status: 400 })
    }
  }

  db.prepare('DELETE FROM sesiones WHERE usuario_id = ?').run(id)
  db.prepare('DELETE FROM usuarios WHERE id = ?').run(id)
  return true
}

/* ------------------------------------------------------------------ */
/* Sesiones                                                            */
/* ------------------------------------------------------------------ */

export function iniciarSesion(usuario, clave) {
  const u = db
    .prepare('SELECT * FROM usuarios WHERE usuario = ?')
    .get(String(usuario || '').trim().toLowerCase())

  const registro = (accion, exito) =>
    registrarAcceso({
      usuario: String(usuario || '').trim().toLowerCase(),
      rol: u?.rol || '—',
      accion,
      exito,
    })

  if (!u) {
    registro('Intento de ingreso fallido', false)
    throw Object.assign(new Error('Usuario o contraseña incorrectos'), { status: 401 })
  }

  if (!u.activo) {
    registro('Ingreso rechazado: usuario inactivo', false)
    throw Object.assign(new Error('Esa cuenta está desactivada'), { status: 403 })
  }

  if (!verificarClave(clave, u.clave_hash)) {
    registro('Intento de ingreso fallido', false)
    throw Object.assign(new Error('Usuario o contraseña incorrectos'), { status: 401 })
  }

  const token = randomBytes(32).toString('hex')
  const expira = new Date(Date.now() + HORAS_SESION * 3600 * 1000).toISOString()

  db.prepare('INSERT INTO sesiones (token, usuario_id, creada, expira) VALUES (?, ?, ?, ?)').run(
    token,
    u.id,
    ahoraISO(),
    expira
  )
  db.prepare('UPDATE usuarios SET ultimo_acceso = ? WHERE id = ?').run(ahoraISO(), u.id)
  registro('Ingreso al sistema', true)

  return {
    token,
    expira,
    usuario: { id: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol },
  }
}

export function cerrarSesion(token) {
  if (!token) return false
  const info = db.prepare('DELETE FROM sesiones WHERE token = ?').run(token)
  return info.changes > 0
}

export function usuarioDesdeToken(token) {
  if (!token) return null

  const s = db.prepare('SELECT * FROM sesiones WHERE token = ?').get(token)
  if (!s) return null

  if (new Date(s.expira) < new Date()) {
    db.prepare('DELETE FROM sesiones WHERE token = ?').run(token)
    return null
  }

  const u = db
    .prepare('SELECT id, usuario, nombre, rol, activo FROM usuarios WHERE id = ?')
    .get(s.usuario_id)

  if (!u || !u.activo) return null
  return u
}

/* ------------------------------------------------------------------ */
/* Bitacora de ingresos                                                */
/* ------------------------------------------------------------------ */

export function registrarAcceso({ usuario, rol, accion, ruta = '', exito = true }) {
  db.prepare(
    `INSERT INTO accesos_log (usuario, rol, accion, ruta, exito, fecha)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    String(usuario || 'desconocido'),
    rol || '—',
    accion,
    ruta,
    exito ? 1 : 0,
    ahoraISO()
  )
}

export function listarAccesos(limite = 300) {
  return plainAll(
    db.prepare('SELECT * FROM accesos_log ORDER BY id DESC LIMIT ?').all(limite)
  )
}

export function borrarAccesos() {
  const info = db.prepare('DELETE FROM accesos_log').run()
  return info.changes
}

/* ------------------------------------------------------------------ */
/* Middleware                                                          */
/* ------------------------------------------------------------------ */

function tokenDe(req) {
  const cabecera = req.headers.authorization || ''
  if (cabecera.startsWith('Bearer ')) return cabecera.slice(7)
  return null
}

/** Exige sesion valida. */
export function requiereAuth(req, res, next) {
  const usuario = usuarioDesdeToken(tokenDe(req))
  if (!usuario) {
    return res.status(401).json({ ok: false, error: 'Sesión no válida o vencida' })
  }
  req.usuario = usuario
  next()
}

/** Exige rol administrador. */
export function requiereAdmin(req, res, next) {
  if (!req.usuario) {
    return res.status(401).json({ ok: false, error: 'Sesión no válida o vencida' })
  }
  if (req.usuario.rol !== 'admin') {
    return res.status(403).json({
      ok: false,
      error: 'Necesitas ser administrador para esta acción',
    })
  }
  next()
}
