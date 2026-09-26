import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../data/store'
import { uid } from '../data/uid'
import { repartirPct } from '../domain/calc'
import { addMonths, mesesHasta } from '../domain/fechas'
import type { Concepto, Evento } from '../domain/types'
import { Sheet, useToast } from '../ui/overlay'

interface Base { nombre: string; on: boolean; adulto: number; menor: number | null }
const INICIALES: Base[] = [
  { nombre: 'Inscripción', on: true, adulto: 800, menor: null },
  { nombre: 'Hospedaje', on: true, adulto: 2500, menor: 1500 },
  { nombre: 'Transporte', on: true, adulto: 1200, menor: 800 },
  { nombre: 'Uniformes', on: true, adulto: 950, menor: null },
  { nombre: 'Alimentos', on: false, adulto: 600, menor: 400 },
]

export function EventoSheet({ onClose }: { onClose: () => void }) {
  const { hoy, agregarEvento } = useStore()
  const { toast } = useToast()
  const nav = useNavigate()
  const [nombre, setNombre] = useState('')
  const [fecha, setFecha] = useState(addMonths(hoy, 2))
  const [lugar, setLugar] = useState('')
  const [conceptos, setConceptos] = useState(INICIALES)
  const set = (i: number, c: Partial<Base>) => setConceptos(xs => xs.map((x, j) => (j === i ? { ...x, ...c } : x)))

  const crear = () => {
    if (!nombre.trim()) { toast('Ponle nombre al evento'); return }
    const meses = mesesHasta(hoy, fecha)
    const cs: Concepto[] = conceptos.filter(c => c.on && c.adulto > 0).map(c => {
      const n = c.adulto >= 1000 ? meses.length : 1
      const pcts = repartirPct(n)
      return {
        id: uid('c'), nombre: c.nombre, base: c.adulto,
        tarifa: c.menor != null ? { adulto: c.adulto, menor: c.menor } : null,
        cuotas: meses.slice(0, n).map((f, j) => ({ fecha: f, pct: pcts[j] })),
      }
    })
    const ev: Evento = {
      id: uid('e'), nombre: nombre.trim(), fecha, lugar: lugar.trim() || 'Por definir',
      conceptos: cs, personas: [], abonos: [], actividades: [], envios: [],
      recordatorios: { diasAntes: 3, hora: '09:00', whatsapp: true, push: false, repetirVencidos: true, cadaDias: 3 },
    }
    agregarEvento(ev)
    onClose()
    nav(`/e/${ev.id}/personas`)
    toast('Evento creado. Ahora agrega personas o familias')
  }

  return (
    <Sheet title="Nuevo evento" onClose={onClose} onSubmit={crear}>
      <label className="f">Nombre del evento<input className="inp" id="ne-n" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej. Torneo Beisbol Veteranos" autoFocus /></label>
      <div className="grid2">
        <label className="f">Fecha<input className="inp" id="ne-f" type="date" value={fecha} min={hoy} onChange={e => setFecha(e.target.value || fecha)} /></label>
        <label className="f">Lugar<input className="inp" id="ne-l" value={lugar} onChange={e => setLugar(e.target.value)} placeholder="Ciudad o sede" /></label>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <span className="f">Conceptos y tarifas</span>
        {conceptos.map((c, i) => (
          <div key={c.nombre} className="row" style={{ gap: 6 }}>
            <button type="button" className="chip" aria-pressed={c.on} onClick={() => set(i, { on: !c.on })} style={{ flex: 1, textAlign: 'left' }}>{c.nombre}</button>
            <input className="inp num" style={{ width: 96 }} type="number" inputMode="numeric" id={`ne-a${i}`} value={c.adulto}
              aria-label={`${c.menor != null ? 'Tarifa adulto' : 'Monto por persona'} de ${c.nombre}`} onChange={e => set(i, { adulto: +e.target.value })} />
            {c.menor != null
              ? <input className="inp num" style={{ width: 86 }} type="number" inputMode="numeric" id={`ne-m${i}`} value={c.menor} aria-label={`Tarifa menor de ${c.nombre}`} onChange={e => set(i, { menor: +e.target.value })} />
              : <span style={{ width: 86 }} />}
          </div>
        ))}
        <div className="small muted">Con dos montos: adulto y menor. Los pagos se reparten cada mes hasta el evento; puedes agregar más conceptos después.</div>
      </div>
      <button className="btn block" type="submit">Crear evento</button>
    </Sheet>
  )
}
