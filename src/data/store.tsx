import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Db, Evento, Rol, Usuario } from '../domain/types'
import { hoyISO } from '../domain/fechas'
import { hashPassword, normalizarEmail, verificarPassword } from '../domain/auth'
import { quedaAdmin } from '../domain/permisos'
import { telefonoWhatsApp } from '../domain/mensajes'
import { marcarLeidas } from '../domain/notificaciones'
import { datosEjemplo } from './seed'
import { repoLocal, type Repositorio } from './repo'
import { uid } from './uid'

export interface NuevoUsuario { nombre: string; email: string; telefono: string; password: string; rol: Rol; eventos?: string[] | null; temporal?: boolean }
export type CambiosUsuario = Partial<Pick<Usuario, 'nombre' | 'email' | 'telefono' | 'rol' | 'activo' | 'eventos'>>

interface Store {
  db: Db
  hoy: string
  usuario: Usuario | null
  evento: (id: string | undefined) => Evento | undefined
  /** Aplica cambios sobre una copia del evento y guarda. Devuelve false si no se pudo guardar. */
  editarEvento: (id: string, fn: (ev: Evento) => void) => boolean
  agregarEvento: (ev: Evento) => void
  borrarEvento: (id: string) => void
  restablecer: () => void
  empezarVacio: () => void
  // Cuentas
  iniciarSesion: (email: string, password: string) => Promise<string | null>
  registrarse: (datos: Omit<NuevoUsuario, 'rol'>) => Promise<string | null>
  cerrarSesion: () => void
  crearUsuario: (datos: NuevoUsuario) => Promise<string | null>
  editarUsuario: (id: string, cambios: CambiosUsuario) => string | null
  cambiarPassword: (id: string, password: string, temporal?: boolean) => Promise<void>
  /** Marca notificaciones del usuario actual como leídas. */
  marcarLeidas: (ids: string[] | 'todas') => void
  error: string | null
  limpiarError: () => void
}

const Ctx = createContext<Store | null>(null)
const mismoTel = (a: string, b: string) => { const x = telefonoWhatsApp(a), y = telefonoWhatsApp(b); return !!x && x === y }

export function StoreProvider({ children, repo = repoLocal }: { children: ReactNode; repo?: Repositorio }) {
  const hoy = hoyISO()
  const [db, setDb] = useState<Db>(() => repo.cargar() ?? datosEjemplo(hoy))
  // Las acciones leen siempre la versión más reciente, para que varias seguidas no se pisen.
  const ref = useRef(db)
  const get = () => ref.current
  const [sesionId, setSesionId] = useState<string | null>(() => repo.sesion())
  const [error, setError] = useState<string | null>(null)

  const commit = useCallback((next: Db) => {
    try {
      repo.guardar(next)
      ref.current = next
      setDb(next)
      return true
    } catch (e) {
      setError((e as Error).message)
      return false
    }
  }, [repo])

  const entrar = useCallback((id: string | null) => { repo.guardarSesion(id); setSesionId(id) }, [repo])
  const usuario = db.usuarios.find(u => u.id === sesionId && u.activo) ?? null

  const nuevo = useCallback(async (d: NuevoUsuario, actual: Db): Promise<Usuario | string> => {
    const email = normalizarEmail(d.email)
    if (actual.usuarios.some(u => u.email === email)) return 'Ya existe una cuenta con ese correo.'
    const { hash, salt } = await hashPassword(d.password)
    return {
      id: uid('u'), nombre: d.nombre.trim(), email, telefono: d.telefono.trim(), rol: d.rol, activo: true,
      eventos: d.rol === 'capturista' ? d.eventos ?? null : null, hash, salt, debeCambiarPassword: !!d.temporal, creado: hoy,
    }
  }, [hoy])

  /** Vincula a un participante con las personas que tengan su mismo teléfono y aún no tengan cuenta. */
  const vincularPorTelefono = (eventos: Evento[], u: Usuario) =>
    u.rol !== 'participante' || !u.telefono ? eventos : eventos.map(ev => ({
      ...ev, personas: ev.personas.map(p => (!p.usuarioId && mismoTel(p.telefono, u.telefono) ? { ...p, usuarioId: u.id } : p)),
    }))

  const store = useMemo<Store>(() => ({
    db, hoy, usuario, error,
    limpiarError: () => setError(null),
    evento: id => get().eventos.find(e => e.id === id),
    editarEvento: (id, fn) => {
      const eventos = get().eventos.map(e => {
        if (e.id !== id) return e
        const copia = structuredClone(e)
        fn(copia)
        return copia
      })
      return commit({ ...get(), eventos })
    },
    agregarEvento: ev => { commit({ ...get(), eventos: [ev, ...get().eventos] }) },
    borrarEvento: id => { commit({ ...get(), eventos: get().eventos.filter(e => e.id !== id) }) },
    restablecer: () => { commit(datosEjemplo(hoy)); entrar(null) },
    empezarVacio: () => { if (usuario) commit({ version: 2, eventos: [], usuarios: [usuario] }) },

    iniciarSesion: async (email, password) => {
      const u = get().usuarios.find(x => x.email === normalizarEmail(email))
      if (!u || !(await verificarPassword(u, password))) return 'Correo o contraseña incorrectos.'
      if (!u.activo) return 'Esta cuenta está desactivada. Pide al administrador que la active.'
      entrar(u.id)
      return null
    },
    registrarse: async datos => {
      // La primera cuenta es la del administrador; las demás entran como participantes.
      const rol: Rol = get().usuarios.length === 0 ? 'admin' : 'participante'
      const u = await nuevo({ ...datos, rol }, get())
      if (typeof u === 'string') return u
      if (!commit({ ...get(), usuarios: [...get().usuarios, u], eventos: vincularPorTelefono(get().eventos, u) })) return 'No se pudo guardar la cuenta.'
      entrar(u.id)
      return null
    },
    cerrarSesion: () => entrar(null),

    crearUsuario: async datos => {
      if (usuario?.rol !== 'admin') return 'Solo el administrador puede crear usuarios.'
      const u = await nuevo(datos, get())
      if (typeof u === 'string') return u
      return commit({ ...get(), usuarios: [...get().usuarios, u], eventos: vincularPorTelefono(get().eventos, u) }) ? null : 'No se pudo guardar.'
    },
    editarUsuario: (id, cambios) => {
      if (usuario?.rol !== 'admin') return 'Solo el administrador puede editar usuarios.'
      const actual = get().usuarios.find(u => u.id === id)
      if (!actual) return 'No se encontró el usuario.'
      const email = cambios.email != null ? normalizarEmail(cambios.email) : actual.email
      if (get().usuarios.some(u => u.id !== id && u.email === email)) return 'Ya existe una cuenta con ese correo.'
      const cambiado: Usuario = { ...actual, ...cambios, email }
      if (cambiado.rol !== 'capturista') cambiado.eventos = null
      if (!quedaAdmin(get().usuarios, cambiado)) return 'Debe quedar al menos un administrador activo.'
      // Si deja de ser participante, se desvincula de sus registros
      const eventos = cambiado.rol === 'participante' ? get().eventos
        : get().eventos.map(ev => ({ ...ev, personas: ev.personas.map(p => (p.usuarioId === id ? { ...p, usuarioId: null } : p)) }))
      return commit({ ...get(), eventos, usuarios: get().usuarios.map(u => (u.id === id ? cambiado : u)) }) ? null : 'No se pudo guardar.'
    },
    cambiarPassword: async (id, password, temporal = false) => {
      const { hash, salt } = await hashPassword(password)
      commit({ ...get(), usuarios: get().usuarios.map(u => (u.id === id ? { ...u, hash, salt, debeCambiarPassword: temporal } : u)) })
    },
    marcarLeidas: ids => {
      if (!usuario) return
      const actual = get().usuarios.find(u => u.id === usuario.id) ?? usuario
      const cambios = marcarLeidas(actual, ids, new Date().toISOString())
      commit({ ...get(), usuarios: get().usuarios.map(u => (u.id === usuario.id ? { ...u, ...cambios } : u)) })
    },
  }), [db, hoy, usuario, error, commit, entrar, nuevo])

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}

export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore fuera de StoreProvider')
  return s
}
