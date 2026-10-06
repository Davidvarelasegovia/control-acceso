/**
 * Pagina publica de descarga de una credencial.
 *
 * La abre el trabajador en su celular desde el link de WhatsApp. Muestra la
 * credencial y ofrece instalarla como aplicacion:
 *
 *   - Android / escritorio: boton que dispara el instalador del navegador
 *   - iPhone / iPad: no hay API de instalacion, se guia con los pasos de
 *     "Compartir > Anadir a pantalla de inicio"
 *
 * Se renderiza en el SERVIDOR, no con React, para que funcione aunque el
 * frontend este caido y para que el service worker pueda cachearla entera.
 *
 *   /cred/:codigo
 */
import express, { Router } from 'express'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as credenciales from './credenciales.js'
import { credencialSvg } from '../shared/credencialSvg.js'
import { db } from './db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PUBLICO_CRED = join(__dirname, '..', 'public', 'cred')

const router = Router()

/**
 * Iconos y service worker.
 *
 * Van PRIMERO: la pagina de la credencial se la lleva el celular del
 * trabajador, que puede no tener Vite ni el build de produccion servidos.
 * Ademas, mas abajo hay una ruta con:parametro (/:codigo) que se comeria
 * cualquier archivo estatico si esta se declarara despues.
 */
router.use(express.static(PUBLICO_CRED))

/* ------------------------------------------------------------------ */
/* Texto                                                              */
/* ------------------------------------------------------------------ */

/** Escapa texto para meterlo en HTML. */
function esc(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/* ------------------------------------------------------------------ */
/* Plantilla                                                           */
/* ------------------------------------------------------------------ */

function plantilla({ frente, reverso, codigo, empresa, anulada }) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Credencial ${esc(codigo)}</title>
<meta name="theme-color" content="#050508">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Mi Credencial">
<link rel="manifest" href="/cred/manifesto.json?c=${esc(codigo)}">
<link rel="apple-touch-icon" href="/cred/icono-180.png">
<style>
  :root {
    --fondo: #050508;
    --panel: #12121a;
    --linea: #2a2a3a;
    --cian: #00f0ff;
    --verde: #00ff88;
    --gris: #6b7280;
  }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body {
    margin: 0; padding: 16px 14px 40px;
    background: var(--fondo); color: #fff;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    padding-bottom: calc(40px + env(safe-area-inset-bottom));
  }
  .envoltura { max-width: 460px; margin: 0 auto; }

  h1 { font-size: 15px; text-transform: uppercase; letter-spacing: .16em; margin: 0 0 4px; }
  .sub { color: var(--gris); font-size: 12px; margin-bottom: 18px; }

  .credencial {
    background: var(--panel); border: 1px solid var(--linea);
    border-radius: 16px; overflow: hidden; margin-bottom: 18px;
    box-shadow: 0 12px 40px rgba(0,0,0,.6);
  }
  /* La credencial entra como SVG incrustado: aca solo va el marco y el
     espaciado entre las dos caras. El dibujo (cinta, foto, codigo de barras,
     QR, textos) lo pone shared/credencialSvg.js, el mismo que usa el panel y
     la descarga, para que los tres se vean igual. */
  .cara { line-height: 0; }
  .cara svg { width: 100%; height: auto; display: block; }
  .cara + .cara { margin-top: 10px; }

  .acciones { display: grid; gap: 9px; margin-bottom: 14px; }
  .btn {
    display:flex; align-items:center; justify-content:center; gap:9px;
    padding: 15px 18px; border-radius: 12px; border: 1px solid var(--linea);
    background: var(--panel); color: #fff; font-size: 14px; font-weight: 600;
    text-decoration: none; cursor: pointer; text-align: center;
  }
  .btn.principal { background: rgba(0,240,255,.14); border-color: var(--cian); color: var(--cian); }
  .btn:active { transform: scale(.98); }

  .instrucciones {
    background: var(--panel); border: 1px solid var(--linea); border-radius: 12px;
    padding: 16px; margin-bottom: 14px; display: none;
  }
  .instrucciones.visible { display: block; }
  .instrucciones h3 { font-size: 11px; text-transform: uppercase; letter-spacing: .14em; color: var(--cian); margin: 0 0 10px; }
  .instrucciones ol { margin: 0; padding-left: 20px; display: grid; gap: 6px; }
  .instrucciones li { font-size: 13px; color: #d1d5db; }

  .nota { text-align:center; font-size: 11px; color: var(--gris); line-height: 1.6; margin-top: 6px; }
  .estado { text-align:center; font-size: 12px; margin-bottom: 14px; padding: 10px; border-radius: 10px; }
  .estado.ok { background: rgba(0,255,136,.1); border: 1px solid rgba(0,255,136,.35); color: var(--verde); }
  .estado.anulada { background: rgba(255,0,85,.1); border: 1px solid rgba(255,0,85,.35); color: #ff0055; }
</style>
</head>
<body>
<div class="envoltura">

  <h1>Mi Credencial</h1>
  <p class="sub">${esc(empresa || 'Control de Acceso')}</p>

  ${anulada ? '<div class="estado anulada">Esta credencial esta ANULADA</div>' : ''}

  <div class="credencial">
    <!-- La credencial es el MISMO SVG que muestra el panel y el que se
         descarga como PNG. Va incrustado, no como <img>, para que se vea
         nitida en cualquier pantalla y el service worker la guarde entera. -->
    <div class="cara">${frente}</div>
    <div class="cara">${reverso}</div>
  </div>

  <!-- INSTALACION -->
  <div class="acciones" id="acciones">
    <button class="btn principal" id="btnInstalar">
      <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/>
      </svg>
      Instalar en mi celular
    </button>
  </div>

  <div class="instrucciones" id="instrucciones">
    <h3 id="tituloInst">Como instalarla</h3>
    <ol id="pasosInst"></ol>
  </div>

  <p class="nota">
    Guarda esta credencial en tu telefono y usala aunque no tengas internet.<br>
    Presenta el codigo de barras en el acceso.
  </p>
</div>

<script>
// --- Instalar como aplicacion -------------------------------------
var promptInstalar = null
var instalando = false

window.addEventListener('beforeinstallprompt', function (e) {
  e.preventDefault()
  promptInstalar = e
  var b = document.getElementById('btnInstalar')
  if (b) b.style.display = 'flex'
})

var esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
var esAndroid = /android/i.test(navigator.userAgent)

function mostrarPasos(titulo, pasos) {
  document.getElementById('tituloInst').textContent = titulo
  document.getElementById('pasosInst').innerHTML = pasos.map(function (p) {
    return '<li>' + p + '</li>'
  }).join('')
  document.getElementById('instrucciones').classList.add('visible')
}

// Si el navegador soporta el instalador nativo, lo usamos.
if (!promptInstalar) {
  if (esIOS) {
    mostrarPasos('Instalar en iPhone', [
      'Toque el boton <b>Compartir</b> (el cuadro con la flecha hacia arriba).',
      'Baje hasta <b>Anadir a pantalla de inicio</b>.',
      'Toque <b>Anadir</b>.',
      'Abra la credencial desde el icono que quedo en su pantalla.'
    ])
  } else if (esAndroid) {
    mostrarPasos('Instalar en Android', [
      'Toque el menu de tres puntos (⋮) de su navegador.',
      'Elija <b>Instalar aplicacion</b> o <b>Añadir a pantalla de inicio</b>.',
      'Confirme en <b>Instalar</b>.',
      'Abra la credencial desde el icono que quedo en su pantalla.'
    ])
  } else {
    mostrarPasos('Instalar en este equipo', [
      'Abra el menu de su navegador.',
      'Elija <b>Instalar aplicacion</b>.',
      'Confirme en <b>Instalar</b>.'
    ])
  }
}

document.getElementById('btnInstalar').addEventListener('click', function () {
  if (promptInstalar) {
    instalando = true
    promptInstalar.prompt()
    promptInstalar.userChoice.then(function () { promptInstalar = null })
    return
  }
  var i = document.getElementById('instrucciones')
  i.classList.toggle('visible')
})

// --- Service worker: deja la credencial disponible sin internet ------
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('/cred/sw.js').catch(function () {})
}
</script>
</body>
</html>`
}

/* ------------------------------------------------------------------ */
/* Rutas                                                               */
/* ------------------------------------------------------------------ */

/**
 * Manifiesto de cada credencial, para que la app tenga su icono y su nombre.
 *
 * OJO: esta ruta va antes de `/:codigo`. Si se invirtiera, Express tomaria
 * "manifesto.json" como si fuera el codigo de una credencial.
 */
router.get('/manifesto.json', (req, res) => {
  const codigo = String(req.query.c || '').trim().toUpperCase()
  const cred = codigo ? credenciales.obtenerPorCodigo(codigo) : null
  const nombre = cred ? `${cred.nombres} ${cred.apellidos}`.trim() : 'Credencial'

  res.json({
    name: `Credencial ${nombre}`,
    short_name: cred ? cred.codigo : 'Credencial',
    description: 'Credencial de acceso',
    start_url: `/cred/${codigo || ''}`,
    scope: '/cred/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#050508',
    theme_color: '#00f0ff',
    icons: [
      { src: '/cred/icono-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/cred/icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/cred/icono-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  })
})

/** Raiz: explica que falta el codigo. */
router.get('/', (req, res) => {
  res.send(
    `<!doctype html><html lang="es"><head><meta charset="utf-8">
     <meta name="viewport" content="width=device-width,initial-scale=1">
     <title>Credencial</title></head>
     <body style="background:#050508;color:#fff;font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0;text-align:center;padding:20px">
     <div>
       <h1 style="font-size:17px;text-transform:uppercase;letter-spacing:.14em">Credencial de acceso</h1>
       <p style="color:#6b7280;font-size:13px">Abra el link que recibio por WhatsApp.</p>
     </div></body></html>`
  )
})

/**
 * GET /cred/:codigo
 * Pagina publica: el link de WhatsApp la abre el celular del trabajador,
 * sin sesion.
 *
 * Va AL FINAL a proposito: es la ruta que captura todo lo demas.
 */
router.get('/:codigo', (req, res) => {
  const codigo = String(req.params.codigo).trim().toUpperCase()
  const cred = credenciales.obtenerPorCodigo(codigo)

  if (!cred) {
    return res.status(404).send(
      `<!doctype html><html lang="es"><head><meta charset="utf-8">
       <meta name="viewport" content="width=device-width,initial-scale=1">
       <title>Credencial no encontrada</title></head>
       <body style="background:#050508;color:#fff;font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0;text-align:center;padding:20px">
       <div>
         <div style="font-size:40px">\u{1F6AB}</div>
         <h1 style="font-size:17px;text-transform:uppercase;letter-spacing:.14em">Credencial no encontrada</h1>
         <p style="color:#6b7280;font-size:13px">Revise el link o solicite una nueva credencial.</p>
       </div></body></html>`
    )
  }

  credenciales.registrarDescarga(codigo)

  const logo = dbConfig().logo || ''
  const datos = {
    cred: { ...cred, rut: cred.rut || cred.persona_rut || '' },
    logo,
    foto: cred.foto || '',
    qrUrl: credenciales.urlQr(),
  }

  // En el celu la credencial se dibuja con el papel de PANTALLA (19,5:9, el de
  // un Galaxy S22 Ultra), para que ocupe la pantalla completa sin franjas
  // vacias arriba ni abajo. El papel de 54 x 86 mm es el de la descarga para
  // la prensa.
  const frente = credencialSvg({ lado: 'frente', ...datos, papel: 'celular' }, 1080)
  const reverso = credencialSvg({ lado: 'reverso', ...datos, papel: 'celular' }, 1080)

  res.send(
    plantilla({
      frente,
      reverso,
      codigo: cred.codigo,
      empresa: cred.empresa,
      anulada: cred.estado === 'anulada',
    })
  )
})

/** Lee el logo guardado en la tabla config. */
function dbConfig() {
  const fila = db.prepare("SELECT valor FROM config WHERE clave = 'logo'").get()
  return { logo: fila?.valor || '' }
}

export default router