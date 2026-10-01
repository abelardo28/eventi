import { useEffect, useMemo } from 'react'
import { useStore } from './store'
import { esNueva, notificaciones, type Notificacion } from '../domain/notificaciones'

/** Notificaciones del usuario actual y cuántas no ha leído. */
export function useNotificaciones() {
  const { db, usuario, hoy } = useStore()
  return useMemo(() => {
    const lista = usuario ? notificaciones(db, usuario, hoy) : []
    const nuevas = usuario ? lista.filter(n => esNueva(usuario, n)) : []
    return { lista, nuevas }
  }, [db, usuario, hoy])
}

// Avisos del sistema (los del celular o la computadora) mientras la app está abierta o en segundo plano.
const leer = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const escribir = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* sin almacenamiento */ } }
const claveActivo = (uid: string) => `eventi-avisos-${uid}`
const claveAvisados = (uid: string) => `eventi-avisados-${uid}`

export const avisosSoportados = () => typeof window !== 'undefined' && 'Notification' in window
export const avisosActivos = (uid: string) => avisosSoportados() && Notification.permission === 'granted' && leer(claveActivo(uid)) === '1'

async function mostrar(n: Pick<Notificacion, 'id' | 'titulo' | 'texto' | 'ruta'>) {
  const opciones: NotificationOptions = { body: n.texto, tag: n.id, icon: 'icono-192.png', badge: 'icono-192.png', data: { url: `${location.pathname}#${n.ruta}` } }
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) { await reg.showNotification(n.titulo, opciones); return }
  } catch { /* sin service worker */ }
  try { new Notification(n.titulo, opciones) } catch { /* el navegador no lo permite (p. ej. Android sin service worker) */ }
}

const avisados = (uid: string) => new Set<string>(JSON.parse(leer(claveAvisados(uid)) ?? '[]'))
const guardarAvisados = (uid: string, s: Set<string>) => escribir(claveAvisados(uid), JSON.stringify([...s].slice(-300)))

/** Activa o desactiva los avisos del sistema. Devuelve un mensaje si no se pudo. */
export async function activarAvisos(uid: string, activo: boolean, actuales: Notificacion[]): Promise<string | null> {
  if (!activo) { escribir(claveActivo(uid), '0'); return null }
  if (!avisosSoportados()) return 'Este navegador no permite avisos. En iPhone, primero instala Eventi en tu pantalla de inicio.'
  const permiso = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
  if (permiso !== 'granted') return 'No diste permiso para los avisos. Puedes activarlo en los ajustes del navegador.'
  escribir(claveActivo(uid), '1')
  // Lo que ya existe no se vuelve a anunciar
  const s = avisados(uid); actuales.forEach(n => s.add(n.id)); guardarAvisados(uid, s)
  await mostrar({ id: 'prueba', titulo: 'Avisos activados', texto: 'Aquí te avisaremos de pagos nuevos, validaciones y vencimientos.', ruta: '/notificaciones' })
  return null
}

/** Anuncia con un aviso del sistema las notificaciones nuevas que todavía no se habían anunciado. */
export function AvisosDelSistema() {
  const { usuario } = useStore()
  const { nuevas } = useNotificaciones()
  useEffect(() => {
    if (!usuario || !avisosActivos(usuario.id)) return
    const s = avisados(usuario.id)
    const pendientes = nuevas.filter(n => !s.has(n.id))
    if (!pendientes.length) return
    pendientes.forEach(n => s.add(n.id))
    guardarAvisados(usuario.id, s)
    if (pendientes.length > 3) mostrar({ id: 'varias', titulo: `Tienes ${pendientes.length} notificaciones nuevas`, texto: pendientes.slice(0, 2).map(n => n.titulo).join(' · '), ruta: '/notificaciones' })
    else pendientes.forEach(n => { mostrar(n) })
  }, [usuario, nuevas])
  return null
}
