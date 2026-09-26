import { useMemo, useState } from 'react'
import { useStore } from '../data/store'
import { uid } from '../data/uid'
import { prepararComprobante } from '../data/comprobantes'
import { cargo, composicion, concepto, money, pagado, siguiente } from '../domain/calc'
import { fCorta } from '../domain/fechas'
import type { Comprobante, Evento, Metodo } from '../domain/types'
import { puede } from '../domain/permisos'
import { IcUpload } from '../ui/icons'
import { Chips } from '../ui/kit'
import { Sheet, useToast } from '../ui/overlay'

const METODOS = ['Efectivo', 'Transferencia', 'Depósito'] as const
const METODOS_PART = ['Transferencia', 'Depósito'] as const

export function AbonoSheet({ ev, personaId, conceptoId, onClose }: { ev: Evento; personaId?: string; conceptoId?: string; onClose: () => void }) {
  const { hoy, editarEvento, usuario } = useStore()
  // Quien no puede registrar abonos (participante) envía un comprobante que queda por validar.
  const propuesta = !puede(usuario, 'abonos.registrar', ev.id)
  const { toast } = useToast()
  const conCargos = ev.personas.filter(p => p.cargos.length && (!propuesta || p.id === personaId))
  const [pid, setPid] = useState(personaId ?? conCargos[0]?.id ?? '')
  const persona = ev.personas.find(p => p.id === pid)
  // Por omisión, el primer concepto que todavía tiene saldo
  const conSaldo = (pp: typeof persona) => pp?.cargos.find(g => { const cc = concepto(ev, g.conceptoId); return cc && siguiente(ev, pp, cc, hoy) })?.conceptoId ?? pp?.cargos[0]?.conceptoId ?? ''
  const [cid, setCid] = useState(conceptoId && persona && cargo(persona, conceptoId) ? conceptoId : conSaldo(persona))
  const c = concepto(ev, cid)
  const sig = useMemo(() => (persona && c ? siguiente(ev, persona, c, hoy) : null), [ev, persona, c, hoy])
  const [monto, setMonto] = useState(sig ? String(sig.monto) : '')
  const [fecha, setFecha] = useState(hoy)
  const [metodo, setMetodo] = useState<Metodo>('Transferencia')
  const [comp, setComp] = useState<Comprobante | null>(null)
  const [subiendo, setSubiendo] = useState(false)

  const elegir = (nuevoPid: string, nuevoCid?: string) => {
    const p = ev.personas.find(x => x.id === nuevoPid)!
    const k = nuevoCid ?? conSaldo(p)
    setPid(nuevoPid); setCid(k)
    const cc = concepto(ev, k)
    const s = cc ? siguiente(ev, p, cc, hoy) : null
    setMonto(s ? String(s.monto) : '')
  }

  const subir = async (f: File | undefined) => {
    if (!f) return
    setSubiendo(true)
    try { setComp(await prepararComprobante(f)) } catch (e) { toast((e as Error).message) } finally { setSubiendo(false) }
  }

  const guardar = () => {
    const m = Number(monto)
    if (!persona || !c) { toast('Elige persona y concepto'); return }
    if (!(m > 0)) { toast('Escribe el monto del abono'); return }
    if (propuesta && !comp) { toast('Sube la foto o PDF del comprobante'); return }
    const ok = editarEvento(ev.id, e => {
      e.abonos.unshift({
        id: uid('a'), personaId: persona.id, conceptoId: c.id, monto: m, fecha: fecha || hoy, metodo,
        comprobante: metodo === 'Efectivo' ? null : comp, estado: propuesta ? 'pendiente' : 'validado', registradoPor: usuario?.id ?? null,
      })
    })
    if (ok) { toast(propuesta ? 'Comprobante enviado. Te avisaremos cuando lo validen' : `Abono de ${money(m)} registrado`); onClose() }
  }

  const g = persona && c ? cargo(persona, c.id) : undefined
  return (
    <Sheet title={propuesta ? 'Enviar comprobante de pago' : 'Registrar abono'} onClose={onClose} onSubmit={guardar}>
      {propuesta && <div className="small muted">El organizador revisará tu comprobante. Mientras tanto aparecerá como “por validar”.</div>}
      {!propuesta && <label className="f">Persona o familia
        <select className="inp" id="ab-p" value={pid} onChange={e => elegir(e.target.value)}>
          {conCargos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
      </label>}
      <label className="f">Concepto
        <select className="inp" id="ab-c" value={cid} onChange={e => elegir(pid, e.target.value)}>
          {persona?.cargos.map(x => <option key={x.conceptoId} value={x.conceptoId}>{concepto(ev, x.conceptoId)?.nombre}</option>)}
        </select>
      </label>
      {persona && c && g && (
        <div className="small muted">
          Lleva <b className="num">{money(pagado(ev, persona.id, c.id))}</b> de {money(g.monto)} ({composicion(g)}).{' '}
          {sig ? <>{sig.vencida ? 'Pendiente vencido' : 'Siguiente pago'}: <b className="num">{money(sig.monto)}</b>, {fCorta(sig.fecha)}.</> : 'Este concepto ya está liquidado.'}
        </div>
      )}
      <div className="grid2">
        <label className="f">Monto<input className="inp num" id="ab-m" type="number" inputMode="decimal" min={1} value={monto} onChange={e => setMonto(e.target.value)} /></label>
        <label className="f">Fecha<input className="inp" id="ab-f" type="date" max={hoy} value={fecha} onChange={e => setFecha(e.target.value)} /></label>
      </div>
      <div className="f">Forma de pago<Chips options={propuesta ? METODOS_PART : METODOS} value={metodo} onChange={setMetodo} /></div>
      {metodo !== 'Efectivo' && (
        <div className="stack" style={{ gap: 8 }}>
          <div className={`drop ${comp ? 'has' : ''}`}>
            <IcUpload size={22} style={{ display: 'block', margin: '0 auto 4px' }} />
            <b>{subiendo ? 'Procesando…' : comp ? 'Cambiar comprobante' : 'Subir comprobante'}</b><br />Foto o PDF de la transferencia o depósito
            <input type="file" id="ab-file" accept="image/*,application/pdf" onChange={e => subir(e.target.files?.[0])} aria-label="Subir comprobante" />
          </div>
          {comp && (comp.tipo.startsWith('image/') ? <img className="thumb" src={comp.data} alt="Comprobante" /> : <span className="pill neutral">{comp.nombre}</span>)}
        </div>
      )}
      <button className="btn block" type="submit" disabled={subiendo}>{propuesta ? 'Enviar comprobante' : 'Guardar abono'}</button>
    </Sheet>
  )
}
