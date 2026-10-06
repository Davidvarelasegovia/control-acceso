/**
 * Comprueba si el servidor acepta las imagenes que el panel deja subir.
 *
 * El panel deja elegir un archivo de hasta 3 MB y lo manda como base64 dentro de
 * un JSON. Base64 infla el archivo a cerca de un 37 % mas, asi que 3 MB se
 * vuelven unos 4,1 MB de JSON. Si el limite del servidor es menor, el panel
 * acepta el archivo y despues el servidor lo rechaza.
 *
 *   node scripts/probar-limite-subida.js
 */
const BASE = process.env.BASE || 'http://localhost:3001'

async function tamanoDe(nombre) {
  const res = await fetch(`${BASE}/api/estado`)
  const { data } = await res.json()
  return data?.servicio?.nombre ?? '(sin servicio)'
}

async function probar(bytes, etiqueta) {
  // Base64 de bytes neutros: mismo tamano que una foto, sin contenido real.
  const relleno = 'A'.repeat(Math.ceil((bytes * 4) / 3))
  const cuerpo = {
    nombres: 'PRUEBA',
    apellidos: 'LIMITE',
    rut: 'pruebalimite1',
    empresa: 'x',
    cargo: 'x',
    foto: `data:image/jpeg;base64,${relleno}`,
    autorizaciones: [],
    licencias: [],
    vehiculos: [],
  }
  const json = JSON.stringify(cuerpo)

  const res = await fetch(`${BASE}/api/credenciales`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: json,
  })
  let detalle = ''
  try {
    const r = await res.json()
    detalle = r.error || (r.data ? 'creada' : '')
  } catch {
    detalle = 'sin respuesta JSON'
  }
  console.log(
    `  ${etiqueta.padEnd(26)} archivo ${(bytes / 1024 / 1024).toFixed(1)} MB` +
      `  JSON ${(json.length / 1024 / 1024).toFixed(2)} MB  ->  HTTP ${res.status}  ${detalle}`
  )
  return res.status
}

console.log(`Servidor: ${BASE}`)
console.log(`Servicio actual: ${await tamanoDe('x')}`)
console.log('')
console.log('El panel deja elegir archivos de hasta 3 MB (ver CredencialesPanel.jsx).')
console.log('')

console.log('Imagenes aceptadas por el panel:')
await probar(1 * 1024 * 1024, 'foto chica')
await probar(2 * 1024 * 1024, 'foto mediana')
console.log('')
console.log('Imagenes que el panel RECHAZA antes de mandar:')
const grande = await probar(3 * 1024 * 1024, 'foto al limite')
console.log('')

if (grande === 413 || grande === 500) {
  console.log('*** El servidor RECHAZO una foto que el panel dejo pasar.')
  console.log('    La diferencia: 3 MB de archivo se vuelven ~4,1 MB de JSON en base64.')
  console.log('    server/index.js tiene  express.json({ limit: \'2mb\' })')
} else {
  console.log('OK  el servidor acepta lo que el panel deja subir.')
}