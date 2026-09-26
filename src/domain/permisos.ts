import type { Evento, Persona, Rol, Usuario } from './types'

/**
 * Qué puede hacer cada rol.
 *
 * - Administrador: todo, incluidos usuarios, eventos, conceptos, tarifas y borrar registros.
 * - Capturista: registra y valida abonos, agrega y edita personas, registra gastos e ingresos
 *   de actividades y manda recordatorios, solo en los eventos que tiene asignados. No borra nada.
 * - Participante: ve solo su estado de cuenta y sube comprobantes, que quedan por validar.
 */
export type Accion =
  | 'usuarios.gestionar'
  | 'evento.crear'
  | 'evento.editar'
  | 'evento.borrar'
  | 'evento.ver'
  | 'conceptos.gestionar'
  | 'personas.gestionar'
  | 'personas.borrar'
  | 'personas.vincular'
  | 'abonos.registrar'
  | 'abonos.validar'
  | 'abonos.borrar'
  | 'abonos.proponer'
  | 'actividades.crear'
  | 'actividades.movimientos'
  | 'avisos.configurar'
  | 'avisos.enviar'
  | 'datos.restablecer'
  | 'datos.importar'

const TABLA: Record<Rol, readonly Accion[]> = {
  admin: [
    'usuarios.gestionar', 'evento.crear', 'evento.editar', 'evento.borrar', 'evento.ver',
    'conceptos.gestionar', 'personas.gestionar', 'personas.borrar', 'personas.vincular',
    'abonos.registrar', 'abonos.validar', 'abonos.borrar', 'abonos.proponer',
    'actividades.crear', 'actividades.movimientos', 'avisos.configurar', 'avisos.enviar', 'datos.restablecer', 'datos.importar',
  ],
  capturista: [
    'evento.ver', 'personas.gestionar', 'abonos.registrar', 'abonos.validar',
    'actividades.movimientos', 'avisos.enviar',
  ],
  participante: ['abonos.proponer'],
}

export const ROLES: Record<Rol, { nombre: string; descripcion: string }> = {
  admin: { nombre: 'Administrador', descripcion: 'Controla todo: eventos, conceptos, usuarios y puede borrar registros.' },
  capturista: { nombre: 'Capturista', descripcion: 'Registra y valida abonos, personas, gastos e ingresos en sus eventos. No borra.' },
  participante: { nombre: 'Participante', descripcion: 'Ve su estado de cuenta y sube sus comprobantes para que los validen.' },
}

/** El capturista solo trabaja en los eventos que tiene asignados (null = todos). */
export function tieneEvento(u: Usuario, eventoId: string | undefined): boolean {
  if (u.rol === 'admin') return true
  if (u.rol === 'capturista') return !eventoId || u.eventos === null || u.eventos.includes(eventoId)
  return false
}

export function puede(u: Usuario | null | undefined, accion: Accion, eventoId?: string): boolean {
  if (!u || !u.activo) return false
  if (!TABLA[u.rol].includes(accion)) return false
  if (eventoId && u.rol === 'capturista') return tieneEvento(u, eventoId)
  return true
}

/** Personas (en cualquier evento) vinculadas a la cuenta de un participante. */
export function misRegistros(eventos: Evento[], u: Usuario): { ev: Evento; p: Persona }[] {
  return eventos.flatMap(ev => ev.personas.filter(p => p.usuarioId === u.id).map(p => ({ ev, p })))
}

/** ¿Puede este usuario abrir la ficha de esta persona? */
export function puedeVerPersona(u: Usuario | null | undefined, ev: Evento, p: Persona): boolean {
  if (!u || !u.activo) return false
  if (u.rol === 'participante') return p.usuarioId === u.id
  return puede(u, 'evento.ver', ev.id)
}

/** Eventos visibles en el inicio. */
export function eventosVisibles(eventos: Evento[], u: Usuario): Evento[] {
  if (u.rol === 'participante') return []
  return eventos.filter(e => tieneEvento(u, e.id))
}

/** No se puede dejar la app sin administradores activos. */
export function quedaAdmin(usuarios: Usuario[], cambiado: Usuario): boolean {
  return usuarios.some(u => (u.id === cambiado.id ? cambiado : u).rol === 'admin' && (u.id === cambiado.id ? cambiado : u).activo)
}
