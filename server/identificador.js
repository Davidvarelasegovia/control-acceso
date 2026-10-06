/**
 * Identificadores de personas (RUT / ID).
 *
 * DECISION: NO hay validacion. El sistema funciona con cualquier texto que
 * exista en la base de datos. Por ejemplo se puede registrar:
 *
 *   id: 123                 nombre: David Varela
 *   rut: 13874809-K         nombre: David Varela
 *   rut: 13874809           nombre: David Varela
 *
 * La COMPARACION se hace sobre el identificador "base", es decir el texto antes
 * del digito verificador. Asi 13874809-K y 13874809 son la misma persona, y
 * tambien 138748095.
 *
 * Solo se ignoran mayusculas/minusculas en la K y los separadores (puntos,
 * guiones, espacios) para que el tecleo no falle.
 */

/** Caracteres que se eliminan: todo lo que no sea digito ni K. */
export function normalizar(texto) {
  return String(texto ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^0-9K]/g, '')
}

/**
 * Clave de comparacion: el identificador sin digito verificador.
 *
 *   "13874809-K" -> "13874809"
 *   "138748095"  -> "13874809"   (9 digitos: el ultimo es verificador)
 *   "13874809"   -> "13874809"
 *   "123"        -> "123"        (no se toca: no hay verificador)
 *
 * Regla: solo se quita el ultimo caracter si sobraria un cuerpo de 7 u 8
 * digitos, que son las longitudes reales de un RUT chileno. Asi los IDs cortos
 * como "123" se respetan intactos.
 */
export function clave(texto) {
  const s = normalizar(texto)
  if (!s) return ''

  const terminaEnK = s.endsWith('K')

  if (terminaEnK) {
    const cuerpo = s.slice(0, -1)
    // "13874809K" -> cuerpo de 8 digitos, la K es verificador
    return cuerpo.length >= 7 ? cuerpo : s
  }

  // 9 digitos: el ultimo es verificador
  if (s.length === 9) return s.slice(0, 8)

  return s
}

/** Solo para mostrar: agrega puntos de miles a la parte numerica. */
export function formatear(texto) {
  const s = normalizar(texto)
  if (!s) return ''

  const terminaEnK = s.endsWith('K')
  const cuerpo = terminaEnK ? s.slice(0, -1) : s
  const conPuntos = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.')

  return terminaEnK ? `${conPuntos}-K` : conPuntos
}

/**
 * Verificacion minima: solo que no este vacio.
 * No se revisa digito verificador, ni longitud, ni formato.
 */
export function esValido(texto) {
  return normalizar(texto).length > 0
}

/**
 * Analisis informativo. NO bloquea nada: siempre devuelve ok si hay texto.
 * Se usa solo para mostrar sugerencias en la interfaz.
 */
export function analizar(texto) {
  const s = normalizar(texto)
  if (!s) return { ok: false, motivo: 'Ingrese un identificador' }

  return {
    ok: true,
    normalizado: s,
    clave: clave(texto),
    largo: s.length,
  }
}

/** Compara dos identificadores ignorando el verificador. */
export function mismo(a, b) {
  const ka = clave(a)
  const kb = clave(b)
  return ka !== '' && ka === kb
}

/** Audita identificadores duplicados o vacios en una lista. */
export function auditar(lista) {
  const vistos = new Map()
  const problemas = []

  for (const p of lista) {
    const k = clave(p.rut ?? p.id)
    if (!k) {
      problemas.push({ ...p, motivo: 'Identificador vacío' })
      continue
    }
    if (vistos.has(k)) {
      problemas.push({ ...p, motivo: `Mismo identificador que ${vistos.get(k)}` })
    } else {
      vistos.set(k, p.rut ?? p.id)
    }
  }

  return problemas
}
