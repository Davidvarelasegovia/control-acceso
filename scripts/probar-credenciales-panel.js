/**
 * Verifica los cuatro arreglos del panel de credenciales:
 *   1. Escribir en "cargo" no tumba la pagina
 *   2. El logo se sube de verdad
 *   3. El codigo de barras sale limpio, con RUT e ID debajo
 *   4. El QR del reverso es de 200x200 y usa la URL configurada
 *   node scripts/probar-credenciales-panel.js
 */
const WEB = 'http://localhost:5173'
const API = 'http://localhost:3001'

let fallos = 0
const ok = (cond, texto, extra = '') => {
  if (!cond) fallos++
  console.log(`  ${cond ? 'OK   ' : 'FALLA'} ${texto}${extra ? ' | ' + extra : ''}`)
}

const login = await (
  await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: 'david', clave: '123456' }),
  })
).json()
const token = login.data?.token
if (!token) {
  console.log('No pude iniciar sesión')
  process.exit(1)
}
const auth = { Authorization: `Bearer ${token}` }

console.log('=== 1. CONFIG: logo y URL del QR ===')
const cfg0 = (await (await fetch(`${API}/api/config`)).json()).data
ok(cfg0.logo !== undefined, 'GET /config devuelve el logo', JSON.stringify(cfg0.logo).slice(0, 30))
ok(
  typeof cfg0.qr_url === 'string' && cfg0.qr_url.length > 0,
  'GET /config devuelve la URL del QR',
  cfg0.qr_url
)

// Subir un logo de 1x1 px en PNG (data URL)
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const putLogo = await (
  await fetch(`${API}/api/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ logo: PNG }),
  })
).json()
ok(putLogo.ok, 'PUT /config acepta el logo')

const cfg1 = (await (await fetch(`${API}/api/config`)).json()).data
ok(cfg1.logo === PNG, 'el logo quedo guardado y se vuelve a leer')

const putQr = await (
  await fetch(`${API}/api/credenciales/qr`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ url: 'https://miempresa.cl/credenciales' }),
  })
).json()
ok(putQr.ok && putQr.data.qr_url === 'https://miempresa.cl/credenciales', 'se guarda la URL del QR')

// Volver a la de prueba
await fetch(`${API}/api/credenciales/qr`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json', ...auth },
  body: JSON.stringify({ url: '' }),
})
const cfg2 = (await (await fetch(`${API}/api/config`)).json()).data
ok(
  cfg2.qr_url === 'https://ejemplo.com/control-acceso/credenciales',
  'URL vacia vuelve a la de prueba',
  cfg2.qr_url
)

console.log('')
console.log('=== 2. RUTA /qr NO SE CONFUNDE CON UN ID ===')
const qrRuta = await fetch(`${API}/api/credenciales/qr`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json', ...auth },
  body: JSON.stringify({ url: 'https://miempresa.cl/credenciales' }),
})
const qrJson = await qrRuta.json()
ok(qrJson.ok && qrJson.data?.qr_url, 'PUT /credenciales/qr no cae en /:id', `HTTP ${qrRuta.status}`)

console.log('')
console.log('=== 3. CREDENCIAL DE PRUEBA Y PAGINA ===')
const personas = (await (await fetch(`${API}/api/personas`)).json()).data
const persona = personas.find((p) => /10\.017\.328/.test(p.rut)) || personas[0]

const cred = (
  await (
    await fetch(`${API}/api/credenciales`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({
        persona_id: persona.id,
        cargo: 'Jefe de Turno',
        autorizaciones: ['Acceso general', 'Bodega'],
        licencias: ['B - Automovil'],
        vehiculos: ['Camioneta'],
      }),
    })
  ).json()
).data

ok(cred.codigo.length === 10, 'codigo de 10 caracteres', cred.codigo)
ok(cred.rut === persona.rut, 'trae el RUT', cred.rut)

const pag = await (await fetch(`${API}/cred/${cred.codigo}`)).text()

ok(pag.includes('Identificador del trabajador'), 'rotulo del RUT bajo el codigo de barras')
ok(pag.includes('Codigo de credencial'), 'rotulo del ID bajo el codigo de barras')
ok(pag.includes(persona.rut), 'muestra el RUT real')
ok(!pag.includes('includetext'), 'el codigo de barras no trae texto incrustado')
ok(/qr-marco/.test(pag), 'el QR del reverso esta presente')
ok(
  /\.qr-marco\s*\{[^}]*width:\s*104px[^}]*height:\s*104px/.test(pag),
  'el QR mide 104 x 104 (la mitad)'
)
ok(/\.qr-seccion\s*\{[^}]*padding:\s*14px 18px 20px/.test(pag), 'el QR tiene aire de los bordes')
ok(
  /\.foto\s*\{[^}]*width:\s*150px[^}]*height:\s*172px[^}]*border-radius:\s*14px[^}]*object-fit:\s*cover/.test(pag),
  'la foto es un recuadro redondeado que adapta la imagen'
)

// El QR dibuja la URL como trazos, asi que no aparece como texto plano.
// Para comprobar que usa la URL configurada se cambia la URL y se ve que el
// dibujo del QR cambia.
const qrDe = async () => {
  const html = await (await fetch(`${API}/cred/${cred.codigo}`)).text()
  const m = html.match(/<div class="qr-marco">([\s\S]*?)<\/div>/)
  return (m?.[1] || '').replace(/\s+/g, '')
}

const qrConA = await qrDe()
await fetch(`${API}/api/credenciales/qr`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json', ...auth },
  body: JSON.stringify({ url: 'https://otra-empresa.cl/acceso-2026' }),
})
const qrConB = await qrDe()

ok(qrConA.length > 500, 'el QR dibuja un dibujo real', `${qrConA.length} caracteres`)
ok(qrConA !== qrConB, 'el QR cambia cuando cambia la URL configurada')

console.log('')
console.log('=== 4. ESCANEO CON RUT Y CON ID ===')
// "autorizado" o "duplicado" sirven: lo que importa es que los dos
// identificadores resuelvan a la MISMA persona. Si ya entro antes en este
// servicio, el sistema lo rechaza como duplicado, y eso tambien es correcto.
const escanear = async (valor) =>
  (
    await (
      await fetch(`${API}/api/escaneo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rut: valor, dispositivo: 'PRUEBA PANEL' }),
      })
    )
  ).json()

const porRut = await escanear(persona.rut)
ok(
  ['autorizado', 'duplicado'].includes(porRut.data?.resultado),
  'el RUT autoriza el ingreso',
  porRut.data?.resultado
)
ok(
  porRut.data?.persona?.id === persona.id,
  'el RUT resuelve a la persona correcta',
  `${porRut.data?.persona?.nombres} ${porRut.data?.persona?.apellidos}`
)

const porId = await escanear(cred.codigo)
ok(
  ['autorizado', 'duplicado'].includes(porId.data?.resultado),
  'el ID de credencial tambien autoriza',
  porId.data?.resultado
)
ok(
  porId.data?.persona?.id === porRut.data?.persona?.id,
  'RUT e ID resuelven a la MISMA persona',
  `RUT -> #${porRut.data?.persona?.id} | ID -> #${porId.data?.persona?.id}`
)

console.log('')
console.log('=== 5. LIMPIEZA ===')
await fetch(`${API}/api/credenciales/${cred.id}`, { method: 'DELETE', headers: auth })
ok((await (await fetch(`${API}/api/credenciales/${cred.id}`, { headers: auth })).status) === 404,
   'credencial de prueba eliminada')

await fetch(`${API}/api/config`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ logo: '' }),
})
const cfgF = (await (await fetch(`${API}/api/config`)).json()).data
ok(cfgF.logo === '', 'logo de prueba quitado')

const { db } = await import('../server/db.js')
const n = db.prepare("DELETE FROM registros WHERE dispositivo = 'PRUEBA PANEL'").run().changes
console.log(`  registros de prueba borrados: ${n}`)
db.close()

console.log('')
console.log(fallos === 0 ? 'RESULTADO: todo correcto' : `RESULTADO: ${fallos} fallas`)