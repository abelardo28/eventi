import { useState } from 'react'
import { useStore } from '../data/store'
import { uid } from '../data/uid'
import { cargo, concepto, money, plural } from '../domain/calc'
import { abonosDeReparto, disponible, partes, saldo } from '../domain/reparto'
import type { Evento, Movimiento } from '../domain/types'
import { Chips, Toggle } from '../ui/kit'
import { Sheet, useToast } from '../ui/overlay'

export function ActividadSheet({ ev, onClose }: { ev: Evento; onClose: () => void }) {
  const { hoy, editarEvento } = useStore()
  const { toast } = useToast()
  const [nombre, setNombre] = useState('')
  const [detalle, setDetalle] = useState('')
  const [g, setG] = useState('')
  const [r, setR] = useState('')

  const guardar = () => {
    if (!nombre.trim()) { toast('Ponle nombre a la actividad'); return }
    const movimientos: Movimiento[] = []
    if (Number(g) > 0) movimientos.push({ id: uid('m'), tipo: 'gasto', monto: Number(g), fecha: hoy, nota: 'Gasto inicial' })
    if (Number(r) > 0) movimientos.push({ id: uid('m'), tipo: 'ingreso', monto: Number(r), fecha: hoy, nota: 'Ingreso inicial' })
    if (editarEvento(ev.id, e => { e.actividades.push({ id: uid('x'), nombre: nombre.trim(), detalle: detalle.trim(), estado: 'En curso', movimientos }) })) {
      toast('Actividad creada'); onClose()
    }
  }

  return (
    <Sheet title="Nueva actividad" onClose={onClose} onSubmit={guardar}>
      <label className="f">Nombre<input className="inp" id="na-n" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej. Rifa 3" autoFocus /></label>
      <label className="f">Detalle<input className="inp" id="na-d" value={detalle} onChange={e => setDetalle(e.target.value)} placeholder="Premio o descripción" /></label>
      <div className="grid2">
        <label className="f">Gastado<input className="inp num" id="na-g" type="number" inputMode="numeric" min={0} value={g} onChange={e => setG(e.target.value)} placeholder="0" /></label>
        <label className="f">Recuperado<input className="inp num" id="na-r" type="number" inputMode="numeric" min={0} value={r} onChange={e => setR(e.target.value)} placeholder="0" /></label>
      </div>
      <button className="btn block" type="submit">Crear actividad</button>
    </Sheet>
  )
}

export function MovimientoSheet({ ev, actividadId, tipo, onClose }: { ev: Evento; actividadId: string; tipo: 'gasto' | 'ingreso'; onClose: () => void }) {
  const { hoy, editarEvento } = useStore()
  const { toast } = useToast()
  const a = ev.actividades.find(x => x.id === actividadId)
  const [monto, setMonto] = useState('')
  const [nota, setNota] = useState('')
  const [terminar, setTerminar] = useState(false)
  if (!a) return null

  const guardar = () => {
    const m = Number(monto)
    if (!(m > 0)) { toast('Escribe el monto'); return }
    const ok = editarEvento(ev.id, e => {
      const x = e.actividades.find(y => y.id === a.id)!
      x.movimientos.push({ id: uid('m'), tipo, monto: m, fecha: hoy, nota: nota.trim() })
      if (terminar) x.estado = 'Terminada'
    })
    if (ok) { toast(`${tipo === 'gasto' ? 'Gasto' : 'Ingreso'} de ${money(m)} registrado`); onClose() }
  }

  return (
    <Sheet title={`${tipo === 'gasto' ? 'Gasto' : 'Ingreso'} en ${a.nombre}`} onClose={onClose} onSubmit={guardar}>
      <label className="f">Monto<input className="inp num" id="mv-m" type="number" inputMode="numeric" min={1} value={monto} onChange={e => setMonto(e.target.value)} autoFocus /></label>
      <label className="f">Nota<input className="inp" id="mv-n" value={nota} onChange={e => setNota(e.target.value)} placeholder={tipo === 'gasto' ? 'Ej. Boletos impresos' : 'Ej. Venta de 20 boletos'} /></label>
      {a.estado === 'En curso' && <div className="between"><span className="small">Marcar la actividad como terminada</span><Toggle id="mv-t" checked={terminar} onChange={setTerminar} label="Terminada" /></div>}
      <button className="btn block" type="submit">Guardar</button>
    </Sheet>
  )
}

/** Abona la ganancia de una actividad (toda o una parte) a un concepto, dividida en partes iguales entre las personas elegidas. */
export function RepartoSheet({ ev, actividadId, onClose }: { ev: Evento; actividadId: string; onClose: () => void }) {
  const { hoy, editarEvento, usuario } = useStore()
  const { toast } = useToast()
  const a = ev.actividades.find(x => x.id === actividadId)
  const conceptos = ev.conceptos.filter(c => ev.personas.some(p => cargo(p, c.id)))
  const [cid, setCid] = useState(conceptos[0]?.id ?? '')
  const conCargo = ev.personas.filter(p => cargo(p, cid))
  const [sel, setSel] = useState<Set<string>>(() => new Set(conCargo.filter(p => saldo(ev, p.id, cid) > 0).map(p => p.id)))
  const [modo, setModo] = useState<'Toda la ganancia' | 'Solo una parte'>('Toda la ganancia')
  const [parte, setParte] = useState('')
  if (!a) return null

  const disp = disponible(ev, a)
  const monto = modo === 'Toda la ganancia' ? disp : Math.round(Number(parte) * 100) / 100
  const elegidos = conCargo.filter(p => sel.has(p.id))
  const montos = partes(monto > 0 ? monto : 0, elegidos.length)
  const parteDe = new Map(elegidos.map((p, i) => [p.id, montos[i]]))
  const todos = conCargo.length > 0 && elegidos.length === conCargo.length

  const cambiarConcepto = (id: string) => {
    setCid(id)
    setSel(new Set(ev.personas.filter(p => cargo(p, id) && saldo(ev, p.id, id) > 0).map(p => p.id)))
  }
  const marcar = (id: string, on: boolean) => setSel(s => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n })

  const guardar = () => {
    if (!cid) { toast('Elige el concepto'); return }
    if (!(monto > 0)) { toast('Escribe cuánto de la ganancia se va a usar'); return }
    if (monto > disp) { toast(`Solo hay ${money(disp)} de ganancia disponible`); return }
    if (!elegidos.length) { toast('Elige al menos una persona'); return }
    const nombre = concepto(ev, cid)?.nombre
    let cabe = true
    const ok = editarEvento(ev.id, e => {
      const x = e.actividades.find(y => y.id === a.id)
      if (!x || monto > disponible(e, x)) { cabe = false; return }
      e.abonos.push(...abonosDeReparto({
        actividadId: a.id, conceptoId: cid, monto, personaIds: elegidos.map(p => p.id),
        fecha: hoy, usuarioId: usuario?.id ?? null, creado: new Date().toISOString(), nuevoId: () => uid('a'),
      }))
    })
    if (!cabe) { toast('La ganancia disponible cambió, revisa el monto'); return }
    if (ok) { toast(`${money(monto)} abonados a ${nombre} de ${plural(elegidos.length, 'persona', 'personas')}`); onClose() }
  }

  return (
    <Sheet title={`Abonar ganancia de ${a.nombre}`} onClose={onClose} onSubmit={guardar}>
      <div className="between"><span className="small muted">Ganancia disponible</span><b className="num">{money(disp)}</b></div>
      {disp <= 0 ? <p className="small muted">Esta actividad no tiene ganancia por abonar. Registra sus ingresos primero.</p> : !conceptos.length ? <p className="small muted">Ninguna persona tiene conceptos asignados todavía.</p> : <>
        <label className="f">Abonar a<select className="inp" id="rp-c" value={cid} onChange={e => cambiarConcepto(e.target.value)}>
          {conceptos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select></label>
        <div className="f">¿Cuánto de la ganancia?<Chips options={['Toda la ganancia', 'Solo una parte'] as const} value={modo} onChange={setModo} /></div>
        {modo === 'Solo una parte' && <label className="f">Monto a usar<input className="inp num" id="rp-m" type="number" inputMode="decimal" min={1} max={disp} step="0.01" value={parte} onChange={e => setParte(e.target.value)} placeholder={`Hasta ${money(disp)}`} autoFocus /></label>}
        <div className="stack" style={{ gap: 0 }}>
          <label className="selp todos">
            <input type="checkbox" id="rp-todos" checked={todos} ref={el => { if (el) el.indeterminate = !todos && elegidos.length > 0 }} onChange={e => setSel(new Set(e.target.checked ? conCargo.map(p => p.id) : []))} />
            <span><b>Seleccionar todos</b><div className="small muted">{elegidos.length} de {conCargo.length} con {concepto(ev, cid)?.nombre}</div></span>
            <span className="num small muted">{elegidos.length > 0 && monto > 0 ? `${money(montos[0])} c/u` : ''}</span>
          </label>
          {conCargo.map(p => {
            const s = saldo(ev, p.id, cid), m = parteDe.get(p.id)
            return (
              <label key={p.id} className="selp">
                <input type="checkbox" checked={sel.has(p.id)} onChange={e => marcar(p.id, e.target.checked)} />
                <span><b>{p.nombre}</b><div className="small muted">{p.grupo ? `${p.grupo} · ` : ''}{s > 0 ? `debe ${money(s)}` : 'liquidado'}</div></span>
                <span className="num" style={{ textAlign: 'right' }}>
                  {m != null && monto > 0 ? <b>{money(m)}</b> : <span className="faint">—</span>}
                  {m != null && monto > 0 && m > s && <div className="small warn-t">{money(m - s)} a favor</div>}
                </span>
              </label>
            )
          })}
        </div>
        {monto > 0 && elegidos.length > 0 && <div className="small muted">Se registra un abono de {concepto(ev, cid)?.nombre} para cada persona elegida. {monto < disp ? `Quedan ${money(disp - monto)} de ganancia para después.` : 'Se usa toda la ganancia.'}</div>}
        <button className="btn block" type="submit" disabled={!(monto > 0) || !elegidos.length}>Abonar {monto > 0 ? money(monto) : ''}</button>
      </>}
    </Sheet>
  )
}
