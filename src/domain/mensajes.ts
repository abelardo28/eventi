import type { Concepto, Evento, Persona } from './types'
import { money, saludo, type Siguiente } from './calc'
import { fCorta } from './fechas'

export function mensajeRecordatorio(ev: Evento, p: Persona, c: Concepto, s: Siguiente): string {
  const quien = saludo(p)
  return s.vencida
    ? `Hola ${quien}, tu pago de ${c.nombre} para ${ev.nombre} venció el ${fCorta(s.fecha)}. Saldo pendiente: ${money(s.monto)}.\nPuedes subir tu comprobante en Eventi.`
    : `Hola ${quien}, te recordamos que el ${fCorta(s.fecha)} vence tu pago de ${c.nombre} para ${ev.nombre}: ${money(s.monto)}.\nPuedes subir tu comprobante en Eventi.`
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
