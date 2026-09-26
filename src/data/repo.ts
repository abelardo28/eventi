import type { Db } from '../domain/types'

/**
 * Dónde se guardan los datos. Hoy: el navegador (localStorage).
 * Cuando haya backend, otra implementación (p. ej. Supabase) cumple esta misma interfaz.
 */
export interface Repositorio {
  cargar(): Db | null
  guardar(db: Db): void
  sesion(): string | null
  guardarSesion(usuarioId: string | null): void
}

const CLAVE_V1 = 'eventi-db-v1'
const CLAVE = 'eventi-db-v2'
const CLAVE_SESION = 'eventi-sesion'

type DbV1 = { version: 1; eventos: Db['eventos'] }

/** v1 no tenía usuarios ni estado de abono: todo lo capturado antes cuenta como validado. */
export function migrar(raw: unknown): Db | null {
  const db = raw as Db | DbV1 | null
  if (!db || !Array.isArray(db.eventos)) return null
  if (db.version === 2) return Array.isArray(db.usuarios) ? db : null
  if (db.version === 1) {
    for (const ev of db.eventos) for (const a of ev.abonos) a.estado ??= 'validado'
    return { version: 2, eventos: db.eventos, usuarios: [] }
  }
  return null
}

const leer = (k: string) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null } catch { return null } }

export const repoLocal: Repositorio = {
  cargar() {
    return migrar(leer(CLAVE)) ?? migrar(leer(CLAVE_V1))
  },
  guardar(db) {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(db))
    } catch (e) {
      console.warn('No se pudo guardar', e)
      throw new Error('No hay espacio para guardar. Borra comprobantes antiguos o usa imágenes más pequeñas.')
    }
  },
  sesion() {
    try { return localStorage.getItem(CLAVE_SESION) } catch { return null }
  },
  guardarSesion(id) {
    try { if (id) localStorage.setItem(CLAVE_SESION, id); else localStorage.removeItem(CLAVE_SESION) } catch { /* sin almacenamiento: la sesión dura lo que la pestaña */ }
  },
}
