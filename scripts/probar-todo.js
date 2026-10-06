/**
 * Verificacion final de todo el sistema de credenciales.
 *   node scripts/probar-todo.js
 */
const WEB = 'http://localhost:5173'
const API = 'http://localhost:3001'

const get = async (url) => {
  const r = await fetch(url)
  return { status: r.status, tipo: r.headers.get('content-type'), texto: await r.text() }
}

let fallos = 0
const ok = (cond, texto, extra = '') => {
  if (!cond) fallos++
  console.log(`  ${cond ? 'OK  ' : 'FALLA'}  ${texto}${extra ? ' | ' + extra : ''}`)
}

console.log('=== SERVIDOR ===')
const estado = await get(`${API}/api/estado`)
ok(estado.status === 200, 'API responde', `HTTP ${estado.status}`)
const web = await get(`${WEB}/`)
ok(web.texto.includes('/src/main.jsx'), 'Vite sirve el HTML de desarrollo')
ok(!(await get(`${WEB}/credenciales`)).texto.includes('/assets/index-'),
   'la ruta /credenciales NO cae en el build')

console.log('')
console.log('=== PAGINAS DEL SISTEMA ===')
for (const ruta of ['/', '/informes', '/credenciales', '/login']) {
  const r = await get(`${WEB}${ruta}`)
  ok(r.status === 200 && r.texto.includes('/src/main.jsx'), `${ruta} sirve dev`)
}

console.log('')
console.log('=== API DE CREDENCIALES (permisos) ===')
const sinToken = await get(`${API}/api/credenciales`)
ok(sinToken.status === 401, 'sin token -> 401', `HTTP ${sinToken.status}`)

const login = await fetch(`${API}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ usuario: 'david', clave: '123456' }),
})
const token = (await login.json()).data?.token
ok(!!token, 'login de administrador')

console.log('')
console.log('=== EMISION DE UNA CREDENCIAL REAL ===')
const personas = (await (await fetch(`${API}/api/personas`)).json()).data
const persona = personas.find((p) => /10\.017\.328|10017328/.test(p.rut)) || personas[0]

const creada = await fetch(`${API}/api/credenciales`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    persona_id: persona.id,
    cargo: 'Jefe de Turno',
    autorizaciones: ['Acceso general', 'Bodega'],
    licencias: ['B - Automovil'],
    vehiculos: ['Camioneta'],
    vigente_hasta: '2027-12-31',
  }),
})
const cred = (await creada.json()).data
ok(!!cred?.codigo, 'credencial emitida', cred?.codigo)
ok(cred.codigo.length === 10, 'el codigo tiene 10 caracteres', cred.codigo)
ok(/^[A-Z][0-9]{3}[A-Z][0-9]{5}$/.test(cred.codigo), 'formato L###L#####', cred.codigo)
ok(!/[OI0]/.test(cred.codigo), 'sin letras/numeros ambiguos (O, I, 0)')
ok(cred.persona_id === persona.id, 'ligada a la persona de la base')
ok(cred.rut === persona.rut, 'trae el RUT de la persona', cred.rut)

console.log('')
console.log('=== ESCANEO DE LA CREDENCIAL ===')
const esc = await fetch(`${API}/api/escaneo`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ rut: cred.codigo, dispositivo: 'PRUEBA FINAL' }),
})
const escJson = (await esc.json()).data
ok(escJson?.resultado === 'autorizado', 'el codigo de barras autoriza el acceso', escJson?.resultado)
ok(
  escJson?.persona?.id === persona.id,
  'resuelve a la persona correcta',
  `${escJson?.persona?.nombres} ${escJson?.persona?.apellidos}`
)
ok(
  `${escJson?.persona?.nombres} ${escJson?.persona?.apellidos}` ===
    `${persona.nombres} ${persona.apellidos}`,
  'los nombres coinciden con la base'
)

console.log('')
console.log('=== PAGINA DEL TRABAJADOR ===')
const pub = await get(`${API}/cred/${cred.codigo}`)
ok(pub.status === 200, 'la pagina publica abre sin sesion', `HTTP ${pub.status}`)
ok(pub.texto.includes(cred.codigo), 'muestra el codigo')
ok(pub.texto.includes('Instalar'), 'ofrece instalarla')
ok(pub.texto.includes('<svg'), 'trae el codigo de barras en SVG')
ok(pub.texto.includes(persona.apellidos), 'muestra los datos del trabajador')

const man = await get(`${API}/cred/manifesto.json?c=${cred.codigo}`)
ok(man.tipo?.includes('json'), 'manifiesto JSON', man.tipo)
for (const ico of ['icono-192.png', 'icono-512.png', 'icono-maskable.png', 'icono-180.png']) {
  const r = await get(`${API}/cred/${ico}`)
  ok(r.status === 200 && r.tipo === 'image/png', `icono ${ico}`, r.tipo)
}
ok((await get(`${API}/cred/sw.js`)).status === 200, 'service worker disponible')
ok((await get(`${WEB}/cred/${cred.codigo}`)).status === 200, 'tambien responde por el puerto del frontend')

console.log('')
console.log('=== LIMPIEZA ===')
await fetch(`${API}/api/credenciales/${cred.id}`, {
  method: 'DELETE',
  headers: { Authorization: `Bearer ${token}` },
})
// Con token: si se borro, ya no existe
const despues = await fetch(`${API}/api/credenciales/${cred.id}`, {
  headers: { Authorization: `Bearer ${token}` },
})
ok(despues.status === 404, 'credencial eliminada', `HTTP ${despues.status}`)
const { db } = await import('../server/db.js')
const limpio = db.prepare("DELETE FROM registros WHERE dispositivo = 'PRUEBA FINAL'").run().changes
console.log(`  registros de prueba borrados: ${limpio}`)
db.close()

console.log('')
console.log(fallos === 0 ? 'RESULTADO: todo correcto' : `RESULTADO: ${fallos} fallas`)