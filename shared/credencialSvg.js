import bwipjs from 'bwip-js'

/**
 * La credencial, en un solo lugar.
 *
 * Este modulo dibuja la credencial completa y devuelve un **SVG**. Es el unico
 * que dibuja: lo usan los tres lugares donde se ve o se entrega una credencial.
 *
 *   1. El panel (/credenciales)      -> muestra este mismo SVG
 *   2. La descarga PNG               -> este SVG, rasterizado
 *   3. La pagina del celular (/cred) -> este SVG, tal cual
 *
 * Antes cada uno tenia su propio dibujo y se iban desincronizando: lo que se
 * veia en el panel no era lo que salia al imprimir. Con un solo modulo es
 * imposible que se separen.
 *
 * Sin DOM y sin `canvas`: funciona igual en el navegador y en Node.
 *
 * ## El diseno
 *
 * El diseno esta escrito **tal cual se hizo al comienzo**, con las medidas
 * originales en pixeles (frente de 340 x 660, reverso de 340 x 640) y todo
 * multiplicado por un solo factor de escala. No hay dos juegos de medidas que
 * puedan desincronizarse, y el resultado es el mismo que se tenia antes: la
 * misma proporcion, el mismo aire, la misma foto montada sobre la franja.
 *
 * El unico cambio de contenido es que las tres filas de identificador, empresa
 * y vigencia ya no se dibujan: esos datos salen en la franja de arriba y bajo
 * el codigo de barras, y tenerlos dos veces era redundante.
 */

/**
 * Los dos papeles.
 *
 * Son dos cosas distintas y no se pueden mezclar:
 *
 * - **Credencial**: 54 x 86 mm, el tamano de una credencial estandar. Es el que
 *   va a la prensa de sublimacion o a la imprenta. A 1200 px de ancho son
 *   1200 x 1911 px.
 * - **Celular**: la pantalla de un telefono, para que al abrir la credencial en
 *   el celu ocupe la pantalla completa sin franjas vacias. Se usa la de un
 *   Galaxy S22 Ultra (1440 x 3088, 19,5:9). A 1200 px de ancho son
 *   1200 x 2573 px.
 *
 * Antes habia un solo papel y salia desproporcionado segun cual se tomara: el
 * de la tarjeta del panel (muy angosto) o el de la credencial (mas cuadrado).
 * Con los dos disponibles, cada descarga va a lo que es.
 */
export const PAPELES = {
  credencial: {
    id: 'credencial',
    nombre: 'Credencial',
    para: 'imprenta / sublimación',
    razon: 86 / 54,
    medida: '54 × 86 mm',
  },
  celular: {
    id: 'celular',
    nombre: 'Celular',
    para: 'pantalla completa del teléfono',
    razon: 3088 / 1440, // Galaxy S22 Ultra, 19,5:9
    medida: '1440 × 3088 px (S22 Ultra)',
  },
}

/** Papel por omision. */
export const PAPEL_POR_OMISION = 'credencial'

/** El papel de un id, o el de por omision si no existe. */
export function papel(id) {
  return PAPELES[id] ?? PAPELES[PAPEL_POR_OMISION]
}

export const MM_ANCHO = 54
export const MM_ALTO = 86

/* Medidas originales del diseno, en pixeles. */
export const FRENTE_BASE = { w: 340, h: 660 }
export const REVERSO_BASE = { w: 340, h: 640 }

/** Ancho de referencia del papel, en pixeles. */
export const ANCHO = 1200

/** Alto del papel de la credencial, con el ancho de referencia. */
export const ALTO = altoDe()

/**
 * Alto del papel para cualquier ancho.
 * @param {'credencial'|'celular'} cual
 */
export function altoDe(cual = PAPEL_POR_OMISION, ancho = ANCHO) {
  return Math.round(ancho * papel(cual).razon)
}

/* ------------------------------------------------------------------ */
/* Paleta                                                              */
/* ------------------------------------------------------------------ */

const FONDO = '#050508' // gamer-darker
const PANEL = '#12121a'
const CIAN = '#00f0ff' // gamer-accent
const CIAN_OSCURO = '#062a33'
const AZUL = '#0080ff'
const TINTA = '#04191f' // gamer-darker, el texto sobre la franja
const GRIS_ETIQUETA = '#6b7280' // gray-500
const GRIS = '#9aa0aa'
const GRIS_TENUE = '#4b5563'
const GRIS_TEXTO = '#d1d5db' // gray-300
const GRIS_NOTA = '#9ca3af' // gray-400
const BLANCO = '#ffffff'
const VERDE = '#00ff88' // gamer-success

const FUENTE =
  "'Segoe UI', Roboto, system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif"

/* ------------------------------------------------------------------ */
/* Medidas del texto                                                   */
/* ------------------------------------------------------------------ */

/**
 * Ancho de cada caracter, como fraccion del tamano de la letra.
 *
 * Se mide a mano en vez de usar `canvas.measureText` a proposito: esa funcion
 * solo existe en el navegador, y el mismo dibujo tiene que dar el mismo
 * resultado en el panel, en la descarga y en la pagina del celular. Con una
 * tabla fija, los tres coinciden siempre.
 */
const ANCHO_CARACTER = {
  ' ': 0.26,
  '.': 0.28, ',': 0.28, ':': 0.28, ';': 0.28, '!': 0.29, "'": 0.2, '"': 0.34,
  '|': 0.24, '(': 0.33, ')': 0.33, '[': 0.33, ']': 0.33,
  '-': 0.34, '/': 0.4, '\\': 0.4, '_': 0.5,
  'i': 0.24, 'j': 0.24, 'l': 0.24, 'I': 0.3, 't': 0.34, 'f': 0.32, 'r': 0.35,
  'm': 0.86, 'w': 0.74, 'M': 0.86, 'W': 0.93, '@': 0.92, '%': 0.8,
  '&': 0.68, '$': 0.56,
  '0': 0.56, '1': 0.56, '2': 0.56, '3': 0.56, '4': 0.56,
  '5': 0.56, '6': 0.56, '7': 0.56, '8': 0.56, '9': 0.56,
}

const ANCHO_MINUSCULA = 0.53
const ANCHO_MAYUSCULA = 0.68

/** Ancho de un texto en pixeles. */
export function medirTexto(valor, size, weight = 400) {
  let total = 0
  for (const c of String(valor ?? '')) {
    const tabla = ANCHO_CARACTER[c]
    if (tabla !== undefined) total += tabla
    else if (c >= 'A' && c <= 'Z') total += ANCHO_MAYUSCULA
    else total += ANCHO_MINUSCULA
  }
  return total * size * (weight >= 700 ? 1.035 : weight >= 600 ? 1.015 : 1)
}

/**
 * Ascente de la letra como fraccion del tamano.
 *
 * En SVG el `y` de un `<text>` marca la **linea base**, no el alto. Si se
 * dibujara en la linea base, todo el texto quedaria corrido hacia arriba (el
 * nombre se montaria sobre la foto). Por eso el alto se mide desde arriba y se
 * convierte a linea base al escribir.
 */
const ASCENTE = 0.76
/** Alto que ocupa una linea de `size`. */
const ALTO_LINEA = 1.2

/* ------------------------------------------------------------------ */
/* Ajuste de texto                                                     */
/* ------------------------------------------------------------------ */

function envolverLineas(texto, ancho, size, weight) {
  const palabras = String(texto ?? '')
    .split(/\s+/)
    .filter(Boolean)
  if (!palabras.length) return ['']

  const lineas = []
  let actual = ''
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p
    if (!actual || medirTexto(prueba, size, weight) <= ancho) {
      actual = prueba
    } else {
      lineas.push(actual)
      actual = p
    }
  }
  if (actual) lineas.push(actual)
  return lineas
}

function recortar(texto, ancho, size, weight) {
  let t = String(texto ?? '')
  while (t.length > 1 && medirTexto(`${t}…`, size, weight) > ancho) {
    t = t.slice(0, -1)
  }
  return t === texto ? t : `${t}…`
}

/**
 * Ajuste automatico: el tamano de letra mas grande con el que el texto entra
 * en `maxLineas` lineas de ancho `ancho`.
 *
 * Solo baja del tamano original cuando hace falta (nombre de empresa largo,
 * licencia que no cabe). Con eso el diseno se mantiene igual en el caso normal
 * y se deforma lo menos posible en el raro.
 */
export function ajustarTexto({
  texto,
  ancho,
  maxLineas = 2,
  sizeMax,
  sizeMin,
  weight = 400,
  paso = 0.5,
}) {
  let size = sizeMax
  while (size > sizeMin) {
    const lineas = envolverLineas(texto, ancho, size, weight)
    if (lineas.length <= maxLineas) return { size, lineas }
    size = Math.max(sizeMin, size - paso)
  }

  const lineas = envolverLineas(texto, ancho, sizeMin, weight).slice(0, maxLineas)
  if (lineas.length === maxLineas) {
    lineas[maxLineas - 1] = recortar(lineas[maxLineas - 1], ancho, sizeMin, weight)
  }
  return { size: sizeMin, lineas }
}

/* ------------------------------------------------------------------ */
/* Piezas de dibujo                                                   */
/* ------------------------------------------------------------------ */

const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const redondear = (n) => Math.round(n * 100) / 100

/**
 * Un `<text>` con `y` medido desde el ALTO de la letra (no desde la linea base).
 */
function txt(valor, x, yAlto, { size, weight = 400, color = BLANCO, anchor = 'start', espiado = 0 } = {}) {
  const attrs = [
    `x="${redondear(x)}"`,
    `y="${redondear(yAlto + size * ASCENTE)}"`,
    `font-size="${redondear(size)}"`,
    `font-weight="${weight}"`,
    `fill="${color}"`,
  ]
  if (anchor !== 'start') attrs.push(`text-anchor="${anchor}"`)
  if (espiado) attrs.push(`letter-spacing="${redondear(espiado)}"`)
  return `<text ${attrs.join(' ')}>${esc(valor)}</text>`
}

function txtLineas(lineas, x, y, opciones = {}) {
  const { size } = opciones
  return lineas
    .map((l, i) => txt(l, x, y + i * size * ALTO_LINEA, opciones))
    .join('')
}

function rect(x, y, w, h, r, relleno, extra = '') {
  return `<rect x="${redondear(x)}" y="${redondear(y)}" width="${redondear(w)}" height="${redondear(
    h
  )}" rx="${redondear(r)}" fill="${relleno}" ${extra}/>`
}

function imagen(href, x, y, w, h, { ajuste = 'meet', clipId = null } = {}) {
  if (!href) return ''
  const partes = [
    `href="${esc(href)}"`,
    `xlink:href="${esc(href)}"`,
    `x="${redondear(x)}"`,
    `y="${redondear(y)}"`,
    `width="${redondear(w)}"`,
    `height="${redondear(h)}"`,
    `preserveAspectRatio="xMidYMid ${ajuste}"`,
  ]
  if (clipId) partes.push(`clip-path="url(#${clipId})"`)
  return `<image ${partes.join(' ')}/>`
}

/** Texto a data URL, para los codigos de barras y el QR. */
const aDataUrl = (svg) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}`

/** Lee el viewBox de un SVG de bwip-js para saber su proporcion real. */
function proporcion(svg, porDefecto) {
  const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg || '')
  if (!m) return porDefecto
  const w = Number(m[1])
  const h = Number(m[2])
  return h > 0 ? w / h : porDefecto
}

/** Codigo de barras con los parametros del diseno original. */
function codigoBarras(codigo) {
  if (!codigo) return null
  try {
    return bwipjs.toSVG({
      bcid: 'code128',
      text: codigo,
      scale: 3,
      height: 14,
      // El rotulo se dibuja aparte: el de bwip-js sale con la fuente
      // comprimida y era lo que hacia ver raro el codigo.
      includetext: false,
      backgroundcolor: 'FFFFFF',
      paddingleft: 8,
      paddingright: 8,
      paddingtop: 6,
      paddingbottom: 6,
    })
  } catch {
    return null
  }
}

function codigoQr(url) {
  if (!url) return null
  try {
    return aDataUrl(bwipjs.toSVG({ bcid: 'qrcode', text: url, scale: 8, eclevel: 'M' }))
  } catch {
    return null
  }
}

/** Proporcion natural (ancho/alto) de una imagen embebida en base64. */
function proporcionNatural(dataUrl) {
  const m = /^data:image\/(png|jpe?g|gif|webp);base64,/.exec(String(dataUrl || ''))
  if (!m) return 1

  const base64 = String(dataUrl).slice(m[0].length)
  try {
    const bin =
      typeof atob === 'function'
        ? atob(base64.slice(0, 4096))
        : Buffer.from(base64.slice(0, 4096), 'base64').toString('latin1')
    const b = []
    for (let i = 0; i < bin.length; i++) b.push(bin.charCodeAt(i))

    const tipo = m[1]
    if (tipo === 'png' && b.length > 24) return leerUint32(b, 16) / leerUint32(b, 20)
    if (tipo === 'gif' && b.length > 10) return b.readUInt16LE(6) / b.readUInt16LE(8)
    if (tipo === 'webp' && b.length > 30) return leerUint24LE(b, 26) / leerUint24LE(b, 29)
    if (tipo === 'jpeg' || tipo === 'jpg') {
      let i = 2
      while (i < b.length - 9) {
        if (b[i] !== 0xff) {
          i++
          continue
        }
        const marcador = b[i + 1]
        const largo = (b[i + 2] << 8) | b[i + 3]
        if (marcador >= 0xc0 && marcador <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcador)) {
          return ((b[i + 7] << 8) | b[i + 8]) / ((b[i + 5] << 8) | b[i + 6])
        }
        i += 2 + largo
      }
    }
  } catch {
    /* si no se puede leer, se asume cuadrada */
  }
  return 1
}

const leerUint32 = (b, o) => (b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]
const leerUint24LE = (b, o) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)

/** Trama de rayas diagonales de la franja. */
function trama(id, paso) {
  return (
    `<pattern id="${id}" width="${redondear(paso)}" height="${redondear(paso)}" ` +
    `patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
    `<rect width="${redondear(paso)}" height="${redondear(paso)}" fill="none"/>` +
    `<rect width="${redondear(paso)}" height="${redondear(paso)}" fill="${FONDO}" opacity="0.6"/>` +
    `</pattern>`
  )
}

const hoy = () => new Date().toLocaleDateString('es-CL')

/* ------------------------------------------------------------------ */
/* Frente                                                              */
/* ------------------------------------------------------------------ */

/**
 * Frente de la credencial.
 *
 * @param {object} datos { cred, logo, foto }
 * @param {number} W      ancho en pixeles
 */
export function frenteSvg({ cred = {}, logo = '', foto = '' } = {}, W = ANCHO, papel = PAPEL_POR_OMISION) {
  const H = altoDe(papel, W)
  /**
   * Factor de escala del diseño original (340 px de ancho) a este ancho.
   *
   * Los **lados** de las cosas (margenes, foto, codigo, logo) salen de aqui, y
   * los **altos** de las lineas tambien. Lo que se aparta es el ritmo vertical:
   * los huecos entre bloques se reparten en el papel nuevo, que es mas bajo, en
   * vez de medirse en pixeles fijos. Asi el dibujo nunca se deforma (la foto
   * sigue siendo de 176 x 200, el codigo conserva su proporcion) y ademas
   * ocupa el papel entero.
   */
  const u = W / FRENTE_BASE.w
  /** Convierte una medida del diseño original (px) a este ancho. */
  const p = (n) => n * u

  const M = p(20) // px-5
  const util = W - M * 2

  /* --- Codigo de barras (se mide primero: ocupa desde abajo) --- */

  const svgBarras = codigoBarras(cred.codigo)
  const anchoBarras = util - p(24) // px-6 del contenedor, dos veces
  const altoBarras = svgBarras ? anchoBarras / proporcion(svgBarras, 2.7) : 0

  // El bloque del codigo arranca pegado al pie (bottom-4) y se arma hacia
  // arriba, igual que en el diseño original.
  const yPie = H - p(16)
  const hEtiqueta = p(10 * ALTO_LINEA)
  const hValor = p(14 * ALTO_LINEA)

  const yCodigo = yPie - hValor
  const yEtiquetaCod = yCodigo - p(4) - hEtiqueta
  const yRut = yEtiquetaCod - hValor
  const yEtiquetaIdent = yRut - hEtiqueta
  const yCajaFin = yEtiquetaIdent - p(6) // mt-1.5
  const yCaja = yCajaFin - p(8) - altoBarras - p(8) // py-2
  const altoCaja = altoBarras + p(16)

  /* --- Nombre y cargo --- */

  const nombre = `${cred.nombres || ''} ${cred.apellidos || ''}`.trim() || 'Sin nombre'
  const nombreAjuste = ajustarTexto({
    texto: nombre,
    ancho: util,
    maxLineas: 2,
    sizeMax: p(20),
    sizeMin: p(13),
    weight: 800,
  })

  const cargoAjuste = cred.cargo
    ? ajustarTexto({
        texto: cred.cargo,
        ancho: util,
        maxLineas: 1,
        sizeMax: p(14),
        sizeMin: p(10),
        weight: 500,
      })
    : null

  /* --- Reparto vertical del papel --- */
  // La franja y el bloque del codigo de barras se miden con el ANCHO, no con el
  // alto: asi no se inflan en el papel del celular (que es mas alto) y el
  // diseno se ve igual en los dos. Lo que se reparte es el hueco del medio: en
  // un papel mas alto simply hay mas aire, que es justo lo que se busca para
  // que la credencial ocupe la pantalla del telefono.
  const yFranjaFin = p(104)
  const yBarrasTope = yCaja - H * 0.022 // aire sobre la caja del codigo

  const anchoFoto = p(176)
  const altoFoto = p(200)
  const radioFoto = p(16)

  const altoNombre = nombreAjuste.lineas.length * nombreAjuste.size * ALTO_LINEA
  const altoCargo = cargoAjuste ? cargoAjuste.size * ALTO_LINEA : 0
  const huecoNombreCargo = cargoAjuste ? p(2) : 0

  const altoGrupo = altoFoto + p(16) + altoNombre + huecoNombreCargo + altoCargo

  // La foto va **montada sobre la franja**, como en el diseño original (-mt-10
  // sobre una franja de 104, o sea un 38 % de la franja). Si despues sobra
  // espacio, el grupo baja hasta la mitad de lo que sobra: asi el montaje se
  // mantiene y el papel no queda con un vacio abajo.
  // Los lados de cada pieza nunca se tocan, asi que la foto sigue midiendo
  // 176 x 200 y sale entera.
  const solape = yFranjaFin * 0.38
  const yFotoMin = yFranjaFin - solape
  const yFoto = yFotoMin + Math.max(0, (yBarrasTope - yFotoMin - altoGrupo) * 0.5)
  const yNombre = yFoto + altoFoto + p(16)
  // El cargo va debajo de TODAS las lineas del nombre, no solo de la primera.
  const yCargo = yNombre + altoNombre + huecoNombreCargo

  /* --- Logo y empresa --- */

  const logoAlto = yFranjaFin * 0.46
  const logoAnchoMax = W * 0.46 // el doble del ancho util de la banda
  const logoX = M
  const logoY = (yFranjaFin - logoAlto) / 2
  let logoAncho = logoAnchoMax
  if (logo) logoAncho = Math.min(logoAnchoMax, logoAlto * proporcionNatural(logo))

  const xEmpresa = logoX + logoAncho + p(12) // gap-3
  const anchoEmpresa = Math.max(p(60), W - M - xEmpresa)
  const empresa = (cred.empresa || 'Acceso').toUpperCase()
  const empresaAjuste = ajustarTexto({
    texto: empresa,
    ancho: anchoEmpresa,
    maxLineas: 2,
    sizeMax: p(14),
    sizeMin: p(8),
    weight: 900,
  })

  /* --- Armado --- */

  const d = []
  d.push(
    `<defs>` +
      `<linearGradient id="g-frente" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="${CIAN_OSCURO}"/>` +
      `<stop offset="1" stop-color="${CIAN}"/>` +
      `</linearGradient>` +
      trama('p-frente', p(12)) +
      `<clipPath id="c-foto"><rect x="${redondear((W - anchoFoto) / 2)}" y="${redondear(yFoto)}" ` +
      `width="${redondear(anchoFoto)}" height="${redondear(altoFoto)}" rx="${redondear(radioFoto)}"/></clipPath>` +
      `<clipPath id="c-barras"><rect x="${redondear(M)}" y="${redondear(yCaja)}" ` +
      `width="${redondear(util)}" height="${redondear(altoCaja)}" rx="${redondear(p(8))}"/></clipPath>` +
      `</defs>`
  )

  // Fondo
  d.push(rect(0, 0, W, H, p(16), FONDO))
  d.push(`<rect x="0" y="0" width="${redondear(W)}" height="${redondear(yFranjaFin)}" fill="url(#g-frente)"/>`)
  d.push(
    `<rect x="0" y="0" width="${redondear(W)}" height="${redondear(yFranjaFin)}" fill="url(#p-frente)" opacity="0.2"/>`
  )

  // Logo
  if (logo) {
    d.push(imagen(logo, logoX, logoY, logoAncho, logoAlto, { ajuste: 'meet' }))
  } else {
    d.push(rect(logoX, logoY, p(52), p(28), p(4), 'rgba(5,5,8,0.8)'))
    d.push(
      txt('LOGO', logoX + p(8), logoY + p(7), { size: p(10), weight: 700, color: BLANCO, espiado: p(0.5) })
    )
  }

  // "Credencial de" + empresa, a la derecha. Ambos centrados en la franja,
  // como el bloque que forman.
  const marcaSize = p(9)
  const altoMarca = marcaSize + p(4) + empresaAjuste.size * ALTO_LINEA
  const yMarca = yFranjaFin / 2 - altoMarca / 2
  d.push(
    txt('CREDENCIAL DE', xEmpresa, yMarca, {
      size: marcaSize,
      weight: 700,
      color: TINTA,
      espiado: p(1.8),
    })
  )
  d.push(
    txtLineas(empresaAjuste.lineas, xEmpresa, yMarca + marcaSize + p(4), {
      size: empresaAjuste.size,
      weight: 900,
      color: TINTA,
    })
  )

  // Foto: recuadro redondeado, montado sobre la franja
  const fx = (W - anchoFoto) / 2
  if (foto) {
    d.push(imagen(foto, fx, yFoto, anchoFoto, altoFoto, { ajuste: 'slice', clipId: 'c-foto' }))
  } else {
    d.push(rect(fx, yFoto, anchoFoto, altoFoto, radioFoto, '#1c1c28'))
    d.push(
      `<circle cx="${redondear(W / 2)}" cy="${redondear(yFoto + p(80))}" r="${redondear(p(28))}" fill="#33334a"/>`
    )
    d.push(
      `<path d="M ${redondear(W / 2 - p(48))} ${redondear(yFoto + p(200))} ` +
        `A ${redondear(p(48))} ${redondear(p(44))} 0 0 1 ${redondear(W / 2 + p(48))} ` +
        `${redondear(yFoto + p(200))} Z" fill="#33334a"/>`
    )
  }
  d.push(
    rect(fx, yFoto, anchoFoto, altoFoto, radioFoto, 'none', `stroke="${CIAN}" stroke-width="${redondear(p(4))}"`)
  )

  // Nombre y cargo
  d.push(
    txtLineas(nombreAjuste.lineas, W / 2, yNombre, {
      size: nombreAjuste.size,
      weight: 800,
      color: BLANCO,
      anchor: 'middle',
    })
  )
  if (cargoAjuste) {
    d.push(
      txtLineas(cargoAjuste.lineas, W / 2, yCargo, {
        size: cargoAjuste.size,
        weight: 500,
        color: CIAN,
        anchor: 'middle',
      })
    )
  }

  // Codigo de barras
  d.push(rect(M, yCaja, util, altoCaja, p(8), '#ffffff'))
  if (svgBarras) {
    d.push(
      imagen(aDataUrl(svgBarras), M + p(8), yCaja + p(8), anchoBarras, altoBarras, {
        ajuste: 'meet',
        clipId: 'c-barras',
      })
    )
  } else {
    d.push(
      txt('Codigo no disponible', W / 2, yCaja + p(10), {
        size: p(11),
        weight: 500,
        color: '#ff0055',
        anchor: 'middle',
      })
    )
  }

  d.push(
    txt('IDENTIFICADOR DEL TRABAJADOR', W / 2, yEtiquetaIdent, {
      size: p(10),
      weight: 400,
      color: GRIS_ETIQUETA,
      anchor: 'middle',
      espiado: p(0.5),
    })
  )
  d.push(
    txt(cred.rut || '—', W / 2, yRut, {
      size: p(14),
      weight: 700,
      color: CIAN,
      anchor: 'middle',
    })
  )
  d.push(
    txt('CÓDIGO DE CREDENCIAL', W / 2, yEtiquetaCod, {
      size: p(10),
      weight: 400,
      color: GRIS_ETIQUETA,
      anchor: 'middle',
      espiado: p(0.5),
    })
  )
  d.push(
    txt(cred.codigo || '', W / 2, yCodigo, {
      size: p(14),
      weight: 700,
      color: BLANCO,
      anchor: 'middle',
      espiado: p(3.5),
    })
  )

  return envolver(W, H, d.join(''), 'frente')
}

/* ------------------------------------------------------------------ */
/* Reverso                                                             */
/* ------------------------------------------------------------------ */

/** Reverso de la credencial. */
export function reversoSvg({ cred = {}, logo = '', qrUrl = '' } = {}, W = ANCHO, papel = PAPEL_POR_OMISION) {
  const u = W / REVERSO_BASE.w
  const H = altoDe(papel, W)
  const p = (n) => n * u

  const M = p(20) // px-5
  const util = W - M * 2
  const autorizaciones = cred.autorizaciones || []
  const licencias = cred.licencias || []
  const vehiculos = cred.vehiculos || []

  // Pie: se mide antes que el contenido, para saber hasta donde llega.
  const ladoQR = p(104)
  const gap = p(12)
  const yPie = H - p(16) - ladoQR // bottom-4
  const sizeTextoPie = p(8)
  const altoCajaLogo = p(40) + p(8) + sizeTextoPie * 1.4 * 2 + p(24)
  const anchoCajaLogo = util - p(32) - ladoQR - gap

  const d = []
  const altoFranja = H * 0.075
  let y = altoFranja + H * 0.026

  /* --- Autorizaciones --- */

  d.push(
    txt('AUTORIZACIONES DE INGRESO', M, H * 0.024, {
      size: p(10),
      weight: 700,
      color: BLANCO,
      espiado: p(2),
    })
  )

  y = altoFranja + H * 0.026

  const itemSize = p(12)
  const itemAlto = p(12 * ALTO_LINEA) + p(4)

  /**
   * El reverso tiene mucho menos texto que el frente: a veces son tres lineas
   * en total. Si todo se pegara arriba, la mitad de abajo quedaria vacia. Por eso
   * cada bloque se mide primero, se reparte el sobrante entre los huecos (con un
   * tope, para que no se separen de mas) y lo que al final sobre se parte en
   * mitades arriba y abajo, para que el contenido quede centrado.
   */
  const bloques = []

  // Autorizaciones
  bloques.push({
    alto: autorizaciones.length ? autorizaciones.length * itemAlto : itemAlto,
    dibujar: (y0) => {
      if (!autorizaciones.length) {
        return txt('Sin registros', M, y0, {
          size: p(11),
          weight: 400,
          color: GRIS_TENUE,
          espiado: p(0.5),
        })
      }
      return autorizaciones
        .map((a, i) => {
          const ajuste = ajustarTexto({
            texto: a,
            ancho: util - p(20),
            maxLineas: 1,
            sizeMax: itemSize,
            sizeMin: p(9),
            weight: 400,
          })
          const fila = y0 + i * itemAlto
          return (
            palomita(M, fila + p(1), VERDE, p(2.2)) +
            txt(ajuste.lineas[0], M + p(20), fila, { size: ajuste.size, weight: 400, color: GRIS_TEXTO })
          )
        })
        .join('')
    },
  })

  // Licencias y vehiculos: titulo mas recuadros marcados
  const bloqueCasillas = (titulo, items) => ({
    alto: p(9 * ALTO_LINEA) + p(6) + Math.max(1, Math.ceil(items.length / 2)) * p(16),
    dibujar: (y0) => {
      const partes = [
        txt(titulo, M, y0, { size: p(9), weight: 700, color: CIAN, espiado: p(1.6) }),
      ]
      let yb = y0 + p(9 * ALTO_LINEA) + p(6)

      if (!items.length) {
        partes.push(
          txt('Sin registros', M, yb, { size: p(11), weight: 400, color: GRIS_TENUE, espiado: p(0.5) })
        )
        return partes.join('')
      }

      const cols = 2
      const anchoCol = util / cols
      const lado = p(12)
      const altoFila = p(16)

      items.forEach((item, i) => {
        const cx = M + (i % cols) * anchoCol
        const cy = yb + Math.floor(i / cols) * altoFila
        const ajuste = ajustarTexto({
          texto: item,
          ancho: anchoCol - lado - p(6),
          maxLineas: 1,
          sizeMax: p(10),
          sizeMin: p(7),
          weight: 400,
        })

        partes.push(
          rect(cx, cy, lado, lado, p(2), 'rgba(0,240,255,0.25)', `stroke="${CIAN}" stroke-width="${redondear(p(1))}"`)
        )
        partes.push(palomita(cx + p(2.4), cy + p(2), CIAN, p(1.4)))
        partes.push(
          txt(ajuste.lineas[0], cx + lado + p(6), cy + p(1), {
            size: ajuste.size,
            weight: 400,
            color: GRIS_TEXTO,
          })
        )
      })

      return partes.join('')
    },
  })

  bloques.push(bloqueCasillas('LICENCIA DE CONDUCIR', licencias))
  bloques.push(bloqueCasillas('VEHÍCULOS AUTORIZADOS', vehiculos))

  if (cred.notas) {
    const ajuste = ajustarTexto({
      texto: cred.notas,
      ancho: util,
      maxLineas: 5,
      sizeMax: p(10),
      sizeMin: p(7),
      weight: 400,
    })
    bloques.push({
      alto: p(9 * ALTO_LINEA) + p(6) + ajuste.size * ALTO_LINEA * ajuste.lineas.length,
      dibujar: (y0) =>
        txt('OBSERVACIONES', M, y0, { size: p(9), weight: 700, color: CIAN, espiado: p(1.6) }) +
        txtLineas(ajuste.lineas, M, y0 + p(9 * ALTO_LINEA) + p(6), {
          size: ajuste.size,
          weight: 400,
          color: GRIS_NOTA,
        }),
    })
  }

  /* --- Reparto del sobrante --- */

  const limite = yPie - H * 0.016
  const inicio = y
  const altoTotal = bloques.reduce((s, b) => s + b.alto, 0)
  const huecos = Math.max(1, bloques.length - 1)
  const sobrante = Math.max(0, limite - inicio - altoTotal)
  const hueco = Math.max(p(16), Math.min(H * 0.075, sobrante / huecos))
  const libre = Math.max(0, limite - inicio - altoTotal - hueco * huecos)

  let yb = inicio + libre / 2
  for (const b of bloques) {
    d.push(b.dibujar(yb))
    yb += b.alto + hueco
  }

  // Caja del logo y QR, alineadas por abajo (items-end del diseño original).
  const yCajaLogo = yPie + ladoQR - altoCajaLogo

  const out = []
  out.push(
    `<defs>` +
      `<linearGradient id="g-reverso" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="${CIAN_OSCURO}"/>` +
      `<stop offset="1" stop-color="${AZUL}"/>` +
      `</linearGradient>` +
      `<linearGradient id="g-logo-pie" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="${CIAN_OSCURO}"/>` +
      `<stop offset="1" stop-color="${CIAN}"/>` +
      `</linearGradient>` +
      `</defs>`
  )
  out.push(rect(0, 0, W, H, p(16), FONDO))
  out.push(
    `<rect x="0" y="0" width="${redondear(W)}" height="${redondear(altoFranja)}" fill="url(#g-reverso)"/>`
  )
  out.push(d.join(''))

  const xPie = p(16) // left-4

  // Caja con el logo
  out.push(rect(xPie, yCajaLogo, anchoCajaLogo, altoCajaLogo, p(8), `url(#g-logo-pie)`))
  if (logo) {
    out.push(imagen(logo, xPie + p(16), yCajaLogo + p(12), anchoCajaLogo - p(32), p(40), { ajuste: 'meet' }))
  }
  out.push(
    txtLineas(
      [`Emitida ${hoy()}`, `Credencial ${cred.codigo || ''}`],
      xPie + p(16),
      yCajaLogo + p(12) + p(40) + p(8),
      { size: sizeTextoPie, weight: 700, color: TINTA, espiado: sizeTextoPie * 0.1, interlineado: 1.4 }
    )
  )

  // QR con su marco
  const qx = xPie + anchoCajaLogo + gap
  out.push(rect(qx, yPie, ladoQR, ladoQR, p(8), '#ffffff'))
  const qr = codigoQr(qrUrl)
  if (qr) {
    out.push(imagen(qr, qx + p(6), yPie + p(6), ladoQR - p(12), ladoQR - p(12), { ajuste: 'meet' }))
  }

  return envolver(W, H, out.join(''), 'reverso')
}

/* ------------------------------------------------------------------ */

function palomita(x, yAlto, color, grosor) {
  const s = grosor * 3.6
  return (
    `<path d="M ${redondear(x)} ${redondear(yAlto + s * 0.6)} ` +
    `L ${redondear(x + s * 0.26)} ${redondear(yAlto + s * 0.9)} ` +
    `L ${redondear(x + s * 0.82)} ${redondear(yAlto + s * 0.16)}" ` +
    `fill="none" stroke="${color}" stroke-width="${redondear(grosor)}" ` +
    `stroke-linecap="round" stroke-linejoin="round"/>`
  )
}

function envolver(W, H, contenido, sufijo) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `viewBox="0 0 ${redondear(W)} ${redondear(H)}" width="${redondear(W)}" height="${redondear(H)}" ` +
    `font-family="${FUENTE}">${contenido}</svg>`
  )
}

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

/**
 * Una cara de la credencial en SVG.
 *
 * @param {'frente'|'reverso'} lado
 * @param {object} datos  { cred, logo, foto, qrUrl }
 * @param {number} ancho  ancho en pixeles; el alto sale del papel
 * @param {'credencial'|'celular'} papel
 */
export function credencialSvg(
  { lado = 'frente', cred = {}, logo = '', foto = '', qrUrl = '', papel = PAPEL_POR_OMISION } = {},
  ancho = ANCHO
) {
  return lado === 'reverso'
    ? reversoSvg({ cred, logo, qrUrl }, ancho, papel)
    : frenteSvg({ cred, logo, foto }, ancho, papel)
}

/** Data URL lista para un `<img src>`. */
export function credencialDataUrl(opciones, ancho = ANCHO) {
  return aDataUrl(credencialSvg(opciones, ancho))
}