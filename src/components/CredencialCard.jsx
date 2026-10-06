import { useMemo } from 'react'
import { credencialSvg, FRENTE_BASE, REVERSO_BASE, altoDe } from '../../shared/credencialSvg.js'

/**
 * Credencial del trabajador: frente y reverso.
 *
 * Esto **no dibuja la credencial**: muestra el mismo SVG que se descarga como
 * PNG y que se imprime en la pagina del celular. Antes cada pantalla tenia su
 * propio dibujo y se terminaban desincronizando (lo que se veia en el panel no
 * era lo que salia al imprimir). Con un solo modulo, ver aqui es ver lo mismo
 * que se va a emitir.
 *
 * El SVG se pide al ancho que se va a mostrar, no al ancho de impresion: el
 * texto sale nitido a cualquier tamano.
 */

/** Ancho en pixeles con el que se muestra en el panel (340, como el diseño). */
const ANCHO_PANEL = 340

/** Texto a data URL, para un `<img src>`. */
const aDataUrl = (svg) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}`

export default function CredencialCard({ credencial, logo, foto, qrUrl, ancho = ANCHO_PANEL, className = '' }) {
  // El frente y el reverso se arman por separado: si no, cada cambio en el
  // formulario rehace los dos.
  const frente = useMemo(
    () =>
      credencial
        ? aDataUrl(credencialSvg({ lado: 'frente', cred: credencial, logo, foto, qrUrl }, ancho))
        : null,
    [credencial, logo, foto, qrUrl, ancho]
  )

  const reverso = useMemo(
    () =>
      credencial ? aDataUrl(credencialSvg({ lado: 'reverso', cred: credencial, logo, qrUrl }, ancho)) : null,
    [credencial, logo, qrUrl, ancho]
  )

  if (!credencial) {
    return (
      <div
        className="flex items-center justify-center text-gray-500 text-sm border border-dashed border-gamer-light-gray/40 rounded-xl"
        style={{ width: ancho, height: altoDe('frente', ancho) }}
      >
        Seleccione o cree una credencial
      </div>
    )
  }

  const nombre = `${credencial.nombres || ''} ${credencial.apellidos || ''}`.trim()

  return (
    <div className={`flex gap-6 ${className}`}>
      {[
        { url: frente, lado: 'frente', alt: `Frente de la credencial de ${nombre}` },
        { url: reverso, lado: 'reverso', alt: `Reverso de la credencial de ${nombre}` },
      ].map(({ url, lado, alt }) => {
        const h = altoDe(lado, ancho)
        return (
          <img
            key={lado}
            src={url}
            alt={alt}
            width={ancho}
            height={h}
            className="rounded-2xl shadow-2xl block"
            style={{ width: ancho, height: h }}
          />
        )
      })}
    </div>
  )
}