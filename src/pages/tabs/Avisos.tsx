import { useRef, useState } from 'react'
import { useStore } from '../../data/store'
import { uid } from '../../data/uid'
import { cola, concepto, money, type Aviso } from '../../domain/calc'
import { fCorta } from '../../domain/fechas'
import { enlaceWhatsApp, mensajeRecordatorio, PLANTILLAS, plantillas, rellenar, VARIABLES, variables, variablesDesconocidas } from '../../domain/mensajes'
import type { ConfigRecordatorios, Evento, Plantillas } from '../../domain/types'
import { useToast } from '../../ui/overlay'
import { puede } from '../../domain/permisos'
import { IcBell, IcWa } from '../../ui/icons'
import { DateBadge, Stepper, Toggle } from '../../ui/kit'

export function TabAvisos({ ev }: { ev: Evento }) {
  const { hoy, editarEvento, usuario } = useStore()
  const config = puede(usuario, 'avisos.configurar', ev.id), enviar = puede(usuario, 'avisos.enviar', ev.id)
  const r = ev.recordatorios
  const set = (patch: Partial<ConfigRecordatorios>) => editarEvento(ev.id, e => { Object.assign(e.recordatorios, patch) })
  const c = cola(ev, hoy)
  const ej = c.find(x => x.tipo === 'proximo') ?? c[0]
  const hoyN = c.filter(x => x.envio <= hoy).length
  const enviados = new Set(ev.envios.filter(e => e.fecha === hoy).map(e => e.personaId + e.conceptoId))
  const marcar = (x: Aviso) => editarEvento(ev.id, e => { e.envios.push({ id: uid('n'), fecha: hoy, personaId: x.p.id, conceptoId: x.c.id, canal: 'WhatsApp' }) })

  return (
    <div className="stack-lg deck">
      <div className="col">
      <section className="glass panel stack o1" style={config ? undefined : { opacity: .6, pointerEvents: 'none' }} aria-disabled={!config}>
        <div className="between"><h2>Configuración</h2>{!config && <span className="small muted">Solo el administrador</span>}</div>
        <div className="between"><span>Días de aviso antes de cada pago</span><Stepper label="días" min={1} max={15} value={r.diasAntes} onChange={v => set({ diasAntes: v })} /></div>
        <div className="between"><span>Hora de envío</span><input className="inp" type="time" id="hora" value={r.hora} onChange={e => set({ hora: e.target.value || '09:00' })} style={{ width: 'auto' }} /></div>
        <div className="between"><span className="row" style={{ gap: 8 }}><span className="ch wa"><IcWa size={12} />WhatsApp</span><span className="small muted">a su número</span></span><Toggle id="t-wa" checked={r.whatsapp} onChange={v => set({ whatsapp: v })} label="WhatsApp" /></div>
        <div className="between"><span className="row" style={{ gap: 8 }}><span className="ch push"><IcBell size={12} />Push</span><span className="small muted">si tiene la app</span></span><Toggle id="t-push" checked={r.push} onChange={v => set({ push: v })} label="Notificación push" /></div>
        <div className="between"><span>Repetir a quien tenga atraso cada {r.cadaDias} días</span><Toggle id="t-rep" checked={r.repetirVencidos} onChange={v => set({ repetirVencidos: v })} label="Repetir a quien tenga atraso" /></div>
        <div className="small faint">Por ahora cada recordatorio se manda desde tu WhatsApp con un toque. El envío automático a la hora configurada y las notificaciones push se activan cuando conectemos el servidor.</div>
      </section>

      <section className="glass panel stack o3">
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
                {link && enviar
                  ? <a className={`btn sm ${esHoy && !yaHoy ? 'wa' : 'ghost'}`} href={link} target="_blank" rel="noreferrer" onClick={() => marcar(x)}>{yaHoy ? 'Enviado' : 'Enviar'}</a>
                  : <span />}
              </div>
            )
          })}
          {!c.length && <p className="muted small">No hay pagos pendientes.</p>}
        </div>
      </section>
      </div>

      <div className="col">
      {ej && <Mensajes ev={ev} aviso={ej} editable={config} />}

      <section className="glass panel o4">
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
    </div>
  )
}

type Tipo = 'proximo' | 'vencido' | 'push'
const TIPOS: { id: Tipo; nombre: string }[] = [
  { id: 'proximo', nombre: 'WhatsApp: próximo pago' },
  { id: 'vencido', nombre: 'WhatsApp: pago vencido' },
  { id: 'push', nombre: 'Push' },
]

/** Editor de los textos de WhatsApp y push con vista previa en vivo. */
function Mensajes({ ev, aviso, editable }: { ev: Evento; aviso: Aviso; editable: boolean }) {
  const { editarEvento } = useStore()
  const { toast } = useToast()
  const guardadas = plantillas(ev)
  const [t, setT] = useState<Plantillas>(guardadas)
  const [tipo, setTipo] = useState<Tipo>(aviso.tipo === 'vencido' ? 'vencido' : 'proximo')
  const [campo, setCampo] = useState<keyof Plantillas>('whatsappProximo')
  const refs = useRef<Partial<Record<keyof Plantillas, HTMLTextAreaElement | HTMLInputElement | null>>>({})
  const vars = variables(ev, aviso.p, aviso.c, { ...aviso.s, vencida: tipo === 'vencido' || (tipo === 'push' && aviso.s.vencida) })
  const campos: (keyof Plantillas)[] = tipo === 'push' ? ['pushTitulo', 'pushTexto'] : [tipo === 'proximo' ? 'whatsappProximo' : 'whatsappVencido']
  const cambios = (Object.keys(t) as (keyof Plantillas)[]).some(k => t[k] !== guardadas[k])
  const malas = [...new Set(campos.flatMap(k => variablesDesconocidas(t[k])))]
  const vacio = campos.some(k => !t[k].trim())

  const elegir = (x: Tipo) => { setTipo(x); setCampo(x === 'push' ? 'pushTexto' : x === 'proximo' ? 'whatsappProximo' : 'whatsappVencido') }
  const insertar = (clave: string) => {
    const k = campos.includes(campo) ? campo : campos[campos.length - 1]
    const el = refs.current[k], v = `{${clave}}`
    const i = el?.selectionStart ?? t[k].length, j = el?.selectionEnd ?? i
    setT({ ...t, [k]: t[k].slice(0, i) + v + t[k].slice(j) })
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(i + v.length, i + v.length) })
  }
  const guardar = () => {
    if (vacio) { toast('El mensaje no puede quedar vacío'); return }
    // Solo se guarda lo que difiere del texto original, así una mejora futura del original sigue llegando.
    const dif = Object.fromEntries((Object.keys(t) as (keyof Plantillas)[]).filter(k => t[k] !== PLANTILLAS[k]).map(k => [k, t[k]]))
    if (editarEvento(ev.id, e => { e.recordatorios.plantillas = dif })) toast('Mensajes guardados')
  }
  const restaurar = () => setT({ ...t, ...Object.fromEntries(campos.map(k => [k, PLANTILLAS[k]])) })

  return (
    <section className="glass panel stack o2">
      <div className="between"><h2>Mensajes</h2><span className="small muted">Ejemplo con {aviso.p.nombre}</span></div>
      <div className="chips" role="tablist">
        {TIPOS.map(x => <button key={x.id} type="button" role="tab" className="chip" aria-pressed={tipo === x.id} aria-selected={tipo === x.id} onClick={() => elegir(x.id)}>{x.nombre}</button>)}
      </div>
      {editable && (
        <div className="stack" style={{ gap: 8 }}>
          {campos.map(k => k === 'pushTitulo'
            ? <label key={k} className="f">Título<input className="inp" id="msg-titulo" ref={el => { refs.current[k] = el }} value={t[k]} onFocus={() => setCampo(k)} onChange={e => setT({ ...t, [k]: e.target.value })} /></label>
            : <label key={k} className="f">{k === 'pushTexto' ? 'Texto' : 'Texto del mensaje'}
                <textarea className="inp" id={`msg-${k}`} rows={k === 'pushTexto' ? 2 : 4} ref={el => { refs.current[k] = el }} value={t[k]} onFocus={() => setCampo(k)} onChange={e => setT({ ...t, [k]: e.target.value })} /></label>)}
          <div className="small muted">Toca para insertar un dato:</div>
          <div className="chips">
            {VARIABLES.map(v => <button key={v.clave} type="button" className="chip var" title={v.descripcion} onMouseDown={e => e.preventDefault()} onClick={() => insertar(v.clave)}>{v.descripcion}</button>)}
          </div>
          {malas.length > 0 && <div className="small neg" role="alert">No reconozco {malas.map(m => `{${m}}`).join(', ')}. Usa los botones de arriba para insertar datos.</div>}
        </div>
      )}
      <div className="small muted">Vista previa</div>
      {tipo === 'push'
        ? (
          <div className="chatbg">
            <div className="pushcard">
              <span className="pushicon" aria-hidden="true">E</span>
              <span><b>{rellenar(t.pushTitulo, vars)}</b><div>{rellenar(t.pushTexto, vars)}</div></span>
              <span className="t">ahora</span>
            </div>
          </div>
        )
        : <div className="chatbg"><div className="bubble">{rellenar(campos.map(k => t[k]).join(''), vars)}<div className="t">{ev.recordatorios.hora}</div></div></div>}
      {editable && (
        <div className="row wrap">
          <button type="button" className="btn sm" disabled={!cambios} onClick={guardar}>Guardar mensajes</button>
          {campos.some(k => t[k] !== PLANTILLAS[k]) && <button type="button" className="btn sm ghost" onClick={restaurar}>Volver al texto original</button>}
          {cambios && <button type="button" className="btn sm ghost" onClick={() => setT(guardadas)}>Descartar cambios</button>}
        </div>
      )}
    </section>
  )
}
