import { useState } from 'react'
import { useStore } from '../data/store'
import { uid } from '../data/uid'
import { money, plural, repartirPct } from '../domain/calc'
import { abonosDeConcepto, aConcepto, actualizarConcepto, borradorDe, cuotasMensuales, eliminarConcepto, problemaConcepto, type BorradorConcepto } from '../domain/conceptos'
import { addDays, addMonths } from '../domain/fechas'
import type { Cargo, Concepto, Evento } from '../domain/types'
import { IcClose, IcPlus, IcTrash } from '../ui/icons'
import { Toggle } from '../ui/kit'
import { Sheet, useToast } from '../ui/overlay'

/** Campos de un concepto: nombre, tipo de cobro, montos y fechas de pago con su porcentaje. */
export function ConceptoCampos({ b, onChange, idp }: { b: BorradorConcepto; onChange: (b: BorradorConcepto) => void; idp: string }) {
  const set = (patch: Partial<BorradorConcepto>) => onChange({ ...b, ...patch })
  const setCuota = (i: number, patch: Partial<BorradorConcepto['cuotas'][number]>) => set({ cuotas: b.cuotas.map((q, j) => (j === i ? { ...q, ...patch } : q)) })
  const suma = b.cuotas.reduce((s, q) => s + (q.pct || 0), 0)
  const agregarPago = () => {
    const ultima = b.cuotas[b.cuotas.length - 1]?.fecha
    const cuotas = [...b.cuotas, { fecha: ultima ? addMonths(ultima, 1) : '', pct: 0 }]
    const pcts = repartirPct(cuotas.length)
    set({ cuotas: cuotas.map((q, i) => ({ ...q, pct: pcts[i] })) })
  }
  const repartir = () => { const pcts = repartirPct(b.cuotas.length); set({ cuotas: b.cuotas.map((q, i) => ({ ...q, pct: pcts[i] })) }) }

  return (
    <>
      <label className="f">Nombre<input className="inp" id={`${idp}-n`} value={b.nombre} onChange={e => set({ nombre: e.target.value })} placeholder="Ej. Hospedaje" /></label>
      <div className="chips">
        <button type="button" className="chip" aria-pressed={!b.porEdad} onClick={() => set({ porEdad: false })}>Mismo monto para todos</button>
        <button type="button" className="chip" aria-pressed={b.porEdad} onClick={() => set({ porEdad: true })}>Por adulto y menor</button>
      </div>
      <div className="grid2">
        <label className="f">{b.porEdad ? 'Monto por adulto' : 'Monto por persona'}
          <input className="inp num" id={`${idp}-a`} type="number" inputMode="numeric" min={0} value={b.adulto || ''} onChange={e => set({ adulto: +e.target.value })} /></label>
        {b.porEdad && <label className="f">Monto por menor
          <input className="inp num" id={`${idp}-m`} type="number" inputMode="numeric" min={0} value={b.menor || ''} onChange={e => set({ menor: +e.target.value })} /></label>}
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <div className="between"><span className="f">Fechas de pago</span>
          <span className={`small num ${suma === 100 ? 'muted' : 'neg'}`}>Suma {suma}%</span></div>
        {b.cuotas.map((q, i) => (
          <div key={i} className="row" style={{ gap: 6 }}>
            <input className="inp" style={{ flex: 1 }} type="date" id={`${idp}-f${i}`} value={q.fecha} aria-label={`Fecha del pago ${i + 1}`} onChange={e => setCuota(i, { fecha: e.target.value })} />
            <span className="row" style={{ gap: 4, width: 92 }}>
              <input className="inp num" type="number" inputMode="numeric" min={1} max={100} id={`${idp}-p${i}`} value={q.pct || ''} aria-label={`Porcentaje del pago ${i + 1}`} onChange={e => setCuota(i, { pct: +e.target.value })} />
              <span className="small muted">%</span>
            </span>
            <button type="button" className="iconbtn" aria-label={`Quitar pago ${i + 1}`} disabled={b.cuotas.length === 1} onClick={() => set({ cuotas: b.cuotas.filter((_, j) => j !== i) })}><IcClose size={16} /></button>
          </div>
        ))}
        <div className="row wrap">
          <button type="button" className="btn sm ghost" onClick={agregarPago}><IcPlus />Agregar pago</button>
          {suma !== 100 && <button type="button" className="btn sm ghost" onClick={repartir}>Repartir en partes iguales</button>}
        </div>
      </div>
    </>
  )
}

/** Alta o edición de un concepto en un evento existente (solo administrador). */
export function ConceptoSheet({ ev, concepto, onClose }: { ev: Evento; concepto?: Concepto; onClose: () => void }) {
  const { hoy, editarEvento } = useStore()
  const { toast } = useToast()
  const [b, setB] = useState<BorradorConcepto>(() => concepto ? borradorDe(concepto)
    : { nombre: '', porEdad: false, adulto: 0, menor: 0, cuotas: cuotasMensuales(addDays(hoy, 15), 2) })
  const [actualizar, setActualizar] = useState(true)
  const [todos, setTodos] = useState(false)
  const [borrar, setBorrar] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const asignados = concepto ? ev.personas.filter(p => p.cargos.some(g => g.conceptoId === concepto.id)).length : 0
  const conAbonos = concepto ? abonosDeConcepto(ev, concepto.id) : 0
  const cambiaMonto = !!concepto && (b.adulto !== borradorDe(concepto).adulto || b.menor !== borradorDe(concepto).menor || b.porEdad !== !!concepto.tarifa)

  const guardar = () => {
    const p = problemaConcepto(b, ev.conceptos.filter(c => c.id !== concepto?.id).map(c => c.nombre))
    if (p) { setError(p); return }
    let cambiados = 0
    const ok = editarEvento(ev.id, e => {
      if (concepto) {
        cambiados = actualizarConcepto(e, aConcepto(b, concepto.id), actualizar)
      } else {
        const c = aConcepto(b, uid('c'))
        e.conceptos.push(c)
        if (todos) for (const per of e.personas) {
          const g: Cargo = c.tarifa ? { conceptoId: c.id, adultos: 1, menores: 0, monto: c.tarifa.adulto } : { conceptoId: c.id, adultos: null, menores: null, cantidad: 1, monto: c.base }
          per.cargos.push(g)
        }
      }
    })
    if (!ok) return
    toast(concepto ? (cambiados ? `Concepto actualizado; se recalcularon ${plural(cambiados, 'monto', 'montos')}` : 'Concepto actualizado') : 'Concepto agregado')
    onClose()
  }

  const eliminar = () => {
    let ok = false
    editarEvento(ev.id, e => { ok = eliminarConcepto(e, concepto!.id) })
    if (ok) { toast(`${concepto!.nombre} eliminado`); onClose() }
  }

  return (
    <Sheet title={concepto ? `Editar ${concepto.nombre}` : 'Agregar concepto'} onClose={onClose} onSubmit={guardar}>
      <ConceptoCampos b={b} onChange={x => { setB(x); setError(null) }} idp="cs" />
      {concepto && cambiaMonto && asignados > 0 && (
        <div className="between">
          <span className="small">Recalcular el monto de quienes pagan por tarifa ({plural(asignados, 'registro', 'registros')}). Los montos ajustados a mano no cambian.</span>
          <Toggle id="cs-act" checked={actualizar} onChange={setActualizar} label="Recalcular montos" />
        </div>
      )}
      {!concepto && ev.personas.length > 0 && (
        <div className="between"><span className="small">Asignar a todos ({ev.personas.length}), 1 {b.porEdad ? 'adulto' : 'persona'} cada uno</span>
          <Toggle id="cs-todos" checked={todos} onChange={setTodos} label="Asignar a todos" /></div>
      )}
      {concepto && <div className="small muted">Cambiar las fechas o porcentajes reparte de nuevo lo que cada quien debe; lo ya pagado se respeta.</div>}
      {error && <div className="small neg" role="alert">{error}</div>}
      <button className="btn block" type="submit">{concepto ? 'Guardar cambios' : 'Agregar concepto'}</button>
      {concepto && (conAbonos > 0
        ? <div className="small faint">No se puede eliminar: tiene {plural(conAbonos, 'abono registrado', 'abonos registrados')}.</div>
        : borrar
          ? (
            <div className="confirm">
              <span>¿Eliminar {concepto.nombre}? Se quitará a {plural(asignados, 'registro', 'registros')} que lo tienen asignado.</span>
              <div className="row"><button type="button" className="btn sm danger" onClick={eliminar}><IcTrash />Sí, eliminar</button><button type="button" className="btn sm ghost" onClick={() => setBorrar(false)}>Cancelar</button></div>
            </div>
          )
          : <button type="button" className="linkbtn small danger" style={{ alignSelf: 'flex-start' }} onClick={() => setBorrar(true)}>Eliminar concepto</button>)}
      {concepto && <div className="small faint num">Monto actual: {concepto.tarifa ? `${money(concepto.tarifa.adulto)} adulto · ${money(concepto.tarifa.menor)} menor` : `${money(concepto.base)} por persona`}</div>}
    </Sheet>
  )
}
