import { useState } from 'react'
import { useStore } from '../data/store'
import { uid } from '../data/uid'
import { repartirPct } from '../domain/calc'
import { addDays, addMonths } from '../domain/fechas'
import type { Cargo, Evento } from '../domain/types'
import { Chips, Toggle } from '../ui/kit'
import { Sheet, useToast } from '../ui/overlay'

const TIPOS = ['Mismo monto para todos', 'Por adulto y menor'] as const

export function ConceptoSheet({ ev, onClose }: { ev: Evento; onClose: () => void }) {
  const { hoy, editarEvento } = useStore()
  const { toast } = useToast()
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState<(typeof TIPOS)[number]>(TIPOS[0])
  const [adulto, setAdulto] = useState('')
  const [menor, setMenor] = useState('')
  const [pagos, setPagos] = useState('2')
  const [primero, setPrimero] = useState(addDays(hoy, 15))
  const [todos, setTodos] = useState(false)
  const tarifa = tipo === TIPOS[1]

  const guardar = () => {
    const a = Number(adulto), q = Math.max(1, Math.min(12, Number(pagos) || 1))
    if (!nombre.trim() || !(a > 0)) { toast('Completa nombre y monto'); return }
    const pcts = repartirPct(q)
    const cuotas = pcts.map((pct, j) => ({ fecha: addMonths(primero || hoy, j), pct }))
    const c = { id: uid('c'), nombre: nombre.trim(), base: a, tarifa: tarifa ? { adulto: a, menor: Number(menor) || 0 } : null, cuotas }
    const ok = editarEvento(ev.id, e => {
      e.conceptos.push(c)
      if (todos) for (const p of e.personas) {
        const g: Cargo = tarifa ? { conceptoId: c.id, adultos: 1, menores: 0, monto: a } : { conceptoId: c.id, adultos: null, menores: null, cantidad: 1, monto: a }
        p.cargos.push(g)
      }
    })
    if (ok) { toast('Concepto agregado'); onClose() }
  }

  return (
    <Sheet title="Agregar concepto" onClose={onClose} onSubmit={guardar}>
      <label className="f">Nombre<input className="inp" id="nc-n" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej. Alimentos" autoFocus /></label>
      <Chips options={TIPOS} value={tipo} onChange={setTipo} />
      <div className="grid2">
        <label className="f">{tarifa ? 'Monto por adulto' : 'Monto por persona'}<input className="inp num" id="nc-a" type="number" inputMode="numeric" min={1} value={adulto} onChange={e => setAdulto(e.target.value)} /></label>
        {tarifa && <label className="f">Monto por menor<input className="inp num" id="nc-m" type="number" inputMode="numeric" min={0} value={menor} onChange={e => setMenor(e.target.value)} /></label>}
      </div>
      <div className="grid2">
        <label className="f">Número de pagos<input className="inp num" id="nc-q" type="number" inputMode="numeric" min={1} max={12} value={pagos} onChange={e => setPagos(e.target.value)} /></label>
        <label className="f">Primer pago<input className="inp" id="nc-f" type="date" value={primero} onChange={e => setPrimero(e.target.value)} /></label>
      </div>
      <div className="small muted">Los siguientes pagos se programan cada mes a partir del primero.</div>
      {ev.personas.length > 0 && (
        <div className="between"><span className="small">Asignar a todos ({ev.personas.length}), 1 adulto cada uno</span><Toggle id="nc-todos" checked={todos} onChange={setTodos} label="Asignar a todos" /></div>
      )}
      <button className="btn block" type="submit">Agregar concepto</button>
    </Sheet>
  )
}
