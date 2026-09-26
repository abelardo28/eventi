import { useState } from 'react'
import { useStore } from '../data/store'
import { concepto, money } from '../domain/calc'
import { fCorta } from '../domain/fechas'
import type { Evento } from '../domain/types'
import { puede } from '../domain/permisos'
import { IcTrash } from '../ui/icons'
import { Sheet, useToast } from '../ui/overlay'

/** Detalle de un abono: comprobante y opción de borrarlo si se registró por error. */
export function ComprobanteSheet({ ev, abonoId, onClose }: { ev: Evento; abonoId: string; onClose: () => void }) {
  const { editarEvento, usuario } = useStore()
  const { toast } = useToast()
  const [borrar, setBorrar] = useState(false)
  const a = ev.abonos.find(x => x.id === abonoId)
  if (!a) return null
  const c = a.comprobante

  return (
    <Sheet title={`Abono de ${concepto(ev, a.conceptoId)?.nombre ?? ''}`} onClose={onClose} onSubmit={onClose}>
      {c && (c.tipo.startsWith('image/')
        ? <img className="thumb" style={{ maxWidth: '100%', margin: '0 auto' }} src={c.data} alt="Comprobante" />
        : <a className="btn ghost" href={c.data} target="_blank" rel="noreferrer">Abrir {c.nombre}</a>)}
      <div className="between small"><span className="muted">{a.metodo} · {fCorta(a.fecha)}</span><b className="num">{money(a.monto)}</b></div>
      {a.estado === 'rechazado' && <div className="small neg">Rechazado: {a.motivoRechazo}</div>}
      {a.estado === 'pendiente' && <div className="small" style={{ color: 'var(--warn)' }}>Por validar</div>}
      {!puede(usuario, 'abonos.borrar', ev.id) ? null : borrar ? (
        <div className="confirm">
          <span>¿Borrar este abono de {money(a.monto)}? No se puede deshacer.</span>
          <div className="row">
            <button type="button" className="btn sm danger" onClick={() => { if (editarEvento(ev.id, e => { e.abonos = e.abonos.filter(x => x.id !== a.id) })) { toast('Abono borrado'); onClose() } }}><IcTrash />Sí, borrar</button>
            <button type="button" className="btn sm ghost" onClick={() => setBorrar(false)}>Cancelar</button>
          </div>
        </div>
      ) : <button type="button" className="linkbtn small danger" style={{ alignSelf: 'flex-start' }} onClick={() => setBorrar(true)}>Borrar abono</button>}
      <button className="btn ghost block" type="submit">Cerrar</button>
    </Sheet>
  )
}
