import { useState } from 'react'
import { formaDePago } from '../domain/reparto'
import { useStore } from '../data/store'
import { concepto, money } from '../domain/calc'
import { fCorta } from '../domain/fechas'
import type { Evento } from '../domain/types'
import { puede, puedeEditarAbono } from '../domain/permisos'
import { IcEdit, IcTrash, IcUpload } from '../ui/icons'
import { AbonoSheet } from './AbonoSheet'
import { VerComprobante } from '../ui/VerComprobante'
import { Sheet, useToast } from '../ui/overlay'

/** Detalle de un abono: comprobante y opción de borrarlo si se registró por error. */
export function ComprobanteSheet({ ev, abonoId, onClose }: { ev: Evento; abonoId: string; onClose: () => void }) {
  const { editarEvento, usuario } = useStore()
  const { toast } = useToast()
  const [borrar, setBorrar] = useState(false)
  const [editar, setEditar] = useState(false)
  const a = ev.abonos.find(x => x.id === abonoId)
  if (!a) return null
  if (editar) return <AbonoSheet ev={ev} abono={a} onClose={onClose} />
  const c = a.comprobante
  const editable = puedeEditarAbono(usuario, ev, a)

  return (
    <Sheet title={`Abono de ${concepto(ev, a.conceptoId)?.nombre ?? ''}`} onClose={onClose} onSubmit={onClose}>
      {c && <VerComprobante c={c} grande />}
      <div className="between small"><span className="muted">{formaDePago(ev, a)} · {fCorta(a.fecha)}</span><b className="num">{money(a.monto)}</b></div>
      {a.estado === 'rechazado' && <div className="small neg">Rechazado: {a.motivoRechazo}</div>}
      {a.estado === 'pendiente' && <div className="small" style={{ color: 'var(--warn)' }}>Por validar</div>}
      {editable && <div className="row wrap">
        <button type="button" className="btn sm" onClick={() => setEditar(true)}><IcEdit />Editar abono</button>
        {a.metodo !== 'Efectivo' && <button type="button" className="btn sm ghost" onClick={() => setEditar(true)}><IcUpload />{c ? 'Reemplazar comprobante' : 'Subir comprobante'}</button>}
      </div>}
      {a.metodo === 'Actividad' && <div className="small faint">Este abono salió de la ganancia de una actividad; para cambiarlo, bórralo y vuelve a abonar desde Actividades.</div>}
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
