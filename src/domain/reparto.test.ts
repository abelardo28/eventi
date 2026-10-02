import { describe, expect, it } from 'vitest'
import { abonosDeReparto, disponible, partes, repartido, saldo } from './reparto'
import type { Evento } from './types'

const ev = (): Evento => ({
  id: 'e', nombre: 'E', fecha: '2026-11-21', lugar: 'X', envios: [],
  recordatorios: { diasAntes: 3, hora: '09:00', whatsapp: true, push: false, repetirVencidos: true, cadaDias: 3 },
  conceptos: [{ id: 'h', nombre: 'Hospedaje', base: 1000, tarifa: null, cuotas: [{ fecha: '2026-11-01', pct: 100 }] }],
  personas: ['a', 'b', 'c'].map(id => ({ id, nombre: id, tipo: 'Persona' as const, telefono: '', cargos: [{ conceptoId: 'h', monto: 1000, adultos: null, menores: null }] })),
  abonos: [{ id: 'x', personaId: 'a', conceptoId: 'h', monto: 400, fecha: '2026-10-01', metodo: 'Efectivo', comprobante: null, estado: 'validado' }],
  actividades: [{ id: 'r', nombre: 'Rifa', detalle: '', estado: 'Terminada', movimientos: [
    { id: 'm1', tipo: 'gasto', monto: 500, fecha: '2026-10-01', nota: '' },
    { id: 'm2', tipo: 'ingreso', monto: 1500, fecha: '2026-10-01', nota: '' },
  ] }],
})

describe('reparto de ganancias', () => {
  it('divide en partes iguales al centavo', () => {
    expect(partes(1000, 3)).toEqual([333.34, 333.33, 333.33])
    expect(partes(900, 3)).toEqual([300, 300, 300])
    expect(partes(100, 0)).toEqual([])
  })

  it('crea un abono por persona y descuenta lo repartido de la ganancia', () => {
    const e = ev()
    let n = 0
    const nuevos = abonosDeReparto({ actividadId: 'r', conceptoId: 'h', monto: 700, personaIds: ['a', 'b'], fecha: '2026-10-02', usuarioId: 'u', creado: 'T', nuevoId: () => `n${n++}` })
    expect(nuevos.map(a => [a.personaId, a.monto, a.metodo, a.actividadId, a.estado])).toEqual([
      ['a', 350, 'Actividad', 'r', 'validado'], ['b', 350, 'Actividad', 'r', 'validado'],
    ])
    expect(disponible(e, e.actividades[0])).toBe(1000)
    e.abonos.push(...nuevos)
    expect(repartido(e, 'r')).toBe(700)
    expect(disponible(e, e.actividades[0])).toBe(300)
    expect(saldo(e, 'a', 'h')).toBe(250)
    expect(saldo(e, 'c', 'h')).toBe(1000)
  })

  it('un abono rechazado no cuenta como repartido', () => {
    const e = ev()
    e.abonos.push({ id: 'z', personaId: 'b', conceptoId: 'h', monto: 200, fecha: '2026-10-02', metodo: 'Actividad', comprobante: null, estado: 'rechazado', actividadId: 'r' })
    expect(disponible(e, e.actividades[0])).toBe(1000)
  })
})
