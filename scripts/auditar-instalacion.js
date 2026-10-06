/**
 * Auditoría de "¿se puede instalar como aplicación?" (widget).
 *
 * Revisa exactamente lo mismo que revisa Chrome antes de mostrar el banner de
 * instalación, y además lo que exige cada sistema operativo.
 *
 *   node scripts/auditar-instalacion.js [http://192.168.x.x:5173/cred/CODIGO]
 */
const URL_CRED = process.argv[2]

const API = 'http://localhost:3001'
const WEB = 'http://localhost:5173'

let fallos = 0
let avisos = 0

const ok = (cond, texto, extra = '') => {
  if (!cond) fallos++
  console.log(`  ${cond ? 'OK   ' : 'FALLA'} ${texto}${extra ? ' | ' + extra : ''}`)
}

const nota = (texto) => {
  avisos++
  console.log(`  AVISO ${texto}`)
}

/** Resuelve un código de credencial si se le paso una URL incompleta. */
async function resolverUrl(arg) {
  if (!arg) return null
  if (arg.startsWith('http')) return arg
  // es un código suelto
  return `${WEB}/cred/${arg.trim().toUpperCase()}`
}

const url = await resolverUrl(URL_CRED)

console.log('=== 1. EL SERVIDOR ESTA ACCESIBLE DESDE LA RED ===')
const interfaces = await fetch(`${API}/api/estado`)
ok(interfaces.ok, 'la API responde en local', `HTTP ${interfaces.status}`)

console.log('')
console.log('=== 2. MANIFIESTO (lo primero que revisa el sistema) ===')
if (!url) {
  console.log('  (sin URL: se omite la revision del manifiesto y de la pagina)')
} else {
  const base = new URL(url)
  const origen = base.origin
  const codigo = base.pathname.split('/').filter(Boolean).pop() || ''

  const man = await (await fetch(`${origen}/cred/manifesto.json?c=${codigo}`)).json()

  ok(typeof man.name === 'string' && man.name.length > 0, 'tiene "name"', man.name)
  ok(typeof man.short_name === 'string' && man.short_name.length > 0, 'tiene "short_name"', man.short_name)
  ok(man.display === 'standalone', 'display es "standalone" (se abre sin barra del navegador)', man.display)
  ok(typeof man.start_url === 'string' && man.start_url.length > 0, 'tiene "start_url"', man.start_url)
  ok(Array.isArray(man.icons) && man.icons.length > 0, 'tiene iconos', `${man.icons.length} iconos`)

  // Chrome exige: un icono de 192 y otro de 512, ambos PNG
  const tamanos = man.icons.map((i) => i.sizes)
  ok(tamanos.includes('192x192'), 'icono de 192x192 (Chrome lo exige)')
  ok(tamanos.includes('512x512'), 'icono de 512x512 (Chrome lo exige)')
  const maskable = man.icons.some((i) => String(i.purpose).includes('maskable'))
  ok(maskable, 'tiene icono "maskable" (Android lo usa para el recorte圆形)')
  ok(
    man.icons.every((i) => i.type === 'image/png'),
    'todos los iconos son PNG'
  )

  console.log('')
  console.log('=== 3. SERVICE WORKER (offline y requisito de instalación) ===')
  const sw = await fetch(`${origen}/cred/sw.js`)
  ok(sw.ok, 'el service worker existe', `HTTP ${sw.status}`)
  const swTexto = await sw.text()
  ok(swTexto.includes('fetch'), 'intercepta peticiones (tiene manejador fetch)')
  ok(swTexto.includes('caches'), 'guarda en caché')
  ok(
    swTexto.includes('skipWaiting'),
    'usa skipWaiting (la actualización no se queda esperando)'
  )

  console.log('')
  console.log('=== 4. LA PAGINA DE LA CREDENCIAL ===')
  const pag = await (await fetch(url)).text()
  ok(pag.includes('apple-mobile-web-app-capable'), 'etiqueta para iPhone/iPad (A2HS)')
  ok(pag.includes('apple-touch-icon'), 'icono para iPhone')
  ok(pag.includes('rel="manifest"'), 'enlaza el manifiesto')
  ok(pag.includes('theme-color'), 'define el color de la barra del sistema')
  ok(/viewport/.test(pag), 'tiene viewport (se ve bien en pantalla chica)')
  ok(pag.includes('Instalar'), 'muestra el botón de instalar')

  console.log('')
  console.log('=== 5. CONTEXTO SEGURO (la trampa importante) ===')
  const esLocalhost =
    base.hostname === 'localhost' || base.hostname === '127.0.0.1' || base.hostname === '::1'
  const esHttps = base.protocol === 'https:'

  if (esHttps) {
    ok(true, 'HTTPS: contexto seguro, todo permitido')
  } else if (esLocalhost) {
    ok(true, 'localhost: el navegador lo considera seguro aunque sea HTTP')
  } else {
    ok(
      false,
      `HTTP desde ${base.hostname}: NO es contexto seguro`,
      'el service worker NO se registra y Chrome NO muestra el banner de instalar'
    )
    console.log('')
    console.log('  Esto es una regla del navegador, no un error del sistema.')
    console.log('  Para probar en un celular real hace falta una de estas:')
    console.log('   a) Un túnel HTTPS (ngrok / cloudflared) -> funciona en Android y iPhone')
    console.log('   b) En Chrome del Android: chrome://flags/#unsafely-treat-insecure-origin-as-secure')
    console.log('   c) En iPhone: funciona igual por HTTP, porque Safari permite')
    console.log('      "Añadir a pantalla de inicio" sin HTTPS')
  }
}

console.log('')
console.log('=== 6. RESUMEN ===')
console.log(`  Fallas: ${fallos}`)
console.log(`  Avisos: ${avisos}`)
console.log('')
console.log(
  fallos === 0
    ? 'RESULTADO: la credencial cumple los requisitos de instalacion'
    : 'RESULTADO: hay requisitos que revisar'
)