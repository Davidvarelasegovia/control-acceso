import { useState, useEffect, useRef, useCallback } from 'react'
import { vistaPrevia, normalizar } from '../utils/identificador'

/**
 * Modal de Ingreso Manual.
 *
 * Pensado para celulares y pantallas tactiles:
 *  - teclado en pantalla con los digitos 1-9, 0 y la tecla K
 *  - sin validacion: cualquier texto que exista en la base es valido
 *  - Enter tambien registra
 */
export default function ManualEntryModal({ abierto, onCerrar, onIngresar, busy }) {
  const [valor, setValor] = useState('')
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (abierto) {
      setValor('')
      setError('')
      // enfoca despues del animacion de apertura
      const t = setTimeout(() => inputRef.current?.focus(), 120)
      return () => clearTimeout(t)
    }
  }, [abierto])

  // Bloquea el scroll del fondo mientras el modal esta abierto
  useEffect(() => {
    if (!abierto) return
    const previo = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previo
    }
  }, [abierto])

  // Cierra con Escape
  useEffect(() => {
    if (!abierto) return
    const onKey = (e) => {
      if (e.key === 'Escape') onCerrar()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [abierto, onCerrar])

  // Sin validacion: solo importa que tenga algo escrito
  const hayAlgo = normalizar(valor).length > 0

  const agregar = useCallback((tecla) => {
    setValor((v) => {
      const limpio = v.trim()
      if (limpio.length >= 20) return limpio

      if (tecla === 'BORRAR') return limpio.slice(0, -1)
      if (tecla === 'LIMPIAR') return ''
      if (tecla === 'K') {
        // la K es el verificador: solo al final, y una sola vez
        return /k$/i.test(limpio) ? limpio : limpio + 'K'
      }
      return limpio + tecla
    })
    setError('')
  }, [])

  const registrar = () => {
    if (!valor.trim()) {
      setError('Ingrese un identificador')
      return
    }
    onIngresar(valor.trim())
    setValor('')
    setError('')
  }

  // Teclado fisico tambien funciona dentro del modal
  const onTeclaFisica = (e) => {
    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault()
      agregar(e.key)
    } else if (e.key === 'k' || e.key === 'K') {
      e.preventDefault()
      agregar('K')
    } else if (e.key === 'Backspace') {
      e.preventDefault()
      agregar('BORRAR')
    } else if (e.key === 'Enter') {
      e.preventDefault()
      registrar()
    }
  }

  if (!abierto) return null

  const vista = vistaPrevia(valor)

  const teclas = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCerrar()
      }}
    >
      <div className="w-full sm:max-w-md gamer-card p-5 sm:p-6 fade-in rounded-b-none sm:rounded-b-2xl sm:border">
        {/* Cabecera */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xl font-bold text-white">Ingreso Manual</h3>
            <p className="text-gray-400 text-xs mt-0.5">
              Escribe el identificador. El dígito verificador es opcional.
            </p>
          </div>
          <button
            onClick={onCerrar}
            className="p-2.5 rounded-lg bg-gamer-gray/60 text-gray-300 hover:text-white hover:bg-gamer-gray transition-colors"
            aria-label="Cerrar"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Pantalla del identificador */}
        <div
          className={`rounded-xl border-2 bg-gamer-darker px-4 py-5 mb-3 text-center transition-colors ${
            error ? 'border-gamer-danger' : hayAlgo ? 'border-gamer-success' : 'border-gamer-light-gray/40'
          }`}
        >
          <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">
            Identificador / RUT
          </div>
          <div
            className={`text-3xl font-mono font-bold tracking-widest min-h-[2.5rem] ${
              hayAlgo ? 'text-gamer-success' : error ? 'text-gamer-danger' : 'text-white'
            }`}
          >
            {vista || '—'}
          </div>
          {hayAlgo && (
            <div className="text-xs text-gray-500 mt-1">
              Con o sin dígito verificador — se busca en la base
            </div>
          )}
          {error && <div className="text-xs text-gamer-danger mt-1">{error}</div>}
        </div>

        {/* Campo oculto para teclado fisico */}
        <input
          ref={inputRef}
          type="text"
          inputMode="none"
          value={valor}
          onChange={(e) => {
            setValor(e.target.value)
            setError('')
          }}
          onKeyDown={onTeclaFisica}
          className="w-full bg-transparent border-0 outline-none text-transparent caret-transparent h-0 p-0"
          aria-label="Identificador"
        />

        {/* Teclado en pantalla */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {teclas.map((t) => (
            <button
              key={t}
              onClick={() => agregar(t)}
              className="py-4 sm:py-3 rounded-xl bg-gamer-gray/70 text-white text-2xl font-bold hover:bg-gamer-accent/20 hover:text-gamer-accent active:scale-95 transition-all select-none"
            >
              {t}
            </button>
          ))}

          <button
            onClick={() => agregar('K')}
            className="py-4 sm:py-3 rounded-xl bg-gamer-accent/15 text-gamer-accent text-2xl font-bold hover:bg-gamer-accent/30 active:scale-95 transition-all select-none"
            title="Verificador K"
          >
            K
          </button>
          <button
            onClick={() => agregar('0')}
            className="py-4 sm:py-3 rounded-xl bg-gamer-gray/70 text-white text-2xl font-bold hover:bg-gamer-accent/20 hover:text-gamer-accent active:scale-95 transition-all select-none"
          >
            0
          </button>
          <button
            onClick={() => agregar('BORRAR')}
            className="py-4 sm:py-3 rounded-xl bg-gamer-danger/15 text-gamer-danger text-xl font-bold hover:bg-gamer-danger/30 active:scale-95 transition-all select-none flex items-center justify-center"
            title="Borrar"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        </div>

        {/* Acciones */}
        <div className="flex gap-2">
          <button
            onClick={() => {
              setValor('')
              setError('')
            }}
            className="px-5 py-3.5 rounded-xl bg-gamer-gray/60 text-gray-300 font-semibold hover:bg-gamer-gray transition-colors"
          >
            Limpiar
          </button>
          <button
            onClick={registrar}
            disabled={!hayAlgo || busy}
            className={`flex-1 py-3.5 rounded-xl font-bold text-lg transition-all ${
              hayAlgo && !busy
                ? 'bg-gamer-success/20 text-gamer-success border border-gamer-success/50 hover:bg-gamer-success/30 active:scale-[.98]'
                : 'bg-gamer-gray/40 text-gray-600 cursor-not-allowed'
            }`}
          >
            {busy ? 'Registrando...' : 'Registrar Ingreso'}
          </button>
        </div>

        {valor && !error && (
          <div className="mt-3 text-center text-xs text-gray-500">
            Se enviará como <span className="font-mono text-gray-400">{valor.trim()}</span>
          </div>
        )}
      </div>
    </div>
  )
}
