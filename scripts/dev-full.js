/**
 * Levanta la API (Node + SQLite) y el frontend (Vite) juntos.
 *   npm run dev:full
 *
 * Diferencias importantes con una version ingenua:
 *
 *  1. Vite se lanza DIRECTO (no via `npm run dev`). Si se lanza con npm, vite
 *     queda como proceso nieto: al cerrar, npm muere pero vite sigue vivo y
 *     la web queda respondiendo sin API, que es laCombinacion mas confusa.
 *
 *  2. Si la API se cae, se vuelve a levantar sola con una espera creciente.
 *     La base de datos es local; no tiene sentido que un error puntual deje el
 *     sistema de acceso sin servicio en la puerta.
 *
 *  3. Al cerrar se mata el ARBOL de procesos, no solo el hijo directo.
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

/** Rutas absolutas: evita depender del PATH y del directorio actual. */
const VITE = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')

const COLOR = {
  API: 36, // cian
  WEB: 35, // magenta
  SYS: 33, // amarillo
}

let api = null
let web = null
let saliendo = false
let reintentos = 0
let temporizadorReintento = null

/* ------------------------------------------------------------------ */
/* Procesos                                                           */
/* ------------------------------------------------------------------ */

function log(quien, texto) {
  console.log(`\x1b[${COLOR[quien]}m[${quien}]\x1b[0m ${texto}`)
}

/**
 * Lanza un proceso hijo reenviando su salida con prefijo.
 * @returns {import('node:child_process').ChildProcess}
 */
function lanzar(nombre, comando, args) {
  const p = spawn(comando, args, {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    // process_group permite matar el arbol completo al cerrar
    detached: process.platform !== 'win32',
  })

  const prefijo = `\x1b[${COLOR[nombre]}m[${nombre}]\x1b[0m `
  const escribir = (buffer) => {
    String(buffer)
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .forEach((l) => console.log(prefijo + l))
  }

  p.stdout.on('data', escribir)
  p.stderr.on('data', escribir)
  return p
}

/**
 * Mata un proceso y todos sus hijos.
 * En Windows hace falta taskkill /T porque kill() no baja el arbol.
 */
function matarArbol(p) {
  if (!p || p.killed) return
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(p.pid), '/T', '/F'], { stdio: 'ignore' })
    } else {
      try {
        process.kill(-p.pid, 'SIGKILL')
      } catch {
        p.kill('SIGKILL')
      }
    }
  } catch {
    /* ya estaba muerto */
  }
}

/* ------------------------------------------------------------------ */
/* API con reinicio automatico                                        */
/* ------------------------------------------------------------------ */

function iniciarApi() {
  if (saliendo) return

  reintentos++
  api = lanzar('API', process.execPath, [join(ROOT, 'server', 'index.js')])

  api.on('exit', (codigo, senal) => {
    if (saliendo) return

    log(
      'SYS',
      `la API se detuvo (código ${codigo}${senal ? ', señal ' + senal : ''}). ` +
        `Vuelvo a levantarla…`
    )

    // Espera creciente hasta 15 segundos, para no entrar en bucle si el
    // problema es persistente (por ejemplo, la base esta bloqueada).
    const espera = Math.min(15000, 1000 * 2 ** Math.min(reintentos, 4))
    temporizadorReintento = setTimeout(iniciarApi, espera)
  })

  // La API arranca bien: se reinicia el contador de intentos.
  setTimeout(() => {
    if (api && !api.killed && reintentos > 0) {
      reintentos = 0
      log('API', 'estable')
    }
  }, 6000)
}

/* ------------------------------------------------------------------ */
/* Web                                                                */
/* ------------------------------------------------------------------ */

function iniciarWeb() {
  if (saliendo) return
  web = lanzar('WEB', process.execPath, [VITE])

  web.on('exit', (codigo) => {
    if (saliendo) return
    log('SYS', `el frontend se detuvo (código ${codigo}). Lo vuelvo a levantar…`)
    setTimeout(iniciarWeb, 2000)
  })
}

/* ------------------------------------------------------------------ */
/* Apagado                                                            */
/* ------------------------------------------------------------------ */

function detener() {
  if (saliendo) return
  saliendo = true
  clearTimeout(temporizadorReintento)

  console.log('')
  log('SYS', 'apagando…')
  matarArbol(web)
  matarArbol(api)
  process.exit(0)
}

process.on('SIGINT', detener)
process.on('SIGTERM', detener)
process.on('exit', () => {
  clearTimeout(temporizadorReintento)
  matarArbol(web)
  matarArbol(api)
})

/* ------------------------------------------------------------------ */

console.log('\n\x1b[32m Control de Acceso\x1b[0m')
console.log('  Frontend : http://localhost:5173')
console.log('  API      : http://localhost:3001/api/estado')
console.log(`  Base     : ${process.env.DB_PATH || 'data/control-acceso.db'}`)
console.log('  Si se cae la API, se vuelve a levantar sola.\n')

iniciarApi()
iniciarWeb()