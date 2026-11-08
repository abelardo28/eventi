import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Comprobante, Evento, Usuario } from '../domain/types'
import { NUBE } from '../nube.config'

export const nubeActiva = !!(NUBE.url && NUBE.key)

/** Cliente de Supabase; null cuando la app trabaja solo en este dispositivo. */
export const sb: SupabaseClient | null = nubeActiva ? createClient(NUBE.url, NUBE.key) : null

/** Un cliente aparte, sin sesión guardada, para que el administrador cree cuentas sin salir de la suya. */
export const clienteSinSesion = () => createClient(NUBE.url, NUBE.key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'eventi-alta' } })

export interface Perfil {
  id: string
  nombre: string
  email: string
  telefono: string
  rol: Usuario['rol']
  activo: boolean
  eventos: string[] | null
  debe_cambiar_password: boolean
  creado: string
  notif_leidas_hasta: string | null
  notif_leidas: string[] | null
}

export const aUsuario = (p: Perfil): Usuario => ({
  id: p.id, nombre: p.nombre, email: p.email, telefono: p.telefono, rol: p.rol, activo: p.activo, eventos: p.eventos,
  hash: '', salt: '', debeCambiarPassword: p.debe_cambiar_password, creado: p.creado,
  ...(p.notif_leidas_hasta && { notifLeidasHasta: p.notif_leidas_hasta }),
  ...(p.notif_leidas?.length && { notifLeidas: p.notif_leidas }),
})

/** Los mensajes de Supabase Auth, en español. */
export function errorAuth(m: string | undefined): string {
  const t = (m ?? '').toLowerCase()
  if (t.includes('invalid login')) return 'Correo o contraseña incorrectos.'
  if (t.includes('email not confirmed')) return 'Falta confirmar tu correo. Abre el enlace que te mandamos y vuelve a intentar.'
  if (t.includes('already registered') || t.includes('already exists')) return 'Ya existe una cuenta con ese correo.'
  if (t.includes('password') && (t.includes('least') || t.includes('short') || t.includes('weak'))) return 'La contraseña es muy corta o débil; usa al menos 8 caracteres.'
  if (t.includes('rate limit') || t.includes('too many')) return 'Demasiados intentos seguidos. Espera un momento y vuelve a intentar.'
  if (t.includes('fetch') || t.includes('network')) return 'Sin conexión con el servidor. Revisa tu internet.'
  return m || 'Algo salió mal. Vuelve a intentar.'
}

// ─── Comprobantes en Storage ────────────────────────────────────────────────
// En el evento se guarda "sb:<ruta>" en lugar de la imagen completa.

const PREFIJO = 'sb:'
export const enNube = (c: Comprobante | null | undefined) => !!c?.data.startsWith(PREFIJO)

function aBlob(dataUrl: string): Blob {
  const [cab, b64] = dataUrl.split(',')
  const tipo = /data:([^;]+)/.exec(cab)?.[1] ?? 'application/octet-stream'
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: tipo })
}

/** Sube los comprobantes que todavía vienen como imagen dentro del evento y deja su ruta en su lugar. */
export async function subirComprobantes(ev: Evento): Promise<void> {
  if (!sb) return
  for (const a of ev.abonos) {
    const c = a.comprobante
    if (!c || !c.data.startsWith('data:')) continue
    const ext = c.tipo === 'application/pdf' ? 'pdf' : 'jpg'
    const ruta = `${ev.id}/${a.id}-${Date.now()}.${ext}`
    const { error } = await sb.storage.from('comprobantes').upload(ruta, aBlob(c.data), { contentType: c.tipo, upsert: false })
    if (error) throw new Error('No se pudo subir el comprobante: ' + error.message)
    a.comprobante = { ...c, data: PREFIJO + ruta }
  }
}

const firmadas = new Map<string, { url: string; vence: number }>()

/** Dirección para ver un comprobante (las de la nube se firman por una hora). */
export async function urlComprobante(c: Comprobante): Promise<string> {
  if (!enNube(c) || !sb) return c.data
  const ruta = c.data.slice(PREFIJO.length)
  const hit = firmadas.get(ruta)
  if (hit && hit.vence > Date.now()) return hit.url
  const { data, error } = await sb.storage.from('comprobantes').createSignedUrl(ruta, 3600)
  if (error || !data) throw new Error('No se pudo abrir el comprobante.')
  firmadas.set(ruta, { url: data.signedUrl, vence: Date.now() + 50 * 60 * 1000 })
  return data.signedUrl
}
