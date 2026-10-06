/**
 * Genera una base de DEMOSTRACION con un mes de historia para poder ver los
 * graficos de informes con datos realistas.
 *
 * NO toca la base real: escribe en data/demo.db
 *   DB_PATH=data/demo.db node scripts/demo-datos.js
 */
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ruta = process.env.DB_PATH || join(__dirname, '..', 'data', 'demo.db')

mkdirSync(dirname(ruta), { recursive: true })
rmSync(ruta, { force: true })
rmSync(ruta + '-journal', { force: true })

const db = new DatabaseSync(ruta)

/**
 * Las horas se guardan en UTC (como las de la app real), pero se generan a
 * partir de componentes de HORA LOCAL: asi el informe, que convierte con
 * 'localtime', devuelve exactamente la hora que se escribio aqui.
 */
function isoLocal(fecha, hora, minuto, segundo = 0) {
  const [a, m, d] = fecha.split('-').map(Number)
  return new Date(a, m - 1, d, hora, minuto, segundo).toISOString()
}

db.exec(`
  CREATE TABLE personas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombres TEXT NOT NULL, apellidos TEXT NOT NULL,
    rut TEXT NOT NULL, clave TEXT, empresa TEXT,
    activo INTEGER DEFAULT 1,
    created_at TEXT, updated_at TEXT
  );
  CREATE TABLE horarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL, hora_inicio TEXT NOT NULL, hora_fin TEXT NOT NULL,
    activo INTEGER DEFAULT 1, created_at TEXT
  );
  CREATE TABLE servicios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    horario_id INTEGER, nombre TEXT NOT NULL, fecha TEXT NOT NULL,
    hora_inicio TEXT NOT NULL, hora_fin TEXT NOT NULL,
    estado TEXT DEFAULT 'abierto', origen TEXT, cerrado_at TEXT,
    created_at TEXT
  );
  CREATE TABLE registros (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    servicio_id INTEGER, persona_id INTEGER,
    nombres TEXT, rut TEXT, dispositivo TEXT,
    estado TEXT, hora TEXT NOT NULL, created_at TEXT
  );
  CREATE TABLE eventos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    servicio_id INTEGER, persona_id INTEGER,
    nombres TEXT, rut TEXT, tipo TEXT, dispositivo TEXT,
    acceso_previo TEXT, hora TEXT NOT NULL, created_at TEXT
  );
`)

/* --------------------------- Personas --------------------------- */

const NOMBRES = ['Juan', 'María', 'Pedro', 'Ana', 'Luis', 'Sofía', 'Carlos', 'Valentina',
  'Diego', 'Camila', 'Andrés', 'Javiera', 'Matías', 'Isabella', 'Sebastián', 'Fernanda',
  'Nicolás', 'Antonia', 'Gabriel', 'Catalina', 'Tomás', 'Renata', 'Ignacio', 'Javiera',
  'Rodrigo', 'Emilia', 'Cristóbal', 'Martina', 'Vicente', 'Josefa']
const APELLIDOS = ['Gómez', 'Rodríguez', 'Fernández', 'Pérez', 'Muñoz', 'Silva', 'Castro',
  'Vargas', 'Rojas', 'Herrera', 'Medina', 'Bravo', 'Reyes', 'Espinoza', 'Contreras']
const EMPRESAS = ['Programind', 'Constructora XYZ', 'Acme Ltda.', 'Servicios SA', 'Innova']

const insPersona = db.prepare(
  'INSERT INTO personas (nombres, apellidos, rut, clave, empresa, activo, created_at, updated_at) VALUES (?,?,?,?,?,1,?,?)'
)

const personas = []
for (let i = 0; i < 400; i++) {
  const rut = String(10000000 + i * 137)
  const nombres = NOMBRES[i % NOMBRES.length]
  const apellidos = APELLIDOS[i % APELLIDOS.length]
  insPersona.run(nombres, apellidos, rut, rut, EMPRESAS[i % EMPRESAS.length], '2026-09-01T10:00:00Z', '2026-09-01T10:00:00Z')
  personas.push({ id: i + 1, nombres, apellidos, rut })
}
console.log(`Personas: ${personas.length}`)

/* --------------------------- Horarios --------------------------- */

const HORARIOS = [
  ['Desayuno', '07:00', '09:00', 320],
  ['Almuerzo', '12:00', '14:00', 260],
  ['Colación', '16:00', '17:00', 140],
  ['Cena', '19:00', '21:00', 400],
  ['Cena Noche', '22:00', '23:30', 190],
]

const insHorario = db.prepare(
  'INSERT INTO horarios (nombre, hora_inicio, hora_fin, activo, created_at) VALUES (?,?,?,1,?)'
)
const horarios = HORARIOS.map((h, i) => {
  insHorario.run(h[0], h[1], h[2], '2026-09-01T10:00:00Z')
  return { id: i + 1, nombre: h[0], desde: h[1], hasta: h[2], base: h[3] }
})
console.log(`Horarios: ${horarios.length}`)

/* --------------------------- Servicios y accesos --------------------------- */

const insServicio = db.prepare(
  `INSERT INTO servicios (horario_id, nombre, fecha, hora_inicio, hora_fin, estado, origen, cerrado_at, created_at)
   VALUES (?,?,?,?,?,'cerrado','horario',?,?)`
)
const insRegistro = db.prepare(
  `INSERT INTO registros (servicio_id, persona_id, nombres, rut, dispositivo, estado, hora, created_at)
   VALUES (?,?,?,?,?,?,?,?)`
)
const insEvento = db.prepare(
  `INSERT INTO eventos (servicio_id, persona_id, nombres, rut, tipo, dispositivo, acceso_previo, hora, created_at)
   VALUES (?,?,?,?,?,?,?,?,?)`
)

// Todo en una sola transaccion: sin esto, decenas de miles de INSERT
// individuales tardan minutos.
db.exec('BEGIN')

const ultimoId = db.prepare('SELECT last_insert_rowid() AS id')

const PUERTOS = ['Norte', 'Sur', 'Principal', 'Personal']

/** Fecha local hace N dias */
function fechaHace(dias) {
  const d = new Date()
  d.setDate(d.getDate() - dias)
  return d.toLocaleDateString('sv-SE')
}

let totalServicios = 0
let totalRegistros = 0
let totalEventos = 0

// Generacion pseudoaleatoria pero estable (misma semilla en cada corrida)
let semilla = 42
function aleatorio() {
  semilla = (semilla * 1103515245 + 12345) % 2147483648
  return semilla / 2147483648
}

for (let diasAtras = 29; diasAtras >= 0; diasAtras--) {
  const fecha = fechaHace(diasAtras)

  for (const h of horarios) {
    // No todos los servicios corren todos los dias: la cena noche solo fines de semana
    const dow = new Date(fecha + 'T12:00:00').getDay()
    if (h.nombre === 'Cena Noche' && dow !== 5 && dow !== 6 && dow !== 0) continue
    if (h.nombre === 'Colación' && dow === 0) continue

    const variacion = 0.7 + aleatorio() * 0.6
    const cuantos = Math.round(h.base * variacion)

    const [hIni, mIni] = h.desde.split(':').map(Number)
    const [hFin] = h.hasta.split(':').map(Number)
    const duracionMin = (hFin * 60) - (hIni * 60 + mIni)

    const usados = new Set()

    insServicio.run(h.id, h.nombre, fecha, h.desde, h.hasta, `${fecha}T${h.hasta}:00`,
      `${fecha}T00:00:00Z`)
    const servicioId = ultimoId.get().id
    totalServicios++

    for (let i = 0; i < cuantos; i++) {
      // 70% en la primera mitad del turno, resto repartido
      let minuto
      if (aleatorio() < 0.7) minuto = Math.floor(Math.pow(aleatorio(), 1.9) * (duracionMin / 2))
      else minuto = Math.floor(duracionMin / 2 + aleatorio() * (duracionMin / 2))

      const hh = hIni * 60 + mIni + minuto
      const puerta = PUERTOS[Math.floor(aleatorio() * PUERTOS.length)]
      const fechaHora = isoLocal(fecha, Math.floor(hh / 60), hh % 60, Math.floor(aleatorio() * 60))

      // Persona unica dentro del servicio (no puede entrar dos veces)
      let p
      let intentos = 0
      do {
        p = personas[Math.floor(aleatorio() * personas.length)]
        intentos++
      } while (usados.has(p.id) && intentos < 30)
      if (usados.has(p.id)) continue
      usados.add(p.id)

      insRegistro.run(servicioId, p.id, p.nombres, p.rut, puerta, 'autorizado', fechaHora, fechaHora)
      totalRegistros++

      // Duplicados: alguien que ya entro y vuelve a pasar
      if (aleatorio() < 0.06) {
        insEvento.run(servicioId, p.id, p.nombres, p.rut, 'duplicado', puerta, puerta, fechaHora, fechaHora)
        totalEventos++
      }
    }

    // No encontrados: identificadores que no estan en la base
    const nNoEnc = Math.round(cuantos * 0.04)
    for (let i = 0; i < nNoEnc; i++) {
      const minuto = Math.floor(aleatorio() * duracionMin)
      const hh = hIni * 60 + mIni + minuto
      const fechaHora = isoLocal(fecha, Math.floor(hh / 60), hh % 60)
      const rutDesconocido = String(99000000 + Math.floor(aleatorio() * 900000))
      insRegistro.run(servicioId, null, 'DESCONOCIDO', rutDesconocido, 'Principal', 'no-encontrado', fechaHora, fechaHora)
      totalRegistros++
    }
  }
}

db.exec('COMMIT')

console.log('')
console.log(`Servicios generados : ${totalServicios}`)
console.log(`Registros           : ${totalRegistros}`)
console.log(`Eventos duplicados  : ${totalEventos}`)
console.log('')
console.log(`Base de demostracion: ${ruta}`)

db.close()