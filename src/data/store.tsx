import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { Db, Evento } from '../domain/types'
import { hoyISO } from '../domain/fechas'
import { datosEjemplo } from './seed'
import { repoLocal, type Repositorio } from './repo'

interface Store {
  db: Db
  hoy: string
  evento: (id: string | undefined) => Evento | undefined
  /** Aplica cambios sobre una copia del evento y guarda. Devuelve false si no se pudo guardar. */
  editarEvento: (id: string, fn: (ev: Evento) => void) => boolean
  agregarEvento: (ev: Evento) => void
  borrarEvento: (id: string) => void
  restablecer: () => void
  error: string | null
  limpiarError: () => void
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children, repo = repoLocal }: { children: ReactNode; repo?: Repositorio }) {
  const hoy = hoyISO()
  const [db, setDb] = useState<Db>(() => repo.cargar() ?? datosEjemplo(hoy))
  const [error, setError] = useState<string | null>(null)

  const commit = useCallback((next: Db) => {
    try {
      repo.guardar(next)
      setDb(next)
      return true
    } catch (e) {
      setError((e as Error).message)
      return false
    }
  }, [repo])

  const store = useMemo<Store>(() => ({
    db, hoy, error,
    limpiarError: () => setError(null),
    evento: id => db.eventos.find(e => e.id === id),
    editarEvento: (id, fn) => {
      const eventos = db.eventos.map(e => {
        if (e.id !== id) return e
        const copia = structuredClone(e)
        fn(copia)
        return copia
      })
      return commit({ ...db, eventos })
    },
    agregarEvento: ev => { commit({ ...db, eventos: [ev, ...db.eventos] }) },
    borrarEvento: id => { commit({ ...db, eventos: db.eventos.filter(e => e.id !== id) }) },
    restablecer: () => { commit(datosEjemplo(hoy)) },
  }), [db, hoy, error, commit])

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}

export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore fuera de StoreProvider')
  return s
}
