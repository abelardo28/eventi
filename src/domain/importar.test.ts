import { describe, expect, it } from 'vitest'
import type { Evento } from './types'
import { aplicarPlan, fecha, numero, planImportacion, resumenPlan, tipoDeHoja } from './importar'
import { pagado } from './calc'

const vacio = (): Evento => ({
  id: 'e', nombre: 'Torneo', fecha: '2026-11-14', lugar: 'Mazatlán', conceptos: [], personas: [], abonos: [], actividades: [], envios: [],
  recordatorios: { diasAntes: 3, hora: '09:00', whatsapp: true, push: false, repetirVencidos: true, cadaDias: 3 },
})
const op = { hoy: '2026-09-26', usuarioId: 'u1' }

const libro = [
  { sheet: 'Conceptos', data: [['Concepto', 'Monto adulto', 'Monto menor', 'Fechas de pago'], ['Hospedaje', 2500, 1500, '01/10/2026, 01/11/2026'], ['Inscripción', '$800', null, new Date(Date.UTC(2026, 9, 15))]] },
  { sheet: 'Personas', data: [['Nombre', 'WhatsApp', 'Adultos', 'Menores', 'Hospedaje', 'Inscripción', 'Notas'], ['Familia López', '6675550101', 2, 2, 8000, 'x', ''], ['Carlos Ramírez', '', 1, 0, '', 800, '']] },
  { sheet: 'Pagos', data: [['Fecha', 'Nombre', 'Concepto', 'Monto', 'Forma de pago'], ['01/09/2026', 'López', 'hospedaje', '2,000', 'Transferencia'], ['05/09/2026', 'Carlos Ramírez', 'Inscripcion', 500, 'efectivo'], ['', 'Pedro', 'Hospedaje', 100, '']] },
  { sheet: 'Hoja4', data: [['Actividad', 'Fecha', 'Descripción', 'Gasto', 'Ingreso'], ['Rifa 1', '10/08/2026', 'Premio', 1800, null], ['Rifa 1', '30/08/2026', 'Boletos', null, 4200]] },
]

describe('importar desde Excel', () => {
  it('lee números y fechas en formatos comunes', () => {
    expect(numero('$1,200.50')).toBe(1200.5)
    expect(numero('(300)')).toBe(-300)
    expect(fecha('1/10/2026')).toBe('2026-10-01')
    expect(fecha('2026-10-01')).toBe('2026-10-01')
    expect(fecha('31/02/2026')).toBeNull()
    expect(fecha(46296)).toBe('2026-10-01')
  })

  it('reconoce las hojas por nombre o por columnas', () => {
    expect(libro.map(tipoDeHoja)).toEqual(['conceptos', 'personas', 'pagos', 'gastos'])
  })

  it('arma conceptos, personas con sus montos, pagos y gastos', () => {
    const ev = vacio()
    const plan = planImportacion(ev, libro, op)
    const r = resumenPlan(plan)
    expect(r).toMatchObject({ conceptos: 2, personas: 2, cargos: 3, abonos: 2, totalAbonos: 2500, actividades: 1, movimientos: 2, errores: 1 })
    expect(plan.avisos.find(a => a.grave)?.texto).toMatch(/Pedro/)
    const hos = plan.conceptos[0]
    expect(hos.tarifa).toEqual({ adulto: 2500, menor: 1500 })
    expect(hos.cuotas).toEqual([{ fecha: '2026-10-01', pct: 50 }, { fecha: '2026-11-01', pct: 50 }])
    const lopez = plan.personas[0]
    expect(lopez.tipo).toBe('Familia')
    expect(lopez.cargos.map(g => g.monto)).toEqual([8000, 800])
    aplicarPlan(ev, plan)
    expect(pagado(ev, lopez.id, hos.id)).toBe(2000)
    expect(ev.abonos.every(a => a.estado === 'validado' && a.registradoPor === 'u1')).toBe(true)
  })

  it('no duplica al importar el mismo archivo dos veces', () => {
    const ev = vacio()
    aplicarPlan(ev, planImportacion(ev, libro, op))
    const r = resumenPlan(planImportacion(ev, libro, op))
    expect(r).toMatchObject({ conceptos: 0, personas: 0, cargos: 0, abonos: 0, movimientos: 0 })
  })

  it('asigna el concepto si llega un pago de algo que no tenía', () => {
    const ev = vacio()
    aplicarPlan(ev, planImportacion(ev, libro.slice(0, 1), op))
    ev.personas.push({ id: 'p1', nombre: 'Ana Ruiz', tipo: 'Persona', telefono: '', cargos: [] })
    const plan = planImportacion(ev, [{ sheet: 'Abonos', data: [['Nombre', 'Concepto', 'Monto'], ['ana ruiz', 'Hospedaje', 1000]] }], op)
    expect(plan.cargosNuevos).toHaveLength(1)
    aplicarPlan(ev, plan)
    expect(ev.personas[0].cargos[0].monto).toBe(2500)
    expect(pagado(ev, 'p1', ev.conceptos[0].id)).toBe(1000)
  })
})

describe('hoja de control con Total y Anticipo por concepto', () => {
  const hoja = { sheet: 'Pagos Extras', data: [
    ['CONTROL DE PAGOS DE ACOMPAÑANTES', null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    ['Jugador\n(familiar de)', 'Nombre del\nFamiliar', 'Parentesco', 'Habitación', 'Total Hotel', 'Anticipo\nHotel', 'Total\nTransporte', 'Anticipo\nTransporte'],
    ['Emilio G', 'Esmeralda', 'Abuela', 'Hab. 1', 4100, 900, null, null],
    [null, 'Melisa', 'Tia', 'Hab. 2', 3733.33, 708.33, null, null],
    ['Santiago T', 'Norma', 'Abuela', 'Hab. 1', null, null, null, 338.5],
    [null, 'José', 'Tio', null, 0, 0, null, null],
    ['TOTALES', null, null, null, 7833.33, 1608.33, 0, 338.5],
  ] }

  it('reconoce el formato y lleva cada fila a persona, cargos y anticipos', () => {
    const ev = vacio()
    ev.conceptos.push({ id: 'hos', nombre: 'Hospedaje', base: 2500, tarifa: null, cuotas: [{ fecha: '2026-11-01', pct: 100 }] })
    expect(tipoDeHoja(hoja)).toBe('cuentas')
    const plan = planImportacion(ev, [hoja], op)
    expect(plan.conceptos.map(c => c.nombre)).toEqual(['Transporte'])
    expect(plan.personas.map(p => [p.nombre, p.grupo, p.nota])).toEqual([
      ['Esmeralda', 'Emilio G', 'Abuela · Hab. 1'], ['Melisa', 'Emilio G', 'Tia · Hab. 2'], ['Norma', 'Santiago T', 'Abuela · Hab. 1'], ['José', 'Santiago T', 'Tio'],
    ])
    aplicarPlan(ev, plan)
    const melisa = ev.personas[1]
    expect(melisa.cargos).toEqual([{ conceptoId: 'hos', adultos: null, menores: null, cantidad: 1, monto: 3733.33 }])
    expect(pagado(ev, melisa.id, 'hos')).toBe(708.33)
    expect(pagado(ev, null)).toBe(900 + 708.33 + 338.5)
  })

  it('al reimportar con anticipos mayores solo registra la diferencia', () => {
    const ev = vacio()
    aplicarPlan(ev, planImportacion(ev, [hoja], op))
    const nueva = structuredClone(hoja); nueva.data[3][5] = 1500
    const plan = planImportacion(ev, [nueva], { ...op, hoy: '2026-10-05' })
    expect(plan.abonos.map(a => a.monto)).toEqual([600])
    expect(resumenPlan(plan)).toMatchObject({ personas: 0, conceptos: 0 })
  })
})
