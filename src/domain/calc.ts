import type { Abono, Actividad, Cargo, Concepto, Evento, ISODate, Persona } from './types'
import { addDays } from './fechas'

export const money = (n: number) => '$' + Math.round(n).toLocaleString('es-MX')
export const pct = (a: number, b: number) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0)
export const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`

export const porTarifa = (c: Concepto, adultos: number, menores: number) =>
  c.tarifa ? adultos * c.tarifa.adulto + menores * c.tarifa.menor : c.base

/** Porcentajes enteros que suman 100 para `n` pagos. */
export function repartirPct(n: number): number[] {
  const b = Math.floor(100 / n)
  return Array.from({ length: n }, (_, i) => (i === 0 ? 100 - b * (n - 1) : b))
}

export interface PagoProgramado { fecha: ISODate; monto: number }

/** Reparte el total de un cargo en las fechas del concepto (redondeado a $50; el último pago absorbe la diferencia). */
export function plan(c: Concepto, monto: number): PagoProgramado[] {
  let acc = 0
  return c.cuotas.map((q, i) => {
    const m = i === c.cuotas.length - 1 ? monto - acc : Math.round((monto * q.pct) / 100 / 50) * 50
    acc += m
    return { fecha: q.fecha, monto: m }
  })
}

export function composicion(g: Cargo): string {
  if (g.adultos == null) return g.cantidad ? plural(g.cantidad, 'persona', 'personas') : 'Monto fijo'
  const a: string[] = []
  if (g.adultos) a.push(plural(g.adultos, 'adulto', 'adultos'))
  if (g.menores) a.push(plural(g.menores, 'menor', 'menores'))
  return a.join(' · ') || 'Sin personas'
}

export const concepto = (ev: Evento, cid: string) => ev.conceptos.find(c => c.id === cid)
export const cargo = (p: Persona, cid: string) => p.cargos.find(g => g.conceptoId === cid)
export const totalPersona = (p: Persona) => p.cargos.reduce((s, g) => s + g.monto, 0)

export const esperado = (ev: Evento, cid?: string) =>
  ev.personas.reduce((s, p) => s + (cid ? cargo(p, cid)?.monto ?? 0 : totalPersona(p)), 0)

/** Solo cuentan los abonos validados; los que subió un participante esperan revisión. */
export const cuenta = (a: Abono) => (a.estado ?? 'validado') === 'validado'

export const pagado = (ev: Evento, pid?: string | null, cid?: string | null) =>
  ev.abonos.filter(a => cuenta(a) && (!pid || a.personaId === pid) && (!cid || a.conceptoId === cid)).reduce((s, a) => s + a.monto, 0)

export const porValidar = (ev: Evento) => ev.abonos.filter(a => a.estado === 'pendiente')

const debidoCargo = (c: Concepto, g: Cargo, hoy: ISODate) =>
  plan(c, g.monto).filter(q => q.fecha <= hoy).reduce((s, q) => s + q.monto, 0)

function sumarCargos(ev: Evento, pid: string | null | undefined, cid: string | null | undefined, f: (p: Persona, g: Cargo, c: Concepto) => number) {
  let v = 0
  for (const p of ev.personas) {
    if (pid && p.id !== pid) continue
    for (const g of p.cargos) {
      if (cid && g.conceptoId !== cid) continue
      const c = concepto(ev, g.conceptoId)
      if (c) v += f(p, g, c)
    }
  }
  return v
}

/** Lo que ya debería estar pagado a la fecha `hoy`. */
export const debido = (ev: Evento, hoy: ISODate, pid?: string | null, cid?: string | null) =>
  sumarCargos(ev, pid, cid, (_p, g, c) => debidoCargo(c, g, hoy))

/** Monto con fecha vencida que no se ha pagado. */
export const vencido = (ev: Evento, hoy: ISODate, pid?: string | null, cid?: string | null) =>
  sumarCargos(ev, pid, cid, (p, g, c) => Math.max(0, debidoCargo(c, g, hoy) - pagado(ev, p.id, c.id)))

export interface Siguiente { fecha: ISODate; monto: number; vencida: boolean }

/** Próximo pago sin cubrir de una persona en un concepto. */
export function siguiente(ev: Evento, p: Persona, c: Concepto, hoy: ISODate): Siguiente | null {
  const g = cargo(p, c.id)
  if (!g) return null
  const pag = pagado(ev, p.id, c.id)
  let cum = 0
  for (const q of plan(c, g.monto)) {
    cum += q.monto
    if (pag < cum) return { fecha: q.fecha, monto: Math.min(q.monto, cum - pag), vencida: q.fecha < hoy }
  }
  return null
}

export type EstadoK = 'ok' | 'warn' | 'bad' | 'neutral'
export function estadoPersona(ev: Evento, p: Persona, hoy: ISODate): { k: EstadoK; t: string } {
  const tot = totalPersona(p), pag = pagado(ev, p.id), v = vencido(ev, hoy, p.id)
  if (tot === 0) return { k: 'neutral', t: 'Sin conceptos' }
  if (pag >= tot) return { k: 'ok', t: 'Liquidado' }
  if (v > 0) return { k: 'bad', t: 'Atrasado ' + money(v) }
  return { k: 'warn', t: 'Al corriente' }
}

export const gastado = (a: Actividad) => a.movimientos.filter(m => m.tipo === 'gasto').reduce((s, m) => s + m.monto, 0)
export const recuperado = (a: Actividad) => a.movimientos.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0)
export const totalGastado = (ev: Evento) => ev.actividades.reduce((s, a) => s + gastado(a), 0)
export const totalRecuperado = (ev: Evento) => ev.actividades.reduce((s, a) => s + recuperado(a), 0)
export const ganancia = (ev: Evento) => totalRecuperado(ev) - totalGastado(ev)

export interface Aviso { p: Persona; c: Concepto; s: Siguiente; envio: ISODate; tipo: 'vencido' | 'proximo' }

/** Recordatorios programados: cada pago pendiente se avisa `diasAntes` días antes; los vencidos, hoy (si está activado). */
export function cola(ev: Evento, hoy: ISODate): Aviso[] {
  const r = ev.recordatorios, out: Aviso[] = []
  for (const p of ev.personas) for (const g of p.cargos) {
    const c = concepto(ev, g.conceptoId)
    if (!c) continue
    const s = siguiente(ev, p, c, hoy)
    if (!s) continue
    if (s.vencida) { if (r.repetirVencidos) out.push({ p, c, s, envio: hoy, tipo: 'vencido' }) }
    else out.push({ p, c, s, envio: addDays(s.fecha, -r.diasAntes), tipo: 'proximo' })
  }
  return out.sort((a, b) => a.envio.localeCompare(b.envio) || a.p.nombre.localeCompare(b.p.nombre))
}

export const saludo = (p: Persona) => (/^familia\s/i.test(p.nombre) ? p.nombre : p.nombre.split(' ')[0])

export const initials = (n: string) =>
  n.replace(/^Familia\s+/i, 'F ').split(/\s+/).slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase()

/**
 * Lo que le toca a una persona en un pago del concepto (índice de la cuota) o en el total (`null`),
 * y cuánto de lo ya validado cubre ese pago. Los abonos se aplican en orden a los pagos más antiguos.
 */
export function avancePago(ev: Evento, p: Persona, c: Concepto, i: number | null): { monto: number; cubierto: number; completo: boolean } {
  const g = cargo(p, c.id)
  if (!g) return { monto: 0, cubierto: 0, completo: false }
  const total = pagado(ev, p.id, c.id)
  if (i === null) return { monto: g.monto, cubierto: Math.min(total, g.monto), completo: total >= g.monto }
  const pl = plan(c, g.monto)
  const antes = pl.slice(0, i).reduce((s, y) => s + y.monto, 0)
  const monto = pl[i]?.monto ?? 0
  const cubierto = Math.max(0, Math.min(monto, total - antes))
  return { monto, cubierto, completo: cubierto >= monto }
}
