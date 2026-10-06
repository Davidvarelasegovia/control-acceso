/**
 * Comprobacion de que una COPIA del proyecto sirve en un equipo limpio.
 *
 * Esta es la lista que se revisa ANTES de cerrar esta sesion y despues de
 * abrirla en el otro equipo. Se divide en dos partes: lo que se comprueba
 * ahora (sin base de datos, sin navegador) y lo que hay que mirar con el
 * sistema ya andando.
 *
 *   node scripts/checklist-copia.js
 *
 * Sale con codigo 0 si todo lo automatico esta bien, 1 si algo falla.
 */
import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')

let fallos = 0
const ok = (t) => console.log('  OK    ' + t)
const mal = (t, d = '') => {
  fallos++
  console.log('  FALLA ' + t + (d ? '\n          ' + d : ''))
}
const titulo = (t) => {
  console.log('')
  console.log(t)
}

/* ------------------------------------------------------------------ */
titulo('1. Lo que el sistema necesita para arrancar')
/* ------------------------------------------------------------------ */

const [mayor, menor] = process.versions.node.split('.').map(Number)
if (mayor > 22 || (mayor === 22 && menor >= 12)) ok(`Node ${process.versions.node} (se necesita 22.12+)`)
else
  mal(
    `Node ${process.versions.node} es viejo`,
    'La base de datos usa node:sqlite, que no existe antes de 22.12. Instala Node 22 LTS.'
  )

if (existsSync(join(raiz, 'node_modules'))) ok('Dependencias instaladas')
else mal('Faltan las dependencias', 'En esta carpeta corre:  npm install')

/* ------------------------------------------------------------------ */
titulo('2. La base de datos (lo unico que no se puede rehacer)')
/* ------------------------------------------------------------------ */

const rutaDb = process.env.DB_PATH || join(raiz, 'data', 'control-acceso.db')
if (!existsSync(rutaDb)) {
  mal('No existe la base de datos', `${rutaDb}\n          Se crea sola al arrancar, pero saldría vacía: sin personas.`)
} else {
  const kb = Math.round(statSync(rutaDb).size / 1024)
  if (kb > 20) ok(`data/control-acceso.db (${kb} KB)`)
  else
    mal(
      `La base esta sospechosamente chica: ${kb} KB`,
      'Si deberia tener personas y no las tiene, la copia salio mal. Con el servidor ' +
        'corriendo no se copia el .db a mano: usa el boton "Respaldar base".'
    )

  try {
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(rutaDb, { readOnly: true })
    const n = (t) => {
      try {
        return db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n
      } catch {
        return -1
      }
    }
    const personas = n('personas')
    const admins = (() => {
      try {
        return db.prepare("SELECT COUNT(*) n FROM usuarios WHERE rol='admin'").get().n
      } catch {
        return -1
      }
    })()

    if (personas > 0) ok(`${personas} personas`)
    else mal('La base no tiene personas', 'No hay forma de recuperarlas: copia de nuevo la base.')

    if (admins > 0) ok(`${admins} administrador(es)`)
    else mal('No hay administrador', 'Se crearia uno solo con clave 123456 al arrancar.')

    console.log(
      `         ${n('credenciales')} credenciales · ${n('registros')} ingresos · ` +
        `${n('accesos_log')} movimientos en la bitacora`
    )
    db.close()
  } catch (e) {
    mal('La base no se pudo abrir', e.message)
  }
}

/* ------------------------------------------------------------------ */
titulo('3. Archivos que no pueden faltar')
/* ------------------------------------------------------------------ */

for (const f of [
  'package.json',
  'package-lock.json',
  'index.html',
  'vite.config.js',
  'server/index.js',
  'server/db.js',
  'server/auth.js',
  'server/credenciales.js',
  'server/cred-routes.js',
  'shared/credencialSvg.js',
  'public/sw.js',
  'public/cred/sw.js',
  'README.md',
]) {
  if (existsSync(join(raiz, f))) ok(f)
  else mal(`falta ${f}`)
}

/* ------------------------------------------------------------------ */
titulo('4. El codigo no tiene rutas de este equipo')
/* ------------------------------------------------------------------ */

// Esta palabra se busca en el codigo, asi que este archivo se excluye: si no,
// se encontraria a si mismo y siempre fallaria.
const NO_MIRAR = new Set(['checklist-copia.js'])

const rotas = []
for (const carpeta of ['server', 'shared', 'scripts', 'src']) {
  const base = join(raiz, carpeta)
  if (!existsSync(base)) continue
  const recorrer = (ruta) => {
    for (const e of readdirSync(ruta, { withFileTypes: true })) {
      const p = join(ruta, e.name)
      if (e.isDirectory()) recorrer(p)
      else if (/\.(js|jsx)$/.test(e.name) && !NO_MIRAR.has(e.name)) {
        const texto = readFileSync(p, 'utf8')
        // Rutas absolutas de esta maquina, que en otro equipo no existen.
        if (/C:\\Users|OneDrive|Documentos\\|Predeterminado/i.test(texto)) rotas.push(relative(raiz, p))
      }
    }
  }
  recorrer(base)
}
if (rotas.length === 0) ok('Ninguna ruta absoluta de este equipo')
else
  mal(
    'Hay rutas absolutas en el codigo',
    rotas.join(', ') + '\n          En otro equipo esas carpetas no existen.'
  )

/* ------------------------------------------------------------------ */
titulo('5. Sintaxis de todo el codigo')
/* ------------------------------------------------------------------ */

const { execFileSync } = await import('node:child_process')
let conError = 0
let contados = 0
for (const carpeta of ['server', 'shared', 'scripts']) {
  const base = join(raiz, carpeta)
  if (!existsSync(base)) continue
  const recorrer = (ruta) => {
    for (const e of readdirSync(ruta, { withFileTypes: true })) {
      const p = join(ruta, e.name)
      if (e.isDirectory()) recorrer(p)
      else if (e.name.endsWith('.js')) {
        contados++
        try {
          execFileSync(process.execPath, ['--check', p], { stdio: 'pipe' })
        } catch {
          conError++
          console.log('          con error: ' + relative(raiz, p))
        }
      }
    }
  }
  recorrer(base)
}
if (conError === 0) ok(`${contados} archivos .js sin errores de sintaxis`)
else mal(`${conError} archivo(s) con errores de sintaxis`)

/* ------------------------------------------------------------------ */
titulo('6. Lo que hay que revisar con el sistema ya andando')
/* ------------------------------------------------------------------ */

console.log(`
   Arranca con:   npm run dev:full
   Y abre en el navegador:

   [ ]  http://localhost:5173            la pantalla de escaneo
   [ ]  http://localhost:5173/credenciales   el panel (david / 123456)
   [ ]  http://localhost:5173/informes       los informes
   [ ]  http://localhost:5173/admin          administration
   [ ]  http://localhost:5173/cred/A972Q66464   una credencial en el celular

   En el celular: eso tiene que abrir SIN sesion, y con la credencial
   ocupando la pantalla completa.
`)

/* ------------------------------------------------------------------ */
console.log('')
console.log('='.repeat(64))
if (fallos) {
  console.log(`${fallos} problema(s). Todavia no se puede cerrar y cambiar de equipo.`)
  console.log('='.repeat(64))
  process.exit(1)
}
console.log('Todo lo automatico esta bien. Se puede copiar a otro equipo.')
console.log('='.repeat(64))