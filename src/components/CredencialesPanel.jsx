import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../utils/api'
import CredencialCard from './CredencialCard'
import { generarImagen, descargar, nombreArchivo } from './generarCredencialImagen'
import { altoDe, PAPELES } from '../../shared/credencialSvg.js'

/**
 * Panel de Credenciales.
 *
 * Pagina independiente, separada del menu de la puerta. Solo se ocupa de
 * emitir credenciales virtuales:
 *
 *   - genera un codigo de 10 caracteres ligado al RUT del trabajador
 *   - muestra el frente y el reverso de la credencial
 *   - logo de la empresa y foto del trabajador, editables
 *   - envia la credencial por WhatsApp con un link de descarga
 *   - el link instala la credencial como aplicacion en Android e iPhone
 */

const OPCIONES_VACIAS = { autorizaciones: [], licencias: [], vehiculos: [] }

/**
 * Resoluciones para descargar la credencial como imagen.
 *
 * Hay dos papeles y cada uno tiene lo suyo: la **credencial** de 54 x 86 mm para
 * la prensa, y la **pantalla del celular** (Galaxy S22 Ultra, 19,5:9) para que
 * al abrirla ocupe el telefono entero. Los DPI salen del ancho de la credencial
 * de 54 mm; la prensa de sublimacion trabaja entre 300 y 600, asi que "Alta" es
 * la recomendada para imprimir.
 */
const ANCHO_BASE = 1200
const MM_ANCHO_CRED = 54

const RESOLUCIONES = [
  { id: 'normal', escala: 0.5, nombre: 'Media' },
  { id: 'alta', escala: 1, nombre: 'Alta' },
  { id: 'maxima', escala: 1.5, nombre: 'Máxima' },
].map((r) => ({
  ...r,
  ancho: Math.round(ANCHO_BASE * r.escala),
  dpi: Math.round((ANCHO_BASE * r.escala * 25.4) / MM_ANCHO_CRED),
}))

/** Etiqueta de una resolución, para el papel que se elija. */
function textoResolucion(papel, r) {
  const ancho = Math.round(ANCHO_BASE * r.escala)
  const alto = altoDe(papel, ancho)
  const dpi = Math.round((ancho * 25.4) / MM_ANCHO_CRED)
  return `${r.nombre} · ${ancho} × ${alto} px${papel === 'credencial' ? ` (${dpi} dpi)` : ''}`
}

export default function CredencialesPanel({ usuario, onSalir }) {
  const navigate = useNavigate()
  const archivoRef = useRef(null)

  const [lista, setLista] = useState([])
  const [resumen, setResumen] = useState(null)
  const [opciones, setOpciones] = useState(OPCIONES_VACIAS)
  const [personas, setPersonas] = useState([])
  const [config, setConfig] = useState({ logo: '', qr_url: '', empresa: '', pie: '' })

  const [seleccion, setSeleccion] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  // Descarga como imagen: un papel para la prensa y otro para el celular.
  const [generando, setGenerando] = useState('')
  const [papel, setPapel] = useState('credencial')
  const [resolucion, setResolucion] = useState('alta')

  // Borrador del formulario
  const [borrador, setBorrador] = useState({
    persona_id: '',
    nombres: '',
    apellidos: '',
    rut: '',
    empresa: '',
    cargo: '',
    telefono: '',
    foto: '',
    autorizaciones: [],
    // Tres casillas libres para escribir autorizaciones a medida.
    // El texto va aparte para poder editarlo sin perder las casillas.
    autorizacionesLibres: ['', '', ''],
    licencias: [],
    licenciasLibres: ['', '', ''],
    vehiculos: [],
    vehiculosLibres: ['', '', ''],
    vigente_desde: new Date().toISOString().slice(0, 10),
    vigente_hasta: '',
    notas: '',
  })

  /* ------------------------------------------------------------------ */
  /* Carga                                                              */
  /* ------------------------------------------------------------------ */

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const [d, p, cfg] = await Promise.all([
        api.credenciales(),
        api.personas(),
        api.config(),
      ])
      setLista(d.credenciales)
      setResumen(d.resumen)
      setOpciones(d.opciones)
      setPersonas(p)
      setConfig({
        logo: cfg.logo || '',
        qr_url: cfg.qr_url || '',
        empresa: cfg.venue?.nombre || cfg.empresa_nombre || '',
        pie: cfg.venue?.direccion || cfg.empresa_pie || '',
      })
      setError('')
    } catch (e) {
      setError(e.offline ? 'Sin conexión con el servidor.' : e.message)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(''), 4000)
    return () => clearTimeout(t)
  }, [aviso])

  /* ------------------------------------------------------------------ */
  /* Edicion                                                            */
  /* ------------------------------------------------------------------ */

  const setCampo = (campo, valor) => setBorrador((b) => ({ ...b, [campo]: valor }))

  const alternar = (campo, valor) =>
    setBorrador((b) => ({
      ...b,
      [campo]: b[campo].includes(valor)
        ? b[campo].filter((x) => x !== valor)
        : [...b[campo], valor],
    }))

  const nuevo = () => {
    setSeleccion(null)
    setBorrador({
      persona_id: '',
      nombres: '',
      apellidos: '',
      rut: '',
      empresa: config.empresa || '',
      cargo: '',
      telefono: '',
      foto: '',
      autorizaciones: ['Acceso general'],
      autorizacionesLibres: ['', '', ''],
      licencias: [],
      licenciasLibres: ['', '', ''],
      vehiculos: [],
      vehiculosLibres: ['', '', ''],
      vigente_desde: new Date().toISOString().slice(0, 10),
      vigente_hasta: '',
      notas: '',
    })
    setError('')
  }

  /** Las autorizaciones fijas son las que vienen del servidor; el resto
   *  son las que el usuario escribio a mano. */
  const separarAutorizaciones = (lista = [], fijas = []) => {
    const libres = lista.filter((a) => !fijas.includes(a))
    return [...libres, '', '', ''].slice(0, 3)
  }

  const editar = (c) => {
    setSeleccion(c)
    setBorrador({
      persona_id: c.persona_id || '',
      nombres: c.nombres || '',
      apellidos: c.apellidos || '',
      rut: c.rut || c.persona_rut || '',
      empresa: c.empresa || '',
      cargo: c.cargo || '',
      telefono: c.telefono || '',
      foto: c.foto || '',
      autorizaciones: c.autorizaciones?.filter((a) => opciones.autorizaciones.includes(a)) || [],
      autorizacionesLibres: separarAutorizaciones(
        c.autorizaciones || [],
        opciones.autorizaciones
      ),
      licencias: c.licencias?.filter((l) => opciones.licencias.includes(l)) || [],
      licenciasLibres: separarAutorizaciones(c.licencias || [], opciones.licencias),
      vehiculos: c.vehiculos?.filter((v) => opciones.vehiculos.includes(v)) || [],
      vehiculosLibres: separarAutorizaciones(c.vehiculos || [], opciones.vehiculos),
      vigente_desde: c.vigente_desde || '',
      vigente_hasta: c.vigente_hasta || '',
      notas: c.notas || '',
    })
    setError('')
  }

  /** Al elegir una persona de la base, se copian sus datos. */
  const elegirPersona = (id) => {
    const p = personas.find((x) => String(x.id) === String(id))
    if (!p) {
      setCampo('persona_id', '')
      return
    }
    setBorrador((b) => ({
      ...b,
      persona_id: p.id,
      nombres: p.nombres,
      apellidos: p.apellidos,
      rut: p.rut,
      empresa: p.empresa || b.empresa,
    }))
  }

  /* ------------------------------------------------------------------ */
  /* Logo y foto                                                        */
  /* ------------------------------------------------------------------ */

  const leerImagen = (archivo, destino) => {
    if (!archivo) return
    if (archivo.size > 3 * 1024 * 1024) {
      setError('La imagen es muy grande. Use una de menos de 3 MB.')
      return
    }
    const lector = new FileReader()
    lector.onload = () => setCampo(destino, lector.result)
    lector.onerror = () => setError('No se pudo leer la imagen')
    lector.readAsDataURL(archivo)
  }

  /** Lee un archivo como data URL, para mandarlo al servidor. */
  const leerComoBase64 = (archivo) =>
    new Promise((resolver, rechazar) => {
      const lector = new FileReader()
      lector.onload = () => resolver(lector.result)
      lector.onerror = () => rechazar(new Error('no se pudo leer el archivo'))
      lector.readAsDataURL(archivo)
    })

  /** El logo se guarda en la configuracion general y aplica a todas. */
  const subirLogo = async (archivo) => {
    if (!archivo) return
    if (archivo.size > 3 * 1024 * 1024) {
      setError('El logo es muy grande. Use un PNG de menos de 3 MB.')
      return
    }
    try {
      const base64 = await leerComoBase64(archivo)
      await api.guardarConfig({ logo: base64 })
      setConfig((c) => ({ ...c, logo: base64 }))
      setAviso('Logo actualizado. Se aplica a todas las credenciales.')
    } catch (e) {
      setError(`No se pudo subir el logo: ${e.message}`)
    }
  }

  /** Guarda la URL del codigo QR del reverso. */
  const guardarQr = async (url) => {
    try {
      const r = await api.guardarUrlQr(url)
      setConfig((c) => ({ ...c, qr_url: r.qr_url }))
      setAviso('URL del código QR actualizada')
    } catch (e) {
      setError(`No se pudo guardar la URL: ${e.message}`)
    }
  }

  const limpiarFoto = () => setCampo('foto', '')

  /* ------------------------------------------------------------------ */
  /* Guardar                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * Arma lo que se manda al servidor: las casillas fijas mas lo que se
   * escribio a mano, sin repetidas y sin vacias.
   */
  const datosParaGuardar = () => {
    const juntar = (fijas, libres) => {
      const escritas = (libres || [])
        .map((t) => String(t || '').trim())
        .filter(Boolean)
      return [...new Set([...fijas, ...escritas])]
    }

    const {
      autorizacionesLibres,
      licenciasLibres,
      vehiculosLibres,
      ...resto
    } = borrador

    return {
      ...resto,
      autorizaciones: juntar(borrador.autorizaciones, autorizacionesLibres),
      licencias: juntar(borrador.licencias, licenciasLibres),
      vehiculos: juntar(borrador.vehiculos, vehiculosLibres),
    }
  }

  const guardar = async () => {
    setGuardando(true)
    setError('')
    try {
      const datos = datosParaGuardar()

      if (seleccion) {
        const actualizada = await api.actualizarCredencial(seleccion.id, datos)
        setSeleccion(actualizada)
        setAviso(`Credencial ${actualizada.codigo} actualizada`)
      } else {
        const creada = await api.crearCredencial(datos)
        setSeleccion(creada)
        setBorrador((b) => ({
          ...b,
          ...creada,
          autorizaciones: creada.autorizaciones?.filter((a) =>
            opciones.autorizaciones.includes(a)
          ) || [],
          autorizacionesLibres: separarAutorizaciones(
            creada.autorizaciones || [],
            opciones.autorizaciones
          ),
          licencias: creada.licencias?.filter((l) => opciones.licencias.includes(l)) || [],
          licenciasLibres: separarAutorizaciones(creada.licencias || [], opciones.licencias),
          vehiculos: creada.vehiculos?.filter((v) => opciones.vehiculos.includes(v)) || [],
          vehiculosLibres: separarAutorizaciones(creada.vehiculos || [], opciones.vehiculos),
        }))
        setAviso(`Credencial ${creada.codigo} creada`)
      }
      await cargar()
    } catch (e) {
      setError(e.message)
    } finally {
      setGuardando(false)
    }
  }

  const eliminar = async (c) => {
    if (!confirm(`¿Eliminar la credencial ${c.codigo} de ${c.nombres} ${c.apellidos}?`)) return
    try {
      await api.eliminarCredencial(c.id)
      if (seleccion?.id === c.id) nuevo()
      setAviso(`Credencial ${c.codigo} eliminada`)
      await cargar()
    } catch (e) {
      setError(e.message)
    }
  }

  /* ------------------------------------------------------------------ */
  /* Envio y descarga                                                   */
  /* ------------------------------------------------------------------ */

  const baseUrl = useMemo(() => `${window.location.origin}/cred/`, [])

  const linkDescarga = (codigo) => `${baseUrl}${codigo}`

  const enviarWhatsApp = async () => {
    if (!seleccion) return
    const c = seleccion
    const texto =
      `Hola ${c.nombres}, tu credencial de acceso esta lista.\n\n` +
      `Descargala e instalala en tu celular:\n${linkDescarga(c.codigo)}\n\n` +
      `Presenta el codigo de barras en la entrada.`

    const telefono = borrador.telefono?.replace(/\D/g, '')
    const url = telefono
      ? `https://wa.me/${telefono}?text=${encodeURIComponent(texto)}`
      : `https://wa.me/?text=${encodeURIComponent(texto)}`

    window.open(url, '_blank')
    try {
      await api.marcarCredencialEnviada(c.id)
      await cargar()
      setAviso('WhatsApp abierto con el mensaje listo')
    } catch {
      /* no es critico */
    }
  }

  const imprimir = () => {
    // El PDF se arma con los datos que ya estan en pantalla
    window.print()
  }

  const copiarLink = async () => {
    try {
      await navigator.clipboard.writeText(linkDescarga(seleccion.codigo))
      setAviso('Link copiado al portapapeles')
    } catch {
      setError('No se pudo copiar. Copia el link a mano.')
    }
  }

  const previsualizarDescarga = () => {
    window.open(linkDescarga(seleccion.codigo), '_blank')
  }

  /* ------------------------------------------------------------------ */
  /* Descarga como imagen                                               */
  /* ------------------------------------------------------------------ */

  /** Escala del selector de resolucion (1 = 1200 px de ancho). */
  const escalaElegida = () => RESOLUCIONES.find((r) => r.id === resolucion)?.escala ?? 1

  /** Nombre del archivo, con el papel para no pisarse entre las dos descargas. */
  const nombreConPapel = (cred, lado) =>
    nombreArchivo(cred, papel === 'credencial' ? lado : `${lado}-celular`)

  /**
   * Baja una cara de la credencial en PNG.
   *
   * Se dibuja en un canvas, no se captura la pantalla: el archivo sale a miles
   * de pixeles y con bordes limpios, que es lo que necesita una prensa de
   * sublimacion, una imprenta, o que se vea nitido en el celular.
   */
  const bajar = async (lado) => {
    if (!seleccion) {
      setError('Primero guarde la credencial para poder descargarla')
      return
    }

    setGenerando(lado)
    setError('')
    try {
      // Se manda lo que hay en pantalla para que el PNG salga igual a la vista
      // previa, sin tener que guardar antes.
      const cred = credencialParaImagen()
      const dataUrl = await generarImagen({
        lado,
        cred,
        logo: config.logo,
        foto: cred.foto,
        qrUrl: config.qr_url,
        escala: escalaElegida(),
        papel,
      })

      descargar(dataUrl, nombreConPapel(cred, lado))
      setAviso(`Imagen ${lado} (${PAPELES[papel].nombre.toLowerCase()}) descargada`)
    } catch (e) {
      setError('No se pudo generar la imagen: ' + e.message)
    } finally {
      setGenerando('')
    }
  }

  /** Las dos caras. Van separadas porque el navegador a veces cancela la
   *  segunda descarga si salen las dos en el mismo instante. */
  const bajarAmbas = async () => {
    if (!seleccion) {
      setError('Primero guarde la credencial para poder descargarla')
      return
    }

    setGenerando('ambas')
    setError('')
    try {
      const cred = credencialParaImagen()
      const escala = escalaElegida()

      const frente = await generarImagen({
        lado: 'frente',
        cred,
        logo: config.logo,
        foto: cred.foto,
        qrUrl: config.qr_url,
        escala,
        papel,
      })
      descargar(frente, nombreConPapel(cred, 'frente'))

      await new Promise((r) => setTimeout(r, 400))

      const reverso = await generarImagen({
        lado: 'reverso',
        cred,
        logo: config.logo,
        foto: cred.foto,
        qrUrl: config.qr_url,
        escala,
        papel,
      })
      descargar(reverso, nombreConPapel(cred, 'reverso'))

      setAviso(`Las dos caras (${PAPELES[papel].nombre.toLowerCase()}) quedaron descargadas`)
    } catch (e) {
      setError('No se pudieron generar las imagenes: ' + e.message)
    } finally {
      setGenerando('')
    }
  }

  /* ------------------------------------------------------------------ */
  /* Render                                                             */
  /* ------------------------------------------------------------------ */

  /** Junta las casillas fijas con lo escrito a mano, sin repetir ni vacios. */
  const juntar = (fijas, libres) => [
    ...new Set([
      ...(fijas || []),
      ...(libres || []).map((t) => String(t || '').trim()).filter(Boolean),
    ]),
  ]

  /** Lo que se ve en la tarjeta: lo del formulario mas lo escrito a mano. */
  const credencialVisible = {
    ...borrador,
    codigo: seleccion ? seleccion.codigo : 'NUEVO0000',
    autorizaciones: juntar(borrador.autorizaciones, borrador.autorizacionesLibres),
    licencias: juntar(borrador.licencias, borrador.licenciasLibres),
    vehiculos: juntar(borrador.vehiculos, borrador.vehiculosLibres),
  }

  /**
   * Lo que se manda al generador de imagenes: igual que la vista previa pero
   * sin los campos `*Libres`, que ya quedaron juntados en las listas.
   */
  const credencialParaImagen = () => {
    const {
      autorizacionesLibres,
      licenciasLibres,
      vehiculosLibres,
      ...resto
    } = credencialVisible
    return {
      ...resto,
      empresa: borrador.empresa || config.empresa || 'Acceso',
      vigente_desde: borrador.vigente_desde || '',
      vigente_hasta: borrador.vigente_hasta || '',
    }
  }

  return (
    <div className="min-h-screen bg-gamer-darker">
      {/* Cabecera */}
      <header className="sticky top-0 z-40 bg-gamer-darker/90 backdrop-blur-md border-b border-gamer-light-gray/30 no-print">
        <div className="max-w-[1600px] mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')} className="gamer-btn p-2" title="Volver al sistema">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-base font-bold text-white tracking-wider uppercase">
                Credenciales Virtuales
              </h1>
              <p className="text-xs text-gray-400">
                {usuario ? `${usuario.nombre} · ` : ''}Emisión, impresión y envío por WhatsApp
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={nuevo} className="gamer-btn text-sm">
              + Nueva credencial
            </button>
            {usuario && (
              <button onClick={onSalir} className="gamer-btn-danger text-sm">
                Cerrar sesión
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto p-6 space-y-6">
        {error && (
          <div className="gamer-card p-4 border-gamer-danger/50 bg-gamer-danger/5 text-gamer-danger text-sm no-print">
            {error}
          </div>
        )}
        {aviso && (
          <div className="gamer-card p-3 border-gamer-success/50 bg-gamer-success/5 text-gamer-success text-sm no-print">
            {aviso}
          </div>
        )}

        {/* Resumen */}
        {resumen && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 no-print">
            <Mini valor={resumen.total} texto="Emitidas" color="text-white" />
            <Mini valor={resumen.emitidas} texto="Vigentes" color="text-gamer-success" />
            <Mini valor={resumen.anuladas} texto="Anuladas" color="text-gamer-danger" />
            <Mini valor={resumen.enviadas} texto="Enviadas" color="text-gamer-accent" />
            <Mini valor={resumen.sinPersona} texto="Sin persona en BD" color="text-gamer-warning" />
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr_380px] gap-6">
          {/* ------------------------- Lista ------------------------- */}
          <div className="gamer-card p-4 no-print xl:max-h-[calc(100vh-220px)] xl:overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs uppercase tracking-wider text-gray-400">
                Credenciales ({lista.length})
              </h2>
              <button onClick={cargar} className="text-xs text-gamer-accent hover:text-white">
                Actualizar
              </button>
            </div>

            {cargando ? (
              <p className="text-sm text-gray-500 py-6 text-center">Cargando…</p>
            ) : lista.length === 0 ? (
              <p className="text-sm text-gray-500 py-6 text-center">
                Todavia no hay credenciales.
                <br />
                Use “+ Nueva credencial”.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {lista.map((c) => (
                  <li key={c.id} className="group relative">
                    <button
                      onClick={() => editar(c)}
                      className={`w-full text-left px-3 py-2 rounded-lg border transition-colors pr-10 ${
                        seleccion?.id === c.id
                          ? 'bg-gamer-accent/15 border-gamer-accent/50'
                          : 'bg-gamer-darker/50 border-gamer-light-gray/30 hover:border-gamer-accent/30'
                      }`}
                    >
                      {/* El padding extra deja libre la esquina del boton de borrar */}
                      <div className="flex items-center justify-between gap-2 pr-7">
                        <span className="text-sm text-white font-medium truncate">
                          {c.nombres} {c.apellidos}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                            c.estado === 'anulada'
                              ? 'bg-gamer-danger/20 text-gamer-danger'
                              : 'bg-gamer-success/15 text-gamer-success'
                          }`}
                        >
                          {c.estado}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <span className="text-xs text-gray-400 font-mono">{c.codigo}</span>
                        <span className="text-[10px] text-gray-500">
                          {c.enviada_whats ? '📱 enviada' : `${c.descargas} desc.`}
                        </span>
                      </div>
                    </button>

                    {/* Borrar esa credencial, sin abrirla antes */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        eliminar(c)
                      }}
                      title={`Eliminar la credencial ${c.codigo}`}
                      className="absolute right-2 top-2 w-7 h-7 rounded-md flex items-center justify-center
                                 bg-gamer-darker/80 border border-gamer-light-gray/40 text-gray-500
                                 hover:bg-gamer-danger/20 hover:border-gamer-danger/60 hover:text-gamer-danger
                                 opacity-60 hover:opacity-100 focus:opacity-100 transition-all"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3m3 0H6"
                        />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ----------------------- Formulario ---------------------- */}
          <div className="space-y-6 no-print">
            <div className="gamer-card p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
                  {seleccion ? `Credencial ${seleccion.codigo}` : 'Nueva credencial'}
                </h2>
                {seleccion && (
                  <button onClick={eliminar.bind(null, seleccion)} className="text-xs text-gamer-danger hover:text-white">
                    Eliminar
                  </button>
                )}
              </div>

              {/* Elegir de la base */}
              <div className="mb-4">
                <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1.5">
                  Buscar en la base de datos
                </label>
                <select
                  value={borrador.persona_id}
                  onChange={(e) => elegirPersona(e.target.value)}
                  className="gamer-input text-sm py-2"
                >
                  <option value="">— Ingresar una persona nueva —</option>
                  {personas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombres} {p.apellidos} — {p.rut}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-gray-500 mt-1">
                  Elige una persona y se copian su nombre, RUT y empresa. La credencial queda
                  ligada a su RUT, para que la pistola la reconhezca.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Campo
                  etiqueta="Nombres"
                  valor={borrador.nombres}
                  onChange={(v) => setCampo('nombres', v)}
                  placeholder="Juan Carlos"
                />
                <Campo
                  etiqueta="Apellidos"
                  valor={borrador.apellidos}
                  onChange={(v) => setCampo('apellidos', v)}
                  placeholder="Pérez González"
                />
                <Campo
                  etiqueta="Empresa"
                  valor={borrador.empresa}
                  onChange={(v) => setCampo('empresa', v)}
                />
                <Campo
                  etiqueta="Cargo"
                  valor={borrador.cargo}
                  onChange={(v) => setCampo('cargo', v)}
                  placeholder="Supervisor de Turno"
                />
                <Campo
                  etiqueta="Identificador (RUT)"
                  valor={borrador.rut}
                  onChange={(v) => setCampo('rut', v)}
                  placeholder="12.345.678-5"
                  mono
                />
                <Campo
                  etiqueta="Celular (para WhatsApp)"
                  valor={borrador.telefono || ''}
                  onChange={(v) => setCampo('telefono', v)}
                  placeholder="+56912345678"
                />
                <Campo
                  etiqueta="Vigente desde"
                  tipo="date"
                  valor={borrador.vigente_desde}
                  onChange={(v) => setCampo('vigente_desde', v)}
                />
                <Campo
                  etiqueta="Vigente hasta"
                  tipo="date"
                  valor={borrador.vigente_hasta}
                  onChange={(v) => setCampo('vigente_hasta', v)}
                />
              </div>

              {/* Logo, URL del QR y foto */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5 pt-5 border-t border-gamer-light-gray/30">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1.5">
                    Logo de la empresa
                  </label>
                  <div className="flex items-start gap-3">
                    <div className="w-20 h-20 rounded-lg bg-gamer-darker border border-gamer-light-gray/40 flex items-center justify-center overflow-hidden shrink-0">
                      {config.logo ? (
                        <img
                          src={config.logo}
                          alt="Logo"
                          className="max-w-full max-h-full object-contain"
                        />
                      ) : (
                        <span className="text-[10px] text-gray-600">sin logo</span>
                      )}
                    </div>
                    <div className="space-y-1.5 min-w-0">
                      {/* Label en vez de boton: el input de archivo queda
                          dentro del label, asi el clic abre el selector en
                          todos los navegadores. */}
                      <label className="gamer-btn text-xs cursor-pointer inline-block">
                        Subir PNG
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/svg+xml"
                          className="hidden"
                          onChange={(e) => {
                            subirLogo(e.target.files?.[0])
                            e.target.value = ''
                          }}
                        />
                      </label>
                      {config.logo && (
                        <button
                          onClick={async () => {
                            try {
                              await api.guardarConfig({ logo: '' })
                              setConfig((c) => ({ ...c, logo: '' }))
                              setAviso('Logo quitado')
                            } catch (e) {
                              setError(e.message)
                            }
                          }}
                          className="block text-xs text-gray-500 hover:text-gamer-danger"
                        >
                          Quitar logo
                        </button>
                      )}
                      <p className="text-[10px] text-gray-500 leading-snug">
                        Se aplica a todas las credenciales.
                        <br />
                        PNG con fondo transparente.
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1.5">
                    URL del código QR
                  </label>
                  <input
                    type="url"
                    value={config.qr_url || ''}
                    onChange={(e) => setConfig((c) => ({ ...c, qr_url: e.target.value }))}
                    placeholder="https://..."
                    className="gamer-input text-sm py-2 font-mono"
                  />
                  <div className="flex gap-1.5 mt-2">
                    <button onClick={() => guardarQr(config.qr_url)} className="gamer-btn text-xs flex-1">
                      Guardar URL
                    </button>
                    <button
                      onClick={() => guardarQr('')}
                      className="text-xs text-gray-500 hover:text-white px-2"
                      title="Volver a la URL de prueba"
                    >
                      Prueba
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-500 mt-1 leading-snug">
                    Es el QR de 200×200 del reverso. Mientras la aplicación no
                    esté publicada queda una URL de prueba.
                  </p>
                </div>

                <div>
                  <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1.5">
                    Foto del trabajador
                  </label>
                  <div className="flex items-start gap-3">
                    <div className="w-20 h-20 rounded-full bg-gamer-darker border-2 border-gamer-accent flex items-center justify-center overflow-hidden shrink-0">
                      {borrador.foto ? (
                        <img src={borrador.foto} alt="Foto" className="w-full h-full object-cover" />
                      ) : (
                        <svg className="w-10 h-10 text-gray-700" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                        </svg>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <label className="gamer-btn text-xs cursor-pointer inline-block">
                        Subir foto
                        <input
                          type="file"
                          accept="image/png,image/jpeg"
                          className="hidden"
                          onChange={(e) => {
                            leerImagen(e.target.files?.[0], 'foto')
                            e.target.value = ''
                          }}
                        />
                      </label>
                      {borrador.foto && (
                        <button
                          onClick={limpiarFoto}
                          className="block text-xs text-gray-500 hover:text-gamer-danger"
                        >
                          Quitar foto
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Casillas del reverso */}
              <div className="mt-5 pt-5 border-t border-gamer-light-gray/30 space-y-4">
                <Grupo
                  titulo="Autorizaciones de ingreso"
                  opciones={opciones.autorizaciones}
                  marcadas={borrador.autorizaciones}
                  onToggle={(v) => alternar('autorizaciones', v)}
                  libres={borrador.autorizacionesLibres}
                  onLibre={(i, v) => {
                    const copia = [...(borrador.autorizacionesLibres || [])]
                    copia[i] = v
                    setCampo('autorizacionesLibres', copia)
                  }}
                />
                <Grupo
                  titulo="Licencias de conducir"
                  opciones={opciones.licencias}
                  marcadas={borrador.licencias}
                  onToggle={(v) => alternar('licencias', v)}
                  libres={borrador.licenciasLibres}
                  rotuloLibres="otras licencias"
                  onLibre={(i, v) => {
                    const copia = [...(borrador.licenciasLibres || [])]
                    copia[i] = v
                    setCampo('licenciasLibres', copia)
                  }}
                />
                <Grupo
                  titulo="Vehículos que puede conducir"
                  opciones={opciones.vehiculos}
                  marcadas={borrador.vehiculos}
                  onToggle={(v) => alternar('vehiculos', v)}
                  libres={borrador.vehiculosLibres}
                  rotuloLibres="otros vehículos"
                  onLibre={(i, v) => {
                    const copia = [...(borrador.vehiculosLibres || [])]
                    copia[i] = v
                    setCampo('vehiculosLibres', copia)
                  }}
                />

                <div>
                  <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1.5">
                    Observaciones
                  </label>
                  <textarea
                    value={borrador.notas}
                    onChange={(e) => setCampo('notas', e.target.value)}
                    rows={2}
                    className="gamer-input text-sm"
                    placeholder="Texto que aparece en el reverso de la credencial"
                  />
                </div>
              </div>

              <div className="mt-5 flex gap-2">
                <button
                  onClick={guardar}
                  disabled={guardando || (!borrador.nombres && !borrador.apellidos)}
                  className="gamer-btn-success flex-1"
                >
                  {guardando
                    ? 'Guardando…'
                    : seleccion
                      ? 'Guardar cambios'
                      : 'Emitir credencial'}
                </button>
              </div>
            </div>
          </div>

          {/* -------------------- Vista de la tarjeta -------------------- */}
          <div className="space-y-4">
            <div className="gamer-card p-4 no-print">
              <h2 className="text-xs uppercase tracking-wider text-gray-400 mb-3">
                Frente y reverso
              </h2>

              <CredencialCard
                credencial={credencialVisible}
                logo={config.logo}
                foto={borrador.foto}
                qrUrl={config.qr_url}
              />
            </div>

            {seleccion && (
              <div className="gamer-card p-4 space-y-2 no-print">
                <h3 className="text-xs uppercase tracking-wider text-gray-400 mb-1">
                  Envío y descarga
                </h3>

                <div className="text-[11px] text-gray-400 font-mono bg-gamer-darker/60 border border-gamer-light-gray/30 rounded-lg p-2 break-all">
                  {linkDescarga(seleccion.codigo)}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button onClick={enviarWhatsApp} className="gamer-btn-success text-xs">
                    📱 WhatsApp
                  </button>
                  <button onClick={previsualizarDescarga} className="gamer-btn text-xs">
                    Ver descarga
                  </button>
                  <button onClick={copiarLink} className="gamer-btn text-xs">
                    Copiar link
                  </button>
                  <button onClick={imprimir} className="gamer-btn text-xs">
                    Imprimir
                  </button>
                </div>

                {/* Descarga como imagen: un papel para la prensa, otro para el celu */}
                <div className="pt-2 mt-1 border-t border-gamer-light-gray/30">
                  <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">
                    Descargar como imagen (PNG)
                  </label>

                  {/* Los dos papeles */}
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    {Object.values(PAPELES).map((q) => (
                      <button
                        key={q.id}
                        onClick={() => setPapel(q.id)}
                        className={`text-left px-2.5 py-2 rounded-lg border transition-colors ${
                          papel === q.id
                            ? 'bg-gamer-accent/15 border-gamer-accent/60'
                            : 'bg-gamer-darker/50 border-gamer-light-gray/30 hover:border-gamer-accent/30'
                        }`}
                      >
                        <div className="text-[11px] font-semibold text-white leading-tight">
                          {q.nombre}
                        </div>
                        <div className="text-[9px] text-gray-400 leading-tight mt-0.5">
                          {q.medida}
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <button onClick={() => bajar('frente')} disabled={!!generando} className="gamer-btn text-xs py-2">
                      {generando === 'frente' ? '…' : 'Frente'}
                    </button>
                    <button onClick={() => bajar('reverso')} disabled={!!generando} className="gamer-btn text-xs py-2">
                      {generando === 'reverso' ? '…' : 'Reverso'}
                    </button>
                    <button onClick={bajarAmbas} disabled={!!generando} className="gamer-btn-success text-xs py-2">
                      {generando === 'ambas' ? '…' : 'Ambas'}
                    </button>
                  </div>

                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[11px] text-gray-500 shrink-0">Resolución</span>
                    <select
                      value={resolucion}
                      onChange={(e) => setResolucion(e.target.value)}
                      className="gamer-input text-xs py-1 flex-1"
                    >
                      {RESOLUCIONES.map((r) => (
                        <option key={r.id} value={r.id}>
                          {textoResolucion(papel, r)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <p className="text-[11px] text-gray-500 leading-relaxed mt-1.5">
                    <strong className="text-gray-400">Credencial</strong>: 54 × 86 mm, el tamaño
                    real de la tarjeta. Para la prensa de sublimación o la imprenta.
                    <br />
                    <strong className="text-gray-400">Celular</strong>: la proporción de una
                    pantalla (Galaxy S22 Ultra, 19,5:9), para que al abrirla ocupe el
                    teléfono completo.
                  </p>
                </div>

                <p className="text-[11px] text-gray-500 leading-relaxed">
                  El link abre la credencial del trabajador, que se puede instalar como
                  aplicación en Android e iPhone. Funciona aunque el teléfono esté sin internet.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Piezas                                                              */
/* ------------------------------------------------------------------ */

function Mini({ valor, texto, color }) {
  return (
    <div className="gamer-card p-3 text-center">
      <div className={`text-2xl font-bold tabular-nums ${color}`}>{valor}</div>
      <div className="text-[10px] uppercase tracking-wider text-gray-500 mt-0.5">{texto}</div>
    </div>
  )
}

function Campo({ etiqueta, valor, onChange, placeholder, tipo = 'text', mono = false }) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1.5">{etiqueta}</label>
      <input
        type={tipo}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`gamer-input text-sm py-2 ${mono ? 'font-mono text-gamer-accent' : ''}`}
      />
    </div>
  )
}

/**
 * Grupo de casillas.
 *
 * Ademas de las opciones fijas, acepta `libres`: tres campos de texto para
 * escribir autorizaciones que no estan en la lista, por si el trabajo necesita
 * otra cosa que no se haya pensado.
 */
function Grupo({
  titulo,
  opciones = [],
  marcadas = [],
  onToggle,
  libres,
  rotuloLibres = 'otras autorizaciones',
  onLibre,
  ayuda,
}) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-wider text-gray-400 mb-2">{titulo}</label>

      {opciones.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {opciones.map((o) => {
            const marcada = marcadas.includes(o)
            return (
              <button
                key={o}
                type="button"
                onClick={() => onToggle(o)}
                className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${
                  marcada
                    ? 'bg-gamer-accent/20 border-gamer-accent/60 text-gamer-accent'
                    : 'bg-gamer-darker/60 border-gamer-light-gray/40 text-gray-400 hover:text-white'
                }`}
              >
                {marcada && <span className="mr-1">✓</span>}
                {o}
              </button>
            )
          })}
        </div>
      )}

      {libres && (
        <>
          <div className="flex items-center gap-3 my-3">
            <div className="h-px flex-1 bg-gamer-light-gray/30" />
            <span className="text-[10px] uppercase tracking-wider text-gray-500">
              {rotuloLibres}
            </span>
            <div className="h-px flex-1 bg-gamer-light-gray/30" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => (
              <input
                key={i}
                type="text"
                value={libres[i] || ''}
                onChange={(e) => onLibre?.(i, e.target.value)}
                placeholder="Otros"
                className="gamer-input text-sm py-2"
              />
            ))}
          </div>
          <p className="text-[11px] text-gray-500 mt-1.5">
            Escriba hasta 3 a mano. Si las deja vacías no se imprimen en la
            credencial.
          </p>
        </>
      )}

      {ayuda && <p className="text-[11px] text-gray-500 mt-1.5">{ayuda}</p>}
    </div>
  )
}