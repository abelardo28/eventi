import { useState } from 'react'
import { useStore } from '../data/store'
import { uid } from '../data/uid'
import { money, pagado, plan, plural, porTarifa } from '../domain/calc'
import { fCorta } from '../domain/fechas'
import type { Cargo, Concepto, Evento, Persona, TipoRegistro } from '../domain/types'
import { Chips, Stepper, Toggle } from '../ui/kit'
import { Sheet, useToast } from '../ui/overlay'

interface Borrador { on: boolean; adultos: number; menores: number; cantidad: number; monto: number }

function inicial(c: Concepto, g: Cargo | undefined): Borrador {
  if (g) return { on: true, adultos: g.adultos ?? 1, menores: g.menores ?? 0, cantidad: g.cantidad ?? 1, monto: g.monto }
  return { on: false, adultos: 1, menores: 0, cantidad: 1, monto: porTarifa(c, 1, 0) }
}
const sugerido = (c: Concepto, b: Borrador) => (c.tarifa ? porTarifa(c, b.adultos, b.menores) : c.base * b.cantidad)

/** Alta de persona/familia o edición de sus conceptos, con monto por adulto/menor y ajuste manual. */
export function PersonaSheet({ ev, persona, onClose }: { ev: Evento; persona?: Persona; onClose: () => void }) {
  const { editarEvento } = useStore()
  const { toast } = useToast()
  const [nombre, setNombre] = useState(persona?.nombre ?? '')
  const [telefono, setTelefono] = useState(persona?.telefono ?? '')
  const [tipo, setTipo] = useState<TipoRegistro>(persona?.tipo ?? 'Persona')
  const [cargos, setCargos] = useState<Record<string, Borrador>>(() =>
    Object.fromEntries(ev.conceptos.map(c => [c.id, inicial(c, persona?.cargos.find(g => g.conceptoId === c.id))])))

  const cambiar = (c: Concepto, patch: Partial<Borrador>, recalcular: boolean) =>
    setCargos(prev => {
      const b = { ...prev[c.id], ...patch }
      if (recalcular) b.monto = sugerido(c, b)
      return { ...prev, [c.id]: b }
    })

  const guardar = () => {
    if (!nombre.trim()) { toast('Escribe el nombre'); return }
    const nuevos: Cargo[] = ev.conceptos.filter(c => cargos[c.id].on).map(c => {
      const b = cargos[c.id], monto = Math.max(0, Math.round(b.monto || 0))
      return c.tarifa
        ? { conceptoId: c.id, adultos: b.adultos, menores: b.menores, monto }
        : { conceptoId: c.id, adultos: null, menores: null, cantidad: b.cantidad, monto }
    })
    const ok = editarEvento(ev.id, e => {
      if (persona) {
        const p = e.personas.find(x => x.id === persona.id)!
        Object.assign(p, { nombre: nombre.trim(), telefono: telefono.trim(), tipo, cargos: nuevos })
      } else {
        e.personas.push({ id: uid('p'), nombre: nombre.trim(), tipo, telefono: telefono.trim(), cargos: nuevos })
      }
    })
    if (!ok) return
    toast(persona ? 'Cambios guardados' : `${nombre.trim()} agregado con ${plural(nuevos.length, 'concepto', 'conceptos')}`)
    onClose()
  }

  return (
    <Sheet title={persona ? `Editar ${persona.nombre}` : 'Agregar persona o familia'} onClose={onClose} onSubmit={guardar}>
      <Chips options={['Persona', 'Familia'] as const} value={tipo} onChange={setTipo} />
      <div className="grid2">
        <label className="f">Nombre<input className="inp" id="np-n" value={nombre} onChange={e => setNombre(e.target.value)} placeholder={tipo === 'Familia' ? 'Ej. Familia López' : 'Ej. Ana López'} /></label>
        <label className="f">WhatsApp<input className="inp" id="np-t" type="tel" inputMode="tel" value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="10 dígitos" /></label>
      </div>
      {ev.conceptos.length === 0
        ? <div className="small muted">Este evento aún no tiene conceptos. Agrégalos en la pestaña Conceptos.</div>
        : <div className="small muted">Activa solo los conceptos que le corresponden. El monto se calcula con la tarifa y puedes cambiarlo.</div>}
      {ev.conceptos.map(c => {
        const b = cargos[c.id]
        const conAbonos = !!persona && pagado(ev, persona.id, c.id) > 0
        const sug = sugerido(c, b)
        const pl = plan(c, b.monto || 0)
        return (
          <div key={c.id} className={`cargo ${b.on ? 'on' : ''}`}>
            <div className="between">
              <span><b>{c.nombre}</b>
                <div className="small muted num">{c.tarifa ? `${money(c.tarifa.adulto)} adulto · ${money(c.tarifa.menor)} menor` : `${money(c.base)} por persona`}</div></span>
              <Toggle id={`on-${c.id}`} checked={b.on} disabled={conAbonos && b.on} label={`Cobrar ${c.nombre}`} onChange={v => cambiar(c, { on: v }, false)} />
            </div>
            {b.on && (
              <div className="detail">
                {c.tarifa ? (
                  <>
                    <div className="qty">Adultos<Stepper label="adultos" value={b.adultos} onChange={v => cambiar(c, { adultos: v }, true)} /></div>
                    <div className="qty">Menores<Stepper label="menores" value={b.menores} onChange={v => cambiar(c, { menores: v }, true)} /></div>
                  </>
                ) : (
                  <><div className="qty">Cantidad<Stepper label="cantidad" min={1} value={b.cantidad} onChange={v => cambiar(c, { cantidad: v }, true)} /></div><span /></>
                )}
                <label className="f full">Monto total a cobrar
                  <input className="inp num" type="number" inputMode="numeric" min={0} step={50} id={`mt-${c.id}`} value={b.monto} onChange={e => cambiar(c, { monto: +e.target.value }, false)} />
                </label>
                <div className="calc full">
                  {b.monto !== sug && <>Monto ajustado a mano (por tarifa serían {money(sug)}). </>}
                  Se cobra en {pl.length === 1 ? '1 pago' : `${pl.length} pagos`}: {pl.map(q => `${money(q.monto)} el ${fCorta(q.fecha)}`).join(', ')}.
                </div>
              </div>
            )}
            {conAbonos && <div className="small faint">Ya tiene abonos en este concepto; no se puede quitar.</div>}
          </div>
        )
      })}
      <button className="btn block" type="submit">{persona ? 'Guardar cambios' : 'Agregar'}</button>
    </Sheet>
  )
}
