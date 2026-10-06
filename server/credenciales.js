/**
 * Credenciales virtuales de los trabajadores.
 *
 * A diferencia del resto del sistema, aqui el identificador de la credencial
 * NO es el RUT: es un codigo corto de 10 caracteres, mas comodo de imprimir y
 * de dictar por radio. Ese codigo queda ligado al RUT de la persona, y el
 * escaneo de acceso acepta cualquiera de los dos.
 *
 * Formato del codigo: L###L#####  = letra, 3 digitos, letra, 5 digitos.
 * Siempre 10 caracteres en total. Por ejemplo: F894P45623
 *
 * Se evitan las letras O e I y el digito 0, porque en una credencial impresa
 * es facil confundir O con 0. Tampoco se usa K, que el sistema podria
 * interpretar como el digito verificador de un RUT.
 */
import { randomInt } from 'node:crypto'
import { db, plain, plainAll, ahoraISO } from './db.js'
import { clave as claveId } from './identificador.js'

const LARGO_CODIGO = 10

/** Letras sin las que se confunden con numeros. */
const LETRAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
/** Digitos sin el 0, que se confunde con la O. */
const DIGITOS = '123456789'

/* ------------------------------------------------------------------ */
/* Generacion del codigo                                              */
/* ------------------------------------------------------------------ */

function caracter(alfabeto) {
  return alfabeto[randomInt(0, alfabeto.length)]
}

/**
 * Arma un codigo con el patron L###L##### y comprueba que no exista.
 * El indice de letras y digitos avanza de forma pseudoaleatoria para que el
 * formato se vea siempre igual de varied.
 */
function codigoSinRepetir() {
  for (let intento = 0; intento < 50; intento++) {
    const codigo =
      caracter(LETRAS) +
      caracter(DIGITOS) +
      caracter(DIGITOS) +
      caracter(DIGITOS) +
      caracter(LETRAS) +
      caracter(DIGITOS) +
      caracter(DIGITOS) +
      caracter(DIGITOS) +
      caracter(DIGITOS) +
      caracter(DIGITOS)

    const existe = db.prepare('SELECT id FROM credenciales WHERE codigo = ?').get(codigo)
    if (!existe) return codigo
  }
  throw new Error('No se encontro un codigo libre. Intente de nuevo.')
}

export function generarCodigo() {
  return codigoSinRepetir()
}

/* ------------------------------------------------------------------ */
/* Codigo QR del reverso                                               */
/* ------------------------------------------------------------------ */

/**
 * URL que muestra el codigo QR del reverso de la credencial.
 *
 * Es editable desde el panel. Mientras la aplicacion no este publicada en
 * Internet se usa una URL de prueba, para que el QR se vea y se pueda
 * escanear en las pruebas. Cuando se publique, se cambia en
 * Credenciales > URL del codigo QR.
 */
export const QR_POR_DEFECTO = 'https://ejemplo.com/control-acceso/credenciales'

/** Lee la URL del QR guardada, o la de prueba si no hay ninguna. */
export function urlQr() {
  const fila = db.prepare("SELECT valor FROM config WHERE clave = 'qr_url'").get()
  return fila?.valor?.trim() || QR_POR_DEFECTO
}

/** Guarda la URL del QR. Se acepta vacio para volver a la de prueba. */
export function guardarUrlQr(url) {
  const limpio = String(url ?? '').trim()
  if (!limpio) {
    db.prepare("DELETE FROM config WHERE clave = 'qr_url'").run()
    return QR_POR_DEFECTO
  }
  db.prepare(
    "INSERT INTO config (clave, valor) VALUES ('qr_url', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor"
  ).run(limpio)
  return limpio
}

/* ------------------------------------------------------------------ */
/* Autorizaciones y licencias (opciones del panel)                     */
/* ------------------------------------------------------------------ */

/**
 * Opciones de la credencial. Se guardan en `config` para que el panel las
 * pueda ampliar sin tocar el codigo.
 *
 * Las licencias van SOLO con la clase (A1, A2, ...), sin la descripcion: la
 * credencial es chica y "A1 - Motocicleta" no cabe junto a los demas.
 */
export const OPCIONES = {
  autorizaciones: [
    'Acceso general',
    'Sala de servidores',
    'Bodega',
    'Oficina de personal',
    'Laboratorio',
    'Zona restringida',
    'Visita con acompanante',
    'Acceso vehicular',
  ],
  licencias: ['A1', 'A2', 'A3', 'A4', 'A5', 'B', 'C', 'D', 'F'],
  vehiculos: [
    'Automovil',
    'Camioneta',
    'Camion',
    'Moto',
    'Bicicleta',
    'Maquinaria',
  ],
}

/**
 * Deja una licencia solo con la clase.
 *
 *   "A1 - Motocicleta" -> "A1"     (formato viejo, con descripción)
 *   "b"                -> "B"
 *   "Permiso interno"  -> "Permiso interno"   (texto escrito a mano)
 *
 * Solo recorta cuando hay un guion con descripción, para no destrozar las
 * licencias que el usuario escribió a mano.
 */
export function claseLicencia(texto) {
  const t = String(texto ?? '').trim()
  if (!t) return ''

  // Clase + descripción: "A1 - Motocicleta", "D - Omnibus"
  const conDescripcion = t.match(/^([A-Za-z]\d?)\s*[-–—]\s*\S+/)
  if (conDescripcion) return conDescripcion[1].toUpperCase()

  // Clase sola, sin descripción
  const sola = t.match(/^([A-Za-z]\d?)$/)
  if (sola) return sola[1].toUpperCase()

  return t
}

/* ------------------------------------------------------------------ */
/* Lecturas                                                            */
/* ------------------------------------------------------------------ */

const SQL_LISTAR = `
  SELECT c.*,
         p.rut AS persona_rut,
         p.clave AS persona_clave
  FROM credenciales c
  LEFT JOIN personas p ON p.id = c.persona_id
`

/** Lista todas, con la persona asociada. */
export function listar({ estado = null, limite = 500 } = {}) {
  const filas = estado
    ? db.prepare(`${SQL_LISTAR} WHERE c.estado = ? ORDER BY c.created_at DESC LIMIT ?`).all(estado, limite)
    : db.prepare(`${SQL_LISTAR} ORDER BY c.created_at DESC LIMIT ?`).all(limite)

  return plainAll(filas).map(conJson)
}

export function obtener(id) {
  const fila = db.prepare(`${SQL_LISTAR} WHERE c.id = ?`).get(id)
  return fila ? conJson(plain(fila)) : null
}

/** Busca por el codigo de la credencial (sin distinguir mayusculas). */
export function obtenerPorCodigo(codigo) {
  const limpio = String(codigo ?? '').trim().toUpperCase()
  if (!limpio) return null
  const fila = db.prepare(`${SQL_LISTAR} WHERE c.codigo = ?`).get(limpio)
  return fila ? conJson(plain(fila)) : null
}

/** Resuelve un codigo de credencial a la persona asociada. */
export function resolverPersona(codigo) {
  const cred = obtenerPorCodigo(codigo)
  if (!cred || cred.estado === 'anulada') return null

  // Si esta ligada a una persona de la base, se usa esa
  if (cred.persona_id) {
    const p = db.prepare('SELECT * FROM personas WHERE id = ?').get(cred.persona_id)
    if (p) return plain(p)
  }

  // Si no, se busca por el RUT guardado en la propia credencial
  const rut = cred.rut || cred.persona_rut
  if (!rut) return null

  const porClave = db.prepare('SELECT * FROM personas WHERE clave = ?').get(claveId(rut))
  if (porClave) return plain(porClave)

  return {
    id: null,
    nombres: cred.nombres,
    apellidos: cred.apellidos,
    rut,
    empresa: cred.empresa,
    activo: 1,
  }
}

/* ------------------------------------------------------------------ */
/* Escrituras                                                          */
/* ------------------------------------------------------------------ */

/**
 * Deja las licencias con la clase sola y sin repetidas, lista para guardar.
 * @param {string[]} lista
 */
function normalizarLicencias(lista) {
  const entrada = Array.isArray(lista) ? lista : parse(lista)
  const limpias = entrada.map(claseLicencia).filter(Boolean)
  return [...new Set(limpias)]
}

/** Convierte los campos JSON a arreglos y agrega el RUT de la persona. */
function conJson(c) {
  if (!c) return c
  const licencias = parse(c.licencias).map(claseLicencia).filter(Boolean)
  return {
    ...c,
    // El RUT vive en personas, no en credenciales: se copia para que el
    // panel y la pagina /cred lo tengan a mano.
    rut: c.rut || c.persona_rut || '',
    autorizaciones: parse(c.autorizaciones),
    // Las licencias se limpian al leer, asi las credenciales emitidas con el
    // formato antiguo ("B - Automovil") salen con la clase sola.
    licencias: [...new Set(licencias)],
    vehiculos: parse(c.vehiculos),
  }
}

function parse(valor) {
  if (Array.isArray(valor)) return valor
  try {
    const v = JSON.parse(valor || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

/**
 * Crea una credencial.
 * @param {object} datos
 *   persona_id, nombres, apellidos, empresa, cargo, foto, rut,
 *   autorizaciones[], licencias[], vehiculos[], notas,
 *   vigente_desde, vigente_hasta
 */
export function crear(datos = {}) {
  // Si se eligio una persona de la base, sus datos mandan sobre lo vacio:
  // asi el panel puede mandar solo el persona_id y que la credencial salga
  // completa.
  let personaId = datos.persona_id ? Number(datos.persona_id) : null
  let persona = null

  if (personaId) {
    persona = db.prepare('SELECT * FROM personas WHERE id = ?').get(personaId) || null
    if (!persona) personaId = null
  }

  const nombres = String(datos.nombres ?? persona?.nombres ?? '').trim()
  const apellidos = String(datos.apellidos ?? persona?.apellidos ?? '').trim()

  if (!nombres && !apellidos) {
    throw Object.assign(new Error('Indique al menos el nombre del trabajador'), { status: 400 })
  }

  // El codigo se puede pedir explicito (para reimprimir una credencial)
  let codigo = String(datos.codigo ?? '').trim().toUpperCase()
  if (codigo) {
    const existe = db.prepare('SELECT id FROM credenciales WHERE codigo = ?').get(codigo)
    if (existe) {
      throw Object.assign(new Error(`El codigo ${codigo} ya existe`), { status: 409 })
    }
  } else {
    codigo = generarCodigo()
  }

  // Si se paso un RUT, se busca a la persona para dejarla ligada
  let rut = String(datos.rut ?? persona?.rut ?? '').trim()

  if (!personaId && rut) {
    const p = db.prepare('SELECT id FROM personas WHERE clave = ?').get(claveId(rut))
    if (p) personaId = p.id
  }

  const ts = ahoraISO()

  const empresa = String(datos.empresa ?? persona?.empresa ?? '').trim()

  const info = db
    .prepare(
      `INSERT INTO credenciales
         (codigo, persona_id, nombres, apellidos, empresa, cargo, foto,
          autorizaciones, licencias, vehiculos, vigente_desde, vigente_hasta,
          notas, estado, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      codigo,
      personaId,
      nombres,
      apellidos,
      empresa,
      String(datos.cargo ?? '').trim(),
      datos.foto ?? null,
      JSON.stringify(datos.autorizaciones ?? []),
      JSON.stringify(normalizarLicencias(datos.licencias)),
      JSON.stringify(datos.vehiculos ?? []),
      datos.vigente_desde || null,
      datos.vigente_hasta || null,
      String(datos.notas ?? '').trim() || null,
      datos.estado || 'emitida',
      ts,
      ts
    )

  const nueva = obtener(Number(info.lastInsertRowid))
  // El RUT no vive en la tabla de credenciales, se lee de la persona ligada.
  // Se adjunta para que el panel y la pagina /cred lo muestren.
  if (rut && !nueva.rut) nueva.rut = rut
  return nueva
}

const CAMPOS_EDITABLES = new Set([
  'nombres',
  'apellidos',
  'empresa',
  'cargo',
  'foto',
  'autorizaciones',
  'licencias',
  'vehiculos',
  'vigente_desde',
  'vigente_hasta',
  'notas',
  'estado',
  'persona_id',
])

export function actualizar(id, datos = {}) {
  const actual = obtener(Number(id))
  if (!actual) throw Object.assign(new Error('Credencial no encontrada'), { status: 404 })

  const campos = []
  const args = []

  for (const [k, v] of Object.entries(datos)) {
    if (!CAMPOS_EDITABLES.has(k)) continue
    campos.push(`${k} = ?`)
    if (['autorizaciones', 'licencias', 'vehiculos'].includes(k)) {
      args.push(
        JSON.stringify(k === 'licencias' ? normalizarLicencias(v) : (v ?? []))
      )
    } else if (k === 'persona_id') {
      args.push(v ? Number(v) : null)
    } else {
      args.push(v ?? null)
    }
  }

  if (campos.length === 0) return actual

  campos.push('updated_at = ?')
  args.push(ahoraISO(), Number(id))

  db.prepare(`UPDATE credenciales SET ${campos.join(', ')} WHERE id = ?`).run(...args)
  return obtener(Number(id))
}

export function eliminar(id) {
  const info = db.prepare('DELETE FROM credenciales WHERE id = ?').run(Number(id))
  return { eliminado: info.changes > 0 }
}

export function marcarEnviada(id) {
  db.prepare(
    `UPDATE credenciales SET enviada_whats = 1, enviada_at = ?, updated_at = ?
     WHERE id = ?`
  ).run(ahoraISO(), ahoraISO(), Number(id))
  return obtener(Number(id))
}

export function registrarDescarga(codigo) {
  db.prepare('UPDATE credenciales SET descargas = descargas + 1 WHERE codigo = ?').run(codigo)
}

/* ------------------------------------------------------------------ */
/* Resumen para el panel                                              */
/* ------------------------------------------------------------------ */

export function resumen() {
  const t = db.prepare('SELECT COUNT(*) AS n FROM credenciales').get().n
  const emitidas = db
    .prepare("SELECT COUNT(*) AS n FROM credenciales WHERE estado = 'emitida'")
    .get().n
  const anuladas = db
    .prepare("SELECT COUNT(*) AS n FROM credenciales WHERE estado = 'anulada'")
    .get().n
  const enviadas = db
    .prepare('SELECT COUNT(*) AS n FROM credenciales WHERE enviada_whats = 1')
    .get().n
  const sinPersona = db
    .prepare(
      `SELECT COUNT(*) AS n FROM credenciales c
       LEFT JOIN personas p ON p.id = c.persona_id
       WHERE p.id IS NULL`
    )
    .get().n

  return { total: t, emitidas, anuladas, enviadas, sinPersona }
}