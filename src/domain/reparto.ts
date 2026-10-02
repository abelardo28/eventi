import { cargo, cuenta, gastado, recuperado } from './calc'
import type { Abono, Actividad, Evento, ISODate } from './types'

const centavos = (n: number) => Math.round(n * 100)

/** Lo que ya se abonó a conceptos con la ganancia de una actividad. */
export const repartido = (ev: Evento, actividadId: string) =>
  centavos(ev.abonos.filter(a => a.actividadId === actividadId && cuenta(a)).reduce((s, a) => s + a.monto, 0)) / 100

/** Ganancia de la actividad que todavía no se ha abonado a nadie. */
export const disponible = (ev: Evento, a: Actividad) =>
  Math.max(0, centavos(recuperado(a) - gastado(a) - repartido(ev, a.id)) / 100)

/** Divide `total` en `n` partes iguales al centavo; los centavos que sobran van a los primeros. */
export function partes(total: number, n: number): number[] {
  if (n <= 0) return []
  const t = centavos(total), b = Math.floor(t / n), r = t - b * n
  return Array.from({ length: n }, (_, i) => (b + (i < r ? 1 : 0)) / 100)
}

/** Lo que a la persona le falta pagar del concepto (abonos validados). */
export function saldo(ev: Evento, personaId: string, conceptoId: string): number {
  const p = ev.personas.find(x => x.id === personaId)
  const g = p && cargo(p, conceptoId)
  if (!g) return 0
  const pg = ev.abonos.filter(a => cuenta(a) && a.personaId === personaId && a.conceptoId === conceptoId).reduce((s, a) => s + a.monto, 0)
  return Math.max(0, centavos(g.monto - pg) / 100)
}

export interface Reparto {
  actividadId: string
  conceptoId: string
  monto: number
  personaIds: string[]
  fecha: ISODate
  usuarioId: string | null
  creado: string
  nuevoId: () => string
}

/** Un abono validado por persona elegida, con su parte de la ganancia. */
export function abonosDeReparto(r: Reparto): Abono[] {
  return partes(r.monto, r.personaIds.length).map((m, i) => ({
    id: r.nuevoId(), personaId: r.personaIds[i], conceptoId: r.conceptoId, monto: m, fecha: r.fecha, metodo: 'Actividad',
    comprobante: null, estado: 'validado', registradoPor: r.usuarioId, creado: r.creado, actividadId: r.actividadId,
  }))
}

/** Cómo se pagó, en palabras: "Transferencia" o "Ganancia de Rifa 1". */
export function formaDePago(ev: Evento, a: Abono): string {
  if (a.metodo !== 'Actividad') return a.metodo
  return `Ganancia de ${ev.actividades.find(x => x.id === a.actividadId)?.nombre ?? 'una actividad'}`
}
