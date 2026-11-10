import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Db, Evento, Usuario } from '../domain/types'
import { hoyISO } from '../domain/fechas'
import { normalizarEmail } from '../domain/auth'
import { conAlcance, quedaAdmin } from '../domain/permisos'
import { marcarLeidas } from '../domain/notificaciones'
import { aUsuario, clienteSinSesion, desuscribirPush, errorAuth, sb, subirComprobantes, type Perfil } from './nube'
import { repoLocal } from './repo'
import { Ctx, type CambiosUsuario, type Store } from './store'

const VACIO: Db = { version: 2, eventos: [], usuarios: [] }
const claveCache = (uid: string) => `eventi-nube-${uid}`

type Fila = { id: string; datos: Evento; version: number }

/** Copia rápida en el dispositivo para abrir la app al instante (y ver datos sin conexión). */
function leerCache(uid: string): { db: Db; versiones: Record<string, number> } | null {
  try { const r = localStorage.getItem(claveCache(uid)); return r ? JSON.parse(r) : null } catch { return null }
}
function guardarCache(uid: string, db: Db, versiones: Record<string, number>) {
  try { localStorage.setItem(claveCache(uid), JSON.stringify({ db, versiones })) } catch { /* sin espacio: se queda solo en memoria */ }
}

/**
 * Los mismos datos y acciones que el modo local, pero guardados en Supabase:
 * cada evento es un documento con versión; si dos personas guardan a la vez, el cambio
 * se vuelve a aplicar sobre la versión más nueva en lugar de pisarla.
 */
export function StoreNubeProvider({ children }: { children: ReactNode }) {
  const nube = sb!
  const hoy = hoyISO()
  const [uid, setUid] = useState<string | null>(null)
  const [listo, setListo] = useState(false)
  const [db, setDb] = useState<Db>(VACIO)
  const ref = useRef(db)
  const versiones = useRef<Record<string, number>>({})
  const [error, setError] = useState<string | null>(null)
  const [recuperando, setRecuperando] = useState(false)
  const [org, setOrg] = useState<{ id: string; nombre: string } | null>(null)

  const poner = useCallback((next: Db) => {
    ref.current = next
    setDb(next)
    if (uid) guardarCache(uid, next, versiones.current)
  }, [uid])


  // ─── Cargar todo desde el servidor ──────────────────────────────────────
  const cargar = useCallback(async (id: string) => {
    const { data: perfiles, error: e1 } = await nube.from('perfiles').select('*')
    if (e1) { setError('No se pudieron cargar los datos: ' + e1.message); return }
    const usuarios = (perfiles as Perfil[]).map(aUsuario)
    nube.from('organizaciones').select('id, nombre').maybeSingle().then(({ data }) => setOrg(data ?? null), () => {})
    const propio = usuarios.find(u => u.id === id)
    let filas: Fila[] = []
    if (propio?.rol === 'participante') {
      const { data, error: e2 } = await nube.rpc('mis_eventos')
      if (e2) { setError('No se pudieron cargar tus pagos: ' + e2.message); return }
      filas = ((data ?? []) as (Evento & { _version: number })[]).map(({ _version, ...ev }) => ({ id: ev.id, datos: ev, version: _version }))
    } else if (propio) {
      const { data, error: e2 } = await nube.from('eventos').select('id, datos, version')
      if (e2) { setError('No se pudieron cargar los eventos: ' + e2.message); return }
      filas = (data ?? []) as Fila[]
    }
    versiones.current = Object.fromEntries(filas.map(f => [f.id, f.version]))
    const eventos = filas.map(f => f.datos).sort((a, b) => b.fecha.localeCompare(a.fecha))
    const next: Db = { version: 2, eventos, usuarios }
    ref.current = next
    setDb(next)
    guardarCache(id, next, versiones.current)
  }, [nube])

  // Sesión: al abrir, al entrar, al salir y al volver de un enlace para cambiar contraseña
  useEffect(() => {
    let vivo = true
    nube.auth.getSession().then(({ data }) => {
      if (!vivo) return
      const id = data.session?.user.id ?? null
      if (id) { const c = leerCache(id); if (c) { versiones.current = c.versiones; ref.current = c.db; setDb(c.db) } }
      // Al volver de un enlace del correo (confirmar cuenta o cambiar contraseña) se limpia la dirección
      const h = location.hash
      if (/access_token|error_description|type=(recovery|signup)/.test(h)) {
        const falla = new URLSearchParams(h.replace(/^#\/?/, '')).get('error_description')
        if (falla) setError(/expired|invalid/i.test(falla) ? 'El enlace del correo ya venció. Pide uno nuevo.' : falla)
        history.replaceState(null, '', location.pathname + location.search + '#/')
      }
      setUid(id)
      setListo(true)
    })
    const { data: sub } = nube.auth.onAuthStateChange((evento, sesion) => {
      if (evento === 'PASSWORD_RECOVERY') setRecuperando(true)
      if (!sesion) { ref.current = VACIO; setDb(VACIO) }
      setUid(sesion?.user.id ?? null)
    })
    return () => { vivo = false; sub.subscription.unsubscribe() }
  }, [nube])

  useEffect(() => {
    if (!uid) return
    cargar(uid)
    // Cambios hechos en otros dispositivos
    let t: ReturnType<typeof setTimeout> | undefined
    const pronto = () => { clearTimeout(t); t = setTimeout(() => cargar(uid), 400) }
    const canal = nube.channel('eventi')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'eventos' }, pronto)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'perfiles' }, pronto)
      .subscribe()
    const alVolver = () => { if (document.visibilityState === 'visible') pronto() }
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('online', pronto)
    return () => {
      clearTimeout(t)
      nube.removeChannel(canal)
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener('online', pronto)
    }
  }, [uid, cargar, nube])

  // ─── Guardar un evento con control de versiones ─────────────────────────
  const fallo = useCallback((m: string) => { setError(m); if (uid) cargar(uid) }, [uid, cargar])

  const guardarEvento = useCallback(async (id: string, fn: (ev: Evento) => void, previo: Evento) => {
    let base = previo
    for (let intento = 0; intento < 4; intento++) {
      const copia = structuredClone(base)
      fn(copia)
      await subirComprobantes(copia)
      const v = versiones.current[id]
      const { data, error: e } = await nube.from('eventos').update({ datos: copia, version: v + 1, actualizado: new Date().toISOString() })
        .eq('id', id).eq('version', v).select('version')
      if (e) throw new Error(e.message)
      if (data?.length) {
        versiones.current[id] = data[0].version
        poner({ ...ref.current, eventos: ref.current.eventos.map(x => (x.id === id ? copia : x)) })
        return
      }
      // Alguien más guardó primero: se toma su versión y se vuelve a aplicar el cambio
      const { data: fila, error: e2 } = await nube.from('eventos').select('datos, version').eq('id', id).single()
      if (e2 || !fila) throw new Error('El evento ya no existe.')
      versiones.current[id] = fila.version
      base = fila.datos as Evento
    }
    throw new Error('Otra persona está guardando cambios en este evento. Vuelve a intentar.')
  }, [nube, poner])

  /** Participante: solo envía sus comprobantes nuevos; el servidor los agrega por validar. */
  const proponer = useCallback(async (id: string, antes: Evento, despues: Evento) => {
    const ya = new Set(antes.abonos.map(a => a.id))
    const nuevo = structuredClone(despues)
    await subirComprobantes(nuevo)
    for (const a of nuevo.abonos) {
      if (ya.has(a.id)) continue
      const { error: e } = await nube.rpc('proponer_abono', { p_evento: id, p_abono: a })
      if (e) throw new Error(e.message)
    }
    if (uid) await cargar(uid)
  }, [nube, uid, cargar])

  const actualizarPerfil = useCallback(async (id: string, cambios: Partial<Perfil>) => {
    const { error: e } = await nube.from('perfiles').update(cambios).eq('id', id)
    if (e) throw new Error(e.message.includes('administrador') ? 'Debe quedar al menos un administrador activo.' : e.message)
  }, [nube])

  const visible = useMemo(() => {
    const u = (listo && db.usuarios.find(x => x.id === uid && x.activo)) || null
    return u && recuperando ? { ...u, debeCambiarPassword: true } : u
  }, [listo, db, uid, recuperando])

  const store = useMemo<Store>(() => {
    const yo = (): Usuario | undefined => ref.current.usuarios.find(u => u.id === uid)
    const esParticipante = () => yo()?.rol === 'participante'
    return {
    nube: true, db, hoy, usuario: visible, error,
    limpiarError: () => setError(null),
    evento: id => ref.current.eventos.find(e => e.id === id),

    editarEvento: (id, fn) => {
      const previo = ref.current.eventos.find(e => e.id === id)
      if (!previo) return false
      const copia = structuredClone(previo)
      fn(copia)
      poner({ ...ref.current, eventos: ref.current.eventos.map(e => (e.id === id ? copia : e)) })
      const tarea = esParticipante() ? proponer(id, previo, copia) : guardarEvento(id, fn, previo)
      tarea.catch(e => fallo('No se guardó el cambio: ' + (e as Error).message))
      return true
    },
    agregarEvento: ev => {
      poner({ ...ref.current, eventos: [ev, ...ref.current.eventos] })
      ;(async () => {
        const copia = structuredClone(ev)
        await subirComprobantes(copia)
        const { error: e } = await nube.from('eventos').insert({ id: ev.id, datos: copia, version: 1 })
        if (e) throw new Error(e.message)
        versiones.current[ev.id] = 1
      })().catch(e => fallo('No se guardó el evento: ' + (e as Error).message))
    },
    borrarEvento: id => {
      poner({ ...ref.current, eventos: ref.current.eventos.filter(e => e.id !== id) })
      nube.from('eventos').delete().eq('id', id).then(({ error: e }) => { if (e) fallo('No se borró el evento: ' + e.message) })
    },
    // En la nube no se cargan datos de ejemplo ni se borra todo desde un dispositivo
    restablecer: () => {},
    empezarVacio: () => {},

    iniciarSesion: async (email, password) => {
      const { data, error: e } = await nube.auth.signInWithPassword({ email: normalizarEmail(email), password })
      if (e || !data.user) return errorAuth(e?.message)
      const { data: p } = await nube.from('perfiles').select('activo').eq('id', data.user.id).single()
      if (p && !p.activo) { await nube.auth.signOut(); return 'Esta cuenta está desactivada. Pide al administrador que la active.' }
      return null
    },
    registrarse: async d => {
      const { data, error: e } = await nube.auth.signUp({
        email: normalizarEmail(d.email), password: d.password,
        options: { data: { nombre: d.nombre.trim(), telefono: d.telefono.trim(), organizacion: d.organizacion?.trim() || d.nombre.trim() }, emailRedirectTo: location.origin + location.pathname },
      })
      if (e) return errorAuth(e.message)
      if (data.user && !data.user.identities?.length) return 'Ya existe una cuenta con ese correo.'
      if (!data.session) return 'Te mandamos un correo para confirmar tu cuenta. Ábrelo y después inicia sesión.'
      return null
    },
    cerrarSesion: () => { setRecuperando(false); desuscribirPush(false).finally(() => nube.auth.signOut()) },

    crearUsuario: async d => {
      if (yo()?.rol !== 'admin') return 'Solo el administrador puede crear usuarios.'
      // La invitación hace que la cuenta nueva entre a esta organización con su rol (y no cree una propia)
      const { data: invitacion, error: e0 } = await nube.rpc('crear_invitacion', {
        p_email: normalizarEmail(d.email), p_rol: d.rol, p_eventos: conAlcance(d.rol) ? d.eventos ?? null : null, p_temporal: !!d.temporal,
      })
      if (e0 || !invitacion) return 'No se pudo preparar la cuenta: ' + (e0?.message ?? 'sin respuesta del servidor')
      const { data, error: e } = await clienteSinSesion().auth.signUp({
        email: normalizarEmail(d.email), password: d.password,
        options: { data: { nombre: d.nombre.trim(), telefono: d.telefono.trim(), invitacion }, emailRedirectTo: location.origin + location.pathname },
      })
      if (e) return errorAuth(e.message)
      if (!data.user || !data.user.identities?.length) return 'Ya existe una cuenta con ese correo.'
      if (uid) await cargar(uid)
      return null
    },
    editarUsuario: (id, cambios: CambiosUsuario) => {
      if (yo()?.rol !== 'admin') return 'Solo el administrador puede editar usuarios.'
      const actual = ref.current.usuarios.find(u => u.id === id)
      if (!actual) return 'No se encontró el usuario.'
      if (cambios.email != null && normalizarEmail(cambios.email) !== actual.email) return 'El correo de una cuenta no se puede cambiar desde aquí.'
      const cambiado: Usuario = { ...actual, ...cambios, email: actual.email }
      if (!conAlcance(cambiado.rol)) cambiado.eventos = null
      if (!quedaAdmin(ref.current.usuarios, cambiado)) return 'Debe quedar al menos un administrador activo.'
      poner({ ...ref.current, usuarios: ref.current.usuarios.map(u => (u.id === id ? cambiado : u)) })
      actualizarPerfil(id, { nombre: cambiado.nombre.trim(), telefono: cambiado.telefono.trim(), rol: cambiado.rol, activo: cambiado.activo, eventos: cambiado.eventos })
        .then(async () => {
          // Si deja de ser participante, se desvincula de sus registros
          if (cambiado.rol === 'participante') return
          for (const ev of ref.current.eventos) {
            if (!ev.personas.some(p => p.usuarioId === id)) continue
            await guardarEvento(ev.id, e => { for (const p of e.personas) if (p.usuarioId === id) p.usuarioId = null }, ev)
          }
        })
        .catch(e => fallo('No se guardó el usuario: ' + (e as Error).message))
      return null
    },
    cambiarPassword: async (id, password) => {
      if (id !== uid) throw new Error('Solo puedes cambiar tu propia contraseña.')
      const { error: e } = await nube.auth.updateUser({ password })
      if (e) throw new Error(errorAuth(e.message))
      await actualizarPerfil(id, { debe_cambiar_password: false })
      setRecuperando(false)
      await cargar(id)
    },
    enviarRestablecer: async email => {
      const { error: e } = await nube.auth.resetPasswordForEmail(normalizarEmail(email), { redirectTo: location.origin + location.pathname })
      return e ? errorAuth(e.message) : null
    },
    organizacion: org?.nombre ?? null,
    renombrarOrganizacion: async nombre => {
      if (!org || yo()?.rol !== 'admin') return 'Solo el administrador puede cambiar el nombre.'
      if (!nombre.trim()) return 'Escribe un nombre.'
      const { error: e } = await nube.from('organizaciones').update({ nombre: nombre.trim() }).eq('id', org.id)
      if (e) return e.message
      setOrg({ ...org, nombre: nombre.trim() })
      return null
    },
    marcarLeidas: ids => {
      const actual = yo()
      if (!actual) return
      const c = marcarLeidas(actual, ids, new Date().toISOString())
      poner({ ...ref.current, usuarios: ref.current.usuarios.map(u => (u.id === actual.id ? { ...u, ...c } : u)) })
      actualizarPerfil(actual.id, { notif_leidas_hasta: c.notifLeidasHasta ?? null, notif_leidas: c.notifLeidas ?? [] }).catch(() => {})
    },

    subirDatosLocales: async () => {
      const local = repoLocal.cargar()
      if (!local?.eventos.length) return 'En este dispositivo no hay eventos guardados.'
      const { data: existentes } = await nube.from('eventos').select('id')
      const ya = new Set((existentes ?? []).map(x => x.id as string))
      let subidos = 0, omitidos = 0
      for (const ev of local.eventos) {
        if (ya.has(ev.id)) { omitidos++; continue }
        const copia = structuredClone(ev)
        // Las cuentas de este dispositivo no existen en la nube: los participantes se vuelven a vincular al registrarse
        for (const p of copia.personas) p.usuarioId = null
        await subirComprobantes(copia)
        const { error: e } = await nube.from('eventos').insert({ id: copia.id, datos: copia, version: 1 })
        if (e) throw new Error(`No se pudo subir «${ev.nombre}»: ${e.message}`)
        subidos++
      }
      if (uid) await cargar(uid)
      return [subidos && `${subidos} ${subidos === 1 ? 'evento subido' : 'eventos subidos'}`, omitidos && `${omitidos} ya estaba${omitidos === 1 ? '' : 'n'} en la nube`].filter(Boolean).join(' · ') || 'Nada que subir.'
    },
  }
  }, [db, hoy, visible, error, uid, org, poner, proponer, guardarEvento, fallo, actualizarPerfil, cargar, nube])

  if (!listo) return <div className="cargando" role="status">Cargando…</div>
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}
