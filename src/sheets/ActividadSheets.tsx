import { useState } from 'react'
import { useStore } from '../data/store'
import { uid } from '../data/uid'
import { money } from '../domain/calc'
import type { Evento, Movimiento } from '../domain/types'
import { Toggle } from '../ui/kit'
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
