import type { Concepto, Evento, Persona, Plantillas } from './types'
import { money, saludo, type Siguiente } from './calc'
import { fCorta } from './fechas'

export const PLANTILLAS: Plantillas = {
  whatsappProximo: 'Hola {nombre}, te recordamos que el {fecha} vence tu pago de {concepto} para {evento}: {monto}.\nPuedes subir tu comprobante en Eventi.',
  whatsappVencido: 'Hola {nombre}, tu pago de {concepto} para {evento} venció el {fecha}. Saldo pendiente: {monto}.\nPuedes subir tu comprobante en Eventi.',
  pushTitulo: '{evento}: pago de {concepto}',
  pushTexto: '{monto} {estado}. Toca para subir tu comprobante.',
}

export const VARIABLES = [
  { clave: 'nombre', descripcion: 'Nombre o familia' },
  { clave: 'concepto', descripcion: 'Concepto' },
  { clave: 'monto', descripcion: 'Monto del pago' },
  { clave: 'fecha', descripcion: 'Fecha límite' },
  { clave: 'estado', descripcion: '“vence el…” o “venció el…”' },
  { clave: 'evento', descripcion: 'Evento' },
] as const

export const plantillas = (ev: Evento): Plantillas => ({ ...PLANTILLAS, ...ev.recordatorios.plantillas })

export function variables(ev: Evento, p: Persona, c: Concepto, s: Siguiente): Record<string, string> {
  const fecha = fCorta(s.fecha)
  return {
    nombre: saludo(p), concepto: c.nombre, monto: money(s.monto), fecha, evento: ev.nombre,
    estado: s.vencida ? `venció el ${fecha}` : `vence el ${fecha}`,
  }
}

/** Sustituye {variable}; las llaves desconocidas se dejan tal cual para que se note el error. */
export const rellenar = (texto: string, vars: Record<string, string>) =>
  texto.replace(/\{(\w+)\}/g, (m, k: string) => vars[k.toLowerCase()] ?? m)

/** Variables escritas en el texto que no existen (p. ej. {nombr}). */
export const variablesDesconocidas = (texto: string) =>
  [...texto.matchAll(/\{(\w+)\}/g)].map(m => m[1]).filter(k => !VARIABLES.some(v => v.clave === k.toLowerCase()))

export function mensajeRecordatorio(ev: Evento, p: Persona, c: Concepto, s: Siguiente): string {
  const t = plantillas(ev)
  return rellenar(s.vencida ? t.whatsappVencido : t.whatsappProximo, variables(ev, p, c, s))
}

export function notificacionPush(ev: Evento, p: Persona, c: Concepto, s: Siguiente): { titulo: string; texto: string } {
  const t = plantillas(ev), v = variables(ev, p, c, s)
  return { titulo: rellenar(t.pushTitulo, v), texto: rellenar(t.pushTexto, v) }
}

/** Deja solo dígitos; si son 10 (número mexicano sin lada internacional) antepone 52. */
export function telefonoWhatsApp(tel: string): string | null {
  const dig = tel.replace(/\D/g, '')
  if (dig.length === 10) return '52' + dig
  if (dig.length >= 11 && dig.length <= 15) return dig
  return null
}

/** Enlace que abre WhatsApp con el mensaje escrito, listo para enviar. */
export function enlaceWhatsApp(tel: string, texto: string): string | null {
  const n = telefonoWhatsApp(tel)
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(texto)}` : null
}
