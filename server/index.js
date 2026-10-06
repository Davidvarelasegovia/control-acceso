/**
 * Servidor HTTP del Sistema de Control de Acceso.
 *
 *   node server/index.js
 *
 * - Expone la API REST en /api
 * - Sirve el build de produccion (dist/) si existe
 * - Escaneo: recibe un RUT, resuelve persona + servicio vigente y registra
 */
import express from 'express'
import cors from 'cors'
import { existsSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  db,
  sembrar,
  ahoraISO,
  plain,
  compactar,
  sincronizar,
  cerrarBase,
  modoJournal,
  tamanhoBase,
  importarPersonas,
} from './db.js'
import * as repo from './repo.js'
import { normalizar, clave as claveId } from './identificador.js'
import {
  getServicioActual,
  getEstadisticas,
  totalGlobalRegistros,
  totalDuplicados,
  generarServicioDesdeHorario,
  crearServicioManual,
  cerrarServicioActual,
  listarServicios,
  fechaISO,
} from './services.js'
import {
  rango,
  resumen,
  comparativa,
  porServicio,
  serieTemporal,
  flujoPorFranjas,
  serviciosConTotales,
} from './informes.js'
import * as credenciales from './credenciales.js'
import credRoutes from './cred-routes.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const PORT = process.env.PORT || 3001
const VENTANA_DUPLICADO_MIN = Number(process.env.VENTANA_DUPLICADO_MIN || 5)

import {
  iniciarSesion,
  cerrarSesion,
  usuarioDesdeToken,
  listarUsuarios,
  crearUsuario,
  actualizarUsuario,
  eliminarUsuario,
  listarAccesos,
  borrarAccesos,
  registrarAcceso,
  requiereAuth,
  requiereAdmin,
} from './auth.js'

sembrar()

/** Administrador inicial, solo si no existe ningun usuario. */
function sembrarUsuarioAdmin() {
  const total = db.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n
  if (total > 0) return

  crearUsuario({
    usuario: 'david',
    nombre: 'David',
    clave: '123456',
    rol: 'admin',
  })
  console.log('\n  Usuario administrador creado:  usuario "david"  contraseña "123456"')
  console.log('  Cámbiala desde el panel /admin > Usuarios.\n')
}

sembrarUsuarioAdmin()

const app = express()
app.use(cors())
/**
 * Limite del cuerpo de las peticiones.
 *
 * El frontend manda las imagenes (foto del trabajador, logo) dentro del mismo
 * JSON, en base64, no como archivo aparte. Base64 infla el archivo a un 33 % mas:
 * una foto de 3 MB se vuelve un JSON de 4 MB. Con el limite en 2 MB, el panel
 * aceptaba elegir el archivo y despues el servidor lo rechazaba con un 413 sin
 * mensaje, que es el peor sintoma posible porque en pantalla no dice nada.
 *
 * 8 MB deja subir tranquilamente los 3 MB que el panel permite, y de paso
 * aguanta la importacion masiva de Excel (el archivo se lee en el navegador y
 * solo viaja el texto, pero en una lista muy grande tambien suma).
 *
 * Si alguna vez se sube un archivo mas grande por la API, el error es de
 * Express, no del sistema: por eso el valor es holgado y no justo.
 */
app.use(express.json({ limit: '8mb' }))

const ok = (res, data) => res.json({ ok: true, data })
const fallo = (res, err) => {
  const status = err?.status || 500
  res.status(status).json({ ok: false, error: err?.message || 'Error interno' })
}

/**
 * Quien realizo la accion.
 * La pantalla principal funciona sin sesion, asi que varias rutas no exigen
 * token: en ese caso el usuario es "operador de puerta" y asi queda en la
 * bitacora, en vez de romper la operacion.
 */
function quien(req) {
  return {
    usuario: req.usuario?.usuario || 'operador de puerta',
    rol: req.usuario?.rol || 'operador',
  }
}

/* ------------------------------------------------------------------ */
/* Estado general (lo que consume la pantalla de escaneo)             */
/* ------------------------------------------------------------------ */

app.get('/api/estado', (req, res) => {
  try {
    const servicio = getServicioActual(new Date())
    ok(res, {
      servidor: true,
      hora_servidor: ahoraISO(),
      version: '1.0.0',
      venue: repo.getVenueConfig(),
      servicio,
      fuera_de_horario: !servicio,
      estadisticas: getEstadisticas(servicio?.id),
      total_global: totalGlobalRegistros(),
      total_duplicados: totalDuplicados(servicio?.id),
      personas: repo.listarPersonas({ soloActivos: true }).length,
    })
  } catch (e) {
    fallo(res, e)
  }
})

/* ------------------------------ Personas ------------------------------ */

app.get('/api/personas', (req, res) => {
  try {
    ok(res, repo.listarPersonas())
  } catch (e) {
    fallo(res, e)
  }
})

app.post('/api/personas', (req, res) => {
  try {
    const r = repo.crearPersona(req.body)
    registrarAcceso({
      ...quien(req),
      accion: `Agregó a ${r.nombres} ${r.apellidos}`,
      ruta: '/api/personas',
    })
    ok(res, r)
  } catch (e) {
    fallo(res, e)
  }
})

app.put('/api/personas/:id', (req, res) => {
  try {
    const r = repo.actualizarPersona(Number(req.params.id), req.body)
    if (!r) return res.status(404).json({ ok: false, error: 'Persona no encontrada' })
    ok(res, r)
  } catch (e) {
    fallo(res, e)
  }
})

app.delete('/api/personas/:id', (req, res) => {
  try {
    ok(res, { eliminado: repo.eliminarPersona(Number(req.params.id)) })
  } catch (e) {
    fallo(res, e)
  }
})

/**
 * Importacion masiva de personas.
 * Solo administradores: permite cargar listas de cientos o miles de filas.
 * Los identificadores repetidos se omiten y se reportan.
 */
app.post('/api/personas/importar', requiereAuth, requiereAdmin, (req, res) => {
  try {
    const filas = Array.isArray(req.body?.personas) ? req.body.personas : []

    if (filas.length === 0) {
      return res.status(400).json({ ok: false, error: 'No se recibió ninguna fila para importar' })
    }
    if (filas.length > 20000) {
      return res
        .status(400)
        .json({ ok: false, error: 'Máximo 20.000 filas por importación' })
    }

    const resultado = importarPersonas(filas)

    registrarAcceso({
      ...quien(req),
      accion: `Importó ${resultado.insertados} personas desde una planilla (omitió ${resultado.omitidos})`,
      ruta: '/api/personas/importar',
    })

    ok(res, resultado)
  } catch (e) {
    fallo(res, e)
  }
})

/* ------------------------------ Horarios ------------------------------ */

app.get('/api/horarios', (req, res) => {
  try {
    ok(res, repo.listarHorarios())
  } catch (e) {
    fallo(res, e)
  }
})

app.post('/api/horarios', (req, res) => {
  try {
    ok(res, repo.crearHorario(req.body))
  } catch (e) {
    fallo(res, e)
  }
})

app.put('/api/horarios/:id', (req, res) => {
  try {
    const r = repo.actualizarHorario(Number(req.params.id), req.body)
    if (!r) return res.status(404).json({ ok: false, error: 'Horario no encontrado' })
    ok(res, r)
  } catch (e) {
    fallo(res, e)
  }
})

app.delete('/api/horarios/:id', (req, res) => {
  try {
    ok(res, { eliminado: repo.eliminarHorario(Number(req.params.id)) })
  } catch (e) {
    fallo(res, e)
  }
})

/* ------------------------------ Servicios ----------------------------- */

app.get('/api/servicios', (req, res) => {
  try {
    ok(res, listarServicios(Number(req.query.limite) || 100))
  } catch (e) {
    fallo(res, e)
  }
})

/** Generar servicio manualmente desde un horario -> reinicia contadores. */
app.post('/api/servicios', (req, res) => {
  try {
    const { horario_id, nombre, fecha, hora_inicio, hora_fin } = req.body

    let servicio
    if (horario_id) {
      servicio = generarServicioDesdeHorario(Number(horario_id))
    } else {
      if (!nombre) return res.status(400).json({ ok: false, error: 'Falta el nombre del servicio' })
      servicio = crearServicioManual({
        nombre,
        fecha: fecha || fechaISO(new Date()),
        hora_inicio: hora_inicio || '00:00',
        hora_fin: hora_fin || '23:59',
      })
    }

    if (!servicio) return res.status(404).json({ ok: false, error: 'Horario no encontrado' })
    ok(res, { servicio, estadisticas: getEstadisticas(servicio.id) })
  } catch (e) {
    fallo(res, e)
  }
})

app.post('/api/servicios/cerrar', (req, res) => {
  try {
    ok(res, { servicio: cerrarServicioActual() })
  } catch (e) {
    fallo(res, e)
  }
})

/* ------------------------------ Registros ----------------------------- */

app.get('/api/registros', (req, res) => {
  try {
    let servicioId = req.query.servicio_id ? Number(req.query.servicio_id) : null
    // "actual" = servicio vigente; "todos" = historial completo
    if (req.query.servicio === 'actual') {
      servicioId = getServicioActual(new Date())?.id || -1
    }
    ok(res, repo.listarRegistros({ servicio_id: servicioId, limite: Number(req.query.limite) || 500 }))
  } catch (e) {
    fallo(res, e)
  }
})

app.delete('/api/registros/:id', (req, res) => {
  try {
    ok(res, { eliminado: repo.eliminarRegistro(Number(req.params.id)) })
  } catch (e) {
    fallo(res, e)
  }
})

/** Intentos de reingreso rechazados (duplicados). */
app.get('/api/eventos', (req, res) => {
  try {
    let servicioId = req.query.servicio_id ? Number(req.query.servicio_id) : null
    if (req.query.servicio === 'actual') {
      servicioId = getServicioActual(new Date())?.id || -1
    }
    ok(res, repo.listarEventos({ servicio_id: servicioId, limite: Number(req.query.limite) || 500 }))
  } catch (e) {
    fallo(res, e)
  }
})

/* ------------------------------ Informes ------------------------------ */

/**
 * Todo el bloque de informes es de SOLO LECTURA sobre datos que ya estan
 * guardados, asi que no pide credenciales: el jefe puede abrir el reporte
 * desde el mismo equipo de la puerta.
 */

/** Lee los filtros de la query y los pasa a los calculos de informes.js */
function filtroInforme(q) {
  return {
    desde: q.desde || null,
    hasta: q.hasta || null,
    servicio_id: q.servicio_id ? Number(q.servicio_id) : null,
    granularidad: ['dia', 'semana', 'mes'].includes(q.granularidad) ? q.granularidad : 'dia',
  }
}

/** Un solo endpoint con todo el dashboard, para no hacer 6 llamadas. */
app.get('/api/informes', (req, res) => {
  try {
    const f = filtroInforme(req.query)
    ok(res, {
      filtro: { ...f, ...rango(f) },
      resumen: resumen(f),
      comparativa: comparativa(f),
      porServicio: porServicio(f),
      serie: serieTemporal(f),
      flujo: flujoPorFranjas(f),
    })
  } catch (e) {
    fallo(res, e)
  }
})

/** Servicios con su total, para el selector "informe por servicio". */
app.get('/api/informes/servicios', (req, res) => {
  try {
    ok(res, serviciosConTotales(Number(req.query.limite) || 200))
  } catch (e) {
    fallo(res, e)
  }
})

/** Detalle de personas que pasaron en un servicio puntual (el caso del jefe). */
app.get('/api/informes/personas', (req, res) => {
  try {
    const servicioId = Number(req.query.servicio_id)
    if (!servicioId) {
      return res.status(400).json({ ok: false, error: 'Falta servicio_id' })
    }

    const servicio = db.prepare('SELECT * FROM servicios WHERE id = ?').get(servicioId)
    if (!servicio) {
      return res.status(404).json({ ok: false, error: 'Ese servicio no existe' })
    }

    const personas = repo.listarRegistros({ servicio_id: servicioId, limite: 20000 })

    ok(res, {
      servicio: plain(servicio),
      personas,
      total: personas.filter((p) => p.estado === 'autorizado').length,
      noEncontrados: personas.filter((p) => p.estado === 'no-encontrado').length,
    })
  } catch (e) {
    fallo(res, e)
  }
})

/* --------------------------- Credenciales ----------------------------- */

/**
 * Gestion de credenciales virtuales.
 *
 * Es un panel aparte, separado del menu de la puerta, asi que va con
 * credenciales de administrador.
 */

app.get('/api/credenciales', requiereAuth, requiereAdmin, (req, res) => {
  try {
    ok(res, {
      credenciales: credenciales.listar({
        estado: req.query.estado || null,
        limite: Number(req.query.limite) || 500,
      }),
      resumen: credenciales.resumen(),
      opciones: credenciales.OPCIONES,
    })
  } catch (e) {
    fallo(res, e)
  }
})

/**
 * URL del codigo QR del reverso.
 *
 * Va ANTES de `/api/credenciales/:id`: si no, Express la toma como si el
 * parametro fuera el id y Number('qr') da NaN.
 */
app.put('/api/credenciales/qr', requiereAuth, requiereAdmin, (req, res) => {
  try {
    const url = credenciales.guardarUrlQr(req.body?.url)
    sincronizar()

    registrarAcceso({
      ...quien(req),
      accion: `Cambio la URL del codigo QR a ${url}`,
      ruta: '/api/credenciales/qr',
    })

    ok(res, { qr_url: url })
  } catch (e) {
    fallo(res, e)
  }
})

app.get('/api/credenciales/:id', requiereAuth, requiereAdmin, (req, res) => {
  try {
    const c = credenciales.obtener(Number(req.params.id))
    if (!c) return res.status(404).json({ ok: false, error: 'Credencial no encontrada' })
    ok(res, { credencial: c, opciones: credenciales.OPCIONES })
  } catch (e) {
    fallo(res, e)
  }
})

app.post('/api/credenciales', requiereAuth, requiereAdmin, (req, res) => {
  try {
    const c = credenciales.crear(req.body)

    registrarAcceso({
      ...quien(req),
      accion: `Emitio la credencial ${c.codigo} de ${c.nombres} ${c.apellidos}`,
      ruta: '/api/credenciales',
    })

    ok(res, c)
  } catch (e) {
    fallo(res, e)
  }
})

app.put('/api/credenciales/:id', requiereAuth, requiereAdmin, (req, res) => {
  try {
    const antes = credenciales.obtener(Number(req.params.id))
    const c = credenciales.actualizar(Number(req.params.id), req.body)

    registrarAcceso({
      ...quien(req),
      accion: `Edito la credencial ${c.codigo} de ${c.nombres} ${c.apellidos}`,
      ruta: '/api/credenciales/:id',
    })

    void antes
    ok(res, c)
  } catch (e) {
    fallo(res, e)
  }
})

app.delete('/api/credenciales/:id', requiereAuth, requiereAdmin, (req, res) => {
  try {
    const id = Number(req.params.id)
    // Se lee antes de borrar: sin esto el log solo tendria el id y no se
    // podria saber que credencial salio de la base.
    const antes = credenciales.obtener(id)
    const r = credenciales.eliminar(id)

    registrarAcceso({
      ...quien(req),
      accion: antes
        ? `Elimino la credencial ${antes.codigo} de ${antes.nombres} ${antes.apellidos}`
        : `Elimino la credencial #${id}`,
      ruta: '/api/credenciales/:id',
    })

    ok(res, r)
  } catch (e) {
    fallo(res, e)
  }
})

app.post('/api/credenciales/:id/enviar', requiereAuth, requiereAdmin, (req, res) => {
  try {
    ok(res, credenciales.marcarEnviada(Number(req.params.id)))
  } catch (e) {
    fallo(res, e)
  }
})

/* ------------------------------- Escaneo ------------------------------ */

app.post('/api/escaneo', (req, res) => {
  try {
    const { rut, dispositivo = 'pantalla principal', hora = null } = req.body

    // SIN validacion: el identificador se busca tal cual en la base.
    // Solo se rechaza si viene completamente vacio.
    const id = String(rut ?? '').trim()
    if (!normalizar(id)) {
      return res.status(400).json({ ok: false, error: 'Ingrese un identificador' })
    }

    const momento = hora ? new Date(hora) : new Date()
    const servicio = getServicioActual(momento)

    // Primero se busca por identificador de persona (RUT o similar).
    let persona = repo.obtenerPersonaPorRut(id)

    // Si no aparece, se prueba con un codigo de credencial virtual: son 10
    // caracteres y pueden venir como "f894p45623" con cualquier capitalizacion.
    let credencialUsada = null
    if (!persona) {
      const cod = String(id).trim().toUpperCase()
      if (/^[A-Z0-9]{10}$/.test(cod)) {
        const cred = credenciales.obtenerPorCodigo(cod)
        if (cred) {
          if (cred.estado === 'anulada') {
            credencialUsada = { anulada: true, codigo: cod }
          } else {
            persona = credenciales.resolverPersona(cod)
            credencialUsada = persona ? cred : { sinPersona: true, codigo: cod }
          }
        }
      }
    }

    let estado
    let mensaje
    let detalle = null
    let accesoPrevio = null

    if (credencialUsada?.anulada) {
      estado = 'no-encontrado'
      mensaje = 'Credencial anulada'
      detalle = `La credencial ${credencialUsada.codigo} fue anulada y no permite el ingreso`
    } else if (credencialUsada?.sinPersona) {
      estado = 'no-encontrado'
      mensaje = 'Credencial sin persona asociada'
      detalle = `La credencial ${credencialUsada.codigo} no esta ligada a ninguna persona de la base`
    } else if (!persona) {
      estado = 'no-encontrado'
      mensaje = 'Persona no encontrada'
    } else {
      // La ventana anti-duplicado se reinicia en cada servicio.
      const previo = repo.ingresoEnServicio(persona.rut, servicio?.id)
      if (previo) {
        estado = 'duplicado'
        const donde = previo.dispositivo || 'otro punto de acceso'
        mensaje = 'Se repite el ingreso, no puede pasar'
        detalle = `Usted ya tiene registro en ${donde} durante este servicio`
        accesoPrevio = {
          dispositivo: previo.dispositivo,
          hora: previo.hora,
          estado: previo.estado,
        }
      } else {
        estado = 'autorizado'
        mensaje = 'Acceso Autorizado'
      }
    }

    let registro = null
    let evento = null

    if (estado === 'duplicado') {
      // El duplicado SE REGISTRA (queda constancia) pero NO suma al total.
      evento = repo.crearEvento({
        tipo: 'duplicado',
        servicio_id: servicio?.id ?? null,
        persona_id: persona?.id ?? null,
        nombres: `${persona.nombres} ${persona.apellidos}`,
        rut: persona.rut,
        dispositivo,
        acceso_previo: accesoPrevio?.dispositivo || '',
        hora: momento.toISOString(),
      })
    } else {
      registro = repo.crearRegistro({
        persona_id: persona?.id ?? null,
        servicio_id: servicio?.id ?? null,
        nombres: persona?.nombres ?? 'DESCONOCIDO',
        apellidos: persona?.apellidos ?? '',
        empresa: persona?.empresa ?? '',
        rut: persona?.rut ?? id,
        estado,
        hora: momento.toISOString(),
        dispositivo,
      })
    }

    ok(res, {
      resultado: estado,
      mensaje,
      detalle,
      accesoPrevio,
      persona,
      servicio,
      registro,
      evento,
      estadisticas: getEstadisticas(servicio?.id),
      total_duplicados: totalDuplicados(servicio?.id),
    })
  } catch (e) {
    fallo(res, e)
  }
})

/* ---------------------------- URLs de acceso -------------------------- */

app.get('/api/urls', (req, res) => {
  try {
    ok(res, repo.listarUrls())
  } catch (e) {
    fallo(res, e)
  }
})

app.post('/api/urls', (req, res) => {
  try {
    ok(res, repo.crearUrl(req.body))
  } catch (e) {
    fallo(res, e)
  }
})

app.put('/api/urls/:id', (req, res) => {
  try {
    const r = repo.actualizarUrl(Number(req.params.id), req.body)
    if (!r) return res.status(404).json({ ok: false, error: 'URL no encontrada' })
    ok(res, r)
  } catch (e) {
    fallo(res, e)
  }
})

app.delete('/api/urls/:id', (req, res) => {
  try {
    ok(res, { eliminado: repo.eliminarUrl(Number(req.params.id)) })
  } catch (e) {
    fallo(res, e)
  }
})

/* ------------------------------ Validacion --------------------------- */

/** Informativo: identificadores vacios o repetidos. No bloquea nada. */
app.get('/api/validar/ruts', requiereAuth, requiereAdmin, (req, res) => {
  try {
    const problemas = repo.auditarRuts()
    ok(res, { total: repo.listarPersonas().length, problemas })
  } catch (e) {
    fallo(res, e)
  }
})

/** Compara dos identificadores ignorando el digito verificador. */
app.post('/api/validar/rut', (req, res) => {
  try {
    const a = String(req.body?.a || '')
    const b = String(req.body?.b || '')
    ok(res, {
      a: { valor: a, clave: claveId(a) },
      b: { valor: b, clave: claveId(b) },
      coinciden: claveId(a) !== '' && claveId(a) === claveId(b),
    })
  } catch (e) {
    fallo(res, e)
  }
})

/* --------------------------- Base de datos ---------------------------- */

/** Compacta el .db para poder abrirlo/copiarlo con DB Browser o DBeaver. */
app.post('/api/admin/compactar', requiereAuth, requiereAdmin, (req, res) => {
  try {
    ok(res, compactar())
  } catch (e) {
    fallo(res, e)
  }
})

/** Estado real de la base: modo de escritura, tamaño y cuando se escribio. */
app.get('/api/admin/estado-db', requiereAuth, requiereAdmin, (req, res) => {
  try {
    const conteos = {}
    for (const t of ['personas', 'registros', 'eventos', 'servicios', 'horarios', 'urls_acceso']) {
      conteos[t] = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n
    }
    sincronizar()
    ok(res, {
      archivo: 'data/control-acceso.db',
      journal_mode: modoJournal(),
      bytes: tamanhoBase(),
      conteos,
    })
  } catch (e) {
    fallo(res, e)
  }
})

/* ------------------------------ Autenticacion ------------------------- */

/** Ingreso al sistema. */
app.post('/api/auth/login', (req, res) => {
  try {
    ok(res, iniciarSesion(req.body?.usuario, req.body?.clave))
  } catch (e) {
    fallo(res, e)
  }
})

app.post('/api/auth/logout', requiereAuth, (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    registrarAcceso({
      usuario: req.usuario.usuario,
      rol: req.usuario.rol,
      accion: 'Cierre de sesión',
      ruta: '/api/auth/logout',
    })
    ok(res, { cerrado: cerrarSesion(token) })
  } catch (e) {
    fallo(res, e)
  }
})

/** Quien esta conectado. */
app.get('/api/auth/yo', requiereAuth, (req, res) => {
  try {
    ok(res, req.usuario)
  } catch (e) {
    fallo(res, e)
  }
})

/* --------------------- Usuarios (solo administrador) ------------------ */

app.get('/api/auth/usuarios', requiereAuth, requiereAdmin, (req, res) => {
  try {
    ok(res, listarUsuarios())
  } catch (e) {
    fallo(res, e)
  }
})

app.post('/api/auth/usuarios', requiereAuth, requiereAdmin, (req, res) => {
  try {
    const nuevo = crearUsuario(req.body)
    registrarAcceso({
      usuario: req.usuario.usuario,
      rol: req.usuario.rol,
      accion: `Creó el usuario "${nuevo.usuario}" (${nuevo.rol})`,
      ruta: '/api/auth/usuarios',
    })
    ok(res, nuevo)
  } catch (e) {
    fallo(res, e)
  }
})

app.put('/api/auth/usuarios/:id', requiereAuth, requiereAdmin, (req, res) => {
  try {
    const r = actualizarUsuario(Number(req.params.id), req.body)
    if (!r) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' })

    registrarAcceso({
      usuario: req.usuario.usuario,
      rol: req.usuario.rol,
      accion: `Modificó el usuario "${r.usuario}"`,
      ruta: '/api/auth/usuarios',
    })
    ok(res, r)
  } catch (e) {
    fallo(res, e)
  }
})

app.delete('/api/auth/usuarios/:id', requiereAuth, requiereAdmin, (req, res) => {
  try {
    const eliminado = eliminarUsuario(Number(req.params.id))
    registrarAcceso({
      usuario: req.usuario.usuario,
      rol: req.usuario.rol,
      accion: `Eliminó el usuario #${req.params.id}`,
      ruta: '/api/auth/usuarios',
    })
    ok(res, { eliminado })
  } catch (e) {
    fallo(res, e)
  }
})

/* ------------------ Bitacora de ingresos (solo admin) ----------------- */

app.get('/api/auth/accesos', requiereAuth, requiereAdmin, (req, res) => {
  try {
    ok(res, listarAccesos(Number(req.query.limite) || 300))
  } catch (e) {
    fallo(res, e)
  }
})

app.delete('/api/auth/accesos', requiereAuth, requiereAdmin, (req, res) => {
  try {
    const borrados = borrarAccesos()
    registrarAcceso({
      usuario: req.usuario.usuario,
      rol: req.usuario.rol,
      accion: 'Borró la bitácora de ingresos',
      ruta: '/api/auth/accesos',
    })
    ok(res, { borrados })
  } catch (e) {
    fallo(res, e)
  }
})

/* ------------------------------- Admin -------------------------------- */

/**
 * Consola SQL de solo lectura.
 * Permite explorar la base de datos desde el navegador sin riskingla:
 * cualquier sentencia que no sea SELECT o PRAGMA se rechaza.
 */
app.post('/api/admin/sql', requiereAuth, requiereAdmin, (req, res) => {
  try {
    const sql = String(req.body?.sql || '').trim()

    if (!sql) return res.status(400).json({ ok: false, error: 'Consulta vacía' })

    // Solo lectura
    const cabecera = sql.replace(/^\s*(--[^\n]*\n|\/\*[\s\S]*?\*\/|\s)*/i, '').trimStart()
    const permitida = /^(select|pragma|with)\b/i.test(cabecera)
    const peligrosa = /\b(insert|update|delete|drop|alter|create|replace|attach|detach|vacuum|reindex|pragma\s+\w+\s*=)\b/i.test(
      sql
    )

    if (!permitida || peligrosa) {
      return res.status(400).json({
        ok: false,
        error: 'Solo se permiten consultas de lectura (SELECT, WITH, PRAGMA de lectura)',
      })
    }

    const filas = db.prepare(sql).all()

    ok(res, {
      filas: filas.length,
      columnas: filas.length ? Object.keys(filas[0]) : [],
      datos: filas.slice(0, 500),
    })
  } catch (e) {
    fallo(res, e)
  }
})

/* ------------------------------- Config ------------------------------- */

/** Lee una clave suelta de la tabla config. */
function leerConfig(clave, porDefecto = '') {
  const fila = db.prepare('SELECT valor FROM config WHERE clave = ?').get(clave)
  return fila?.valor ?? porDefecto
}

app.get('/api/config', (req, res) => {
  try {
    ok(res, {
      venue: repo.getVenueConfig(),
      menu: repo.getMenuItems(),
      // Ajustes del panel de credenciales
      logo: leerConfig('logo'),
      qr_url: credenciales.urlQr(),
    })
  } catch (e) {
    fallo(res, e)
  }
})

/**
 * Claves sueltas de configuracion que tambien se guardan aqui.
 *
 * El logo de las credenciales y la URL del codigo QR viven en la tabla config
 * como valores simples. Antes esta ruta solo aceptaba `venue` y `menu`, asi
 * que el logo se enviaba y se ignoraba en silencio.
 */
const CLAVES_CONFIG = new Set(['logo', 'qr_url'])

app.put('/api/config', (req, res) => {
  try {
    const { venue, menu, ...resto } = req.body || {}

    if (venue) repo.saveVenueConfig(venue)
    if (menu) repo.saveMenuItems(menu)

    const guardadas = {}
    for (const [clave, valor] of Object.entries(resto)) {
      if (!CLAVES_CONFIG.has(clave)) continue
      if (valor === null || valor === '') {
        db.prepare('DELETE FROM config WHERE clave = ?').run(clave)
        guardadas[clave] = ''
      } else {
        db
          .prepare('INSERT INTO config (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor')
          .run(clave, String(valor))
        guardadas[clave] = String(valor)
      }
    }

    if (Object.keys(guardadas).length) sincronizar()

    ok(res, {
      venue: repo.getVenueConfig(),
      menu: repo.getMenuItems(),
      config: guardadas,
    })
  } catch (e) {
    fallo(res, e)
  }
})

/* ------------------------ Sincronizacion offline ---------------------- */

app.post('/api/sync', (req, res) => {
  try {
    const cola = req.body?.cola || []
    let aplicados = 0
    let rechazados = 0
    const detalleRechazos = []

    const ins = db.prepare(
      'INSERT INTO registros (persona_id, servicio_id, nombres, apellidos, empresa, rut, estado, hora, dispositivo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )

    const insEvento = db.prepare(
      `INSERT INTO eventos
        (tipo, servicio_id, persona_id, nombres, rut, dispositivo, acceso_previo, hora, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )

    for (const item of cola) {
      // Sin validacion: se busca el identificador tal cual
      const id = String(item.rut ?? '').trim()
      if (!normalizar(id)) {
        rechazados++
        detalleRechazos.push({ rut: item.rut, motivo: 'Identificador vacío' })
        continue
      }

      const p = repo.obtenerPersonaPorRut(id)
      const servicio = item.servicio_id
        ? plain(db.prepare('SELECT * FROM servicios WHERE id = ?').get(item.servicio_id))
        : getServicioActual(item.hora ? new Date(item.hora) : new Date())

      if (item.es_evento || item.estado === 'duplicado') {
        // Duplicado -> tabla eventos (se registra pero NO suma al total)
        insEvento.run(
          'duplicado',
          item.servicio_id ?? servicio?.id ?? null,
          p?.id ?? null,
          [p?.nombres, p?.apellidos].filter(Boolean).join(' ') || 'DESCONOCIDO',
          p?.rut || id,
          item.dispositivo || '',
          item.acceso_previo || '',
          item.hora || ahoraISO(),
          ahoraISO()
        )
      } else {
        ins.run(
          p?.id ?? null,
          item.servicio_id ?? servicio?.id ?? null,
          item.nombres || p?.nombres || 'DESCONOCIDO',
          item.apellidos || p?.apellidos || '',
          item.empresa || p?.empresa || '',
          p?.rut || id,
          item.estado,
          item.hora || ahoraISO(),
          item.dispositivo || '',
          ahoraISO()
        )
      }
      aplicados++
    }

    const servicio = getServicioActual(new Date())
    ok(res, {
      aplicados,
      rechazados,
      detalle_rechazos: detalleRechazos,
      servicio,
      estadisticas: getEstadisticas(servicio?.id),
      total_global: totalGlobalRegistros(),
    })
  } catch (e) {
    fallo(res, e)
  }
})

/* ------------------------ Pagina de credencial ------------------------ */

/**
 * El link que se manda por WhatsApp abre /cred/CODIGO.
 *
 * Va ANTES del build estatico a proposito: es una pagina del servidor, no de
 * React, asi que el celular la puede abrir aunque el frontend este caido. Es
 * ademas publica: no pide sesion, porque la abre el trabajador.
 */
app.use('/cred', credRoutes)

/* --------------------- Build estatico (produccion) --------------------- */

const DIST = join(ROOT, 'dist')
if (existsSync(DIST)) {
  app.use(express.static(DIST))
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(join(DIST, 'index.html')))
}

/* ------------------------------ Arranque ------------------------------ */

/**
 * Escucha en todas las interfaces (0.0.0.0), no solo en localhost.
 *
 * Asi el celular, que esta en la misma red Wi-Fi, puede abrir el link de la
 * credencial para probarla. Con el default de Node solo escuchaba en loopback
 * y la IP de la red daba conexion rechazada.
 */
app.listen(PORT, '0.0.0.0', () => {
  const url = `http://localhost:${PORT}`
  console.log(`\n  Control de Acceso - API y servidor`)
  console.log(`  -> ${url}`)
  console.log(`  -> API: ${url}/api/estado`)
  console.log(`  -> BD:  ${process.env.DB_PATH || 'data/control-acceso.db'}`)

  // IP de la red local, para probar desde el celular
  const redes = Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address)

  if (redes.length) {
    console.log(`  -> Celular: http://${redes[0]}:${PORT}  (misma red Wi-Fi)`)
  } else {
    console.log('  -> Celular: no se detecto IP de red local')
  }
  console.log('')
})
