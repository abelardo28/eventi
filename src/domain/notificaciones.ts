import type { Abono, Db, Usuario } from './types'
import { concepto, money, plural, siguiente } from './calc'
import { addDays, diasEntre, fCorta } from './fechas'
import { tieneEvento } from './permisos'

export type TipoNotif = 'comprobante' | 'registrado' | 'validado' | 'rechazado' | 'por-vencer' | 'vencido' | 'resumen'

export interface Notificacion {
  id: string
  tipo: TipoNotif
  titulo: string
  texto: string
  /** Fecha y hora ISO; ordena la lista y decide si es nueva. */
  fecha: string
  ruta: string
  eventoId: string
}

/** Días hacia atrás que se muestran. */
export const VENTANA_DIAS = 30

const momento = (a: Abono) => a.creado ?? `${a.fecha}T12:00:00`
const nombreDe = (db: Db, id: string | null | undefined) => db.usuarios.find(u => u.id === id)?.nombre.split(' ')[0] ?? 'Alguien'

/**
 * Notificaciones de un usuario, calculadas a partir de los datos: abonos registrados, validados
 * o rechazados y pagos por vencer o vencidos. Con servidor, esto mismo lo generaría la base de datos.
 */
export function notificaciones(db: Db, u: Usuario, hoy: string): Notificacion[] {
  const desde = addDays(hoy, -VENTANA_DIAS)
  const out: Notificacion[] = []
  const staff = u.rol !== 'participante'

  for (const ev of db.eventos) {
    const trabaja = staff && tieneEvento(u, ev.id)
    const mios = new Set(ev.personas.filter(p => p.usuarioId === u.id).map(p => p.id))
    if (!trabaja && !mios.size) continue
    const persona = (id: string) => ev.personas.find(p => p.id === id)
    const base = (a: Abono) => `${money(a.monto)} de ${concepto(ev, a.conceptoId)?.nombre ?? 'un concepto'}`

    for (const a of ev.abonos) {
      if (a.origen === 'importado' || momento(a).slice(0, 10) < desde) continue
      const p = persona(a.personaId)
      if (!p) continue
      const deParticipante = a.estado === 'pendiente' || !!a.validadoPor
      const esMio = mios.has(a.personaId)

      // Llegó un pago
      if (deParticipante && trabaja && a.registradoPor !== u.id) {
        out.push({
          id: `reg:${a.id}`, tipo: 'comprobante', eventoId: ev.id, fecha: momento(a), ruta: `/e/${ev.id}/p/${p.id}`,
          titulo: `${p.nombre} envió un comprobante`,
          texto: `${base(a)} · ${a.estado === 'pendiente' ? 'falta validarlo' : a.estado === 'validado' ? 'ya se validó' : 'se rechazó'}`,
        })
      } else if (!deParticipante && a.registradoPor !== u.id && (esMio || (trabaja && u.rol === 'admin'))) {
        out.push({
          id: `reg:${a.id}`, tipo: 'registrado', eventoId: ev.id, fecha: momento(a), ruta: `/e/${ev.id}/p/${p.id}`,
          titulo: esMio ? 'Se registró tu pago' : `${nombreDe(db, a.registradoPor)} registró un pago`,
          texto: esMio ? `${base(a)} · ${a.metodo.toLowerCase()}, ${fCorta(a.fecha)}` : `${p.nombre} · ${base(a)}`,
        })
      }

      // Se validó o rechazó un comprobante
      if (a.validadoPor && a.validadoPor !== u.id && (a.estado === 'validado' || a.estado === 'rechazado') && (esMio || a.registradoPor === u.id)) {
        const ok = a.estado === 'validado'
        out.push({
          id: `res:${a.id}`, tipo: ok ? 'validado' : 'rechazado', eventoId: ev.id, fecha: a.resuelto ?? momento(a), ruta: `/e/${ev.id}/p/${p.id}`,
          titulo: ok ? 'Tu pago fue validado' : 'Tu comprobante fue rechazado',
          texto: ok ? `${base(a)} ya cuenta en tu saldo` : `${base(a)} · ${a.motivoRechazo ?? 'sin motivo'}. Puedes enviarlo de nuevo.`,
        })
      }
    }

    // Pagos por vencer o vencidos
    const dias = ev.recordatorios.diasAntes
    let porVencer = 0, vencidos = 0
    for (const p of ev.personas) {
      const mio = mios.has(p.id)
      if (!mio && !trabaja) continue
      for (const g of p.cargos) {
        const c = concepto(ev, g.conceptoId)
        const s = c && siguiente(ev, p, c, hoy)
        if (!c || !s) continue
        const falta = diasEntre(hoy, s.fecha)
        if (s.vencida) vencidos++
        else if (falta <= dias) porVencer++
        if (!mio) continue
        if (s.vencida) {
          out.push({
            id: `vencido:${ev.id}:${p.id}:${c.id}:${s.fecha}`, tipo: 'vencido', eventoId: ev.id, fecha: `${addDays(s.fecha, 1)}T00:00:00`, ruta: `/e/${ev.id}/p/${p.id}`,
            titulo: `Tu pago de ${c.nombre} está vencido`,
            texto: `${money(s.monto)} · venció el ${fCorta(s.fecha)}`,
          })
        } else if (falta <= dias) {
          out.push({
            id: `vence:${ev.id}:${p.id}:${c.id}:${s.fecha}`, tipo: 'por-vencer', eventoId: ev.id, fecha: `${addDays(s.fecha, -dias)}T00:00:00`, ruta: `/e/${ev.id}/p/${p.id}`,
            titulo: falta === 0 ? `Hoy vence tu pago de ${c.nombre}` : `Tu pago de ${c.nombre} vence ${falta === 1 ? 'mañana' : `en ${falta} días`}`,
            texto: `${money(s.monto)} · ${fCorta(s.fecha)}${ev.personas.filter(x => mios.has(x.id)).length > 1 ? ` · ${p.nombre}` : ''}`,
          })
        }
      }
    }
    if (trabaja && (porVencer || vencidos)) {
      out.push({
        id: `resumen:${ev.id}:${hoy}`, tipo: 'resumen', eventoId: ev.id, fecha: `${hoy}T00:00:00`, ruta: `/e/${ev.id}/avisos`,
        titulo: `Pagos de ${ev.nombre}`,
        texto: [porVencer && `${plural(porVencer, 'vence', 'vencen')} ${dias === 1 ? 'hoy o mañana' : `en los próximos ${dias} días`}`, vencidos && plural(vencidos, 'está vencido', 'están vencidos')].filter(Boolean).join(' · '),
      })
    }
  }
  return out.filter(n => n.fecha.slice(0, 10) <= hoy).sort((a, b) => b.fecha.localeCompare(a.fecha))
}

// Las fechas derivadas van en hora local sin zona y las marcas de lectura en UTC: se comparan como instantes.
export const esNueva = (u: Usuario, n: Notificacion) =>
  !(u.notifLeidas ?? []).includes(n.id) && (!u.notifLeidasHasta || Date.parse(n.fecha) > Date.parse(u.notifLeidasHasta))

/** Cambios al usuario para marcar notificaciones como leídas (la lista se recorta para no crecer sin fin). */
export function marcarLeidas(u: Usuario, ids: string[] | 'todas', ahora: string): Pick<Usuario, 'notifLeidas' | 'notifLeidasHasta'> {
  if (ids === 'todas') return { notifLeidasHasta: ahora, notifLeidas: [] }
  return { notifLeidasHasta: u.notifLeidasHasta, notifLeidas: [...new Set([...ids, ...(u.notifLeidas ?? [])])].slice(0, 300) }
}

