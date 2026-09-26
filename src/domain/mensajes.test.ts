import { describe, expect, it } from 'vitest'
import type { Concepto, Evento, Persona } from './types'
import { mensajeRecordatorio, notificacionPush, rellenar, variablesDesconocidas } from './mensajes'

const c: Concepto = { id: 'hos', nombre: 'Hospedaje', base: 2500, tarifa: null, cuotas: [{ fecha: '2026-10-01', pct: 100 }] }
const p: Persona = { id: 'f', nombre: 'Familia López', tipo: 'Familia', telefono: '', cargos: [] }
const ev = (plantillas?: Evento['recordatorios']['plantillas']): Evento => ({
  id: 'e', nombre: 'Torneo', fecha: '2026-11-14', lugar: 'Mazatlán', conceptos: [c], personas: [p], abonos: [], actividades: [], envios: [],
  recordatorios: { diasAntes: 3, hora: '09:00', whatsapp: true, push: false, repetirVencidos: true, cadaDias: 3, plantillas },
})
const s = { fecha: '2026-10-01', monto: 2500, vencida: false }

describe('plantillas de mensajes', () => {
  it('sin plantillas guardadas usa el texto original', () => {
    expect(mensajeRecordatorio(ev(), p, c, s)).toMatch(/^Hola Familia López, te recordamos que el .* Hospedaje para Torneo: \$2,500/)
  })
  it('usa el texto editado y distingue vencido', () => {
    const e = ev({ whatsappProximo: 'Ojo {nombre}: {concepto} {monto} el {fecha}', whatsappVencido: 'Atrasado {concepto}' })
    expect(mensajeRecordatorio(e, p, c, s)).toBe('Ojo Familia López: Hospedaje $2,500 el ' + mensajeRecordatorio(ev({ whatsappProximo: '{fecha}' }), p, c, s))
    expect(mensajeRecordatorio(e, p, c, { ...s, vencida: true })).toBe('Atrasado Hospedaje')
  })
  it('push con título y estado', () => {
    const n = notificacionPush(ev(), p, c, { ...s, vencida: true })
    expect(n.titulo).toBe('Torneo: pago de Hospedaje')
    expect(n.texto).toMatch(/^\$2,500 venció el /)
  })
  it('deja visibles las variables mal escritas', () => {
    expect(rellenar('Hola {nombr}', { nombre: 'Ana' })).toBe('Hola {nombr}')
    expect(variablesDesconocidas('{Nombre} {nombr} {monto}')).toEqual(['nombr'])
  })
})
