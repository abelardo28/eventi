import { describe, expect, it } from 'vitest'
import type { Abono, Db, Evento, Usuario } from './types'
import { esNueva, marcarLeidas, notificaciones } from './notificaciones'

const HOY = '2026-10-01'
const u = (id: string, rol: Usuario['rol'], extra: Partial<Usuario> = {}): Usuario => ({
  id, nombre: `${id} Apellido`, email: `${id}@x.mx`, telefono: '', rol, activo: true, eventos: null, hash: '', salt: '', creado: '2026-09-01', ...extra,
})
const admin = u('admin', 'admin'), cap = u('cap', 'capturista'), capOtro = u('capOtro', 'capturista', { eventos: ['otro'] }), ana = u('ana', 'participante')
const abono = (x: Partial<Abono>): Abono => ({ id: 'a', personaId: 'p1', conceptoId: 'hos', monto: 500, fecha: '2026-09-30', metodo: 'Transferencia', comprobante: null, estado: 'validado', ...x })

const db = (abonos: Abono[]): Db => {
  const ev: Evento = {
    id: 'e1', nombre: 'Torneo', fecha: '2026-12-01', lugar: '', actividades: [], envios: [], abonos,
    conceptos: [
      { id: 'hos', nombre: 'Hospedaje', base: 1000, tarifa: null, cuotas: [{ fecha: '2026-10-03', pct: 100 }] },
      { id: 'ins', nombre: 'Inscripción', base: 800, tarifa: null, cuotas: [{ fecha: '2026-09-20', pct: 100 }] },
    ],
    personas: [
      { id: 'p1', nombre: 'Ana Ruiz', tipo: 'Persona', telefono: '', usuarioId: 'ana', cargos: [{ conceptoId: 'hos', adultos: null, menores: null, cantidad: 1, monto: 1000 }, { conceptoId: 'ins', adultos: null, menores: null, cantidad: 1, monto: 800 }] },
      { id: 'p2', nombre: 'Beto', tipo: 'Persona', telefono: '', cargos: [{ conceptoId: 'hos', adultos: null, menores: null, cantidad: 1, monto: 1000 }] },
    ],
    recordatorios: { diasAntes: 3, hora: '09:00', whatsapp: true, push: false, repetirVencidos: true, cadaDias: 3 },
  }
  return { version: 2, eventos: [ev], usuarios: [admin, cap, capOtro, ana] }
}
const tipos = (d: Db, x: Usuario) => notificaciones(d, x, HOY).map(n => n.tipo)

describe('notificaciones', () => {
  it('un comprobante enviado avisa al personal del evento, no al de otros eventos', () => {
    const d = db([abono({ estado: 'pendiente', registradoPor: 'ana', creado: '2026-09-30T18:00:00Z' })])
    expect(tipos(d, admin)).toContain('comprobante')
    expect(tipos(d, cap)).toContain('comprobante')
    expect(tipos(d, capOtro)).toEqual([])
    expect(notificaciones(d, admin, HOY).find(n => n.tipo === 'comprobante')?.texto).toMatch(/falta validarlo/)
  })

  it('al validar o rechazar se avisa al participante', () => {
    const ok = db([abono({ registradoPor: 'ana', validadoPor: 'cap', resuelto: '2026-10-01T10:00:00Z' })])
    expect(tipos(ok, ana)).toContain('validado')
    expect(tipos(ok, cap)).not.toContain('validado')
    const no = db([abono({ estado: 'rechazado', motivoRechazo: 'Ilegible', registradoPor: 'ana', validadoPor: 'cap' })])
    expect(notificaciones(no, ana, HOY).find(n => n.tipo === 'rechazado')?.texto).toMatch(/Ilegible/)
  })

  it('un pago registrado por el capturista avisa al participante y al administrador', () => {
    const d = db([abono({ registradoPor: 'cap' })])
    expect(tipos(d, ana)).toContain('registrado')
    expect(notificaciones(d, admin, HOY).find(n => n.tipo === 'registrado')?.titulo).toBe('cap registró un pago')
    expect(tipos(d, cap)).not.toContain('registrado')
  })

  it('no avisa de abonos importados ni antiguos', () => {
    const d = db([abono({ registradoPor: 'cap', origen: 'importado' }), abono({ id: 'b', registradoPor: 'cap', fecha: '2026-07-01' })])
    expect(tipos(d, ana)).not.toContain('registrado')
  })

  it('avisa de pagos por vencer y vencidos; el personal recibe un resumen', () => {
    const d = db([])
    const mias = notificaciones(d, ana, HOY)
    expect(mias.find(n => n.tipo === 'por-vencer')?.titulo).toBe('Tu pago de Hospedaje vence en 2 días')
    expect(mias.find(n => n.tipo === 'vencido')?.titulo).toBe('Tu pago de Inscripción está vencido')
    expect(notificaciones(d, admin, HOY).find(n => n.tipo === 'resumen')?.texto).toBe('2 vencen en los próximos 3 días · 1 está vencido')
  })

  it('marcar como leídas', () => {
    const d = db([])
    const [n] = notificaciones(d, ana, HOY)
    expect(esNueva(ana, n)).toBe(true)
    expect(esNueva({ ...ana, ...marcarLeidas(ana, [n.id], '') }, n)).toBe(false)
    expect(notificaciones(d, ana, HOY).every(x => !esNueva({ ...ana, ...marcarLeidas(ana, 'todas', '2026-10-01T23:00:00') }, x))).toBe(true)
  })
})
