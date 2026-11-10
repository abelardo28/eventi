import { useState, type FormEvent } from 'react'
import { useStore } from '../data/store'
import { fijarRecordar, recordarSesion } from '../data/recordar'
import { CUENTAS_DEMO, PASSWORD_DEMO } from '../data/seed'
import { emailValido, problemaPassword } from '../domain/auth'
import { ROLES } from '../domain/permisos'
import { Logo } from '../ui/icons'

/** Pantalla de entrada: iniciar sesión o crear cuenta. */
export function Acceso() {
  const { db, nube, iniciarSesion, registrarse, enviarRestablecer } = useStore()
  // En la nube no se sabe desde aquí si ya hay cuentas: siempre se ofrecen las dos opciones
  const primera = !nube && db.usuarios.length === 0
  const [modo, setModo] = useState<'entrar' | 'registro'>(primera ? 'registro' : 'entrar')
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [telefono, setTelefono] = useState('')
  const [organizacion, setOrganizacion] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [recordar, setRecordar] = useState(recordarSesion)
  const hayDemo = db.usuarios.some(u => u.email.endsWith('@eventi.demo'))

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!emailValido(email)) { setError('Escribe un correo válido.'); return }
    if (modo === 'registro') {
      if (!nombre.trim()) { setError('Escribe tu nombre.'); return }
      const p = problemaPassword(password)
      if (p) { setError(p); return }
    }
    fijarRecordar(recordar)
    setCargando(true)
    const r = modo === 'entrar' ? await iniciarSesion(email, password) : await registrarse({ nombre, email, telefono, password, organizacion })
    setCargando(false)
    if (r) setError(r)
  }

  const olvide = async () => {
    setError(null); setAviso(null)
    if (!emailValido(email)) { setError('Escribe tu correo y vuelve a tocar «Olvidé mi contraseña».'); return }
    const r = await enviarRestablecer!(email)
    if (r) setError(r); else setAviso('Te mandamos un correo con un enlace para elegir una contraseña nueva.')
  }

  return (
    <div className="acceso">
      <div className="acceso-marca"><Logo size={56} /><span>eventi</span></div>
      <p className="muted" style={{ textAlign: 'center', margin: '0 0 22px' }}>Pagos, abonos y actividades de tus eventos, en un solo lugar.</p>

      <form className="glass panel stack" onSubmit={enviar} noValidate>
        {primera
          ? <div><h2>Crea la cuenta de administrador</h2><div className="small muted">Es la primera cuenta en este dispositivo; tendrá control total.</div></div>
          : (
            <div className="tabs" role="tablist" style={{ position: 'static', boxShadow: 'none', margin: 0, background: 'var(--track)' }}>
              <button type="button" role="tab" className="tab" aria-selected={modo === 'entrar'} onClick={() => { setModo('entrar'); setError(null) }}>Iniciar sesión</button>
              <button type="button" role="tab" className="tab" aria-selected={modo === 'registro'} onClick={() => { setModo('registro'); setError(null) }}>Crear cuenta</button>
            </div>
          )}

        {modo === 'registro' && <label className="f">Nombre<input className="inp" id="ac-nombre" autoComplete="name" value={nombre} onChange={e => setNombre(e.target.value)} /></label>}
        {modo === 'registro' && nube && <label className="f">Nombre de tu organización<input className="inp" id="ac-org" autoComplete="organization" value={organizacion} onChange={e => setOrganizacion(e.target.value)} placeholder="Ej. Liga de Béisbol Mazatlán" /></label>}
        <label className="f">Correo<input className="inp" id="ac-email" type="email" inputMode="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
        {modo === 'registro' && (
          <label className="f">WhatsApp
            <input className="inp" id="ac-tel" type="tel" inputMode="tel" autoComplete="tel" value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="10 dígitos" />
            {!primera && !nube && <span className="small faint" style={{ fontWeight: 500 }}>Usa el número que diste al organizador para ver tus pagos al instante.</span>}
          </label>
        )}
        <label className="f">Contraseña
          <input className="inp" id="ac-pass" type="password" autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} />
          {modo === 'registro' && <span className="small faint" style={{ fontWeight: 500 }}>Mínimo 8 caracteres, con letras y números.</span>}
        </label>
        <label className="recordar"><input type="checkbox" id="ac-recordar" checked={recordar} onChange={e => setRecordar(e.target.checked)} />Recordar sesión en este dispositivo</label>
        {error && <div className="small neg" role="alert">{error}</div>}
        {aviso && <div className="small pos" role="status">{aviso}</div>}
        <button className="btn block" type="submit" disabled={cargando}>{cargando ? 'Un momento…' : modo === 'entrar' ? 'Entrar' : 'Crear cuenta'}</button>
        {modo === 'registro' && !primera && <div className="small faint">{nube
          ? 'Se crea tu organización y entras como administrador. Tus eventos, personas y pagos solo los ven las cuentas que tú des de alta. Si alguien ya te dio de alta, no crees otra cuenta: entra con el correo y la contraseña que te mandó.'
          : 'Las cuentas nuevas entran como participante. El administrador puede cambiarte el rol.'}</div>}
        {nube && modo === 'entrar' && <button type="button" className="linkbtn small" style={{ alignSelf: 'center' }} onClick={olvide}>Olvidé mi contraseña</button>}
      </form>

      {hayDemo && modo === 'entrar' && (
        <section className="glass panel stack" style={{ marginTop: 16 }}>
          <div><h3>Cuentas de prueba</h3><div className="small muted">Contraseña: <b className="num">{PASSWORD_DEMO}</b>. Toca una para llenar el formulario.</div></div>
          {CUENTAS_DEMO.map(c => (
            <button key={c.email} type="button" className="item" style={{ gridTemplateColumns: '1fr auto', paddingBlock: 9 }}
              onClick={() => { setEmail(c.email); setPassword(PASSWORD_DEMO); setError(null) }}>
              <span><span className="name small">{ROLES[c.rol].nombre}</span><div className="sub">{c.email}</div></span>
              <span className="small muted">Usar</span>
            </button>
          ))}
        </section>
      )}
    </div>
  )
}

/** Cuando el administrador creó la cuenta con contraseña temporal, se pide una nueva al entrar. */
export function CambiarPasswordObligatorio() {
  const { usuario, cambiarPassword, cerrarSesion } = useStore()
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [error, setError] = useState<string | null>(null)
  if (!usuario) return null
  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    const p = problemaPassword(p1)
    if (p) { setError(p); return }
    if (p1 !== p2) { setError('Las contraseñas no coinciden.'); return }
    try { await cambiarPassword(usuario.id, p1) } catch (x) { setError((x as Error).message) }
  }
  return (
    <div className="acceso">
      <div className="acceso-marca"><Logo size={48} /><span>eventi</span></div>
      <form className="glass panel stack" onSubmit={enviar} noValidate>
        <div><h2>Hola, {usuario.nombre.split(' ')[0]}</h2><div className="small muted">Entraste con una contraseña temporal. Elige una nueva para continuar.</div></div>
        <label className="f">Nueva contraseña<input className="inp" id="cp-1" type="password" autoComplete="new-password" value={p1} onChange={e => setP1(e.target.value)} /></label>
        <label className="f">Repítela<input className="inp" id="cp-2" type="password" autoComplete="new-password" value={p2} onChange={e => setP2(e.target.value)} /></label>
        {error && <div className="small neg" role="alert">{error}</div>}
        <button className="btn block" type="submit">Guardar y entrar</button>
        <button type="button" className="linkbtn small" onClick={cerrarSesion}>Salir</button>
      </form>
    </div>
  )
}
