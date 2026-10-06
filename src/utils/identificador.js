/**
 * Identificadores de personas en el navegador.
 *
 * Espejo de server/identificador.js. SIN validacion: cualquier texto que
 * exista en la base de datos es valido.
 *
 * La comparacion ignora el digito verificador:
 *   "13874809-K", "13874809" y "138748095" son la misma persona.
 *
 * IMPORTANTE: el campo de escaneo NUNCA se reescribe mientras se teclea.
 * El autoformateo rompia las pistolas laser (movia los digitos). Este modulo
 * solo sirve para mostrar una vista previa en el modal de Ingreso Manual.
 */

/** Quita todo lo que no sea digito ni K, y pasa a mayuscula. */
export function normalizar(texto) {
  return String(texto ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^0-9K]/g, '')
}

/** Clave de comparacion: identificador sin digito verificador. */
export function clave(texto) {
  const s = normalizar(texto)
  if (!s) return ''

  if (s.endsWith('K')) {
    const cuerpo = s.slice(0, -1)
    return cuerpo.length >= 7 ? cuerpo : s
  }
  if (s.length === 9) return s.slice(0, 8)
  return s
}

/** Comparacion flexible entre dos identificadores. */
export function mismo(a, b) {
  const ka = clave(a)
  const kb = clave(b)
  return ka !== '' && ka === kb
}

/** Solo para mostrar: agrega puntos de miles. */
export function formatear(texto) {
  const s = normalizar(texto)
  if (!s) return ''
  const terminaEnK = s.endsWith('K')
  const cuerpo = terminaEnK ? s.slice(0, -1) : s
  const conPuntos = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return terminaEnK ? `${conPuntos}-K` : conPuntos
}

/** Verificacion minima: no vacio. Nada mas. */
export function esValido(texto) {
  return normalizar(texto).length > 0
}

/** Informativo, no bloquea nada. */
export function analizar(texto) {
  const s = normalizar(texto)
  if (!s) return { ok: false, motivo: 'Ingrese un identificador' }
  return { ok: true, normalizado: s, clave: clave(texto), largo: s.length }
}

/**
 * Vista previa para el modal de Ingreso Manual.
 * Solo para MOSTRAR: el valor real del input no se modifica.
 */
export function vistaPrevia(texto) {
  const s = normalizar(texto)
  if (!s) return ''
  const terminaEnK = s.endsWith('K')
  const cuerpo = terminaEnK ? s.slice(0, -1) : s
  if (cuerpo.length < 4) return s
  const conPuntos = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return terminaEnK ? `${conPuntos}-K` : conPuntos
}
