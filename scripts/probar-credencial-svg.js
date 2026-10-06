/**
 * Revisa el SVG de la credencial.
 *
 * Comprueba que el dibujo se parezca al diseño original (medidas y
 * posiciones), que nada se salga del papel y que no haya textos encimados.
 *
 * Uso: node scripts/probar-credencial-svg.js
 */
import {
  ANCHO,
  ALTO,
  MM_ANCHO,
  MM_ALTO,
  FRENTE_BASE,
  PAPELES,
  altoDe,
  frenteSvg,
  reversoSvg,
  medirTexto,
  ajustarTexto,
} from '../shared/credencialSvg.js'
import { pngDePrueba } from './ayuda-png.js'

const U = ANCHO / FRENTE_BASE.w // factor de escala del diseño original
const p = (n) => n * U
const util = ANCHO - p(20) * 2

let fallos = 0
const fallo = (msg) => {
  fallos++
  console.log('  *** ' + msg)
}
const ok = (msg) => console.log('  OK  ' + msg)

/** Revisa que el SVG este bien formado, con una pila de etiquetas. */
function problemasXml(svg) {
  const pila = []
  const errores = []
  const re = /<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g
  let m
  while ((m = re.exec(svg))) {
    const [, cierre, nombre, resto] = m
    if (cierre) {
      const esperado = pila.pop()
      if (esperado !== nombre) errores.push(`</${nombre}> pero estaba abierto <${esperado ?? 'nada'}>`)
    } else if (!/\/\s*$/.test(resto)) {
      pila.push(nombre)
    }
  }
  for (const abierto of pila) errores.push(`<${abierto}> quedo abierto`)
  return errores
}

/* ------------------------------------------------------------------ */

const credLargo = {
  codigo: 'A914J31995',
  nombres: 'María José Francisca',
  apellidos: 'Rodríguez-Castro Maldonado',
  empresa: 'Construcciones y Obras Civiles del Norte Grande',
  cargo: 'Jefa de Operaciones y earthworks',
  rut: '10.017.328-K',
  vigente_desde: '01-01-2025',
  vigente_hasta: '31-12-2030',
  foto: 'data:image/png;base64,iVBORw0KGgo=',
  autorizaciones: ['Acceso general', 'Sala de servidores', 'Zona restringida con acompanante'],
  licencias: ['A1', 'B', 'F', 'Permiso especial interno de la empresa'],
  vehiculos: ['Automovil', 'Maquinaria pesada', 'Camion'],
  notas:
    'Credencial de demostracion para probar la instalacion como widget. ' +
    'Este texto es largo a proposito, para ver que no se monte con el pie ' +
    'de la credencial ni se salga del papel.',
}

const credCorto = {
  codigo: 'N536X75243',
  nombres: 'María',
  apellidos: 'López',
  empresa: 'SA',
  cargo: '',
  rut: '9',
  vigente_desde: '',
  vigente_hasta: '',
  foto: '',
  autorizaciones: [],
  licencias: [],
  vehiculos: [],
  notas: '',
}

const logoAncho = pngDePrueba(800, 100)
const logoAlto = pngDePrueba(100, 800)
const fotoAncha = pngDePrueba(1200, 300)
const fotoChica = pngDePrueba(40, 40)

/* ------------------------------------------------------------------ */
/* 1. XML bien formado y proporcion del papel                          */
/* ------------------------------------------------------------------ */

console.log('1. Los dos papeles')

for (const q of Object.values(PAPELES)) {
  const alto = altoDe(q.id, ANCHO)
  console.log(`   ${q.nombre.padEnd(11)} ${ANCHO} x ${alto} px   400:${Math.round((alto / ANCHO) * 400)}   ${q.medida}`)
}

if (Math.abs(PAPELES.celular.razon - 3088 / 1440) > 0.0001) fallo('el papel del celular no es 19,5:9')
else ok('el papel del celular es el de un Galaxy S22 Ultra (1440 x 3088, 19,5:9)')

if (altoDe('credencial', ANCHO) !== ALTO) fallo(`el papel de la credencial no da ${ALTO}`)
else ok(`el papel de la credencial da ${ALTO} px de alto (54 × 86 mm)`)

console.log('')
console.log('2. XML bien formado y papel correcto')

const casos = [
  ['frente / largo', credLargo, (d) => frenteSvg(d, ANCHO, 'credencial')],
  ['reverso / largo', credLargo, (d) => reversoSvg(d, ANCHO, 'credencial')],
  ['frente / minimo', credCorto, (d) => frenteSvg(d, ANCHO, 'credencial')],
  ['reverso / minimo', credCorto, (d) => reversoSvg(d, ANCHO, 'credencial')],
]

const svgs = {}
for (const [nombre, cred, fn] of casos) {
  const svg = fn({ cred, logo: logoAncho, foto: cred.foto, qrUrl: 'https://x.cl/cred/1' })
  svgs[nombre] = svg

  const errores = problemasXml(svg)
  const elementos = (svg.match(/<(text|image|rect|path|circle)\b/g) || []).length
  const m = /width="([\d.]+)" height="([\d.]+)"/.exec(svg)

  if (!svg.startsWith('<svg') || !svg.endsWith('</svg>')) fallo(`${nombre}: no parece un SVG completo`)
  else if (errores.length) fallo(`${nombre}: ${errores[0]}`)
  else if (elementos === 0) fallo(`${nombre}: no drew nada`)
  else if (Number(m[1]) !== ANCHO || Number(m[2]) !== ALTO) {
    fallo(`${nombre}: el papel salio ${m[1]} x ${m[2]} y debe ser ${ANCHO} x ${ALTO}`)
  } else ok(`${nombre}  (${elementos} elementos, ${ANCHO} x ${ALTO} px)`)
}

const extras = [
  ['frente / logo alto y angosto', () => frenteSvg({ cred: credLargo, logo: logoAlto, foto: fotoAncha }, ANCHO)],
  ['frente / foto minuscula', () => frenteSvg({ cred: credLargo, logo: logoAncho, foto: fotoChica }, ANCHO)],
  ['frente / sin logo ni foto', () => frenteSvg({ cred: credLargo, logo: '', foto: '' }, ANCHO)],
  ['reverso / sin logo ni QR', () => reversoSvg({ cred: credLargo, logo: '', qrUrl: '' }, ANCHO)],
  // El papel del celular: mismo dibujo, mas alto.
  ['frente / papel celular', () => frenteSvg({ cred: credLargo, logo: logoAncho, foto: '' }, ANCHO, 'celular')],
  ['reverso / papel celular', () => reversoSvg({ cred: credLargo, logo: logoAncho, qrUrl: 'https://x.cl' }, ANCHO, 'celular')],
]
for (const [nombre, fn] of extras) {
  const errores = problemasXml(fn())
  if (errores.length) fallo(`${nombre}: ${errores[0]}`)
  else ok(nombre)
}

// El papel del celular tiene que dar justo la proporcion de la pantalla.
for (const lado of ['frente', 'reverso']) {
  const svg = lado === 'frente'
    ? frenteSvg({ cred: credLargo }, 1440, 'celular')
    : reversoSvg({ cred: credLargo }, 1440, 'celular')
  const m = /width="([\d.]+)" height="([\d.]+)"/.exec(svg)
  if (Number(m[1]) !== 1440 || Number(m[2]) !== 3088) {
    fallo(`${lado} en papel celular: ${m[1]} x ${m[2]}, se esperaba 1440 x 3088`)
  } else ok(`${lado} a 1440 px = 1440 x 3088 px, la pantalla del S22 Ultra`)
}

/* ------------------------------------------------------------------ */
/* 2. Nada fuera del papel                                             */
/* ------------------------------------------------------------------ */

console.log('')
console.log('3. Nada fuera del papel')

for (const [nombre, svg] of Object.entries(svgs)) {
  let malos = 0
  let detalle = ''

  const mirar = (que, x, y, w, h) => {
    if (x < -1 || y < -1 || x + w > ANCHO + 1 || y + h > ALTO + 1) {
      malos++
      if (!detalle) detalle = `${que} en ${Math.round(x)},${Math.round(y)} ${Math.round(w)}x${Math.round(h)}`
    }
  }

  for (const m of svg.matchAll(/<rect [^>]*x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)) {
    mirar('rect', Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]))
  }
  for (const m of svg.matchAll(/<image [^>]*x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)) {
    mirar('imagen', Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]))
  }
  for (const m of svg.matchAll(/<text [^>]*x="(-?[\d.]+)" y="(-?[\d.]+)"/g)) {
    mirar('texto', Number(m[1]), Number(m[2]), 0, 0)
  }

  if (malos) fallo(`${nombre}: ${malos} elemento(s) fuera (${detalle})`)
  else ok(`${nombre}: todo dentro de ${ANCHO} x ${ALTO}`)
}

/* ------------------------------------------------------------------ */
/* 4. El frente respeta el diseño original                             */
/* ------------------------------------------------------------------ */

console.log('')
console.log('4. El frente respeta el diseño original')

const frente = svgs['frente / largo']
const HFrente = ALTO

const imagenesFrente = [...frente.matchAll(/<image [^>]*x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)].map(
  (m) => ({ x: Number(m[1]), y: Number(m[2]), w: Number(m[3]), h: Number(m[4]) })
)

// La franja se mide con el ANCHO (104 del diseño, escalados), no con el alto:
// asi no se infla en el papel del celular, que es mas alto.
const banda = frente.match(/<rect x="0" y="0" width="[\d.]+" height="([\d.]+)" fill="url\(#g-frente\)"/)
if (!banda) fallo('no se encontro la franja')
else {
  if (Math.abs(Number(banda[1]) - p(104)) > 1) {
    fallo(`la franja mide ${Math.round(Number(banda[1]))} px y deberia medir ${Math.round(p(104))} (104 del diseño)`)
  } else ok(`franja de ${Math.round(Number(banda[1]))} px = 104 del diseño, la misma en los dos papeles`)
}

const foto = imagenesFrente.find((i) => i.h > p(150))
if (!foto) fallo('no se encontro la foto')
else {
  if (Math.abs(foto.w - p(176)) > 1) fallo(`ancho de la foto ${Math.round(foto.w)} (se esperaba ${Math.round(p(176))})`)
  else ok(`foto de ${Math.round(foto.w)} x ${Math.round(foto.h)} px = 176 x 200 del diseño`)
  if (Math.abs(foto.w / foto.h - 0.88) > 0.01) {
    fallo(`la foto quedo deformada (proporcion ${(foto.w / foto.h).toFixed(2)}, debe ser 0,88)`)
  } else ok('la foto conserva su proporción de 176 x 200, sin deformar')
  if (foto.y >= HFrente * 0.16) fallo('la foto no esta montada sobre la franja')
  else ok(`montada sobre la franja (y=${Math.round(foto.y)} < ${Math.round(HFrente * 0.16)})`)
}

// Codigo de barras: el bloque completo (caja + rotulos) tiene que cerrar en
// el bottom-4 del diseño, como en el original.
const cajaBarras = /<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" rx="[\d.]+" fill="#ffffff"/.exec(
  frente
)
if (!cajaBarras) fallo('no se encontro la caja blanca del codigo de barras')
else {
  const [, x, y, w, h] = cajaBarras.map(Number)
  if (Math.abs(x - p(20)) > 1) fallo(`la caja no arranca en el margen (x=${Math.round(x)})`)
  else ok(`ancho de la caja ${Math.round(w)} px = el ancho util`)

  // Arriba de la caja hay 6 px de aire, y despues los dos rotulos y los dos
  // valores, que son los del diseño.
  const ALTO_LINEA = 1.2
  const bajo = y + h + p(6) + p(10 * ALTO_LINEA) + p(14 * ALTO_LINEA) + p(4) + p(10 * ALTO_LINEA) + p(14 * ALTO_LINEA)
  const esperado = HFrente - p(16)
  if (Math.abs(bajo - esperado) > 2) {
    fallo(`el bloque del codigo cierra en ${Math.round(bajo)} y deberia cerrar en ${Math.round(esperado)}`)
  } else {
    ok(`el bloque completo cierra a ${Math.round(esperado)} px del pie, como el bottom-4 del diseño`)
  }
}

// La foto tiene que quedar por ENCIMA del codigo de barras, sin pisarlo.
if (foto && cajaBarras) {
  const yCaja = Number(cajaBarras[2])
  if (foto.y + foto.h > yCaja) fallo('la foto se monta sobre el codigo de barras')
  else ok(`la foto termina en ${Math.round(foto.y + foto.h)} y el codigo arranca en ${Math.round(yCaja)}`)
}

/* ------------------------------------------------------------------ */
/* 4. La letra se ajusta                                               */
/* ------------------------------------------------------------------ */

console.log('')
console.log('5. Ajuste automatico de la letra')

const corto = ajustarTexto({ texto: 'SA', ancho: p(300), maxLineas: 2, sizeMax: p(14), sizeMin: p(8), weight: 900 })
const largo = ajustarTexto({
  texto: 'CONSTRUCCIONES Y OBRAS CIVILES DEL NORTE GRANDE',
  ancho: p(200),
  maxLineas: 2,
  sizeMax: p(14),
  sizeMin: p(8),
  weight: 900,
})
if (corto.size > largo.size) ok(`"SA" queda en ${Math.round(corto.size)} px y el nombre largo en ${Math.round(largo.size)} px`)
else fallo('la letra no se agranda con un nombre corto')

if (largo.lineas.length > 2) fallo('el nombre largo no cabe en 2 lineas')
else ok(`el nombre largo entra en ${largo.lineas.length} lineas`)

const imposible = ajustarTexto({
  texto: 'UN NOMBRE DE EMPRESA DEMA SIADO LARGO PARA DOS LINEAS PEQUENAS',
  ancho: p(200),
  maxLineas: 2,
  sizeMax: p(30),
  sizeMin: p(24),
  weight: 800,
})
const anchos = imposible.lineas.map((l) => medirTexto(l, imposible.size, 800))
if (imposible.lineas.length > 2) fallo('el caso imposible no quedo en 2 lineas')
else if (anchos.some((a) => a > p(200) + 2)) fallo('una linea se pasa del ancho')
else ok('el caso imposible se recorta, no se desborda')

// La letra del frente tiene que ser la del diseño, no una mas chica por gusto.
const sizes = [...frente.matchAll(/font-size="([\d.]+)"/g)].map((m) => Number(m[1]))
if (!sizes.some((s) => Math.abs(s - p(20)) < 1)) fallo(`no se encontro el nombre a 20 px del diseño`)
else ok(`el nombre esta a ${Math.round(p(20))} px, como el diseño original`)

/* ------------------------------------------------------------------ */
/* 5. Ningun texto encima de otro ni fuera del papel                    */
/* ------------------------------------------------------------------ */

console.log('')
console.log('6. Textos que no se pisan')

function cajasTexto(svg) {
  const cajas = []
  const re = /<text x="(-?[\d.]+)" y="(-?[\d.]+)" font-size="([\d.]+)"[^>]*?(?:text-anchor="(\w+)")?[^>]*>([^<]*)<\/text>/g
  for (const m of svg.matchAll(re)) {
    const [, x, y, size, anchor, valor] = m
    const ancho = medirTexto(valor, Number(size), 400)
    const px = Number(x)
    const izq = anchor === 'middle' ? px - ancho / 2 : anchor === 'end' ? px - ancho : px
    cajas.push({
      que: `"${valor}"`,
      x0: izq,
      x1: izq + ancho,
      y0: Number(y) - Number(size) * 0.76,
      y1: Number(y) + Number(size) * 0.3,
    })
  }
  return cajas
}

for (const [nombre, svg] of Object.entries(svgs)) {
  const cajas = cajasTexto(svg)
  const choques = []
  for (let i = 0; i < cajas.length; i++) {
    for (let j = i + 1; j < cajas.length; j++) {
      const a = cajas[i]
      const b = cajas[j]
      if (a.x0 < b.x1 - 2 && b.x0 < a.x1 - 2 && a.y0 < b.y1 - 2 && b.y0 < a.y1 - 2) {
        choques.push(`${a.que} / ${b.que}`)
      }
    }
  }
  if (choques.length) fallo(`${nombre}: ${choques.length} texto(s) encimados -> ${choques[0]}`)
  else ok(`${nombre}: ${cajas.length} textos, ninguno encimado`)
}

/* ------------------------------------------------------------------ */

console.log('')
console.log(
  `Papeles: credencial ${ANCHO} x ${altoDe('credencial', ANCHO)} px (54 × 86 mm) · ` +
    `celular ${ANCHO} x ${altoDe('celular', ANCHO)} px (19,5:9)`
)
console.log(fallos ? `${fallos} fallo(s)` : 'Todo correcto')
process.exit(fallos ? 1 : 0)