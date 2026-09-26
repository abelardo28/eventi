import { useState } from 'react'
import { useStore } from '../data/store'
import { emailValido, passwordTemporal } from '../domain/auth'
import { ROLES } from '../domain/permisos'
import type { Rol, Usuario } from '../domain/types'
import { Toggle } from '../ui/kit'
import { Sheet, useToast } from '../ui/overlay'

const ROLES_LISTA: Rol[] = ['admin', 'capturista', 'participante']

/** Alta y edición de usuarios (solo administrador). */
export function UsuarioSheet({ usuario, onClose }: { usuario?: Usuario; onClose: () => void }) {
  const { db, usuario: yo, crearUsuario, editarUsuario, cambiarPassword, editarEvento } = useStore()
  const { toast } = useToast()
  const [nombre, setNombre] = useState(usuario?.nombre ?? '')
  const [email, setEmail] = useState(usuario?.email ?? '')
  const [telefono, setTelefono] = useState(usuario?.telefono ?? '')
  const [rol, setRol] = useState<Rol>(usuario?.rol ?? 'capturista')
  const [activo, setActivo] = useState(usuario?.activo ?? true)
  const [todos, setTodos] = useState(usuario ? usuario.eventos === null : true)
  const [eventos, setEventos] = useState<string[]>(usuario?.eventos ?? [])
  // Participante: registro al que se vincula (evento:persona)
  const vinculoActual = usuario ? db.eventos.flatMap(ev => ev.personas.filter(p => p.usuarioId === usuario.id).map(p => `${ev.id}:${p.id}`))[0] ?? '' : ''
  const [vinculo, setVinculo] = useState(vinculoActual)
  const [temporal, setTemporal] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const esYo = usuario?.id === yo?.id

  const aplicarVinculo = (uid: string) => {
    if (rol !== 'participante' || vinculo === vinculoActual) return
    const [eid, pid] = vinculo.split(':')
    for (const ev of db.eventos) {
      if (!ev.personas.some(p => p.usuarioId === uid || (ev.id === eid && p.id === pid))) continue
      editarEvento(ev.id, e => {
        for (const p of e.personas) {
          if (p.usuarioId === uid) p.usuarioId = null
          if (e.id === eid && p.id === pid) p.usuarioId = uid
        }
      })
    }
  }

  const guardar = async () => {
    setError(null)
    if (!nombre.trim()) { setError('Escribe el nombre.'); return }
    if (!emailValido(email)) { setError('Escribe un correo válido.'); return }
    if (rol === 'capturista' && !todos && eventos.length === 0) { setError('Elige al menos un evento para el capturista.'); return }
    const alcance = rol === 'capturista' ? (todos ? null : eventos) : null
    if (usuario) {
      const r = editarUsuario(usuario.id, { nombre, email, telefono, rol, activo, eventos: alcance })
      if (r) { setError(r); return }
      aplicarVinculo(usuario.id)
      toast('Usuario actualizado'); onClose()
    } else {
      const pass = passwordTemporal()
      const r = await crearUsuario({ nombre, email, telefono, rol, eventos: alcance, password: pass, temporal: true })
      if (r) { setError(r); return }
      setTemporal(pass)
    }
  }

  const resetear = async () => {
    if (!usuario) return
    const pass = passwordTemporal()
    await cambiarPassword(usuario.id, pass, true)
    setTemporal(pass)
  }

  if (temporal) {
    return (
      <Sheet title={usuario ? 'Contraseña restablecida' : 'Usuario creado'} onClose={onClose} onSubmit={onClose}>
        <div className="small muted">Comparte estos datos con {nombre.split(' ')[0]}. Al entrar se le pedirá elegir su propia contraseña. No volverás a ver esta contraseña temporal.</div>
        <div className="chatbg num" style={{ fontSize: 15 }}>
          <div>Correo: <b>{email.trim().toLowerCase()}</b></div>
          <div>Contraseña temporal: <b style={{ letterSpacing: '.06em' }}>{temporal}</b></div>
        </div>
        <button type="button" className="btn ghost block" onClick={() => {
          navigator.clipboard?.writeText(`Tu cuenta de Eventi\nCorreo: ${email.trim().toLowerCase()}\nContraseña temporal: ${temporal}`)
            .then(() => toast('Copiado'), () => toast('No se pudo copiar; selecciona el texto'))
        }}>Copiar datos</button>
        <button className="btn block" type="submit">Listo</button>
      </Sheet>
    )
  }

  const personasLibres = db.eventos.flatMap(ev => ev.personas
    .filter(p => !p.usuarioId || p.usuarioId === usuario?.id)
    .map(p => ({ key: `${ev.id}:${p.id}`, label: `${p.nombre} · ${ev.nombre}` })))

  return (
    <Sheet title={usuario ? `Editar ${usuario.nombre}` : 'Nuevo usuario'} onClose={onClose} onSubmit={guardar}>
      <div className="grid2">
        <label className="f">Nombre<input className="inp" id="us-n" value={nombre} onChange={e => setNombre(e.target.value)} /></label>
        <label className="f">WhatsApp<input className="inp" id="us-t" type="tel" inputMode="tel" value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="10 dígitos" /></label>
      </div>
      <label className="f">Correo<input className="inp" id="us-e" type="email" inputMode="email" value={email} onChange={e => setEmail(e.target.value)} /></label>

      <div className="f">Rol
        <div className="stack" style={{ gap: 8 }}>
          {ROLES_LISTA.map(r => (
            <button key={r} type="button" className="rolopt" aria-pressed={rol === r} onClick={() => setRol(r)}>
              <span className="dotsel" />
              <span><b style={{ color: 'var(--ink)' }}>{ROLES[r].nombre}</b><div className="small muted" style={{ fontWeight: 500 }}>{ROLES[r].descripcion}</div></span>
            </button>
          ))}
        </div>
      </div>

      {rol === 'capturista' && (
        <div className="stack" style={{ gap: 8 }}>
          <div className="between"><span className="small">Puede trabajar en todos los eventos</span><Toggle id="us-todos" checked={todos} onChange={setTodos} label="Todos los eventos" /></div>
          {!todos && db.eventos.map(ev => (
            <div key={ev.id} className="between">
              <span className="small">{ev.nombre}</span>
              <Toggle id={`us-ev-${ev.id}`} checked={eventos.includes(ev.id)} label={ev.nombre}
                onChange={v => setEventos(xs => (v ? [...xs, ev.id] : xs.filter(x => x !== ev.id)))} />
            </div>
          ))}
        </div>
      )}

      {rol === 'participante' && (
        <label className="f">Registro vinculado
          <select className="inp" id="us-v" value={vinculo} onChange={e => setVinculo(e.target.value)}>
            <option value="">Sin vincular (se vincula solo si su WhatsApp coincide)</option>
            {personasLibres.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          <span className="small faint" style={{ fontWeight: 500 }}>Podrá ver el estado de cuenta de ese registro y subir sus comprobantes.</span>
        </label>
      )}

      {usuario && !esYo && (
        <div className="between"><span className="small">Cuenta activa</span><Toggle id="us-activo" checked={activo} onChange={setActivo} label="Cuenta activa" /></div>
      )}
      {error && <div className="small neg" role="alert">{error}</div>}
      <button className="btn block" type="submit">{usuario ? 'Guardar cambios' : 'Crear y generar contraseña'}</button>
      {usuario && !esYo && <button type="button" className="linkbtn small" onClick={resetear}>Restablecer contraseña</button>}
    </Sheet>
  )
}
