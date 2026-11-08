import type { Cargo, Concepto, Evento } from './types'
import { porTarifa, repartirPct } from './calc'
import { addMonths } from './fechas'

/** Borrador editable de un concepto (formulario). */
export interface BorradorConcepto {
  id?: string
  nombre: string
  porEdad: boolean
  adulto: number
  menor: number
  /** `monto` presente = monto fijo por registro en vez de porcentaje. */
  cuotas: { fecha: string; pct: number; monto?: number }[]
}

export const borradorDe = (c: Concepto): BorradorConcepto => ({
  id: c.id, nombre: c.nombre, porEdad: !!c.tarifa, adulto: c.tarifa?.adulto ?? c.base, menor: c.tarifa?.menor ?? 0,
  cuotas: c.cuotas.map(q => ({ ...q })),
})

/** `n` pagos mensuales a partir de `primero`, con porcentajes que suman 100. */
export const cuotasMensuales = (primero: string, n: number) =>
  repartirPct(Math.max(1, n)).map((pct, i) => ({ fecha: addMonths(primero, i), pct }))

export function problemaConcepto(b: BorradorConcepto, otros: string[]): string | null {
  const nombre = b.nombre.trim()
  if (!nombre) return 'Ponle nombre al concepto.'
  if (otros.some(o => o.trim().toLowerCase() === nombre.toLowerCase())) return `Ya hay un concepto llamado "${nombre}".`
  if (!(b.adulto > 0)) return `Escribe el monto de ${nombre}.`
  if (b.porEdad && b.menor < 0) return 'El monto por menor no puede ser negativo.'
  if (!b.cuotas.length) return `${nombre} necesita al menos una fecha de pago.`
  if (b.cuotas.some(q => !q.fecha)) return `Falta una fecha de pago en ${nombre}.`
  const orden = ordenadas(b.cuotas)
  if (orden.length === 1 && orden[0].monto != null) return null
  if (orden.length === 1 || !orden.some(q => q.monto != null)) {
    if (orden.some(q => !(q.pct > 0))) return `Cada pago de ${nombre} debe tener un porcentaje mayor a 0.`
    const suma = orden.reduce((s, q) => s + q.pct, 0)
    if (suma !== 100) return `Los pagos de ${nombre} suman ${suma}%; deben sumar 100%.`
    return null
  }
  // Con montos fijos el último pago (por fecha) cubre lo que falte
  const antes = orden.slice(0, -1)
  if (antes.some(q => (q.monto != null ? !(q.monto > 0) : !(q.pct > 0)))) return `Cada pago de ${nombre} debe tener un porcentaje o un monto mayor a 0.`
  const suma = antes.reduce((s, q) => s + (q.monto != null ? 0 : q.pct), 0)
  if (suma >= 100) return `Los porcentajes de ${nombre} ya suman ${suma}%; deja algo para el último pago.`
  return null
}

const ordenadas = <T extends { fecha: string }>(xs: T[]) => xs.slice().sort((x, y) => x.fecha.localeCompare(y.fecha))

/** Índice (en el formulario) del pago con la fecha más tardía: con montos fijos es el que cubre lo que falte. */
export function indiceUltimo(cuotas: { fecha: string }[]): number {
  let k = 0
  cuotas.forEach((q, i) => { if (q.fecha >= cuotas[k].fecha) k = i })
  return k
}

export function aConcepto(b: BorradorConcepto, id: string): Concepto {
  return {
    id, nombre: b.nombre.trim(), base: b.adulto,
    tarifa: b.porEdad ? { adulto: b.adulto, menor: b.menor } : null,
    cuotas: aCuotas(b.cuotas),
  }
}

function aCuotas(xs: BorradorConcepto['cuotas']): Concepto['cuotas'] {
  const orden = ordenadas(xs)
  if (orden.length === 1 && orden[0].monto != null) return [{ fecha: orden[0].fecha, pct: 100 }]
  if (orden.length === 1 || !orden.some(q => q.monto != null)) return orden.map(q => ({ fecha: q.fecha, pct: q.pct }))
  return orden.map((q, i) => (i === orden.length - 1 ? { fecha: q.fecha, pct: 0 }
    : q.monto != null ? { fecha: q.fecha, pct: 0, monto: q.monto } : { fecha: q.fecha, pct: q.pct }))
}

/** ¿El monto del cargo es el que da la tarifa (no se ajustó a mano)? */
function usaTarifa(c: Concepto, g: Cargo): boolean {
  if (g.adultos != null) return g.monto === porTarifa(c, g.adultos, g.menores ?? 0)
  if (g.cantidad != null) return g.monto === c.base * g.cantidad
  return false
}

/**
 * Reemplaza un concepto. Si `actualizarMontos`, a quienes pagan según la tarifa anterior se les recalcula
 * con la nueva; los montos ajustados a mano no se tocan. Devuelve cuántos cargos cambiaron.
 */
export function actualizarConcepto(ev: Evento, nuevo: Concepto, actualizarMontos: boolean): number {
  const i = ev.conceptos.findIndex(c => c.id === nuevo.id)
  if (i < 0) return 0
  const viejo = ev.conceptos[i]
  ev.conceptos[i] = nuevo
  let cambiados = 0
  for (const p of ev.personas) for (const g of p.cargos) {
    if (g.conceptoId !== nuevo.id) continue
    const seguiaTarifa = usaTarifa(viejo, g)
    // Cambió de fijo a por edad o al revés: se ajusta la forma del cargo
    if (nuevo.tarifa && g.adultos == null && g.cantidad != null) { g.adultos = g.cantidad; g.menores = 0; delete g.cantidad }
    else if (!nuevo.tarifa && g.adultos != null) { g.cantidad = Math.max(1, g.adultos + (g.menores ?? 0)); g.adultos = null; g.menores = null }
    if (!actualizarMontos || !seguiaTarifa) continue
    const monto = g.adultos != null ? porTarifa(nuevo, g.adultos, g.menores ?? 0) : nuevo.base * (g.cantidad ?? 1)
    if (monto !== g.monto) { g.monto = monto; cambiados++ }
  }
  return cambiados
}

/** Un concepto con abonos no se puede borrar (se perdería el historial de pagos). */
export const abonosDeConcepto = (ev: Evento, cid: string) => ev.abonos.filter(a => a.conceptoId === cid).length

export function eliminarConcepto(ev: Evento, cid: string): boolean {
  if (abonosDeConcepto(ev, cid) > 0) return false
  ev.conceptos = ev.conceptos.filter(c => c.id !== cid)
  for (const p of ev.personas) p.cargos = p.cargos.filter(g => g.conceptoId !== cid)
  return true
}
