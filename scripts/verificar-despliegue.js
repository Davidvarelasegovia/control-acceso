/**
 * Verificacion previa a publicar en un dominio.
 *
 * Revisa lo que se rompe al cambiar de equipo o al subir a internet:
 * version de Node, si el build esta al dia, contrasenas debiles, la URL del
 * codigo QR que todavia apunta a un sitio de prueba, y que datos hay que
 * respaldar.
 *
 * NO cambia nada. Solo informa.
 *
 *   node scripts/verificar-despliegue.js
 *
 * Sale con codigo 1 si hay algo que hay que arreglar antes de publicar.
 */
import { DatabaseSync } from 'node:sqlite'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scryptSync, timingSafeEqual } from 'node:crypto'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const dbPath = process.env.DB_PATH || join(raiz, 'data', 'control-acceso.db')

let problemas = 0
let avisos = 0

function bien(titulo, detalle = '') {
  console.log(`  OK    ${titulo}${detalle ? `\n          ${detalle}` : ''}`)
}
function mal(titulo, detalle) {
  problemas++
  console.log(`  FALLA ${titulo}\n          ${detalle}`)
}
function ojo(titulo, detalle) {
  avisos++
  console.log(`  AVISO ${titulo}\n          ${detalle}`)
}
function titulo(t) {
  console.log('')
  console.log(t)
}

/**
 * Comprueba una clave contra lo guardado, igual que hace el servidor.
 *
 * Copiada de server/auth.js a proposito: importar ese archivo abriria la base
 * otra vez, y este script solo debe LEER, sin dejar la base bloqueada.
 */
function claveEs(clave, guardado) {
  try {
    const [sal, hash] = String(guardado).split(':')
    if (!sal || !hash) return false
    const calculado = scryptSync(String(clave), sal, 64)
    const esperado = Buffer.from(hash, 'hex')
    if (calculado.length !== esperado.length) return false
    return timingSafeEqual(calculado, esperado)
  } catch {
    return false
  }
}

/* ------------------------------------------------------------------ */
titulo('1. El equipo donde se va a instalar')
/* ------------------------------------------------------------------ */

const [mayor, menor] = process.versions.node.split('.').map(Number)
const okNode = mayor > 22 || (mayor === 22 && menor >= 12)
if (okNode) bien(`Node ${process.versions.node}`)
else
  mal(
    `Node ${process.versions.node} es viejo`,
    'Hace falta 22.12 o superior: la base de datos usa el modulo nativo node:sqlite, ' +
      'que no existe antes. Instala Node 22 LTS o mas nuevo.'
  )

if (existsSync(join(raiz, 'node_modules'))) bien('Dependencias instaladas (node_modules existe)')
else
  mal(
    'Faltan las dependencias',
    'En la carpeta del proyecto:  npm install'
  )

const port = process.env.PORT || 3001
if (!existsSync(join(raiz, 'data'))) mal('No existe la carpeta data/', 'Creala antes de arrancar')
else bien(`Puerto de la API: ${port}  (se cambia con la variable PORT)`)

/* ------------------------------------------------------------------ */
titulo('2. El build del frontend')
/* ------------------------------------------------------------------ */

const dist = join(raiz, 'dist')
const tieneDist = existsSync(dist)

/** Lo mas reciente del codigo fuente. Acepta carpetas y archivos sueltos. */
function masReciente(entradas) {
  let ultimo = { archivo: '(nada)', fecha: 0 }
  const anotar = (p) => {
    const f = statSync(p).mtimeMs
    if (f > ultimo.fecha) ultimo = { archivo: relative(raiz, p), fecha: f }
  }
  const recorrer = (ruta) => {
    for (const e of readdirSync(ruta, { withFileTypes: true })) {
      const p = join(ruta, e.name)
      if (e.isDirectory()) recorrer(p)
      else anotar(p)
    }
  }
  for (const c of entradas) {
    const p = join(raiz, c)
    if (!existsSync(p)) continue
    if (statSync(p).isDirectory()) recorrer(p)
    else anotar(p)
  }
  return ultimo
}

if (!tieneDist) {
  mal(
    'No hay build de produccion (dist/)',
    'El servidor sirve solo la API. Para que las pantallas funcionen: para el servidor, ' +
      'luego  npm run build  y despues  npm start'
  )
} else {
  const index = join(dist, 'index.html')
  const fechaBuild = existsSync(index) ? statSync(index).mtimeMs : 0
  const nuevo = masReciente(['src', 'shared', 'index.html', 'vite.config.js', 'package.json'])

  if (!fechaBuild) mal('dist/ esta vacio o sin index.html', 'Vuelve a correr: npm run build')
  else if (fechaBuild < nuevo.fecha) {
    mal(
      'El build esta VIEJO',
      `Lo ultimo que se cambio en el codigo es ${nuevo.archivo}, y el build es de antes.\n` +
        '          Para recompilar hay que PARAR el servidor primero:\n' +
        '            1) cerrar la ventana del npm run dev:full\n' +
        '            2) npm run build\n' +
        '            3) npm start\n' +
        '          Si compilas con el servidor corriendo, se pisa el index.html y quedan dos versiones.'
    )
  } else {
    bien(`El build esta al dia (compilado despues de ${nuevo.archivo})`)
  }

  const credenciales = join(dist, 'cred')
  bien(
    'La pagina de credenciales se sirve desde el servidor',
    'No depende de dist/: se dibuja en el servidor, asi que el link de WhatsApp ' +
      'sigue funcionando aunque el frontend este caido.'
  )
}

/* ------------------------------------------------------------------ */
titulo('3. Service workers (lo que se cachea en los telefonos)')
/* ------------------------------------------------------------------ */

for (const [nombre, ruta] of [
  ['app principal', join(raiz, 'public', 'sw.js')],
  ['credenciales', join(raiz, 'public', 'cred', 'sw.js')],
]) {
  if (!existsSync(ruta)) {
    mal(`Falta el service worker de ${nombre}`, ruta)
    continue
  }
  const texto = readFileSync(ruta, 'utf8')
  const versiones = [...texto.matchAll(/'(?:control-acceso|credencial)-(v\d+)'/g)].map((m) => m[1])
  if (!versiones.length) mal(`No se encontro la version de cache en ${nombre}`, ruta)
  else bien(`${nombre}: cache ${versiones.join(' / ')}`)
}

ojo(
  'Si cambiaste el diseno de la credencial, sube el numero de cache',
  "En public/cred/sw.js esta 'credencial-v2'. Si mas adelante cambias el diseno otra vez, " +
    'tiene que pasar a v3. Sin eso, los telefonos que ya.tenian guardada la credencial ' +
    'seguiran viendo la version vieja para siempre.'
)

/* ------------------------------------------------------------------ */
titulo('4. Contrasenas')
/* ------------------------------------------------------------------ */

if (!existsSync(dbPath)) {
  mal('No existe la base de datos', `${dbPath}\n          Se crea sola al arrancar el servidor.`)
} else {
  const db = new DatabaseSync(dbPath, { readOnly: true })

  // Las contrasenas que nunca hay que dejar puestas en un sitio publico.
  const COMUNES = ['123456', '1234', 'password', 'admin', 'david', '12345678', 'secreto', 'clave']
  const usuarios = db.prepare('SELECT id, usuario, nombre, rol, activo, clave_hash FROM usuarios').all()

  if (!usuarios.length) {
    mal('No hay ningun usuario', 'Hay que crear el administrador desde /admin')
  }

  for (const u of usuarios) {
    const debil = COMUNES.find((c) => claveEs(c, u.clave_hash))
    const etiqueta = `${u.usuario} (${u.rol})${u.activo ? '' : ' - desactivado'}`

    if (debil) {
      mal(
        `La clave de ${etiqueta} es "${debil}"`,
        'Es una de las mas adivinadas del mundo. Antes de publicar hay que cambiarlo ' +
          'desde el panel /admin, o desde Configuracion.'
      )
    } else if (u.rol === 'admin') {
      bien(`Clave de ${etiqueta}: no es una clave debil comun`)
    } else {
      bien(`${etiqueta}: clave correcta`)
    }
  }

  /* ---------------------------------------------------------------- */
  titulo('5. Lo que va a quedar publico')
  /* ---------------------------------------------------------------- */

  const count = (sql) => {
    try {
      return db.prepare(sql).get().n
    } catch {
      return 0
    }
  }

  const credenciales = count('SELECT COUNT(*) n FROM credenciales')
  const personas = count('SELECT COUNT(*) n FROM personas')
  const registros = count('SELECT COUNT(*) n FROM registros')

  console.log(`  ${personas} personas, ${credenciales} credenciales, ${registros} registros`)
  console.log('')

  if (credenciales || personas) {
    mal(
      'La base tiene datos de personas',
      'Se van a publicar: nombre, RUT, empresa, cargo, foto, credencial y los ingresos.\n' +
        '          Si el dominio es publico, cualquiera que conozca una credencial la puede ver.\n' +
        '          Las fotos van DENTRO de la base, en base64, asi que van con el archivo entero.'
    )
  } else {
    bien('La base esta vacia (sin datos personales)')
  }

  /* ---------------------------------------------------------------- */
  titulo('6. La URL del codigo QR de las credenciales')
  /* ---------------------------------------------------------------- */

  let qr = db.prepare("SELECT valor FROM config WHERE clave = 'qr_url'").get()
  const qrActual = qr ? String(qr.valor) : null

  if (!qrActual) {
    ojo(
      'No hay URL de QR guardada, se usara la de prueba',
      `Por omision: ${'https://ejemplo.com/control-acceso/credenciales'}\n` +
        '          Los QR de las credenciales llevarian a un sitio que no existe.\n' +
        '          Cambiala en el panel de credenciales, en el campo "URL del codigo QR".'
    )
  } else if (/ejemplo\.com|localhost|127\.0\.0\.1|192\.168\./.test(qrActual)) {
    mal(
      `La URL del QR todavia apunta a un sitio de prueba: ${qrActual}`,
      'Cambiala en el panel de credenciales a la direccion real, con https.'
    )
  } else if (!/^https:\/\//.test(qrActual)) {
    mal(
      `La URL del QR no usa https: ${qrActual}`,
      'Sin https el telefono no la deja instalar como aplicacion y el navegador ' +
        'avisa que no es segura.'
    )
  } else {
    bien(`URL del QR: ${qrActual}`)
  }

  /* ---------------------------------------------------------------- */
  titulo('7. Lo que hay que respaldar antes de tocar nada')
  /* ---------------------------------------------------------------- */

  for (const f of readdirSync(join(raiz, 'data'))) {
    const p = join(raiz, 'data', f)
    if (statSync(p).isDirectory()) continue
    const kb = Math.round(statSync(p).size / 1024)
    const sufijo = f === 'control-acceso.db' ? '  <-- IMPORTANTE' : kb > 1000 ? '  <-- dato de prueba' : ''
    console.log(`  data/${f.padEnd(26)} ${String(kb).padStart(6)} KB${sufijo}`)
  }
  console.log('')
  console.log('  Para cambiar de equipo, copia la CARPETA ENTERA. Lo imprescindible es:')
  console.log('    data/control-acceso.db   personas, ingresos, credenciales, usuarios y logo')
  console.log('')
  console.log('  Con el servidor corriendo, nunca copies solo el .db a mano:')
  console.log('    usa el boton "Respaldar base" del panel, o para el servidor: stop + copy + start')

  db.close()
}

/* ------------------------------------------------------------------ */
console.log('')
console.log('='.repeat(64))
if (problemas) {
  console.log(`${problemas} cosa(s) que arreglar antes de publicar, ${avisos} aviso(s).`)
  console.log('='.repeat(64))
  process.exit(1)
}
console.log(avisos ? `Todo bien, con ${avisos} aviso(s) a tener en cuenta.` : 'Todo bien para publicar.')
console.log('='.repeat(64))