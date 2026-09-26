import type { ISODate } from './types'

const d = (s: ISODate) => new Date(s + 'T12:00:00')
const iso = (x: Date): ISODate => {
  const m = String(x.getMonth() + 1).padStart(2, '0')
  const day = String(x.getDate()).padStart(2, '0')
  return `${x.getFullYear()}-${m}-${day}`
}

export const hoyISO = (): ISODate => iso(new Date())
export const toDate = d
export const addDays = (s: ISODate, n: number): ISODate => { const x = d(s); x.setDate(x.getDate() + n); return iso(x) }
export const addMonths = (s: ISODate, n: number): ISODate => { const x = d(s); x.setMonth(x.getMonth() + n); return iso(x) }
export const diasEntre = (a: ISODate, b: ISODate) => Math.round((d(b).getTime() - d(a).getTime()) / 864e5)

export const fCorta = (s: ISODate) => d(s).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }).replace('.', '')
export const fMes = (s: ISODate) => d(s).toLocaleDateString('es-MX', { month: 'short' }).replace('.', '')
export const fLarga = (s: ISODate) => d(s).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })
export const fCompleta = (s: ISODate) => d(s).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })

/** Primer día de cada mes, desde el mes siguiente a `desde` hasta antes de `hasta` (máx. 6). */
export function mesesHasta(desde: ISODate, hasta: ISODate): ISODate[] {
  const out: ISODate[] = []
  let x = addMonths(desde.slice(0, 8) + '01', 1)
  while (x < hasta && out.length < 6) { out.push(x); x = addMonths(x, 1) }
  return out.length ? out : [hasta]
}
