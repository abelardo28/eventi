import { describe, expect, it } from 'vitest'
import { estadoGrupo, estadoRegistro, subtotalesPorGrupo, type EstadoRegistro } from './estadoCuenta'
import type { Evento } from './types'

const ev: Evento = {
  id: 'e', nombre: 'Torneo', fecha: '2026-12-20', lugar: 'X', actividades: [], envios: [],
  recordatorios: { diasAntes: 3, hora: '09:00', whatsapp: true, push: false, repetirVencidos: true, cadaDias: 3 },
  conceptos: [
    { id: 'h', nombre: 'Hospedaje', base: 2500, tarifa: { adulto: 2500, menor: 1500 }, cuotas: [{ fecha: '2026-11-01', pct: 50 }, { fecha: '2026-12-01', pct: 50 }] },
    { id: 'i', nombre: 'Inscripción', base: 800, tarifa: null, cuotas: [{ fecha: '2026-12-01', pct: 100 }] },
  ],
  personas: [
    { id: 'a', nombre: 'Santiago', tipo: 'Persona', telefono: '', grupo: 'Santiago', cargos: [{ conceptoId: 'i', monto: 800, adultos: null, menores: null, cantidad: 1 }] },
    { id: 'b', nombre: 'Familia Ruiz', tipo: 'Familia', telefono: '', grupo: 'Santiago', cargos: [{ conceptoId: 'h', monto: 8000, adultos: 2, menores: 2 }] },
  ],
  abonos: [
    { id: '1', personaId: 'b', conceptoId: 'h', monto: 3000, fecha: '2026-10-20', metodo: 'Efectivo', comprobante: null, estado: 'validado' },
    { id: '2', personaId: 'b', conceptoId: 'h', monto: 500, fecha: '2026-11-05', metodo: 'Transferencia', comprobante: null, estado: 'pendiente' },
    { id: '3', personaId: 'a', conceptoId: 'i', monto: 800, fecha: '2026-11-02', metodo: 'Efectivo', comprobante: null, estado: 'validado' },
  ],
}

describe('estado de cuenta', () => {
  it('por registro: total, pagado, saldo, vencido y abonos', () => {
    const e = estadoRegistro(ev, ev.personas[1], '2026-11-08')
    expect([e.total, e.pagado, e.saldo, e.vencido]).toEqual([8000, 3000, 5000, 1000])
    expect(e.conceptos[0]).toMatchObject({ nombre: 'Hospedaje', detalle: '2 adultos · 2 menores', saldo: 5000 })
    expect(e.abonos.map(a => a.id)).toEqual(['1'])
    expect(e.porValidar.map(a => a.id)).toEqual(['2'])
  })
  it('por grupo suma todos los registros', () => {
    const g = estadoGrupo(ev, ev.personas, '2026-11-08')
    expect([g.total, g.pagado, g.saldo]).toEqual([8800, 3800, 5000])
    expect(g.registros).toHaveLength(2)
  })
  it('solo con los conceptos elegidos', () => {
    const g = estadoGrupo(ev, ev.personas, '2026-11-08', new Set(['i']))
    expect([g.total, g.pagado, g.saldo, g.vencido]).toEqual([800, 800, 0, 0])
    expect(g.registros[1]).toMatchObject({ total: 0, conceptos: [], abonos: [], porValidar: [] })
  })
})

describe('subtotalesPorGrupo', () => {
  it('agrupa y deja "Sin grupo" al final', () => {
    const r = (grupo: string | undefined, total: number, pagado: number) => ({ p: { id: grupo ?? 'x', nombre: 'n', tipo: 'Persona', telefono: '', cargos: [], grupo }, conceptos: [], abonos: [], porValidar: [], total, pagado, saldo: total - pagado, vencido: 0 }) as unknown as EstadoRegistro
    const g = subtotalesPorGrupo([r(undefined, 100, 0), r('Santiago', 300, 100), r('Ana', 50, 50), r('Santiago', 200, 0)])
    expect(g.map(x => [x.nombre, x.registros, x.total, x.saldo])).toEqual([['Ana', 1, 50, 0], ['Santiago', 2, 500, 400], ['Sin grupo', 1, 100, 100]])
    expect(subtotalesPorGrupo([r(undefined, 1, 0)])).toEqual([])
  })
})
