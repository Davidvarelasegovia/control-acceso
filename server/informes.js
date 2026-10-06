/**
 * Informes y estadisticas.
 *
 * Todo se calcula en SQL sobre los datos ya guardados, usando hora LOCAL
 * (strftime con 'localtime'), que es la que ve la persona en el reloj.
 *
 * Definiciones:
 *  - Ingreso = registro con estado 'autorizado' (el total solo cuenta estos)
 *  - Evento  = reintento rechazado (duplicado), vive en la tabla `eventos`
 */
import { db, plainAll, plain } from './db.js'

/* ------------------------------------------------------------------ */
/* Utilidades de fecha                                                 */
/* ------------------------------------------------------------------ */

export function hoy() {
  return new Date().toLocaleDateString('sv-SE') // YYYY-MM-DD en hora local
}

export function sumarDias(fecha, dias) {
  const [a, m, d] = fecha.split('-').map(Number)
  const dt = new Date(a, m - 1, d)
  dt.setDate(dt.getDate() + dias)
  return dt.toLocaleDateString('sv-SE')
}

/** Etiqueta legible segun la granularidad. */
function etiqueta(periodo, granularidad) {
  if (granularidad === 'dia') {
    const [, m, d] = periodo.split('-')
    return `${d}/${m}`
  }
  if (granularidad === 'semana') {
    const [y, s] = periodo.split('-')
    return `Sem ${s}/${y.slice(2)}`
  }
  if (periodo === 'total') return 'Todo'
  const [y, m] = periodo.split('-')
  const nombres = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ]
  return `${nombres[Number(m) - 1]} ${y.slice(2)}`
}

/** Formato SQLite de la granularidad pedida. */
const FORMATO = {
  dia: '%Y-%m-%d',
  semana: '%Y-%W',
  mes: '%Y-%m',
}

/* ------------------------------------------------------------------ */
/* Filtros                                                            */
/* ------------------------------------------------------------------ */

/**
 * Arma el WHERE comun.
 * @param {object} f
 *   desde, hasta    'YYYY-MM-DD' (inclusive)
 *   servicio_id     number | null
 *   granularidad    'dia' | 'semana' | 'mes'
 *   incluir         'autorizados' (default) | 'todos'
 */
export function rango(f) {
  const hasta = f.hasta || hoy()
  const desde = f.desde || sumarDias(hasta, -29)
  return { desde, hasta }
}

function condiciones(f) {
  const where = []
  const args = []

  const { desde, hasta } = rango(f)

  // 'hasta' exclusivo del dia siguiente para incluir todo ese dia
  where.push("date(hora, 'localtime') <= date(?)")
  args.push(hasta)
  where.push("date(hora, 'localtime') >= date(?)")
  args.push(desde)

  if (f.servicio_id) {
    where.push('servicio_id = ?')
    args.push(Number(f.servicio_id))
  }

  if (f.incluir !== 'todos') {
    where.push("estado = 'autorizado'")
  }

  return { texto: where.join(' AND '), args }
}

/* ------------------------------------------------------------------ */
/* Resumen general                                                     */
/* ------------------------------------------------------------------ */

/**
 * Resumen del rango.
 *
 * OJO: aqui NO se filtra por estado. Si se filtrara por 'autorizado', los
 * "no encontrados" darían siempre 0, porque el desglose necesita ver las dos
 * clases a la vez.
 */
export function resumen(f) {
  const { texto, args } = condiciones({ ...f, incluir: 'todos' })

  const base = db
    .prepare(
      `SELECT
         COUNT(*)                                                 AS total,
         SUM(CASE WHEN estado = 'autorizado'    THEN 1 ELSE 0 END) AS autorizados,
         SUM(CASE WHEN estado = 'no-encontrado' THEN 1 ELSE 0 END) AS noEncontrados
       FROM registros WHERE ${texto}`
    )
    .get(...args)

  // Los duplicados viven en `eventos`, que tiene su propia fecha y servicio.
  // Se cuentan con el mismo rango, sin filtrar por estado.
  const { desde, hasta } = rango(f)
  const dupArgs = [hasta, desde]
  if (f.servicio_id) dupArgs.push(Number(f.servicio_id))

  const dup = db
    .prepare(
      `SELECT COUNT(*) AS n FROM eventos
       WHERE tipo = 'duplicado'
         AND date(hora, 'localtime') <= date(?)
         AND date(hora, 'localtime') >= date(?)
         ${f.servicio_id ? 'AND servicio_id = ?' : ''}`
    )
    .get(...dupArgs)

  const personas = db
    .prepare(
      `SELECT COUNT(DISTINCT persona_id) AS n
       FROM registros WHERE ${texto} AND persona_id IS NOT NULL`
    )
    .get(...args)

  const servicios = db
    .prepare(
      `SELECT COUNT(DISTINCT servicio_id) AS n
       FROM registros WHERE ${texto} AND servicio_id IS NOT NULL`
    )
    .get(...args)

  return {
    // El total del sistema cuenta SOLO los autorizados (misma regla que la
    // pantalla de escaneo). Los no encontrados quedan aparte.
    total: base?.autorizados || 0,
    registros: base?.total || 0,
    autorizados: base?.autorizados || 0,
    noEncontrados: base?.noEncontrados || 0,
    duplicados: dup?.n || 0,
    personasDistintas: personas?.n || 0,
    servicios: servicios?.n || 0,
  }
}

/* ------------------------------------------------------------------ */
/* Serie temporal: por dia, semana o mes                              */
/* ------------------------------------------------------------------ */

export function serieTemporal(f) {
  const granularidad = f.granularidad || 'dia'
  const formato = FORMATO[granularidad] || FORMATO.dia
  // Sin filtro de estado: asi el detalle muestra tambien los no encontrados.
  const { texto, args } = condiciones({ ...f, incluir: 'todos' })

  const filas = db
    .prepare(
      `SELECT strftime('${formato}', hora, 'localtime') AS periodo,
              COUNT(*) AS total,
              SUM(CASE WHEN estado = 'autorizado'    THEN 1 ELSE 0 END) AS autorizados,
              SUM(CASE WHEN estado = 'no-encontrado' THEN 1 ELSE 0 END) AS noEncontrados
       FROM registros
       WHERE ${texto}
       GROUP BY periodo
       ORDER BY periodo ASC`
    )
    .all(...args)

  return filas.map((r) => ({
    periodo: r.periodo,
    etiqueta: etiqueta(r.periodo, granularidad),
    total: r.total || 0,
    autorizados: r.autorizados || 0,
    noEncontrados: r.noEncontrados || 0,
  }))
}

/* ------------------------------------------------------------------ */
/* Ingresos por servicio (desayuno / almuerzo / cena / cena noche)    */
/* ------------------------------------------------------------------ */

/**
 * Ingresos agrupados por TIPO de servicio.
 *
 * Se agrupa por NOMBRE, no por id: asi los servicios diarios que se repiten
 * (todos los "Cena" de la semana) se suman en una sola barra, que es lo que
 * espera el jefe al comparar desayuno / almuerzo / cena.
 *
 * Cada barra trae ademas su serie por periodo para el grafico acumulado.
 */
export function porServicio(f) {
  const granularidad = f.granularidad || 'dia'
  const formato = FORMATO[granularidad] || FORMATO.dia
  const { desde, hasta } = rango(f)

  const args = [desde, hasta]
  let filtroServicio = ''
  if (f.servicio_id) {
    filtroServicio = 'AND r.servicio_id = ?'
    args.push(Number(f.servicio_id))
  }

  const totales = db
    .prepare(
      `SELECT s.nombre,
              MIN(s.hora_inicio) AS desde_hora,
              MAX(s.hora_fin)    AS hasta_hora,
              COUNT(*) AS ingresos,
              COUNT(DISTINCT r.persona_id) AS personas,
              COUNT(DISTINCT r.servicio_id) AS servicios
       FROM registros r
       JOIN servicios s ON s.id = r.servicio_id
       WHERE r.estado = 'autorizado'
         AND date(r.hora, 'localtime') BETWEEN date(?) AND date(?)
         ${filtroServicio}
       GROUP BY s.nombre
       ORDER BY ingresos DESC, s.nombre ASC`
    )
    .all(...args)

  // Serie por periodo de cada tipo de servicio
  const detalle = db
    .prepare(
      `SELECT s.nombre,
              strftime('${formato}', r.hora, 'localtime') AS periodo,
              COUNT(*) AS ingresos
       FROM registros r
       JOIN servicios s ON s.id = r.servicio_id
       WHERE r.estado = 'autorizado'
         AND date(r.hora, 'localtime') BETWEEN date(?) AND date(?)
         ${filtroServicio}
       GROUP BY s.nombre, periodo
       ORDER BY periodo ASC`
    )
    .all(...args)

  const porNombre = new Map()
  for (const d of detalle) {
    if (!porNombre.has(d.nombre)) porNombre.set(d.nombre, [])
    porNombre.get(d.nombre).push({
      periodo: d.periodo,
      etiqueta: etiqueta(d.periodo, granularidad),
      ingresos: d.ingresos,
    })
  }

  return totales.map((s) => ({
    nombre: s.nombre,
    franja: s.desde_hora === s.hasta_hora ? s.desde_hora : `${s.desde_hora} - ${s.hasta_hora}`,
    ingresos: s.ingresos,
    personas: s.personas,
    servicios: s.servicios,
    serie: porNombre.get(s.nombre) || [],
  }))
}

/* ------------------------------------------------------------------ */
/* Flujo por franjas de 30 minutos                                     */
/* ------------------------------------------------------------------ */

/**
 * Cuenta los ingresos en franjas de 30 minutos.
 * Cada franja indica cuantas personas entraron y en que intervalo,
 * por ejemplo: "entre 13:30 y 14:00 ingresaron 420".
 */
export function flujoPorFranjas(f) {
  const granularidad = f.granularidad || 'dia'
  const formato = FORMATO[granularidad] || FORMATO.dia
  const { desde, hasta } = rango(f)

  let textoExtra = ''
  const args = [desde, hasta]

  if (f.servicio_id) {
    textoExtra = 'AND r.servicio_id = ?'
    args.push(Number(f.servicio_id))
  }

  const filas = db
    .prepare(
      `SELECT strftime('${formato}', r.hora, 'localtime')     AS periodo,
              CAST(strftime('%H', r.hora, 'localtime') AS INTEGER) AS hora,
              COUNT(*) AS ingresos
       FROM registros r
       WHERE r.estado = 'autorizado'
         AND date(r.hora, 'localtime') BETWEEN date(?) AND date(?)
         ${textoExtra}
       GROUP BY periodo, hora
       ORDER BY periodo ASC, hora ASC`
    )
    .all(...args)

  // Una fila por franja de 30 minutos, por periodo
  const mapa = new Map()

  for (const fila of filas) {
    // `hora` es la hora local (0-23). Se pasa a minutos y se cae en la
    // franja que empieza en los :00 o los :30 de esa hora.
    const desdeMin = Math.floor((fila.hora * 60) / 30) * 30
    const hastaMin = desdeMin + 30
    const texto = `${hhmm(desdeMin)} - ${hhmm(hastaMin)}`
    const clave = `${fila.periodo}|${texto}`

    if (!mapa.has(clave)) {
      mapa.set(clave, {
        periodo: fila.periodo,
        periodo_etiqueta: etiqueta(fila.periodo, granularidad),
        franja: texto,
        desde: hhmm(desdeMin),
        hasta: hhmm(hastaMin),
        ingresos: 0,
      })
    }
    mapa.get(clave).ingresos += fila.ingresos
  }

  const franjas = [...mapa.values()].sort((a, b) =>
    a.periodo === b.periodo ? a.desde.localeCompare(b.desde) : a.periodo.localeCompare(b.periodo)
  )

  // Suma de todas las franjas, para el grafico consolidado de 24 horas
  const consolidadas = new Map()
  for (const fila of franjas) {
    consolidadas.set(fila.franja, (consolidadas.get(fila.franja) || 0) + fila.ingresos)
  }

  const flujoConsolidado = [...consolidadas.entries()]
    .map(([franja, ingresos]) => ({
      franja,
      desde: hhmm(Number(franja.slice(0, 2)) * 60 + Number(franja.slice(3, 5))),
      ingresos,
    }))
    .sort((a, b) => a.desde.localeCompare(b.desde))

  // Punto de mayor afflujo, que es lo que el jefe suele preguntar
  const pico = [...flujoConsolidado].sort((a, b) => b.ingresos - a.ingresos)[0] || null

  const maximo = franjas.reduce((m, x) => Math.max(m, x.ingresos), 0)

  return { franjas, flujoConsolidado, pico, maximo, granularidad }
}

/** Minutos desde medianoche -> "HH:MM" */
function hhmm(minutos) {
  return (
    String(Math.floor(minutos / 60) % 24).padStart(2, '0') +
    ':' +
    String(minutos % 60).padStart(2, '0')
  )
}

/* ------------------------------------------------------------------ */
/* Servicios con su total historico (para el selector de informes)    */
/* ------------------------------------------------------------------ */

export function serviciosConTotales(limite = 200) {
  const filas = db
    .prepare(
      `SELECT s.id, s.nombre, s.fecha, s.hora_inicio, s.hora_fin, s.estado,
              (SELECT COUNT(*) FROM registros r
                WHERE r.servicio_id = s.id AND r.estado = 'autorizado') AS ingresos,
              (SELECT COUNT(*) FROM registros r
                WHERE r.servicio_id = s.id AND r.estado = 'no-encontrado') AS noEncontrados,
              (SELECT COUNT(*) FROM eventos e
                WHERE e.servicio_id = s.id AND e.tipo = 'duplicado') AS duplicados
       FROM servicios s
       ORDER BY s.fecha DESC, s.hora_inicio DESC
       LIMIT ?`
    )
    .all(limite)

  return plainAll(filas)
}

/* ------------------------------------------------------------------ */
/* Comparacion entre periodos                                         */
/* ------------------------------------------------------------------ */

/**
 * Compara el rango pedido contra el rango inmediatamente anterior,
 * de la misma cantidad de dias. Sirve para el "vs periodo anterior"
 * de las tarjetas del dashboard.
 */
export function comparativa(f) {
  const { hasta, desde } = rango(f)

  // Dias inclusive del rango actual
  const dias =
    Math.round(
      (new Date(hasta + 'T00:00:00') - new Date(desde + 'T00:00:00')) / 86400000
    ) + 1

  const desdeAnterior = sumarDias(desde, -dias)
  const hastaAnterior = sumarDias(desde, -1)

  const contar = (d, h) => {
    const { texto, args } = condiciones({ ...f, desde: d, hasta: h })
    return db.prepare(`SELECT COUNT(*) AS n FROM registros WHERE ${texto}`).get(...args)?.n || 0
  }

  const actual = contar(desde, hasta)
  const anterior = contar(desdeAnterior, hastaAnterior)

  return {
    desde,
    hasta,
    dias,
    actual,
    anterior,
    variacion: anterior > 0 ? ((actual - anterior) / anterior) * 100 : null,
    periodoAnterior: { desde: desdeAnterior, hasta: hastaAnterior },
  }
}
