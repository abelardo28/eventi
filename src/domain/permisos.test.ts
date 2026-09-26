import { describe, expect, it } from 'vitest'
import type { Evento, Usuario } from './types'
import { eventosVisibles, misRegistros, puede, puedeVerPersona, quedaAdmin } from './permisos'
import { hashPassword, passwordTemporal, problemaPassword, verificarPassword } from './auth'
import { pagado } from './calc'

const u = (rol: Usuario['rol'], extra: Partial<Usuario> = {}): Usuario => ({
  id: rol, nombre: rol, email: `${rol}@x.mx`, telefono: '', rol, activo: true, eventos: null, hash: '', salt: '', creado: '2026-09-26', ...extra,
})
const ev = (id: string): Evento => ({
  id, nombre: id, fecha: '2026-12-01', lugar: '', conceptos: [], abonos: [], actividades: [], envios: [],
  personas: [{ id: 'p1', nombre: 'Ana', tipo: 'Persona', telefono: '', cargos: [], usuarioId: 'participante' }, { id: 'p2', nombre: 'Beto', tipo: 'Persona', telefono: '', cargos: [] }],
  recordatorios: { diasAntes: 3, hora: '09:00', whatsapp: true, push: false, repetirVencidos: true, cadaDias: 3 },
})

describe('permisos por rol', () => {
  it('el administrador puede todo', () => {
    expect(puede(u('admin'), 'usuarios.gestionar')).toBe(true)
    expect(puede(u('admin'), 'abonos.borrar', 'e1')).toBe(true)
  })
  it('el capturista registra y valida pero no borra ni gestiona usuarios', () => {
    const c = u('capturista')
    expect(puede(c, 'abonos.registrar', 'e1')).toBe(true)
    expect(puede(c, 'abonos.validar', 'e1')).toBe(true)
    expect(puede(c, 'abonos.borrar', 'e1')).toBe(false)
    expect(puede(c, 'usuarios.gestionar')).toBe(false)
    expect(puede(c, 'conceptos.gestionar', 'e1')).toBe(false)
  })
  it('el capturista solo trabaja en sus eventos asignados', () => {
    const c = u('capturista', { eventos: ['e1'] })
    expect(puede(c, 'abonos.registrar', 'e1')).toBe(true)
    expect(puede(c, 'abonos.registrar', 'e2')).toBe(false)
    expect(eventosVisibles([ev('e1'), ev('e2')], c).map(e => e.id)).toEqual(['e1'])
  })
  it('el participante solo ve lo suyo y propone abonos', () => {
    const p = u('participante'), e = ev('e1')
    expect(puede(p, 'abonos.proponer')).toBe(true)
    expect(puede(p, 'abonos.registrar', 'e1')).toBe(false)
    expect(puedeVerPersona(p, e, e.personas[0])).toBe(true)
    expect(puedeVerPersona(p, e, e.personas[1])).toBe(false)
    expect(misRegistros([e], p).map(x => x.p.nombre)).toEqual(['Ana'])
    expect(eventosVisibles([e], p)).toEqual([])
  })
  it('una cuenta desactivada no puede nada', () => {
    expect(puede(u('admin', { activo: false }), 'evento.ver')).toBe(false)
  })
  it('no deja la app sin administradores', () => {
    const a = u('admin'), c = u('capturista')
    expect(quedaAdmin([a, c], { ...a, rol: 'capturista' })).toBe(false)
    expect(quedaAdmin([a, c], { ...a, activo: false })).toBe(false)
    expect(quedaAdmin([a, u('admin', { id: 'otro' })], { ...a, rol: 'capturista' })).toBe(true)
  })
})

describe('abonos por validar', () => {
  it('no cuentan hasta validarse', () => {
    const e = ev('e1')
    const base = { personaId: 'p1', conceptoId: 'c', fecha: '2026-09-01', metodo: 'Transferencia' as const, comprobante: null }
    e.abonos = [{ ...base, id: 'a', monto: 500, estado: 'validado' }, { ...base, id: 'b', monto: 300, estado: 'pendiente' }, { ...base, id: 'c', monto: 200, estado: 'rechazado' }]
    expect(pagado(e, 'p1')).toBe(500)
  })
})

describe('contraseñas', () => {
  it('verifica la contraseña correcta y rechaza la incorrecta', async () => {
    const h = await hashPassword('secreto123')
    expect(await verificarPassword(h, 'secreto123')).toBe(true)
    expect(await verificarPassword(h, 'secreto124')).toBe(false)
  })
  it('pide al menos 8 caracteres con letras y números', () => {
    expect(problemaPassword('abc')).not.toBeNull()
    expect(problemaPassword('abcdefgh')).not.toBeNull()
    expect(problemaPassword('abcd1234')).toBeNull()
    expect(problemaPassword(passwordTemporal())).toBeNull()
  })
})
