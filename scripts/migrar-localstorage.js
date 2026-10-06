/**
 * Migracion de los datos que estaban en el navegador (localStorage) a SQLite.
 *
 * Como el navegador no puede escribir en disco, este script recibe un JSON
 * exportado desde la app. Pasos:
 *
 *   1) En la app: Configuracion -> "Exportar datos" (descarga un .json)
 *   2) Copiar ese archivo en la carpeta 'migracion/'
 *   3) npm run migrate
 */
import { readdirSync, existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { db, sembrar, ahoraISO, plain } from '../server/db.js'
import * as repo from '../server/repo.js'
import { fechaISO } from '../server/services.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CARPETA = join(__dirname, '..', 'migracion')

sembrar()

if (!existsSync(CARPETA)) {
  console.error('No existe la carpeta "migracion/".')
  console.error('Exporta los datos desde Configuracion y deja el .json ahi.')
  process.exit(1)
}

const archivos = readdirSync(CARPETA).filter((f) => f.endsWith('.json'))
if (archivos.length === 0) {
  console.error('No hay archivos .json en "migracion/".')
  process.exit(1)
}

let total = { personas: 0, horarios: 0, urls: 0, registros: 0 }

for (const archivo of archivos) {
  console.log(`\nImportando ${archivo} ...`)
  const datos = JSON.parse(readFileSync(join(CARPETA, archivo), 'utf8'))

  // Personas
  const ruts = new Set()
  for (const p of datos.personas || []) {
    const existe = repo.obtenerPersonaPorRut(p.rut)
    if (existe || ruts.has(p.rut)) continue
    try {
      repo.crearPersona({
        nombres: p.nombres || '',
        apellidos: p.apellidos || '',
        rut: p.rut,
        empresa: p.empresa || '',
      })
      ruts.add(p.rut)
      total.personas++
    } catch (e) {
      console.log(`  - Persona ${p.rut} omitida: ${e.message}`)
    }
  }

  // Horarios
  for (const h of datos.horarios || []) {
    const existe = db
      .prepare('SELECT id FROM horarios WHERE nombre = ? AND hora_inicio = ?')
      .get(h.nombre, h.horaInicio || h.hora_inicio)
    if (existe) continue
    repo.crearHorario({
      nombre: h.nombre,
      hora_inicio: h.horaInicio || h.hora_inicio,
      hora_fin: h.horaFin || h.hora_fin,
      descripcion: h.descripcion || '',
    })
    total.horarios++
  }

  // URLs de acceso
  for (const u of datos.urls || datos.accessUrls || []) {
    const existe = db.prepare('SELECT id FROM urls_acceso WHERE url = ?').get(u.url)
    if (existe) continue
    try {
      repo.crearUrl({ nombre: u.nombre, url: u.url })
      total.urls++
    } catch (e) {
      console.log(`  - URL ${u.url} omitida: ${e.message}`)
    }
  }

  // Registros: se agrupan por dia en un servicio creado para ese dia
  const porDia = new Map()
  for (const r of datos.registros || datos.records || []) {
    const fecha = (r.hora || r.timestamp || ahoraISO()).slice(0, 10)
    if (!porDia.has(fecha)) porDia.set(fecha, [])
    porDia.get(fecha).push(r)
  }

  for (const [fecha, registros] of porDia) {
    const yaHay = db.prepare('SELECT COUNT(*) AS n FROM registros WHERE substr(hora,1,10) = ?').get(fecha)
    if (yaHay.n > 0) {
      console.log(`  - ${fecha}: ya habia ${yaHay.n} registros, se omite`)
      continue
    }

    const ts = ahoraISO()
    const info = db
      .prepare(
        `INSERT INTO servicios
           (horario_id, nombre, fecha, hora_inicio, hora_fin, estado, origen, opened_at, closed_at, created_at)
         VALUES (NULL, ?, ?, '00:00', '23:59', 'cerrado', 'migracion', ?, ?, ?)`
      )
      .run(`Migracion ${fecha}`, fecha, ts, ts, ts)
    const servicioId = Number(info.lastInsertRowid)

    const ins = db.prepare(
      `INSERT INTO registros
        (persona_id, servicio_id, nombres, apellidos, empresa, rut, estado, hora, dispositivo, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )

    for (const r of registros) {
      const persona = repo.obtenerPersonaPorRut(r.rut)
      const hora = r.hora || r.timestamp || ts
      ins.run(
        persona?.id ?? null,
        servicioId,
        r.nombres || persona?.nombres || 'DESCONOCIDO',
        r.apellidos || persona?.apellidos || '',
        r.empresa || persona?.empresa || '',
        r.rut,
        r.estado || 'autorizado',
        hora,
        r.dispositivo || 'migracion',
        ts
      )
      total.registros++
    }
    console.log(`  - ${fecha}: ${registros.length} registros -> servicio #${servicioId}`)
  }

  // Config del recinto
  if (datos.venue) {
    repo.saveVenueConfig(datos.venue)
    console.log(`  Recinto: ${datos.venue.nombre}`)
  }
}

console.log('\n--- Migracion completada ---')
console.log(`  Personas : ${total.personas}`)
console.log(`  Horarios : ${total.horarios}`)
console.log(`  URLs     : ${total.urls}`)
console.log(`  Registros: ${total.registros}`)
