/**
 * Prueba de extremo a extremo de las credenciales contra el servidor corriendo.
 *   node scripts/probar-credenciales-api.js
 */
const API = process.env.API_URL || 'http://localhost:3001'

const pedir = async (ruta, metodo = 'GET', cuerpo) => {
  const r = await fetch(`${API}${ruta}`, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      ...(cuerpo?.__token ? { Authorization: `Bearer ${cuerpo.__token}` } : {}),
    },
    body: metodo === 'GET' ? undefined : JSON.stringify(cuerpo),
  })
  return { status: r.status, json: await r.json().catch(() => ({})) }
}

console.log('1) Login de administrador')
const login = await pedir('/api/auth/login', 'POST', { usuario: 'david', clave: '123456' })
if (!login.json.ok) {
  console.log('   FALLA:', login.json.error)
  process.exit(1)
}
const token = login.json.data.token
console.log(`   OK  token ${token.slice(0, 12)}…`)
console.log('')

console.log('2) Crear credencial')
const creada = await pedir('/api/credenciales', 'POST', {
  __token: token,
  nombres: 'Persona',
  apellidos: 'Credencial Demo',
  empresa: 'Constructora Andes',
  cargo: 'Jefe de Turno',
  autorizaciones: ['Acceso general', 'Sala de servidores'],
  licencias: ['B - Automovil', 'C - Camion'],
  vehiculos: ['Camioneta', 'Camion'],
  notas: 'Prueba de emision',
})
if (!creada.json.ok) {
  console.log('   FALLA:', creada.json.error)
  process.exit(1)
}
const c = creada.json.data
console.log(`   codigo      : ${c.codigo} (${c.codigo.length} caracteres)`)
console.log(`   persona     : ${c.persona_id ?? '(sin ligar a la base)'}`)
console.log(`   estado      : ${c.estado}`)
console.log('')

console.log('3) Codigo repetido (debe rechazar)')
const dup = await pedir('/api/credenciales', 'POST', {
  __token: token,
  nombres: 'Otro',
  codigo: c.codigo,
})
console.log(`   HTTP ${dup.status} -> ${dup.json.ok ? 'PROBLEMA: acepto el duplicado' : dup.json.error}`)
console.log('')

console.log('4) Escaneo con el CODIGO de credencial (10 caracteres)')
const escaneo = await pedir('/api/escaneo', 'POST', {
  rut: c.codigo,
  dispositivo: 'PRUEBA CREDENCIAL',
})
console.log(`   resultado : ${escaneo.json.data?.resultado ?? escaneo.json.error}`)
console.log(`   mensaje   : ${escaneo.json.data?.mensaje}`)
console.log(`   persona   : ${escaneo.json.data?.persona ? `${escaneo.json.data.persona.nombres} ${escaneo.json.data.persona.apellidos}` : '(ninguna)'}`)
console.log('')

console.log('5) Escaneo en minusculas')
const minus = await pedir('/api/escaneo', 'POST', { rut: c.codigo.toLowerCase() })
console.log(`   resultado : ${minus.json.data?.resultado} (debe ser duplicado o no-encontrado, no autorizado)`)
console.log('')

console.log('6) Codigo inexistente')
const falso = await pedir('/api/escaneo', 'POST', { rut: 'ZZZZZ99999' })
console.log(`   resultado : ${falso.json.data?.resultado}`)
console.log('')

console.log('7) Credencial ligada a una persona de la base')
const personas = (await (await fetch(`${API}/api/personas`)).json()).data
const primera = personas.find((p) => p.rut)
const ligada = await pedir('/api/credenciales', 'POST', {
  __token: token,
  persona_id: primera.id,
})
const lc = ligada.json.data
console.log(`   ${lc.codigo} -> persona #${primera.id} ${primera.nombres} ${primera.apellidos}`)
const escLigada = await pedir('/api/escaneo', 'POST', { rut: lc.codigo })
const encontrada = escLigada.json.data?.persona
console.log(`   escaneo   : ${escLigada.json.data?.resultado} -> ${encontrada ? `${encontrada.nombres} ${encontrada.apellidos}` : '(ninguna)'}`)
console.log(`   ${encontrada && encontrada.id === primera.id ? 'OK  resuelve a la persona correcta' : 'PROBLEMA  no resuelve bien'}`)
console.log('')

console.log('8) Pagina publica /cred/CODIGO (la que se manda por WhatsApp)')
for (const cod of [c.codigo, lc.codigo]) {
  const r = await fetch(`${API}/cred/${cod}`)
  const html = await r.text()
  const ok = r.ok && html.includes(cod) && html.includes('Instalar')
  console.log(`   ${cod} -> HTTP ${r.status} | ${(html.length / 1024).toFixed(0)} KB | ${ok ? 'OK' : 'FALTA CONTENIDO'}`)
}
const r404 = await fetch(`${API}/cred/NOEXISTE1`)
console.log(`   NOEXISTE1 -> HTTP ${r404.status} (debe ser 404)`)
console.log('')

console.log('9) Iconos y manifiesto')
for (const f of ['icono-192.png', 'icono-512.png', 'icono-180.png', 'icono-maskable.png', 'sw.js']) {
  const r = await fetch(`${API}/cred/${f}`)
  console.log(`   ${f.padEnd(22)} HTTP ${r.status} ${r.ok ? 'OK' : 'FALTA'}`)
}
const man = await fetch(`${API}/cred/manifesto.json?c=${c.codigo}`)
const manJson = await man.json()
console.log(`   manifesto.json -> HTTP ${man.status} | name="${manJson.name}" | iconos ${manJson.icons.length}`)
console.log('')

console.log('10) Editar y eliminar')
const ed = await pedir(`/api/credenciales/${c.id}`, 'PUT', {
  __token: token,
  cargo: 'Gerente de Operaciones',
})
console.log(`   cargo nuevo : ${ed.json.data.cargo}`)
await pedir(`/api/credenciales/${c.id}`, 'DELETE')
await pedir(`/api/credenciales/${lc.id}`, 'DELETE')
console.log('   credenciales de prueba eliminadas')
console.log('')

console.log('11) Permisos: sin token debe rechazar')
const sinToken = await pedir('/api/credenciales')
console.log(`   GET /api/credenciales sin token -> HTTP ${sinToken.status} (401 esperado)`)
const agenteLogin = await pedir('/api/auth/login', 'POST', { usuario: 'romina', clave: 'incorrecta' })
console.log(`   login con clave erronea -> ${agenteLogin.json.ok ? 'PROBLEMA' : 'rechazado'}`)
console.log('')

console.log('--- Limpieza de registros de prueba ---')
console.log('   (los registros quedan en la base; se limpian con limpiar-servicios-prueba.js)')