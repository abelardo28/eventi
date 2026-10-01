import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../data/store'
import { activarAvisos, avisosActivos, avisosSoportados, useNotificaciones } from '../data/notificaciones'
import { esNueva, VENTANA_DIAS, type Notificacion, type TipoNotif } from '../domain/notificaciones'
import { fCorta } from '../domain/fechas'
import { IcAlert, IcBell, IcCheck, IcClock, IcClose, IcReceipt } from '../ui/icons'
import { Toggle, Topbar } from '../ui/kit'
import { useToast } from '../ui/overlay'

const ICONO: Record<TipoNotif, { ic: typeof IcBell; tono: string }> = {
  comprobante: { ic: IcReceipt, tono: 'acc' },
  registrado: { ic: IcReceipt, tono: 'ok' },
  validado: { ic: IcCheck, tono: 'ok' },
  rechazado: { ic: IcClose, tono: 'bad' },
  'por-vencer': { ic: IcClock, tono: 'warn' },
  vencido: { ic: IcAlert, tono: 'bad' },
  resumen: { ic: IcBell, tono: 'acc' },
}

/** "hace 5 min", "hace 3 h", "ayer", "28 sep". */
function haceCuanto(iso: string, ahora = new Date()): string {
  const t = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso)
  const min = Math.round((ahora.getTime() - t.getTime()) / 6e4)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  if (min < 60 * 24 && t.getDate() === ahora.getDate()) return `hace ${Math.round(min / 60)} h`
  const ayer = new Date(ahora); ayer.setDate(ayer.getDate() - 1)
  if (t.toDateString() === ayer.toDateString()) return 'ayer'
  return fCorta(iso.slice(0, 10))
}

function Item({ n, nueva, onAbrir }: { n: Notificacion; nueva: boolean; onAbrir: () => void }) {
  const { ic: Ic, tono } = ICONO[n.tipo]
  return (
    <button className={`notif ${nueva ? 'nueva' : ''}`} onClick={onAbrir}>
      <span className={`notif-ic ${tono}`}><Ic size={17} /></span>
      <span>
        <span className="name">{n.titulo}</span>
        <div className="sub">{n.texto}</div>
      </span>
      <span className="notif-t">{haceCuanto(n.fecha)}{nueva && <i className="punto" aria-label="sin leer" />}</span>
    </button>
  )
}

export function Notificaciones() {
  const { usuario, db, marcarLeidas } = useStore()
  const { lista, nuevas } = useNotificaciones()
  const { toast } = useToast()
  const nav = useNavigate()
  const [activo, setActivo] = useState(() => !!usuario && avisosActivos(usuario.id))
  if (!usuario) return null
  const nombreEvento = (id: string) => db.eventos.find(e => e.id === id)?.nombre
  const varios = new Set(lista.map(n => n.eventoId)).size > 1
  const abrir = (n: Notificacion) => { if (esNueva(usuario, n)) marcarLeidas([n.id]); nav(n.ruta) }
  const cambiarAvisos = async (v: boolean) => {
    const err = await activarAvisos(usuario.id, v, lista)
    if (err) { toast(err); setActivo(false) } else setActivo(v)
  }
  const anteriores = lista.filter(n => !esNueva(usuario, n))
  const seccion = (titulo: string, xs: Notificacion[], nueva: boolean) => xs.length > 0 && (
    <section className="glass panel" style={{ paddingBlock: 6 }}>
      <div className="small muted" style={{ padding: '10px 4px 4px', fontWeight: 600 }}>{titulo}</div>
      <div className="list">
        {xs.map(n => (
          <div key={n.id}>
            <Item n={n} nueva={nueva} onAbrir={() => abrir(n)} />
            {varios && <div className="small faint notif-ev">{nombreEvento(n.eventoId)}</div>}
          </div>
        ))}
      </div>
    </section>
  )

  return (
    <>
      <Topbar back="/" />
      <section className="hello">
        <div><div className="eyebrow">Tu actividad</div><h1 className="titlerow">Notificaciones{nuevas.length > 0 && <span className="badge acc">{nuevas.length}</span>}</h1></div>
        {nuevas.length > 0 && <button className="btn sm ghost" onClick={() => marcarLeidas('todas')}><IcCheck />Marcar todas como leídas</button>}
      </section>
      <div className="stack">
        {seccion('Nuevas', nuevas, true)}
        {seccion('Anteriores', anteriores, false)}
        {!lista.length && <div className="glass panel empty"><IcBell size={26} /><span>No tienes notificaciones. Aquí verás los pagos registrados, validados o rechazados y los que están por vencer.</span></div>}
        <section className="glass panel stack">
          <div className="between">
            <span><b>Avisos en este dispositivo</b><div className="small muted">Te avisamos aunque estés en otra app, mientras Eventi siga abierta.</div></span>
            <Toggle id="t-avisos" checked={activo} onChange={cambiarAvisos} label="Avisos en este dispositivo" disabled={!avisosSoportados()} />
          </div>
          {!avisosSoportados() && <div className="small muted">En iPhone, primero instala Eventi en tu pantalla de inicio (Compartir &gt; Agregar a inicio) y ábrela desde ahí.</div>}
          <div className="small faint">Se muestran los últimos {VENTANA_DIAS} días. Los avisos con la app cerrada llegarán cuando los datos estén en la nube.</div>
        </section>
      </div>
    </>
  )
}
