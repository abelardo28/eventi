import { composicion, concepto, cuenta, integrantes, masRecientes, plural, siguiente, totalPersona, type Siguiente } from './calc'
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

/** Estado de cuenta de un registro (persona o familia): qué le toca, qué pagó y qué le falta.
 *  Con `cids` solo cuentan esos conceptos (sus cargos y sus abonos). */
export function estadoRegistro(ev: Evento, p: Persona, hoy: ISODate, cids?: ReadonlySet<string>): EstadoRegistro {
  const entra = (cid: string) => !cids || cids.has(cid)
  const suyos = ev.abonos.filter(a => a.personaId === p.id && entra(a.conceptoId))
  const conceptos = p.cargos.filter(g => entra(g.conceptoId)).flatMap(g => {
    const c = concepto(ev, g.conceptoId)
    if (!c) return []
    const pagado = r2(suyos.filter(a => cuenta(a) && a.conceptoId === c.id).reduce((s, a) => s + a.monto, 0))
    return [{ nombre: c.nombre, detalle: composicion(g), total: g.monto, pagado, saldo: r2(Math.max(0, g.monto - pagado)), proximo: siguiente(ev, p, c, hoy) }]
  })
  const total = cids ? r2(p.cargos.filter(g => entra(g.conceptoId)).reduce((s, g) => s + g.monto, 0)) : totalPersona(p), pagado = r2(conceptos.reduce((s, x) => s + x.pagado, 0))
  return {
    p, conceptos, total, pagado, saldo: r2(Math.max(0, total - pagado)),
    vencido: r2(conceptos.reduce((s, x) => s + (x.proximo?.vencida ? x.proximo.monto : 0), 0)),
    abonos: masRecientes(suyos.filter(cuenta)),
    porValidar: masRecientes(suyos.filter(a => a.estado === 'pendiente')),
  }
}

/** Estado de cuenta de varios registros (p. ej. todos los de un grupo) con sus totales. */
export function estadoGrupo(ev: Evento, personas: Persona[], hoy: ISODate, cids?: ReadonlySet<string>) {
  const registros = personas.map(p => estadoRegistro(ev, p, hoy, cids))
  const suma = (k: 'total' | 'pagado' | 'saldo' | 'vencido') => r2(registros.reduce((s, x) => s + x[k], 0))
  return { registros, total: suma('total'), pagado: suma('pagado'), saldo: suma('saldo'), vencido: suma('vencido') }
}

export const tipoRegistro = (r: EstadoRegistro) => r.p.tipo === 'Familia' ? `Familia · ${plural(integrantes(r.p), 'persona', 'personas')}` : 'Persona'

export interface SubtotalGrupo { nombre: string; registros: number; personas: number; total: number; pagado: number; saldo: number }

/** Subtotales por grupo (los registros sin grupo van al final como "Sin grupo"). Vacío si nadie tiene grupo. */
export function subtotalesPorGrupo(registros: EstadoRegistro[]): SubtotalGrupo[] {
  if (!registros.some(r => r.p.grupo)) return []
  const m = new Map<string, SubtotalGrupo>()
  for (const r of registros) {
    const nombre = r.p.grupo ?? 'Sin grupo'
    const g = m.get(nombre) ?? { nombre, registros: 0, personas: 0, total: 0, pagado: 0, saldo: 0 }
    g.registros++; g.personas += integrantes(r.p)
    g.total = r2(g.total + r.total); g.pagado = r2(g.pagado + r.pagado); g.saldo = r2(g.saldo + r.saldo)
    m.set(nombre, g)
  }
  return [...m.values()].sort((a, b) => (a.nombre === 'Sin grupo' ? 1 : 0) - (b.nombre === 'Sin grupo' ? 1 : 0) || a.nombre.localeCompare(b.nombre, 'es'))
}
