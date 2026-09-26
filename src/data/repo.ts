import type { Db } from '../domain/types'

/**
 * Dónde se guardan los datos. Hoy: el navegador (localStorage).
 * Cuando haya backend, otra implementación (p. ej. Supabase) cumple esta misma interfaz.
 */
export interface Repositorio {
  cargar(): Db | null
  guardar(db: Db): void
}

const CLAVE = 'eventi-db-v1'

export const repoLocal: Repositorio = {
  cargar() {
    try {
      const raw = localStorage.getItem(CLAVE)
      const db = raw ? (JSON.parse(raw) as Db) : null
      return db && db.version === 1 && Array.isArray(db.eventos) ? db : null
    } catch {
      return null
    }
  },
  guardar(db) {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(db))
    } catch (e) {
      // Cuota llena (normalmente por comprobantes grandes)
      console.warn('No se pudo guardar', e)
      throw new Error('No hay espacio para guardar. Borra comprobantes antiguos o usa imágenes más pequeñas.')
    }
  },
}
