import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../data/store'
import { problemaPassword } from '../domain/auth'
import { ROLES, puede } from '../domain/permisos'
import { Sheet, useToast } from '../ui/overlay'

/** Menú de la cuenta: datos, usuarios (admin), contraseña, datos del dispositivo y salir. */
export function CuentaSheet({ onClose }: { onClose: () => void }) {
  const { usuario, nube, cerrarSesion, cambiarPassword, restablecer, empezarVacio, subirDatosLocales } = useStore()
  const [subiendo, setSubiendo] = useState(false)
  const { toast } = useToast()
  const nav = useNavigate()
  const [vista, setVista] = useState<'menu' | 'password' | 'datos'>('menu')
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [error, setError] = useState<string | null>(null)
  if (!usuario) return null

  const guardarPassword = async () => {
    const p = problemaPassword(p1)
    if (p) { setError(p); return }
    if (p1 !== p2) { setError('Las contraseñas no coinciden.'); return }
    try { await cambiarPassword(usuario.id, p1) } catch (x) { setError((x as Error).message); return }
    toast('Contraseña actualizada'); onClose()
  }

  return (
    <Sheet title={usuario.nombre} onClose={onClose} onSubmit={vista === 'password' ? guardarPassword : undefined}>
      <div className="small muted">{usuario.email} · {ROLES[usuario.rol].nombre}</div>
      {vista === 'menu' && (
        <div className="menu">
          {puede(usuario, 'usuarios.gestionar') && <button type="button" onClick={() => { onClose(); nav('/usuarios') }}>Usuarios y roles</button>}
          <button type="button" onClick={() => setVista('password')}>Cambiar contraseña</button>
          {puede(usuario, 'datos.restablecer') && <button type="button" onClick={() => setVista('datos')}>{nube ? 'Subir datos de este dispositivo' : 'Datos de este dispositivo'}</button>}
          <button type="button" className="danger" onClick={() => { cerrarSesion(); onClose(); nav('/') }}>Cerrar sesión</button>
        </div>
      )}
      {vista === 'password' && (
        <>
          <label className="f">Nueva contraseña<input className="inp" id="cu-p1" type="password" autoComplete="new-password" value={p1} onChange={e => setP1(e.target.value)} /></label>
          <label className="f">Repítela<input className="inp" id="cu-p2" type="password" autoComplete="new-password" value={p2} onChange={e => setP2(e.target.value)} /></label>
          {error && <div className="small neg">{error}</div>}
          <button className="btn block" type="submit">Guardar contraseña</button>
        </>
      )}
      {vista === 'datos' && nube && (
        <div className="stack">
          <div className="small muted">Ahora los datos se guardan en la nube y se ven igual en todos tus dispositivos. Si capturaste eventos en este dispositivo antes de conectarlo, súbelos aquí. Los que ya estén en la nube no se tocan.</div>
          <div className="small faint">Las cuentas de este dispositivo no se suben: cada persona crea su cuenta en la nube y se vincula sola por su WhatsApp.</div>
          <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} disabled={subiendo} onClick={async () => {
            setSubiendo(true)
            try { toast(await subirDatosLocales!()) } catch (e) { toast((e as Error).message) } finally { setSubiendo(false) }
          }}>{subiendo ? 'Subiendo…' : 'Subir eventos a la nube'}</button>
        </div>
      )}
      {vista === 'datos' && !nube && (
        <div className="stack">
          <div className="small muted">Por ahora todo se guarda en este dispositivo. Estas acciones no se pueden deshacer.</div>
          <div className="confirm">
            <b>Empezar desde cero</b>
            <span className="small">Borra eventos y usuarios de prueba. Se queda solo tu cuenta de administrador.</span>
            <button type="button" className="btn sm danger" style={{ alignSelf: 'flex-start' }} onClick={() => { empezarVacio(); onClose(); nav('/'); toast('Listo, empieza creando tu primer evento') }}>Borrar todo y empezar</button>
          </div>
          <div className="confirm">
            <b>Volver a los datos de ejemplo</b>
            <span className="small">Reemplaza todo con el torneo de ejemplo y las cuentas de prueba. Se cerrará tu sesión.</span>
            <button type="button" className="btn sm danger" style={{ alignSelf: 'flex-start' }} onClick={() => { restablecer(); onClose(); nav('/') }}>Cargar ejemplo</button>
          </div>
        </div>
      )}
    </Sheet>
  )
}
