/**
 * Acceso a datos de personas, horarios, registros y urls de acceso.
 */
import {
  db,
  ahoraISO,
  plain,
  plainAll,
  sincronizar,
  getVenueConfig,
  saveVenueConfig,
  getMenuItems,
  saveMenuItems,
} from './db.js'
import { normalizarRut } from './services.js'
import { clave as claveId, normalizar, auditar as auditarIds } from './identificador.js'

/* ------------------------------ Personas ------------------------------ */

export function listarPersonas({ soloActivos = false } = {}) {
  const sql = soloActivos
    ? 'SELECT * FROM personas WHERE activo = 1 ORDER BY nombres, apellidos'
    : 'SELECT * FROM personas ORDER BY activo DESC, nombres, apellidos'
  return plainAll(db.prepare(sql).all())
}

/** Identificadores vacios o repetidos. */
export function auditarRuts() {
  return auditarIds(listarPersonas())
}

/**
 * Busca una persona por identificador.
 *
 * Comparacion sobre la `clave` (el identificador sin digito verificador):
 * "13874809-K", "13874809" y "138748095" devuelven la misma persona.
 * No hay validacion de formato ni de digito verificador.
 */
export function obtenerPersonaPorRut(rut) {
  const objetivo = claveId(rut)
  if (!objetivo) return null

  const row = db
    .prepare('SELECT * FROM personas WHERE clave = ? AND activo = 1 ORDER BY id LIMIT 1')
    .get(objetivo)
  if (row) return plain(row)

  // Respaldo: revisa tambien las inactivas (por si el id quedo ahi)
  const inactiva = db
    .prepare('SELECT * FROM personas WHERE clave = ? ORDER BY id LIMIT 1')
    .get(objetivo)
  return inactiva ? plain(inactiva) : null
}

export function crearPersona({ nombres, apellidos, rut, empresa = '' }) {
  const id = String(rut ?? '').trim()
  if (!normalizar(id)) {
    const err = new Error('El identificador no puede estar vacío')
    err.status = 400
    throw err
  }

  const k = claveId(id)

  // El identificador debe ser unico en la base
  if (obtenerPersonaPorRut(id)) {
    const err = new Error('Ya existe una persona registrada con ese identificador')
    err.status = 409
    throw err
  }

  const ts = ahoraISO()
  const info = db
    .prepare(
      `INSERT INTO personas (nombres, apellidos, rut, clave, empresa, activo, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
    )
    .run(nombres, apellidos, id, k, empresa, ts, ts)

  sincronizar()
  return plain(db.prepare('SELECT * FROM personas WHERE id = ?').get(Number(info.lastInsertRowid)))
}

export function actualizarPersona(id, { nombres, apellidos, rut, empresa, activo }) {
  const actual = db.prepare('SELECT * FROM personas WHERE id = ?').get(id)
  if (!actual) return null

  let rutFinal = actual.rut
  let claveFinal = actual.clave

  if (rut !== undefined && String(rut).trim() !== '') {
    rutFinal = String(rut).trim()
    claveFinal = claveId(rutFinal)

    const choque = obtenerPersonaPorRut(rutFinal)
    if (choque && choque.id !== id) {
      const err = new Error('Ese identificador ya pertenece a otra persona')
      err.status = 409
      throw err
    }
  }

  const m = {
    nombres: nombres ?? actual.nombres,
    apellidos: apellidos ?? actual.apellidos,
    empresa: empresa ?? actual.empresa,
    activo: activo === undefined ? actual.activo : Number(activo),
  }

  db.prepare(
    `UPDATE personas SET nombres = ?, apellidos = ?, rut = ?, clave = ?, empresa = ?, activo = ?, updated_at = ?
     WHERE id = ?`
  ).run(m.nombres, m.apellidos, rutFinal, claveFinal, m.empresa, m.activo, ahoraISO(), id)

  sincronizar()
  return plain(db.prepare('SELECT * FROM personas WHERE id = ?').get(id))
}

export function eliminarPersona(id) {
  const r = db.prepare('DELETE FROM personas WHERE id = ?').run(id)
  sincronizar()
  return r.changes > 0
}

/* ------------------------------ Horarios ------------------------------ */

export function listarHorarios({ soloActivos = false } = {}) {
  const sql = soloActivos
    ? 'SELECT * FROM horarios WHERE activo = 1 ORDER BY hora_inicio ASC'
    : 'SELECT * FROM horarios ORDER BY activo DESC, hora_inicio ASC'
  return plainAll(db.prepare(sql).all())
}

export function crearHorario({ nombre, hora_inicio, hora_fin, descripcion = '' }) {
  const ts = ahoraISO()
  const info = db
    .prepare(
      `INSERT INTO horarios (nombre, hora_inicio, hora_fin, descripcion, activo, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)`
    )
    .run(nombre, hora_inicio, hora_fin, descripcion, ts, ts)
  return plain(db.prepare('SELECT * FROM horarios WHERE id = ?').get(Number(info.lastInsertRowid)))
}

export function actualizarHorario(id, { nombre, hora_inicio, hora_fin, descripcion, activo }) {
  const a = db.prepare('SELECT * FROM horarios WHERE id = ?').get(id)
  if (!a) return null
  const m = {
    nombre: nombre ?? a.nombre,
    hora_inicio: hora_inicio ?? a.hora_inicio,
    hora_fin: hora_fin ?? a.hora_fin,
    descripcion: descripcion ?? a.descripcion,
    activo: activo === undefined ? a.activo : Number(activo),
  }
  db.prepare(
    `UPDATE horarios SET nombre = ?, hora_inicio = ?, hora_fin = ?, descripcion = ?, activo = ?, updated_at = ?
     WHERE id = ?`
  ).run(m.nombre, m.hora_inicio, m.hora_fin, m.descripcion, m.activo, ahoraISO(), id)
  return plain(db.prepare('SELECT * FROM horarios WHERE id = ?').get(id))
}

export function eliminarHorario(id) {
  const r = db.prepare('DELETE FROM horarios WHERE id = ?').run(id)
  return r.changes > 0
}

/* ------------------------------ Registros ----------------------------- */

export function listarRegistros({ servicio_id = null, limite = 500 } = {}) {
  if (servicio_id) {
    return plainAll(
      db
        .prepare(
          `SELECT r.*, s.nombre AS servicio_nombre, s.fecha AS servicio_fecha
           FROM registros r LEFT JOIN servicios s ON s.id = r.servicio_id
           WHERE r.servicio_id = ? ORDER BY r.id DESC LIMIT ?`
        )
        .all(servicio_id, limite)
    )
  }
  return plainAll(
    db
      .prepare(
        `SELECT r.*, s.nombre AS servicio_nombre, s.fecha AS servicio_fecha
         FROM registros r LEFT JOIN servicios s ON s.id = r.servicio_id
         ORDER BY r.id DESC LIMIT ?`
      )
      .all(limite)
  )
}

export function crearRegistro({
  persona_id = null,
  servicio_id = null,
  nombres = '',
  apellidos = '',
  empresa = '',
  rut,
  estado,
  hora,
  dispositivo = '',
}) {
  const info = db
    .prepare(
      `INSERT INTO registros
        (persona_id, servicio_id, nombres, apellidos, empresa, rut, estado, hora, dispositivo, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(persona_id, servicio_id, nombres, apellidos, empresa, rut, estado, hora, dispositivo, ahoraISO())
  sincronizar()
  return plain(db.prepare('SELECT * FROM registros WHERE id = ?').get(Number(info.lastInsertRowid)))
}

/**
 * Ultimo ingreso del mismo RUT DENTRO DEL MISMO SERVICIO.
 *
 * La ventana anti-duplicado se reinicia con cada servicio: si una persona
 * ingreso en el acceso norte durante el Turno Manana, puede volver a
 * registrarse en el acceso sur cuando empieza la Colacion.
 *
 * @returns {object|null} el registro previo (con su dispositivo/acceso)
 */
export function ingresoEnServicio(rut, servicioId) {
  if (!servicioId) return null
  const row = db
    .prepare(
      `SELECT * FROM registros
       WHERE rut = ? AND servicio_id = ?
       ORDER BY id DESC LIMIT 1`
    )
    .get(rut, servicioId)
  return row ? plain(row) : null
}

/**
 * Ultimo ingreso del mismo RUT en los ultimos N minutos (cualquier servicio).
 * Se mantiene para consultashistoricas.
 */
export function ingresoReciente(rut, minutosVentana = 5) {
  const desde = new Date(Date.now() - minutosVentana * 60000).toISOString()
  const row = db
    .prepare('SELECT * FROM registros WHERE rut = ? AND hora >= ? ORDER BY id DESC LIMIT 1')
    .get(rut, desde)
  return row ? plain(row) : null
}

export function eliminarRegistro(id) {
  const r = db.prepare('DELETE FROM registros WHERE id = ?').run(id)
  return r.changes > 0
}

/* ------------------------------- Eventos ------------------------------ */

/**
 * Intento de acceso que NO genero un ingreso (duplicado).
 * Se guardan aparte para que el total de registros no se infla.
 */
export function crearEvento({
  tipo,
  servicio_id = null,
  persona_id = null,
  nombres = '',
  rut = '',
  dispositivo = '',
  acceso_previo = '',
  hora,
}) {
  const info = db
    .prepare(
      `INSERT INTO eventos
        (tipo, servicio_id, persona_id, nombres, rut, dispositivo, acceso_previo, hora, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(tipo, servicio_id, persona_id, nombres, rut, dispositivo, acceso_previo, hora, ahoraISO())

  return plain(db.prepare('SELECT * FROM eventos WHERE id = ?').get(Number(info.lastInsertRowid)))
}

export function listarEventos({ servicio_id = null, limite = 500 } = {}) {
  const sql = `
    SELECT e.*, s.nombre AS servicio_nombre, s.fecha AS servicio_fecha
    FROM eventos e LEFT JOIN servicios s ON s.id = e.servicio_id
    ${servicio_id ? 'WHERE e.servicio_id = ?' : ''}
    ORDER BY e.id DESC LIMIT ?`
  const filas = servicio_id
    ? db.prepare(sql).all(servicio_id, limite)
    : db.prepare(sql).all(limite)
  return plainAll(filas)
}

/* ---------------------------- Urls de acceso -------------------------- */

export function listarUrls() {
  return plainAll(db.prepare('SELECT * FROM urls_acceso ORDER BY id ASC').all())
}

export function crearUrl({ nombre, url }) {
  try {
    const info = db
      .prepare('INSERT INTO urls_acceso (nombre, url, activo, created_at) VALUES (?, ?, 1, ?)')
      .run(nombre, url, ahoraISO())
    return plain(db.prepare('SELECT * FROM urls_acceso WHERE id = ?').get(Number(info.lastInsertRowid)))
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      const err = new Error('Esa URL de acceso ya existe')
      err.status = 409
      throw err
    }
    throw e
  }
}

export function actualizarUrl(id, { nombre, url, activo }) {
  const a = db.prepare('SELECT * FROM urls_acceso WHERE id = ?').get(id)
  if (!a) return null
  const m = {
    nombre: nombre ?? a.nombre,
    url: url ?? a.url,
    activo: activo === undefined ? a.activo : Number(activo),
  }
  db.prepare('UPDATE urls_acceso SET nombre = ?, url = ?, activo = ? WHERE id = ?').run(
    m.nombre, m.url, m.activo, id
  )
  return plain(db.prepare('SELECT * FROM urls_acceso WHERE id = ?').get(id))
}

export function eliminarUrl(id) {
  const r = db.prepare('DELETE FROM urls_acceso WHERE id = ?').run(id)
  return r.changes > 0
}

export { getVenueConfig, saveVenueConfig, getMenuItems, saveMenuItems }
