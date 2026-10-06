/**
 * Genera codigos de barras desde una planilla de personas y los imprime en PDF.
 *
 *   node scripts/generar-codigos.js "C:\ruta\plantilla.xlsx" [carpeta-salida]
 *
 * Genera:
 *   - 2 PDF con los codigos listos para imprimir y probar con la pistola laser
 *   - una copia del Excel con una hoja extra "Codigos de barras"
 *
 * Que codifica:
 * El sistema busca por el identificador ANTES del digito verificador, asi que
 * el codigo lleva solo los numeros: "10.017.328-K" se imprime como 10017328.
 * Se eligieron numeros porque las pistola laser simples leen peor las letras.
 */
import { readFileSync, writeFileSync, mkdirSync, createWriteStream } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'
import bwipjs from 'bwip-js'
import PDFDocument from 'pdfkit'
import { normalizar, clave } from '../server/identificador.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const entrada = process.argv[2]
const salida = process.argv[3] || join(__dirname, '..', 'data', 'codigos')

if (!entrada) {
  console.error('Uso: node scripts/generar-codigos.js "ruta\\plantilla.xlsx" [carpeta-salida]')
  process.exit(1)
}

/* ------------------------------------------------------------------ */
/* Identificador: el mismo criterio que usa el sistema                 */
/* ------------------------------------------------------------------ */

/**
 * Que se imprime dentro del codigo de barras.
 *
 * Se codifica el identificador COMPLETO, con su digito verificador:
 *
 *   "10.000.007-5" -> 100000075
 *   "13874809-K"    -> 13874809K
 *   "12345678"      -> 12345678
 *
 * Y funciona siempre, porque el sistema compara con `clave()`, que le quita
 * el verificador a los dos lados:
 *
 *   clave("100000075") = 10000007   (lo que escanea la pistola)
 *   clave("10.000.007-5") = 10000007 (como esta guardado)   -> coinciden
 *
 * Ojo: imprimir SOLO el cuerpo daria 10000007, que tiene 8 digitos, y al
 * escanearlo el sistema lo interpretaria como un cuerpo de 8 digitos sin
 * verificador... salvo que unluckyamente mida 9. Es mas seguro codificar el
 * identificador tal cual, que es ademas lo que la persona lleva impreso.
 */
function valorCodigo(rut) {
  return normalizar(rut)
}

/* ------------------------------------------------------------------ */
/* 1. Leer la planilla                                                */
/* ------------------------------------------------------------------ */

mkdirSync(salida, { recursive: true })

const libro = XLSX.read(readFileSync(entrada), { type: 'buffer' })
const hoja = libro.Sheets[libro.SheetNames[0]]
const crudos = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: '' })

// Buscar la fila de encabezados entre las primeras 5
let filaTitulos = crudos.findIndex((f) =>
  f.some((c) => c && ['nombres', 'nombre', 'rut', 'id'].includes(String(c).trim().toLowerCase()))
)

if (filaTitulos === -1) {
  console.error('No encontre la fila de encabezados con las columnas "nombres" y "rut".')
  process.exit(1)
}

const idx = (nombre) =>
  crudos[filaTitulos].findIndex((c) => String(c ?? '').trim().toLowerCase() === nombre)

const colNombres = idx('nombres')
const colApellidos = idx('apellidos')
const colRut = idx('rut')
const colEmpresa = idx('empresa')

if (colRut === -1) {
  console.error('Falta la columna "rut".')
  process.exit(1)
}

const personas = []
const vistas = new Map()

for (let i = filaTitulos + 1; i < crudos.length; i++) {
  const f = crudos[i]
  const rut = String(f[colRut] ?? '').trim()
  if (!rut) continue

  const codigo = valorCodigo(rut)
  if (!codigo) continue

  const nombre = [f[colNombres], f[colApellidos]].filter(Boolean).join(' ').trim()
  const empresa = colEmpresa === -1 ? '' : String(f[colEmpresa] ?? '').trim()

  // Avisar si dos filas comparten identificador: la segunda no se importaria
  const repetido = vistas.get(codigo)
  if (repetido) repetido.duplicado = true

  const persona = {
    fila: i + 1,
    rut,
    codigo,
    nombre: nombre || '(sin nombre)',
    empresa,
    duplicado: false,
  }
  personas.push(persona)
  vistas.set(codigo, persona)
}

console.log(`Planilla      : ${entrada}`)
console.log(`Hoja leida    : ${libro.SheetNames[0]}`)
console.log(`Personas      : ${personas.length}`)
console.log('')

/* ------------------------------------------------------------------ */
/* 2. Comprobar contra la base de datos                               */
/* ------------------------------------------------------------------ */

let avisos = []
try {
  const { db } = await import('../server/db.js')

  for (const p of personas) {
    // Busca por CLAVE, que es como el sistema resuelve en el escaneo
    const base = db.prepare('SELECT nombres, apellidos, rut FROM personas WHERE clave = ?').get(clave(p.rut))
    p.enBase = !!base
    p.nombreEnBase = base ? `${base.nombres} ${base.apellidos}`.trim() : null
  }

  const total = db.prepare('SELECT COUNT(*) AS n FROM personas').get().n
  const enBase = personas.filter((p) => p.enBase).length

  const faltan = personas.filter((x) => !x.enBase)

if (faltan.length === 0) {
  console.log('Todas las de la lista ya estan cargadas: se puede escanear derecho.')
  console.log('')
} else {
  console.log(`Base de datos : ${total} personas cargadas`)
  console.log(`De la lista   : ${enBase} de ${personas.length} ya estan en la base`)
  console.log(`Faltan        : ${faltan.length}`)
  console.log('')
  console.log('Para que el escaneo las encuentre, importalas desde:')
  console.log('  /admin > Importar desde Excel  (sube esta misma planilla)')
  console.log('')
}
} catch (e) {
  console.log(`No pude comparar con la base (${e.message}). Sigo igual.`)
  console.log('')
}

// Filas que comparten identificador
const repes = personas.filter((p) => p.duplicado)
if (repes.length) {
  avisos.push(`Hay ${repes.length} filas con el mismo identificador: ` +
    repes.map((p) => p.codigo).join(', ') + '. La segunda no se importa.')
}

/* ------------------------------------------------------------------ */
/* 3. Los 2 PDF                                                       */
/* ------------------------------------------------------------------ */

// Dos simbolos distintos a proposito: muchas pistola laser baratas solo
// leen uno de los dos, asi conviene probarlos.
const FORMATOS = [
  {
    arch: 'codigos-code128.pdf',
    titulo: 'Codigos de barras - CODE 128',
    nota: 'Formato mas usado. Sirve para la mayoria de las pistolas laser.',
    bcid: 'code128',
  },
  {
    arch: 'codigos-code39.pdf',
    titulo: 'Codigos de barras - CODE 39',
    nota: 'Formato antiguo, muy bien soportado en lectores viejos.',
    bcid: 'code39',
  },
]

const A4 = { ancho: 595.28, alto: 841.89 }
const MARGEN = 36
const COLUMNAS = 2
const ALTO_CELDA = 104

const ANCHO_CELDA = (A4.ancho - MARGEN * 2) / COLUMNAS
const Y_TOPE = MARGEN + 58 // debajo del encabezado
const ESPACIO_PIE = 26
const FILAS_POR_HOJA = Math.floor((A4.alto - Y_TOPE - ESPACIO_PIE) / ALTO_CELDA)

/**
 * Dibuja un bloque: codigo de barras + nombre + empresa + rut.
 * Todas las posiciones son absolutas, para no depender de doc.y.
 */
async function celda(doc, persona, x, y, bcid) {
  const anchoUtil = ANCHO_CELDA - 24

  try {
    const png = await bwipjs.toBuffer({
      bcid,
      text: persona.codigo,
      scale: 3,
      height: 13,
      includetext: true,
      textxalign: 'center',
      // Fondo blanco explicito: sin esto el PNG sale con canal alfa y pdfkit
      // mete un XObject extra por cada codigo, duplicando el peso del PDF.
      backgroundcolor: 'FFFFFF',
      // Margen extra a los lados: evita que el lector se coma el primer digito
      paddingleft: 8,
      paddingright: 8,
      paddingtop: 3,
      paddingbottom: 3,
    })
    doc.image(png, x + 12, y + 3, { fit: [anchoUtil, 44] })
  } catch (e) {
    doc.fontSize(8).fillColor('#cc0000').text(`Error: ${e.message}`, x + 12, y + 22)
  }

  // Marco primero, para que el texto quede encima
  doc.lineWidth(0.5).strokeColor('#cccccc').rect(x, y, ANCHO_CELDA - 8, ALTO_CELDA - 10).stroke()

  doc.fontSize(8).fillColor('#000000')
    .text(persona.nombre, x + 12, y + 52, { width: anchoUtil, align: 'center', lineBreak: false })

  doc.fontSize(7).fillColor('#555555')
    .text(persona.rut, x + 12, y + 63, { width: anchoUtil, align: 'center' })

  if (persona.empresa) {
    doc.fontSize(6.5).fillColor('#888888')
      .text(persona.empresa, x + 12, y + 73, { width: anchoUtil, align: 'center', lineBreak: false })
  }

  if (persona.duplicado) {
    doc.fontSize(6.5).fillColor('#cc0000')
      .text('REPETIDO EN LA LISTA', x + 12, y + 83, { width: anchoUtil, align: 'center' })
  }
}

/** Encabezado de cada hoja. */
function encabezado(doc, formato, hoja, total) {
  doc.fontSize(15).fillColor('#000000').text(formato.titulo, MARGEN, MARGEN)
  doc.fontSize(8).fillColor('#666666').text(formato.nota, MARGEN, MARGEN + 20)
  doc.fontSize(7).fillColor('#999999').text(
    `${personas.length} personas · generado el ${new Date().toLocaleString('es-CL')}`,
    MARGEN,
    MARGEN + 32
  )
  doc.fontSize(7).fillColor('#999999').text(
    `Hoja ${hoja} de ${total}`,
    A4.ancho - MARGEN - 90,
    MARGEN + 32,
    { width: 90, align: 'right' }
  )
}

const HOJAS = Math.ceil(personas.length / (FILAS_POR_HOJA * COLUMNAS))

for (const formato of FORMATOS) {
  const destino = join(salida, formato.arch)
  const doc = new PDFDocument({ size: 'A4', margin: MARGEN, autoFirstPage: true })

  const stream = doc.pipe(createWriteStream(destino))

  for (let i = 0; i < personas.length; i++) {
    const porHoja = FILAS_POR_HOJA * COLUMNAS
    const enHoja = i % porHoja
    const hoja = Math.floor(i / porHoja)

    if (enHoja === 0) {
      if (i > 0) doc.addPage()
      encabezado(doc, formato, hoja + 1, HOJAS)
    }

    const fila = Math.floor(enHoja / COLUMNAS)
    const col = enHoja % COLUMNAS

    await celda(
      doc,
      personas[i],
      MARGEN + col * ANCHO_CELDA,
      Y_TOPE + fila * ALTO_CELDA,
      formato.bcid
    )
  }

  doc.end()
  await new Promise((res, rej) => {
    stream.on('finish', res)
    stream.on('error', rej)
  })

  console.log(
    `  ${formato.arch.padEnd(24)} ${personas.length} codigos · ` +
      `${HOJAS} hoja(s) de ${FILAS_POR_HOJA * COLUMNAS}`
  )
}

/* ------------------------------------------------------------------ */
/* 4. Copia del Excel con la hoja extra                               */
/* ------------------------------------------------------------------ */

const filasHoja = [
  ['nombres', 'apellidos', 'rut', 'codigo_barras', 'simbolo', 'en_base'],
  ...personas.map((p) => {
    const partes = p.nombre.split(' ')
    return [
      partes[0] || '',
      partes.slice(1).join(' '),
      p.rut,
      p.codigo,
      'CODE 128 / CODE 39',
      p.enBase ? 'SI' : 'NO',
    ]
  }),
]

const hojaNueva = XLSX.utils.aoa_to_sheet(filasHoja)
hojaNueva['!cols'] = [{ wch: 18 }, { wch: 22 }, { wch: 15 }, { wch: 14 }, { wch: 20 }, { wch: 9 }]

libro.SheetNames.push('Codigos de barras')
libro.Sheets['Codigos de barras'] = hojaNueva

const copia = join(salida, basename(entrada).replace(/\.xlsx?$/i, '') + '-con-codigos.xlsx')
XLSX.writeFile(libro, copia)

/* ------------------------------------------------------------------ */

console.log('Archivos generados:')
console.log(`  ${copia}`)
console.log('')

if (avisos.length) {
  console.log('Avisos:')
  for (const a of avisos) console.log(`  - ${a}`)
  console.log('')
}

console.log('Que lleva el codigo de barras:')
console.log(`  El identificador completo, con su verificador (${personas[3].rut} -> ${personas[3].codigo})`)
console.log(`  Al escanearlo el sistema lo reduce a ${clave(personas[3].rut)}, que es la clave con la que esta guardado.`)