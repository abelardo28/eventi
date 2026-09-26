import { describe, expect, it } from 'vitest'
import type { Concepto, Evento, Persona } from './types'
import { cola, debido, esperado, estadoPersona, pagado, plan, porTarifa, repartirPct, siguiente, vencido } from './calc'
import { enlaceWhatsApp, telefonoWhatsApp } from './mensajes'
import { mesesHasta } from './fechas'

const hospedaje: Concepto = {
  id: 'hos', nombre: 'Hospedaje', base: 2500, tarifa: { adulto: 2500, menor: 1500 },
  cuotas: [{ fecha: '2026-09-01', pct: 34 }, { fecha: '2026-10-01', pct: 33 }, { fecha: '2026-11-01', pct: 33 }],
}
const inscripcion: Concepto = { id: 'ins', nombre: 'Inscripción', base: 800, tarifa: null, cuotas: [{ fecha: '2026-09-15', pct: 100 }] }

const familia: Persona = {
  id: 'f', nombre: 'Familia López', tipo: 'Familia', telefono: '667 555 0101',
  cargos: [{ conceptoId: 'hos', adultos: 2, menores: 2, monto: 8000 }],
}
const solo: Persona = {
  id: 's', nombre: 'Carlos Ramírez', tipo: 'Persona', telefono: '',
  cargos: [{ conceptoId: 'ins', adultos: null, menores: null, cantidad: 1, monto: 800 }, { conceptoId: 'hos', adultos: 1, menores: 0, monto: 2500 }],
}

const evento = (abonos: Evento['abonos'] = []): Evento => ({
  id: 'e', nombre: 'Torneo', fecha: '2026-11-14', lugar: 'Mazatlán',
  conceptos: [inscripcion, hospedaje], personas: [familia, solo], abonos, actividades: [], envios: [],
  recordatorios: { diasAntes: 3, hora: '09:00', whatsapp: true, push: false, repetirVencidos: true, cadaDias: 3 },
})
const abono = (personaId: string, conceptoId: string, monto: number) =>
  ({ id: Math.random().toString(), personaId, conceptoId, monto, fecha: '2026-09-01', metodo: 'Efectivo' as const, comprobante: null, estado: 'validado' as const })

describe('tarifas y reparto', () => {
  it('2 adultos y 2 menores de hospedaje suman 8,000', () => {
    expect(porTarifa(hospedaje, 2, 2)).toBe(8000)
  })
  it('reparte el total en las fechas del concepto y suma exacto', () => {
    const p = plan(hospedaje, 8000)
    expect(p.map(x => x.monto)).toEqual([2700, 2650, 2650])
    expect(p.reduce((s, x) => s + x.monto, 0)).toBe(8000)
  })
  it('los porcentajes siempre suman 100', () => {
    for (const n of [1, 2, 3, 6, 7]) expect(repartirPct(n).reduce((a, b) => a + b, 0)).toBe(100)
  })
  it('genera pagos mensuales hasta la fecha del evento', () => {
    expect(mesesHasta('2026-09-25', '2026-12-12')).toEqual(['2026-10-01', '2026-11-01', '2026-12-01'])
  })
})

describe('cargos distintos por persona', () => {
  it('solo cuenta lo que se le asignó a cada quien', () => {
    const ev = evento()
    expect(esperado(ev)).toBe(8000 + 800 + 2500)
    expect(esperado(ev, 'ins')).toBe(800)
  })
  it('calcula lo vencido con el plan de cada persona', () => {
    const ev = evento([abono('f', 'hos', 2000)])
    // A la fecha vence el primer pago: familia 2,700, Carlos 850 de hospedaje + 800 de inscripción
    expect(debido(ev, '2026-09-25')).toBe(2700 + 850 + 800)
    expect(vencido(ev, '2026-09-25', 'f')).toBe(700)
    expect(vencido(ev, '2026-09-25', 's')).toBe(1650)
  })
  it('el siguiente pago descuenta lo abonado', () => {
    const ev = evento([abono('f', 'hos', 3000)])
    expect(siguiente(ev, familia, hospedaje, '2026-09-25')).toEqual({ fecha: '2026-10-01', monto: 2350, vencida: false })
  })
  it('estado: liquidado, atrasado o al corriente', () => {
    const ev = evento([abono('s', 'ins', 800), abono('s', 'hos', 2500), abono('f', 'hos', 2700)])
    expect(pagado(ev, 's')).toBe(3300)
    expect(estadoPersona(ev, solo, '2026-09-25').k).toBe('ok')
    expect(estadoPersona(ev, familia, '2026-09-25').k).toBe('warn')
    expect(estadoPersona(evento(), familia, '2026-09-25').k).toBe('bad')
  })
})

describe('recordatorios', () => {
  it('programa el aviso días antes y los vencidos para hoy', () => {
    const ev = evento([abono('f', 'hos', 2700)])
    const c = cola(ev, '2026-09-25')
    const fam = c.find(x => x.p.id === 'f')!
    expect(fam.envio).toBe('2026-09-28')
    expect(fam.tipo).toBe('proximo')
    expect(c.filter(x => x.p.id === 's').every(x => x.tipo === 'vencido' && x.envio === '2026-09-25')).toBe(true)
  })
  it('arma el enlace de WhatsApp con lada de México', () => {
    expect(telefonoWhatsApp('667 555 0101')).toBe('526675550101')
    expect(enlaceWhatsApp('+52 667 555 0101', 'Hola')).toBe('https://wa.me/526675550101?text=Hola')
    expect(enlaceWhatsApp('123', 'Hola')).toBeNull()
  })
})
