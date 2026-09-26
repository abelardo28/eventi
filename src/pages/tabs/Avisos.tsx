import { useStore } from '../../data/store'
import { uid } from '../../data/uid'
import { cola, concepto, money, type Aviso } from '../../domain/calc'
import { fCorta } from '../../domain/fechas'
import { enlaceWhatsApp, mensajeRecordatorio } from '../../domain/mensajes'
import type { ConfigRecordatorios, Evento } from '../../domain/types'
import { IcBell, IcWa } from '../../ui/icons'
import { DateBadge, Stepper, Toggle } from '../../ui/kit'

export function TabAvisos({ ev }: { ev: Evento }) {
  const { hoy, editarEvento } = useStore()
  const r = ev.recordatorios
  const set = (patch: Partial<ConfigRecordatorios>) => editarEvento(ev.id, e => { Object.assign(e.recordatorios, patch) })
  const c = cola(ev, hoy)
  const ej = c.find(x => x.tipo === 'proximo') ?? c[0]
  const hoyN = c.filter(x => x.envio <= hoy).length
  const enviados = new Set(ev.envios.filter(e => e.fecha === hoy).map(e => e.personaId + e.conceptoId))
  const marcar = (x: Aviso) => editarEvento(ev.id, e => { e.envios.push({ id: uid('n'), fecha: hoy, personaId: x.p.id, conceptoId: x.c.id, canal: 'WhatsApp' }) })

  return (
    <div className="stack-lg">
      <section className="glass panel stack">
        <h2>Configuración</h2>
        <div className="between"><span>Días de aviso antes de cada pago</span><Stepper label="días" min={1} max={15} value={r.diasAntes} onChange={v => set({ diasAntes: v })} /></div>
        <div className="between"><span>Hora de envío</span><input className="inp" type="time" id="hora" value={r.hora} onChange={e => set({ hora: e.target.value || '09:00' })} style={{ width: 'auto' }} /></div>
        <div className="between"><span className="row" style={{ gap: 8 }}><span className="ch wa"><IcWa size={12} />WhatsApp</span><span className="small muted">a su número</span></span><Toggle id="t-wa" checked={r.whatsapp} onChange={v => set({ whatsapp: v })} label="WhatsApp" /></div>
        <div className="between"><span className="row" style={{ gap: 8 }}><span className="ch push"><IcBell size={12} />Push</span><span className="small muted">si tiene la app</span></span><Toggle id="t-push" checked={r.push} onChange={v => set({ push: v })} label="Notificación push" /></div>
        <div className="between"><span>Repetir a quien tenga atraso cada {r.cadaDias} días</span><Toggle id="t-rep" checked={r.repetirVencidos} onChange={v => set({ repetirVencidos: v })} label="Repetir a quien tenga atraso" /></div>
        <div className="small faint">Por ahora cada recordatorio se manda desde tu WhatsApp con un toque. El envío automático a la hora configurada y las notificaciones push se activan cuando conectemos el servidor.</div>
      </section>

      {ej && (
        <section className="glass panel stack">
          <div className="between"><h2>Vista previa</h2><span className="small muted">{ej.p.nombre}</span></div>
          <div className="chatbg"><div className="bubble">{mensajeRecordatorio(ev, ej.p, ej.c, ej.s)}<div className="t">{r.hora}</div></div></div>
        </section>
      )}

      <section className="glass panel stack">
        <div><h2>Próximos recordatorios</h2><div className="small muted">{c.length} programados · {hoyN} tocan hoy</div></div>
        <div className="list">
          {c.slice(0, 20).map(x => {
            const esHoy = x.envio <= hoy
            const link = r.whatsapp ? enlaceWhatsApp(x.p.telefono, mensajeRecordatorio(ev, x.p, x.c, x.s)) : null
            const yaHoy = enviados.has(x.p.id + x.c.id)
            return (
              <div key={x.p.id + x.c.id} className="item" style={{ gridTemplateColumns: '46px 1fr auto' }}>
                <DateBadge fecha={x.envio} hoy={esHoy} />
                <span><span className="name">{x.p.nombre}</span>
                  <div className="sub">{x.c.nombre} · {money(x.s.monto)} · {x.tipo === 'vencido' ? <span className="neg">vencido</span> : `vence ${fCorta(x.s.fecha)}`}</div>
                  {!x.p.telefono && <div className="sub faint">Sin número de WhatsApp</div>}
                </span>
                {link
                  ? <a className={`btn sm ${esHoy && !yaHoy ? 'wa' : 'ghost'}`} href={link} target="_blank" rel="noreferrer" onClick={() => marcar(x)}>{yaHoy ? 'Enviado' : 'Enviar'}</a>
                  : <span />}
              </div>
            )
          })}
          {!c.length && <p className="muted small">No hay pagos pendientes.</p>}
        </div>
      </section>

      <section className="glass panel">
        <h2 style={{ marginBottom: 4 }}>Historial</h2>
        {ev.envios.slice().reverse().slice(0, 15).map(h => (
          <div key={h.id} className="abono">
            <span><b>{ev.personas.find(p => p.id === h.personaId)?.nombre ?? 'Persona eliminada'}</b><div className="small muted">{concepto(ev, h.conceptoId)?.nombre}</div></span>
            <span className="small" style={{ textAlign: 'right' }}>
              {h.canal === 'WhatsApp' ? <span className="ch wa"><IcWa size={12} />WhatsApp</span> : <span className="ch push"><IcBell size={12} />Push</span>}
              <div className="muted">{fCorta(h.fecha)}</div>
            </span>
          </div>
        ))}
        {!ev.envios.length && <p className="muted small">Todavía no se ha enviado nada.</p>}
      </section>
    </div>
  )
}
