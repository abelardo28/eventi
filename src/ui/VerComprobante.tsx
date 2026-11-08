import { useEffect, useState } from 'react'
import { enNube, urlComprobante } from '../data/nube'
import type { Comprobante } from '../domain/types'

/** Muestra un comprobante, guardado en el dispositivo o en la nube (con enlace firmado). */
export function VerComprobante({ c, grande, className = 'thumb' }: { c: Comprobante; grande?: boolean; className?: string }) {
  // Enlace firmado de la nube, recordado junto con el comprobante al que pertenece
  const [firmada, setFirmada] = useState<{ de: string; url: string | null } | null>(null)
  useEffect(() => {
    if (!enNube(c)) return
    let vivo = true
    urlComprobante(c).then(u => { if (vivo) setFirmada({ de: c.data, url: u }) }, () => { if (vivo) setFirmada({ de: c.data, url: null }) })
    return () => { vivo = false }
  }, [c])
  const lista = firmada?.de === c.data
  const url = enNube(c) ? (lista ? firmada.url : null) : c.data
  const error = enNube(c) && lista && !firmada.url
  if (error) return <span className="small neg">No se pudo abrir el comprobante.</span>
  if (!url) return <span className="small muted">Cargando comprobante…</span>
  if (c.tipo.startsWith('image/')) return <img className={className} style={grande ? { maxWidth: '100%', margin: '0 auto' } : undefined} src={url} alt="Comprobante" />
  return <a className={grande ? 'btn ghost' : 'btn sm ghost'} href={url} target="_blank" rel="noreferrer">Abrir {c.nombre}</a>
}
