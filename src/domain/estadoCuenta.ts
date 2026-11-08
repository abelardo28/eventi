import { composicion, concepto, cuenta, masRecientes, siguiente, totalPersona, type Siguiente } from './calc'
import type { Abono, Evento, ISODate, Persona } from './types'

export interface LineaConcepto { nombre: string; detalle: string; total: number; pagado: number; saldo: number; proximo: Siguiente | null }
export interface EstadoRegistro {
  p: Persona
  conceptos: LineaConcepto[]
  abonos: Abono[]
  /** Comprobantes enviados que todavía no cuentan. */
  porValidar: Abono[]
  total: number
  pagado: number
  saldo: number
  vencido: number
}

const r2 = (n: number) => Math.round(n * 100) / 100

/** Estado de cuenta de un registro (persona o familia): qué le toca, qué pagó y qué le falta. */
export function estadoRegistro(ev: Evento, p: Persona, hoy: ISODate): EstadoRegistro {
  const suyos = ev.abonos.filter(a => a.personaId === p.id)
  const conceptos = p.cargos.flatMap(g => {
    const c = concepto(ev, g.conceptoId)
    if (!c) return []
    const pagado = r2(suyos.filter(a => cuenta(a) && a.conceptoId === c.id).reduce((s, a) => s + a.monto, 0))
    return [{ nombre: c.nombre, detalle: composicion(g), total: g.monto, pagado, saldo: r2(Math.max(0, g.monto - pagado)), proximo: siguiente(ev, p, c, hoy) }]
  })
  const total = totalPersona(p), pagado = r2(conceptos.reduce((s, x) => s + x.pagado, 0))
  return {
    p, conceptos, total, pagado, saldo: r2(Math.max(0, total - pagado)),
    vencido: r2(conceptos.reduce((s, x) => s + (x.proximo?.vencida ? x.proximo.monto : 0), 0)),
    abonos: masRecientes(suyos.filter(cuenta)),
    porValidar: masRecientes(suyos.filter(a => a.estado === 'pendiente')),
  }
}

/** Estado de cuenta de varios registros (p. ej. todos los de un grupo) con sus totales. */
export function estadoGrupo(ev: Evento, personas: Persona[], hoy: ISODate) {
  const registros = personas.map(p => estadoRegistro(ev, p, hoy))
  const suma = (k: 'total' | 'pagado' | 'saldo' | 'vencido') => r2(registros.reduce((s, x) => s + x[k], 0))
  return { registros, total: suma('total'), pagado: suma('pagado'), saldo: suma('saldo'), vencido: suma('vencido') }
}
