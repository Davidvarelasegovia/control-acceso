/**
 * Base de datos SQLite del Sistema de Control de Acceso.
 *
 * Usa el modulo nativo `node:sqlite` (incluido en Node 22.5+), por lo que
 * NO requiere compilar nada ni instalar dependencias nativas.
 *
 * Tablas:
 *   personas    -> Maestro de personas autorizadas (RUT unico)
 *   horarios    -> Plantillas de turnos/servicios que se repiten a diario
 *   servicios   -> Instancia real de un horario en una fecha/ventana concreta.
 *                  Es lo que reinicia los contadores sin borrar registros.
 *   registros   -> Escaneos, cada uno pertenece a un servicio
 *   urls_acceso -> Pantallas de acceso diferenciadas (/acceso-1, ...)
 *   config      -> Ajustes sueltos (nombre del recinto, direccion, ...)
 *   sync_queue  -> Operaciones creadas sin conexion, a la espera de subir
 */
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { clave, normalizar } from './identificador.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DATA_DIR = join(ROOT, 'data')
const DB_PATH = process.env.DB_PATH || join(DATA_DIR, 'control-acceso.db')

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })

export const db = new DatabaseSync(DB_PATH)

/**
 * Modo de escritura.
 *
 * Queremos que todo quede dentro del unico archivo .db para que DB Browser
 * for SQLite o DBeaver muestren los datos al instante. El modo WAL deja las
 * escrituras en un archivo aparte y las herramientas externas pueden abrir el
 * .db y ver una version vieja (o nada).
 *
 * Si otra aplicacion tiene la base abierta, el cambio de modo falla. No es
 * grave: seguimos en WAL y sincronizamos con checkpoint para que el .db se
 * mantenga al dia.
 */
let journalMode = 'wal'
try {
  db.exec('PRAGMA journal_mode = DELETE')
  journalMode = db.prepare('PRAGMA journal_mode').get().journal_mode
} catch {
  // Base abierta en otro programa: seguimos con WAL + checkpoint
  try {
    journalMode = db.prepare('PRAGMA journal_mode').get().journal_mode
  } catch {
    journalMode = 'desconocido'
  }
}

db.exec('PRAGMA foreign_keys = ON')
db.exec('PRAGMA busy_timeout = 5000')

/**
 * Agrega la columna `clave` si falta.
 *
 * Debe correr ANTES del CREATE INDEX: una base creada con una version
 * anterior no tiene esa columna y el indice revienta el arranque.
 */
function agregarColumnaClave() {
  try {
    const tabla = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='personas'")
      .get()
    if (!tabla) return false

    const existe = db.prepare("SELECT name FROM pragma_table_info('personas') WHERE name='clave'").get()
    if (!existe) {
      db.exec('ALTER TABLE personas ADD COLUMN clave TEXT')
      return true
    }
    return false
  } catch {
    return false
  }
}

agregarColumnaClave()

/**
 * Una version anterior dejo un indice UNIQUE en (horario_id, fecha) que
 * impedia generar un segundo servicio del mismo horario el mismo dia.
 * Ahora se permiten varios periodos, asi que se elimina.
 */
try {
  const viejo = db
    .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_servicios_unico'")
    .get()
  if (viejo) db.exec('DROP INDEX IF EXISTS idx_servicios_unico')
} catch {
  /* nada que hacer */
}

export const modoJournal = () => journalMode

/**
 * Vuelca el WAL al archivo .db.
 * Se llama seguido de cada escritura para que las herramientas externas
 * siempre vean los datos al dia.
 */
export function sincronizar() {
  if (journalMode !== 'wal') return false
  try {
    db.exec('PRAGMA wal_checkpoint(PASSIVE)')
    return true
  } catch {
    return false
  }
}

/** Compacta la base: todo queda dentro del .db y sin espacios libres. */
export function compactar() {
  sincronizar()
  db.exec('VACUUM')
  return { ok: true, journal_mode: journalMode, bytes: tamanhoBase() }
}

export function tamanhoBase() {
  try {
    const paginas = db.prepare('PRAGMA page_count').get().page_count
    const tam = db.prepare('PRAGMA page_size').get().page_size
    return paginas * tam
  } catch {
    return 0
  }
}

/** Cierra la base en orden, para poder copiarla o abrirla en otro programa. */
export function cerrarBase() {
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  } catch {
    /* no estamos en WAL */
  }
  try {
    db.close()
  } catch {
    /* ya cerrada */
  }
}

/* ------------------------------------------------------------------ */
/* Esquema                                                             */
/* ------------------------------------------------------------------ */

/**
 * Agrega la columna `clave` si falta.
 * Se ejecuta ANTES de crear el esquema, porque una base vieja puede no
 * tenerla y el CREATE INDEX fallaria.
 */
db.exec(`
CREATE TABLE IF NOT EXISTS personas (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nombres     TEXT NOT NULL,
  apellidos   TEXT NOT NULL,
  rut         TEXT NOT NULL,
  clave       TEXT NOT NULL,
  empresa     TEXT DEFAULT '',
  activo      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS horarios (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre      TEXT NOT NULL,
  hora_inicio TEXT NOT NULL,
  hora_fin    TEXT NOT NULL,
  descripcion TEXT DEFAULT '',
  activo      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS servicios (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  horario_id  INTEGER REFERENCES horarios(id) ON DELETE SET NULL,
  nombre      TEXT NOT NULL,
  fecha       TEXT NOT NULL,
  hora_inicio TEXT NOT NULL,
  hora_fin    TEXT NOT NULL,
  estado      TEXT NOT NULL DEFAULT 'abierto',
  origen      TEXT NOT NULL DEFAULT 'automatico',
  opened_at   TEXT,
  closed_at   TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS registros (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  persona_id  INTEGER REFERENCES personas(id) ON DELETE SET NULL,
  servicio_id INTEGER REFERENCES servicios(id) ON DELETE SET NULL,
  nombres     TEXT DEFAULT '',
  apellidos   TEXT DEFAULT '',
  empresa     TEXT DEFAULT '',
  rut         TEXT NOT NULL,
  estado      TEXT NOT NULL,
  hora        TEXT NOT NULL,
  dispositivo TEXT DEFAULT '',
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS usuarios (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario       TEXT NOT NULL UNIQUE,
  nombre        TEXT NOT NULL,
  clave_hash    TEXT NOT NULL,
  rol           TEXT NOT NULL DEFAULT 'agente',
  activo        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL,
  ultimo_acceso TEXT
);

CREATE TABLE IF NOT EXISTS sesiones (
  token      TEXT PRIMARY KEY,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
  creada     TEXT NOT NULL,
  expira     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS accesos_log (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario TEXT NOT NULL,
  rol     TEXT NOT NULL DEFAULT '-',
  accion  TEXT NOT NULL,
  ruta    TEXT DEFAULT '',
  exito   INTEGER NOT NULL DEFAULT 1,
  fecha   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS eventos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo        TEXT NOT NULL,
  servicio_id INTEGER REFERENCES servicios(id) ON DELETE SET NULL,
  persona_id  INTEGER REFERENCES personas(id) ON DELETE SET NULL,
  nombres     TEXT DEFAULT '',
  rut         TEXT DEFAULT '',
  dispositivo TEXT DEFAULT '',
  acceso_previo TEXT DEFAULT '',
  hora        TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS urls_acceso (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre     TEXT NOT NULL,
  url        TEXT NOT NULL UNIQUE,
  activo     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS config (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_queue (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  entidad    TEXT NOT NULL,
  datos      TEXT NOT NULL,
  synced     INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

/**
 * Credenciales virtuales de los trabajadores.
 *
 * Cada credencial tiene un codigo de 10 caracteres (letras + numeros) que se
 * imprime como codigo de barras. Ese codigo esta ligado al RUT de una persona,
 * de modo que al escanear la credencial el sistema resuelve a quien pertenece.
 *
 * Los campos/licenses/vehiculos guardan JSON con las casillas marcadas
 * del reverso de la credencial.
 */
CREATE TABLE IF NOT EXISTS credenciales (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo         TEXT NOT NULL UNIQUE,
  persona_id     INTEGER,
  nombres        TEXT NOT NULL,
  apellidos      TEXT NOT NULL,
  empresa        TEXT,
  cargo          TEXT,
  foto           TEXT,
  autorizaciones TEXT NOT NULL DEFAULT '[]',
  licencias      TEXT NOT NULL DEFAULT '[]',
  vehiculos      TEXT NOT NULL DEFAULT '[]',
  vigente_desde  TEXT,
  vigente_hasta  TEXT,
  notas          TEXT,
  estado         TEXT NOT NULL DEFAULT 'emitida',
  enviada_whats  INTEGER NOT NULL DEFAULT 0,
  enviada_at     TEXT,
  descargas      INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  FOREIGN KEY (persona_id) REFERENCES personas(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_credenciales_codigo   ON credenciales(codigo);
CREATE INDEX IF NOT EXISTS idx_credenciales_persona ON credenciales(persona_id);
CREATE INDEX IF NOT EXISTS idx_credenciales_estado  ON credenciales(estado);

CREATE INDEX IF NOT EXISTS idx_accesos_fecha     ON accesos_log(fecha);
CREATE INDEX IF NOT EXISTS idx_personas_clave    ON personas(clave);
CREATE INDEX IF NOT EXISTS idx_registros_servicio ON registros(servicio_id);
CREATE INDEX IF NOT EXISTS idx_registros_rut      ON registros(rut);
CREATE INDEX IF NOT EXISTS idx_registros_hora     ON registros(hora);
CREATE INDEX IF NOT EXISTS idx_eventos_servicio   ON eventos(servicio_id);
CREATE INDEX IF NOT EXISTS idx_eventos_tipo       ON eventos(tipo);
CREATE INDEX IF NOT EXISTS idx_servicios_estado   ON servicios(estado);
CREATE INDEX IF NOT EXISTS idx_servicios_periodo  ON servicios(horario_id, fecha);
`)

/* ------------------------------------------------------------------ */
/* Importacion masiva                                                  */
/* ------------------------------------------------------------------ */

/**
 * Inserta muchas personas en una sola transaccion.
 * Pensado para cargar listas grandes (500, 1000 o mas) sinspaper que la
 * interfaz se quede pegada.
 *
 * @param {Array<{nombres, apellidos, rut, empresa}>} filas
 * @returns {{insertados:number, omitidos:number, total:number, errores:Array}}
 */
export function importarPersonas(filas) {
  const existentes = new Set(
    db.prepare('SELECT clave FROM personas').all().map((r) => r.clave)
  )

  const insertar = db.prepare(
    `INSERT INTO personas (nombres, apellidos, rut, clave, empresa, activo, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
  )

  const ts = ahoraISO()
  const errores = []
  let insertados = 0
  let omitidos = 0

  const correr = db.prepare('BEGIN')
  correr.run()

  try {
    filas.forEach((fila, i) => {
      const nombres = String(fila.nombres ?? '').trim()
      const apellidos = String(fila.apellidos ?? '').trim()
      const rutCrudo = String(fila.rut ?? '').trim()
      const empresa = String(fila.empresa ?? '').trim()

      if (!rutCrudo || !normalizar(rutCrudo)) {
        errores.push({ fila: i + 1, motivo: 'Identificador vacío', rut: rutCrudo })
        omitidos++
        return
      }

      const k = clave(rutCrudo)

      // Duplicado dentro del mismo archivo o contra la base
      if (existentes.has(k)) {
        errores.push({ fila: i + 1, motivo: 'Identificador repetido', rut: rutCrudo })
        omitidos++
        return
      }

      try {
        insertar.run(nombres || '(sin nombre)', apellidos, rutCrudo, k, empresa, ts, ts)
        existentes.add(k)
        insertados++
      } catch (e) {
        errores.push({ fila: i + 1, motivo: e.message, rut: rutCrudo })
        omitidos++
      }
    })

    db.prepare('COMMIT').run()
  } catch (e) {
    db.prepare('ROLLBACK').run()
    throw e
  }

  sincronizar()

  return { insertados, omitidos, total: filas.length, errores: errores.slice(0, 200) }
}

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

export const ahoraISO = () => new Date().toISOString()

/** Los resultados de node:sqlite no tienen prototipo; los normalizamos. */
export const plain = (row) => (row ? { ...row } : row)
export const plainAll = (rows) => rows.map((r) => ({ ...r }))

export function getConfig(clave, porDefecto = null) {
  const row = db.prepare('SELECT valor FROM config WHERE clave = ?').get(clave)
  return row ? row.valor : porDefecto
}

export function setConfig(clave, valor) {
  db.prepare(
    `INSERT INTO config (clave, valor) VALUES (?, ?)
     ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`
  ).run(clave, String(valor))
}

export function getVenueConfig() {
  return {
    nombre: getConfig('venue_nombre', 'Hospital Sur'),
    direccion: getConfig('venue_direccion', 'Av. Principal 1234'),
  }
}

export function saveVenueConfig({ nombre, direccion }) {
  if (nombre !== undefined) setConfig('venue_nombre', nombre)
  if (direccion !== undefined) setConfig('venue_direccion', direccion)
  return getVenueConfig()
}

export function getMenuItems() {
  const raw = getConfig('menu_items', null)
  return raw ? JSON.parse(raw) : []
}

export function saveMenuItems(items) {
  setConfig('menu_items', JSON.stringify(items))
  return items
}

/* ------------------------------------------------------------------ */
/* Datos iniciales                                                     */
/* ------------------------------------------------------------------ */

// RUT de ejemplo: todos con digito verificador correcto (ver server/rut.js)
const DEFAULT_PERSONAS = [
  ['Juan Carlos', 'Pérez González', '12.345.678-5', 'TechCorp Ltda.'],
  ['María Fernanda', 'López Martínez', '98.765.432-5', 'Innovaciones SA'],
  ['Carlos Alberto', 'Rodríguez Silva', '11.222.333-9', 'Construcciones XYZ'],
  ['Ana María', 'González Pérez', '15.678.901-1', 'Servicios Integrales'],
  ['Roberto Andrés', 'Martínez López', '87.654.321-4', 'Logística Express'],
]

const DEFAULT_HORARIOS = [
  ['Turno Mañana', '08:00', '13:00', 'Jornada matutina'],
  ['Colación', '13:00', '14:00', 'Tiempo de almuerzo'],
  ['Turno Tarde', '14:00', '18:00', 'Jornada vespertina'],
]

const DEFAULT_URLS = [
  ['Acceso 1 - Puerta Norte', '/acceso-1'],
  ['Acceso 2 - Puerta Sur', '/acceso-2'],
]

const DEFAULT_MENU = [
  { id: 1, nombre: 'Inicio', icono: '🏠', ruta: 'inicio', activo: true },
  { id: 2, nombre: 'Personas', icono: '👥', ruta: 'personas', activo: true },
  { id: 3, nombre: 'Horarios', icono: '🕐', ruta: 'horarios', activo: true },
  { id: 4, nombre: 'Registros', icono: '📋', ruta: 'registros', activo: true },
  { id: 5, nombre: 'Configuración', icono: '⚙️', ruta: 'configuracion', activo: true },
]

/**
 * Migra bases antiguas:
 *  - agrega la columna `clave` si no existe
 *  - la calcula para cada persona
 */
export function repararClaves() {
  agregarColumnaClave()

  const upd = db.prepare('UPDATE personas SET clave = ? WHERE id = ?')
  for (const p of db.prepare('SELECT id, rut, clave FROM personas').all()) {
    const correcta = clave(p.rut)
    if (p.clave !== correcta) upd.run(correcta, p.id)
  }

  sincronizar()
}

export function sembrar() {
  const ts = ahoraISO()

  if (!getConfig('venue_nombre')) {
    setConfig('venue_nombre', 'Hospital Sur')
    setConfig('venue_direccion', 'Av. Principal 1234')
  }
  if (!getConfig('menu_items')) setConfig('menu_items', JSON.stringify(DEFAULT_MENU))

  const personas = db.prepare('SELECT COUNT(*) AS n FROM personas').get().n
  if (personas === 0) {
    const ins = db.prepare(
      `INSERT INTO personas (nombres, apellidos, rut, clave, empresa, activo, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
    )
    for (const p of DEFAULT_PERSONAS) {
      ins.run(p[0], p[1], p[2], clave(p[2]), p[3], ts, ts)
    }
  } else {
    // Bases creadas antes de existir la columna `clave`
    repararClaves()
  }

  const horarios = db.prepare('SELECT COUNT(*) AS n FROM horarios').get().n
  if (horarios === 0) {
    const ins = db.prepare(
      `INSERT INTO horarios (nombre, hora_inicio, hora_fin, descripcion, activo, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)`
    )
    for (const h of DEFAULT_HORARIOS) ins.run(h[0], h[1], h[2], h[3], ts, ts)
  }

  const urls = db.prepare('SELECT COUNT(*) AS n FROM urls_acceso').get().n
  if (urls === 0) {
    const ins = db.prepare(
      'INSERT INTO urls_acceso (nombre, url, activo, created_at) VALUES (?, ?, 1, ?)'
    )
    for (const u of DEFAULT_URLS) ins.run(u[0], u[1], ts)
  }
}
