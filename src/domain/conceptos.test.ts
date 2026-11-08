import { describe, expect, it } from 'vitest'
import type { Evento } from './types'
import { actualizarConcepto, aConcepto, borradorDe, eliminarConcepto, problemaConcepto, type BorradorConcepto } from './conceptos'
import { etiquetaCuota, plan } from './calc'

const ev = (): Evento => ({
  id: 'e', nombre: 'T', fecha: '2026-12-01', lugar: '', actividades: [], envios: [],
  conceptos: [{ id: 'h', nombre: 'Hospedaje', base: 2500, tarifa: { adulto: 2500, menor: 1500 }, cuotas: [{ fecha: '2026-10-01', pct: 100 }] }],
  personas: [
    { id: 'a', nombre: 'Familia A', tipo: 'Familia', telefono: '', cargos: [{ conceptoId: 'h', adultos: 2, menores: 2, monto: 8000 }] },
    { id: 'b', nombre: 'Beto', tipo: 'Persona', telefono: '', cargos: [{ conceptoId: 'h', adultos: 1, menores: 0, monto: 1800 }] },
  ],
  abonos: [],
  recordatorios: { diasAntes: 3, hora: '09:00', whatsapp: true, push: false, repetirVencidos: true, cadaDias: 3 },
})

describe('editar conceptos', () => {
  it('valida nombre, montos y que los pagos sumen 100%', () => {
    const b = borradorDe(ev().conceptos[0])
    expect(problemaConcepto(b, [])).toBeNull()
    expect(problemaConcepto({ ...b, nombre: 'hospedaje' }, ['Hospedaje'])).toMatch(/Ya hay/)
    expect(problemaConcepto({ ...b, cuotas: [{ fecha: '2026-10-01', pct: 60 }] }, [])).toMatch(/suman 60%/)
  })
  it('al cambiar la tarifa recalcula a quienes pagan por tarifa y respeta los montos a mano', () => {
    const e = ev()
    const nuevo = aConcepto({ ...borradorDe(e.conceptos[0]), adulto: 3000, menor: 1500 }, 'h')
    expect(actualizarConcepto(e, nuevo, true)).toBe(1)
    expect(e.personas[0].cargos[0].monto).toBe(9000)
    expect(e.personas[1].cargos[0].monto).toBe(1800)
  })
  it('sin actualizar montos, solo cambia el concepto', () => {
    const e = ev()
    actualizarConcepto(e, aConcepto({ ...borradorDe(e.conceptos[0]), adulto: 3000 }, 'h'), false)
    expect(e.personas[0].cargos[0].monto).toBe(8000)
    expect(e.conceptos[0].tarifa?.adulto).toBe(3000)
  })
  it('no borra un concepto con abonos', () => {
    const e = ev()
    e.abonos.push({ id: 'x', personaId: 'a', conceptoId: 'h', monto: 100, fecha: '2026-09-01', metodo: 'Efectivo', comprobante: null, estado: 'validado' })
    expect(eliminarConcepto(e, 'h')).toBe(false)
    e.abonos = []
    expect(eliminarConcepto(e, 'h')).toBe(true)
    expect(e.personas[0].cargos).toEqual([])
  })
})

describe('pagos con monto fijo', () => {
  const b = (cuotas: BorradorConcepto['cuotas']): BorradorConcepto => ({ nombre: 'Hospedaje', porEdad: false, adulto: 2500, menor: 0, cuotas })

  it('un anticipo fijo y el último pago cubre lo que falte', () => {
    const borr = b([{ fecha: '2026-12-01', pct: 60 }, { fecha: '2026-11-01', pct: 0, monto: 500 }])
    expect(problemaConcepto(borr, [])).toBeNull()
    const c = aConcepto(borr, 'c')
    expect(c.cuotas).toEqual([{ fecha: '2026-11-01', pct: 0, monto: 500 }, { fecha: '2026-12-01', pct: 0 }])
    expect(plan(c, 2500).map(x => x.monto)).toEqual([500, 2000])
    expect(plan(c, 8000).map(x => x.monto)).toEqual([500, 7500])
    expect(plan(c, 300).map(x => x.monto)).toEqual([300, 0])
    expect([0, 1].map(i => etiquetaCuota(c, i))).toEqual(['$500', 'resto'])
  })

  it('mezcla porcentaje y monto fijo', () => {
    const c = aConcepto(b([{ fecha: '2026-10-01', pct: 40 }, { fecha: '2026-11-01', pct: 0, monto: 500 }, { fecha: '2026-12-01', pct: 0 }]), 'c')
    expect(plan(c, 2500).map(x => x.monto)).toEqual([1000, 500, 1000])
    expect(etiquetaCuota(c, 0)).toBe('40%')
  })

  it('valida montos y porcentajes', () => {
    expect(problemaConcepto(b([{ fecha: '2026-11-01', pct: 0, monto: 0 }, { fecha: '2026-12-01', pct: 0 }]), [])).toMatch(/mayor a 0/)
    expect(problemaConcepto(b([{ fecha: '2026-10-01', pct: 100 }, { fecha: '2026-11-01', pct: 0, monto: 500 }, { fecha: '2026-12-01', pct: 0 }]), [])).toMatch(/deja algo/)
    // Un solo pago siempre es el 100%
    expect(problemaConcepto(b([{ fecha: '2026-11-01', pct: 100, monto: 500 }]), [])).toBeNull()
    expect(aConcepto(b([{ fecha: '2026-11-01', pct: 100, monto: 500 }]), 'c').cuotas).toEqual([{ fecha: '2026-11-01', pct: 100 }])
  })
})
