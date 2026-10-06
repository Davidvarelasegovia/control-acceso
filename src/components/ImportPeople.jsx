import { useState, useRef, useCallback } from 'react'
import * as XLSX from 'xlsx'

/**
 * Importacion masiva de personas desde una planilla.
 *
 * Acepta .xlsx, .xls y .csv. Se leen en el navegador con SheetJS y se envian
 * al servidor, que las guarda en una sola transaccion.
 *
 * Formato esperado (los titulos se reconocen con o sin tildes y en cualquier orden):
 *
 *   | nombres | apellidos | rut            | empresa    |
 *   |---------|----------|----------------|------------|
 *   | Juan    | Perez    | 12345678       | Acme Ltda. |
 *   | Maria   | Lopez    | 98765432       | Other SA   |
 *
 * La columna `empresa` es opcional. El identificador (`rut`) puede ir con o
 * sin digito verificador y con cualquier separador.
 */

/** Convierte un titulo a una clave comparable: "Nombres", "nombres ", "NOMBRES" -> "nombres" */
function clave(titulo) {
  return String(titulo)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]/g, '')
}

const ALIAS = {
  nombres: 'nombres',
  nombre: 'nombres',
  nom: 'nombres',
  apellidos: 'apellidos',
  apellido: 'apellidos',
  rut: 'rut',
  id: 'rut',
  cedula: 'rut',
  documento: 'rut',
  empresa: 'empresa',
  razonsocial: 'empresa',
  compania: 'empresa',
  empresa2: 'empresa',
}

/** Detecta, en una fila de titulos, que columna es cada campo. */
function mapearColumnas(filaTitulos) {
  const mapa = {}
  filaTitulos.forEach((titulo, i) => {
    const k = clave(titulo)
    if (ALIAS[k] && mapa[ALIAS[k]] === undefined) mapa[ALIAS[k]] = i
  })
  return mapa
}

export default function ImportarPersonas({ onImportar, onCancelar }) {
  const [archivo, setArchivo] = useState(null)
  const [vistaPrevia, setVistaPrevia] = useState(null)
  const [error, setError] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const inputRef = useRef(null)

  /* ------------------------- Descargar plantilla ------------------------- */

  const descargarPlantilla = useCallback(() => {
    const ejemplo = [
      ['nombres', 'apellidos', 'rut', 'empresa'],
      ['Juan Carlos', 'Pérez González', '12345678', 'TechCorp Ltda.'],
      ['María Fernanda', 'López Martínez', '98765432', 'Innovaciones SA'],
      ['Carlos Alberto', 'Rodríguez Silva', '13874809-K', 'Construcciones XYZ'],
    ]

    const ws = XLSX.utils.aoa_to_sheet(ejemplo)
    ws['!cols'] = [{ wch: 20 }, { wch: 22 }, { wch: 16 }, { wch: 26 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Personas')
    XLSX.writeFile(wb, 'plantilla_personas.xlsx')
  }, [])

  /* ---------------------------- Leer archivo ---------------------------- */

  const procesarArchivo = useCallback(async (file) => {
    setError('')
    setResultado(null)
    setVistaPrevia(null)

    if (!file) return

    try {
      const buffer = await file.arrayBuffer()
      const libro = XLSX.read(buffer, { type: 'array' })
      const hoja = libro.Sheets[libro.SheetNames[0]]
      const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: '' })

      if (filas.length < 2) {
        setError('La planilla está vacía o solo tiene el encabezado')
        return
      }

      // Buscar la fila de titulos entre las primeras 5 (algunas planillas traen titulo antes)
      let filaTitulos = -1
      let mapa = null
      for (let i = 0; i < Math.min(5, filas.length); i++) {
        const m = mapearColumnas(filas[i])
        if (m.rut !== undefined) {
          filaTitulos = i
          mapa = m
          break
        }
      }

      if (filaTitulos === -1) {
        setError(
          'No encontré la columna de identificador. La planilla debe tener una columna llamada "rut" (o "id").'
        )
        return
      }

      const personas = []
      for (let i = filaTitulos + 1; i < filas.length; i++) {
        const f = filas[i]
        const rut = String(f[mapa.rut] ?? '').trim()

        // saltear filas vacias
        const nombres = mapa.nombres !== undefined ? String(f[mapa.nombres] ?? '').trim() : ''
        const apellidos = mapa.apellidos !== undefined ? String(f[mapa.apellidos] ?? '').trim() : ''
        const empresa = mapa.empresa !== undefined ? String(f[mapa.empresa] ?? '').trim() : ''

        if (!rut && !nombres && !apellidos) continue

        personas.push({ nombres, apellidos, rut, empresa })
      }

      if (personas.length === 0) {
        setError('La planilla no tiene filas de datos')
        return
      }

      setArchivo(file.name)
      setVistaPrevia(personas)
    } catch (e) {
      setError(`No se pudo leer el archivo: ${e.message}`)
    }
  }, [])

  /* ----------------------------- Importar ------------------------------- */

  const importar = async () => {
    if (!vistaPrevia) return
    setProcesando(true)
    setError('')
    try {
      const r = await onImportar(vistaPrevia)
      setResultado(r)
    } catch (e) {
      setError(e.message)
    } finally {
      setProcesando(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold text-white">Importar personas desde Excel</h3>
        <p className="text-gray-400 text-sm mt-1">
          Acepta <span className="font-mono text-gray-300">.xlsx</span>,{' '}
          <span className="font-mono text-gray-300">.xls</span> y{' '}
          <span className="font-mono text-gray-300">.csv</span>. Las columnas se reconocen por su
          nombre, en cualquier orden y con o sin tildes.
        </p>
      </div>

      {/* Formato esperado */}
      <div className="gamer-card p-4 bg-gamer-darker/60">
        <div className="text-xs uppercase tracking-wider text-gray-400 mb-2">
          Formato de la planilla
        </div>
        <div className="text-sm font-mono text-gray-300">
          nombres | apellidos | rut | empresa
        </div>
        <div className="text-xs text-gray-500 mt-2">
          <strong className="text-gray-400">rut</strong> obligatorio (también acepta que se llame
          "id"). <strong className="text-gray-400">empresa</strong> opcional. El resto se puede
          dejar vacío.
        </div>
        <button
          type="button"
          onClick={descargarPlantilla}
          className="gamer-btn text-xs mt-3 inline-flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
          </svg>
          Descargar plantilla de ejemplo
        </button>
      </div>

      {/* Selector */}
      {!resultado && (
        <>
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              procesarArchivo(e.dataTransfer.files?.[0])
            }}
            className="border-2 border-dashed border-gamer-light-gray/40 rounded-xl p-8 text-center cursor-pointer hover:border-gamer-accent/60 hover:bg-gamer-accent/5 transition-colors"
          >
            <svg className="w-10 h-10 mx-auto text-gray-500 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.9A5 5 0 1115.9 6h.1a4 4 0 011 7.9H7z" />
            </svg>
            <div className="text-white font-medium">
              {archivo || 'Arrastra tu planilla aquí o haz clic para elegir'}
            </div>
            <div className="text-xs text-gray-500 mt-1">o suelta el archivo directamente</div>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => procesarArchivo(e.target.files?.[0])}
              className="hidden"
            />
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-gamer-danger/10 border border-gamer-danger/40 text-gamer-danger text-sm">
              {error}
            </div>
          )}

          {vistaPrevia && (
            <>
              <div className="gamer-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-white">
                    <strong className="text-gamer-accent">{vistaPrevia.length}</strong> filas listas
                    para importar
                  </span>
                  <button
                    onClick={() => {
                      setArchivo(null)
                      setVistaPrevia(null)
                      setError('')
                      if (inputRef.current) inputRef.current.value = ''
                    }}
                    className="text-xs text-gray-500 hover:text-white"
                  >
                    Cambiar archivo
                  </button>
                </div>

                <div className="overflow-x-auto max-h-40">
                  <table className="w-full text-xs">
                    <thead className="bg-gamer-darker sticky top-0">
                      <tr>
                        {['nombres', 'apellidos', 'rut', 'empresa'].map((h) => (
                          <th key={h} className="text-left p-2 text-gray-400">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {vistaPrevia.slice(0, 6).map((p, i) => (
                        <tr key={i} className="border-t border-gamer-light-gray/20">
                          <td className="p-2 text-gray-300">{p.nombres || '—'}</td>
                          <td className="p-2 text-gray-300">{p.apellidos || '—'}</td>
                          <td className="p-2 text-gamer-accent font-mono">{p.rut || '—'}</td>
                          <td className="p-2 text-gray-400">{p.empresa || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {vistaPrevia.length > 6 && (
                  <div className="text-xs text-gray-500 mt-2">
                    … y {vistaPrevia.length - 6} filas más
                  </div>
                )}
              </div>

              <div className="flex gap-2 justify-end">
                <button type="button" onClick={onCancelar} className="gamer-btn">
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={importar}
                  disabled={procesando}
                  className="gamer-btn-success"
                >
                  {procesando
                    ? 'Importando…'
                    : `Importar ${vistaPrevia.length} personas a la base de datos`}
                </button>
              </div>
            </>
          )}
        </>
      )}

      {/* Resultado */}
      {resultado && (
        <div className="space-y-4">
          <div
            className={`gamer-card p-5 border ${
              resultado.insertados > 0
                ? 'border-gamer-success/50 bg-gamer-success/5'
                : 'border-gamer-warning/50 bg-gamer-warning/5'
            }`}
          >
            <div className="flex items-center gap-3 mb-3">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  resultado.insertados > 0
                    ? 'bg-gamer-success/20'
                    : 'bg-gamer-warning/20'
                }`}
              >
                <svg
                  className={`w-5 h-5 ${resultado.insertados > 0 ? 'text-gamer-success' : 'text-gamer-warning'}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <div className="text-white font-semibold">
                  {resultado.insertados > 0
                    ? 'Ingresado de manera correcta en la base de datos'
                    : 'No se ingresaron personas nuevas'}
                </div>
                <div className="text-sm text-gray-400">
                  {resultado.insertados} guardadas · {resultado.omitidos} omitidas ·{' '}
                  {resultado.total} filas leídas
                </div>
              </div>
            </div>
          </div>

          {resultado.errores?.length > 0 && (
            <div className="gamer-card p-4 max-h-64 overflow-y-auto">
              <div className="text-xs uppercase tracking-wider text-gray-400 mb-2">
                Filas omitidas (primeras {resultado.errores.length})
              </div>
              <table className="w-full text-xs">
                <tbody>
                  {resultado.errores.map((e, i) => (
                    <tr key={i} className="border-b border-gamer-light-gray/20 last:border-0">
                      <td className="p-1.5 text-gray-500 w-14">Fila {e.fila}</td>
                      <td className="p-1.5 text-gray-300 font-mono">{e.rut || '—'}</td>
                      <td className="p-1.5 text-gamer-warning">{e.motivo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => {
                setResultado(null)
                setArchivo(null)
                setVistaPrevia(null)
                if (inputRef.current) inputRef.current.value = ''
              }}
              className="gamer-btn"
            >
              Importar otro archivo
            </button>
            <button type="button" onClick={onCancelar} className="gamer-btn-success">
              Listo
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
