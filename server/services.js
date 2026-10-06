/**
 * Logica de SERVICIOS (periodos de operacion).
 *
 * Un Servicio es la instancia real de un Horario en una fecha concreta.
 * Ej: el horario "Turno Manana" (08:00-13:00) genera un servicio por dia.
 *
 * Regla central pedida: cuando arranca un servicio nuevo, los CONTADORES
 * arrancan en cero, pero los REGISTROS del servicio anterior se conservan.
 *
 * Los horarios pueden cruzar la medianoche (ej: 22:00 - 06:00); en ese caso
 * el servicio pertenece al dia en que COMENZO el turno.
 */
import { db, ahoraISO, plain, plainAll } from './db.js'

/* ------------------------------------------------------------------ */
/* Helpers de fecha/hora                                               */
/* ------------------------------------------------------------------ */

const pad = (n) => String(n).padStart(2, '0')

export function fechaISO(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function sumarDias(fecha, dias) {
  const [a, m, d] = fecha.split('-').map(Number)
  const dt = new Date(a, m - 1, d)
  dt.setDate(dt.getDate() + dias)
  return fechaISO(dt)
}

export function horaDe(d) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function aMinutos(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number)
  return h * 60 + m
}

export function normalizarRut(rut) {
  return String(rut || '').replace(/[^0-9a-zA-Z]/g, '').toUpperCase()
}

/* ------------------------------------------------------------------ */
/* Ocurrencia de un horario                                            */
/* ------------------------------------------------------------------ */

/**
 * Devuelve la ocurrencia del horario que contiene a `fecha`, o null.
 * Respeta horarios que cruzan la medianoche.
 */
export function ocurrenciaDe(horario, fecha = new Date()) {
  const hoy = fechaISO(fecha)
  const ayer = sumarDias(hoy, -1)
  const ahoraMin = fecha.getHours() * 60 + fecha.getMinutes()
  const inicioMin = aMinutos(horario.hora_inicio)
  const finMin = aMinutos(horario.hora_fin)

  const base = {
    horario_id: horario.id,
    nombre: horario.nombre,
    hora_inicio: horario.hora_inicio,
    hora_fin: horario.hora_fin,
  }

  // Horario normal: no cruza medianoche
  if (inicioMin <= finMin) {
    if (ahoraMin >= inicioMin && ahoraMin <= finMin) return { ...base, fecha: hoy }
    return null
  }

  // Horario que cruza medianoche (ej 22:00 -> 06:00)
  if (ahoraMin >= inicioMin) return { ...base, fecha: hoy }
  if (ahoraMin <= finMin) return { ...base, fecha: ayer }
  return null
}

/** Instante real (Date) en que la ocurrencia abre, para saber si ya empezo. */
export function instanteInicio(ocurrencia) {
  const [a, m, d] = ocurrencia.fecha.split('-').map(Number)
  const [hh, mm] = ocurrencia.hora_inicio.split(':').map(Number)
  return new Date(a, m - 1, d, hh, mm, 0, 0)
}

function instanteFin(ocurrencia) {
  const [a, m, d] = ocurrencia.fecha.split('-').map(Number)
  const [hh, mm] = ocurrencia.hora_fin.split(':').map(Number)
  return new Date(a, m - 1, d, hh, mm, 0, 0)
}

/* ------------------------------------------------------------------ */
/* Apertura y cierre de servicios                                      */
/* ------------------------------------------------------------------ */

/**
 * Servicio abierto de un horario para una fecha.
 * Se usa solo en la apertura automatica, para no crear uno nuevo en cada
 * consulta (el servicio debe ser el mismo mientras dure su ventana).
 */
function buscarServicioAbierto(horarioId, fecha) {
  const row = db
    .prepare(
      "SELECT * FROM servicios WHERE horario_id = ? AND fecha = ? AND estado = 'abierto' ORDER BY id DESC LIMIT 1"
    )
    .get(horarioId, fecha)
  return row ? plain(row) : null
}

/** Crea un servicio nuevo. Siempre es un periodo nuevo, con contadores en 0. */
function crearServicio(ocurrencia, origen) {
  const ts = ahoraISO()
  const info = db
    .prepare(
      `INSERT INTO servicios
         (horario_id, nombre, fecha, hora_inicio, hora_fin, estado, origen, opened_at, created_at)
       VALUES (?, ?, ?, ?, ?, 'abierto', ?, ?, ?)`
    )
    .run(
      ocurrencia.horario_id,
      ocurrencia.nombre,
      ocurrencia.fecha,
      ocurrencia.hora_inicio,
      ocurrencia.hora_fin,
      origen,
      ts,
      ts
    )

  return plain(
    db.prepare('SELECT * FROM servicios WHERE id = ?').get(Number(info.lastInsertRowid))
  )
}

/** Apertura automatica: reutiliza el servicio abierto, o crea uno. */
function abrirServicio(ocurrencia) {
  const existente = buscarServicioAbierto(ocurrencia.horario_id, ocurrencia.fecha)
  if (existente) return existente
  return crearServicio(ocurrencia, 'automatico')
}

function cerrarServiciosVencidos(ahora = new Date()) {
  const abiertos = db.prepare("SELECT * FROM servicios WHERE estado = 'abierto'").all()

  for (const s of abiertos) {
    // Los servicios generados a mano se mantienen abiertos hasta que el
    // operador los cierre explicitamente. Si no, un "Generar Servicio" de
    // las 23:00 se cerraria solo al dia siguiente y perderia sus registros.
    if (s.origen === 'manual') continue

    const [a, m, d] = s.fecha.split('-').map(Number)
    const [hh, mm] = s.hora_fin.split(':').map(Number)
    let fin = new Date(a, m - 1, d, hh, mm, 0, 0)

    // Si el horario cruzaba medianoche, el fin es del dia siguiente
    if (aMinutos(s.hora_fin) < aMinutos(s.hora_inicio)) {
      fin = new Date(a, m - 1, d + 1, hh, mm, 0, 0)
    }

    if (ahora > fin) {
      db.prepare(
        "UPDATE servicios SET estado = 'cerrado', closed_at = ? WHERE id = ?"
      ).run(ahoraISO(), s.id)
    }
  }
}

/**
 * Servicio vigente: el que esta abierto y cuya ventana contiene a `ahora`.
 * Si no hay ninguno, se busca el horario activo que corresponda y se abre
 * automaticamente (contadores en cero para ese nuevo servicio).
 *
 * Devuelve null si la hora actual cae fuera de todo horario.
 */
export function getServicioActual(fecha = new Date(), { autoAbrir = true } = {}) {
  const ahora = fecha
  cerrarServiciosVencidos(ahora)

  const hoy = fechaISO(ahora)

  // 1) Prioridad maxima: un servicio generado a mano sigue vigente hasta que
  //    el operador lo cierre, aunque la hora actual se salga de su ventana.
  const manual = db
    .prepare("SELECT * FROM servicios WHERE estado = 'abierto' AND origen = 'manual' ORDER BY id DESC LIMIT 1")
    .get()
  if (manual) return plain(manual)

  // 2) Un servicio automatico ya abierto cuyo horario contiene a "ahora"
  const abiertosHoy = plainAll(
    db
      .prepare("SELECT * FROM servicios WHERE estado = 'abierto' AND fecha = ?")
      .all(hoy)
  )

  for (const s of abiertosHoy) {
    const [hh, mm] = horaDe(ahora).split(':').map(Number)
    const ahoraMin = hh * 60 + mm
    const inicioMin = aMinutos(s.hora_inicio)
    const finMin = aMinutos(s.hora_fin)

    const dentro =
      inicioMin <= finMin
        ? ahoraMin >= inicioMin && ahoraMin <= finMin
        : ahoraMin >= inicioMin || ahoraMin <= finMin

    if (dentro) return s
  }

  // 3) Cerrar servicios automaticos abiertos que ya no corresponden
  for (const s of abiertosHoy) {
    db.prepare("UPDATE servicios SET estado = 'cerrado', closed_at = ? WHERE id = ?").run(
      ahoraISO(),
      s.id
    )
  }

  if (!autoAbrir) return null

  // 3) Abrir automaticamente el horario que contiene a "ahora"
  const horarios = plainAll(
    db.prepare('SELECT * FROM horarios WHERE activo = 1 ORDER BY hora_inicio ASC').all()
  )

  let elegida = null
  for (const h of horarios) {
    const occ = ocurrenciaDe(h, ahora)
    if (occ && instanteInicio(occ) <= ahora) {
      // Preferir el que بدأ mas recientemente (mas especifico)
      if (!elegida || aMinutos(occ.hora_inicio) > aMinutos(elegida.hora_inicio)) {
        elegida = occ
      }
    }
  }

  if (!elegida) return null
  return abrirServicio(elegida)
}

/**
 * Cierra TODOS los servicios abiertos.
 * Cierra todos (no solo el primero) porque si quedaran dos abiertos, el
 * manual seguiria teniendo prioridad y el nuevo servicio nunca se usaria.
 */
export function cerrarServicioActual() {
  const abiertos = db.prepare("SELECT * FROM servicios WHERE estado = 'abierto'").all()
  if (abiertos.length === 0) return null

  const ts = ahoraISO()
  const upd = db.prepare("UPDATE servicios SET estado = 'cerrado', closed_at = ? WHERE id = ?")
  for (const s of abiertos) upd.run(ts, s.id)

  return plainAll(abiertos).at(-1) || null
}

/**
 * Genera un Servicio manualmente desde un horario.
 * Cierra el servicio abierto y arranca el nuevo -> contadores en cero.
 */
export function generarServicioDesdeHorario(horarioId, fecha = new Date()) {
  const horario = plain(db.prepare('SELECT * FROM horarios WHERE id = ?').get(horarioId))
  if (!horario) return null

  const occ = {
    horario_id: horario.id,
    nombre: horario.nombre,
    hora_inicio: horario.hora_inicio,
    hora_fin: horario.hora_fin,
    fecha: fechaISO(fecha),
  }

  // Siempre un periodo NUEVO: contadores en cero, registros anteriores intactos
  cerrarServicioActual()
  return crearServicio(occ, 'manual')
}

/** Crea un Servicio sin horario asociado (servicio libre / evento). */
export function crearServicioManual({ nombre, fecha, hora_inicio, hora_fin }) {
  const ts = ahoraISO()
  cerrarServicioActual()
  const info = db
    .prepare(
      `INSERT INTO servicios
         (horario_id, nombre, fecha, hora_inicio, hora_fin, estado, origen, opened_at, created_at)
       VALUES (NULL, ?, ?, ?, ?, 'abierto', 'manual', ?, ?)`
    )
    .run(nombre, fecha, hora_inicio, hora_fin, ts, ts)
  return plain(db.prepare('SELECT * FROM servicios WHERE id = ?').get(Number(info.lastInsertRowid)))
}

export function listarServicios(limite = 100) {
  return plainAll(
    db.prepare('SELECT * FROM servicios ORDER BY id DESC LIMIT ?').all(limite)
  )
}

/* ------------------------------------------------------------------ */
/* Estadisticas por servicio                                           */
/* ------------------------------------------------------------------ */

/**
 * Estadisticas del servicio.
 *
 * `total` cuenta SOLO los ingresos autorizados. No incluye los no encontrados
 * (nadie entro) ni los duplicados (se rechazaron, y ademas viven en `eventos`).
 */
export function getEstadisticas(servicioId) {
  const base = { total: 0, autorizados: 0, duplicados: 0, noEncontrados: 0 }
  if (!servicioId) return base

  const reg = db
    .prepare(
      `SELECT
         SUM(CASE WHEN estado = 'autorizado'    THEN 1 ELSE 0 END) AS autorizados,
         SUM(CASE WHEN estado = 'no-encontrado' THEN 1 ELSE 0 END) AS noEncontrados
       FROM registros WHERE servicio_id = ?`
    )
    .get(servicioId)

  const dup = db
    .prepare(
      "SELECT COUNT(*) AS n FROM eventos WHERE servicio_id = ? AND tipo = 'duplicado'"
    )
    .get(servicioId)

  const autorizados = reg?.autorizados || 0

  return {
    total: autorizados,
    autorizados,
    duplicados: dup?.n || 0,
    noEncontrados: reg?.noEncontrados || 0,
  }
}

/** Cantidad total de duplicados registrados (en cualquier servicio). */
export function totalDuplicados(servicioId) {
  if (servicioId) {
    return db
      .prepare("SELECT COUNT(*) AS n FROM eventos WHERE servicio_id = ? AND tipo = 'duplicado'")
      .get(servicioId).n
  }
  return db.prepare("SELECT COUNT(*) AS n FROM eventos WHERE tipo = 'duplicado'").get().n
}

export function totalGlobalRegistros() {
  return db.prepare('SELECT COUNT(*) AS n FROM registros').get().n
}
