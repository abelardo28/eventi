import { useState } from 'react'
import { useStore } from '../data/store'
import { concepto, money } from '../domain/calc'
import { fCorta } from '../domain/fechas'
import type { Abono, Evento } from '../domain/types'
import { useToast } from './overlay'

/** Abono enviado por un participante que espera revisión: se valida o se rechaza con motivo. */
export function AbonoPendiente({ ev, a, mostrarPersona }: { ev: Evento; a: Abono; mostrarPersona?: boolean }) {
  const { usuario, editarEvento } = useStore()
  const { toast } = useToast()
  const [rechazando, setRechazando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [ver, setVer] = useState(false)
  const persona = ev.personas.find(p => p.id === a.personaId)

  const resolver = (estado: 'validado' | 'rechazado') => {
    const ok = editarEvento(ev.id, e => {
      const x = e.abonos.find(y => y.id === a.id)!
      x.estado = estado
      x.validadoPor = usuario?.id ?? null
      if (estado === 'rechazado') x.motivoRechazo = motivo.trim() || 'Sin motivo'
    })
    if (ok) toast(estado === 'validado' ? `Abono de ${money(a.monto)} validado` : 'Abono rechazado')
  }

  return (
    <div className="pend">
      <div className="between" style={{ alignItems: 'flex-start' }}>
        <span>
          <b>{mostrarPersona ? `${persona?.nombre} · ` : ''}{concepto(ev, a.conceptoId)?.nombre}</b>
          <div className="small muted">{a.metodo} · {fCorta(a.fecha)} · enviado por el participante</div>
        </span>
        <b className="num">{money(a.monto)}</b>
      </div>
      {a.comprobante && (ver
        ? (a.comprobante.tipo.startsWith('image/')
          ? <img className="thumb" src={a.comprobante.data} alt="Comprobante" />
          : <a className="btn sm ghost" href={a.comprobante.data} target="_blank" rel="noreferrer">Abrir {a.comprobante.nombre}</a>)
        : <button type="button" className="linkbtn small" style={{ alignSelf: 'flex-start' }} onClick={() => setVer(true)}>Ver comprobante</button>)}
      {rechazando ? (
        <div className="stack" style={{ gap: 8 }}>
          <input className="inp" id={`mot-${a.id}`} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo (lo verá el participante)" />
          <div className="row"><button className="btn sm danger" onClick={() => resolver('rechazado')}>Rechazar</button><button className="btn sm ghost" onClick={() => setRechazando(false)}>Cancelar</button></div>
        </div>
      ) : (
        <div className="row">
          <button className="btn sm" onClick={() => resolver('validado')}>Validar</button>
          <button className="btn sm ghost" onClick={() => setRechazando(true)}>Rechazar</button>
        </div>
      )}
    </div>
  )
}
