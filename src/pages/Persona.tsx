import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../data/store'
import { cola, composicion, concepto, debido, estadoPersona, money, pagado, pct, plan, siguiente, totalPersona } from '../domain/calc'
import { fCorta } from '../domain/fechas'
import { enlaceWhatsApp, mensajeRecordatorio } from '../domain/mensajes'
import { uid } from '../data/uid'
import { IcEdit, IcReceipt, IcTrash, IcWa } from '../ui/icons'
import { Avatar, Bar, Topbar } from '../ui/kit'
import { useToast } from '../ui/overlay'
import { AbonoSheet } from '../sheets/AbonoSheet'
import { PersonaSheet } from '../sheets/PersonaSheet'
import { ComprobanteSheet } from '../sheets/ComprobanteSheet'
import { NoEncontrado } from './NoEncontrado'
import { puede, puedeVerPersona } from '../domain/permisos'
import { AbonoPendiente } from '../ui/Pendientes'

export function Persona() {
  const { id, pid } = useParams()
  const { evento, hoy, editarEvento, usuario } = useStore()
  const { toast } = useToast()
  const nav = useNavigate()
  const [sheet, setSheet] = useState<{ t: 'abono'; c?: string } | { t: 'editar' } | { t: 'comp'; a: string } | null>(null)
  const [borrar, setBorrar] = useState(false)
  const ev = evento(id)
  const p = ev?.personas.find(x => x.id === pid)
  if (!ev || !p || !puedeVerPersona(usuario, ev, p)) return <NoEncontrado />
  const can = (a: Parameters<typeof puede>[1]) => puede(usuario, a, ev.id)
  const participante = usuario?.rol === 'participante'

  const tot = totalPersona(p), pg = pagado(ev, p.id), st = estadoPersona(ev, p, hoy)
  const fuera = ev.conceptos.filter(c => !p.cargos.some(g => g.conceptoId === c.id))
  const abonos = ev.abonos.filter(a => a.personaId === p.id)
  const aviso = cola(ev, hoy).find(x => x.p.id === p.id)
  const wa = aviso ? enlaceWhatsApp(p.telefono, mensajeRecordatorio(ev, p, aviso.c, aviso.s)) : null

  const registrarEnvio = () => {
    if (!aviso) return
    editarEvento(ev.id, e => { e.envios.push({ id: uid('n'), fecha: hoy, personaId: p.id, conceptoId: aviso.c.id, canal: 'WhatsApp' }) })
  }
  const borrarPersona = () => {
    editarEvento(ev.id, e => {
      e.personas = e.personas.filter(x => x.id !== p.id)
      e.abonos = e.abonos.filter(a => a.personaId !== p.id)
    })
    toast(`${p.nombre} se quitó del evento`)
    nav(`/e/${ev.id}/personas`, { replace: true })
  }

  return (
    <>
      <Topbar back={participante ? '/' : `/e/${ev.id}/personas`} />
      <section className="evhead row" style={{ gap: 14 }}>
        <Avatar p={p} size={58} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 26 }}>{p.nombre}</h1>
          <div className="meta">{participante ? ev.nombre : `${p.tipo} · ${p.telefono || 'Sin WhatsApp'}`}</div>
          {(p.grupo || p.nota) && <div className="meta">{[p.grupo && `Grupo: ${p.grupo}`, p.nota].filter(Boolean).join(' · ')}</div>}
        </div>
      </section>

      <div className="stack-lg deck">
        <div className="col">
        <section className="glass panel stack o1">
          <div className="between"><span className="eyebrow">Avance individual</span><span className={`pill ${st.k}`}>{st.t}</span></div>
          <div className="row" style={{ alignItems: 'flex-end', gap: 16 }}>
            <div className="hero num">{pct(pg, tot)}<small>%</small></div>
            <div className="small muted num" style={{ paddingBottom: 8 }}>{money(pg)} pagado<br />{money(tot - pg)} por pagar de {money(tot)}</div>
          </div>
          <Bar value={pct(pg, tot)} thick due={pct(debido(ev, hoy, p.id), tot)} />
          <div className="row wrap">
            {p.cargos.length > 0 && (can('abonos.registrar') || can('abonos.proponer')) && <button className="btn" onClick={() => setSheet({ t: 'abono' })}><IcReceipt />{participante ? 'Enviar comprobante' : 'Registrar abono'}</button>}
            {wa && can('avisos.enviar') && <a className="btn wa" href={wa} target="_blank" rel="noreferrer" onClick={registrarEnvio}><IcWa />Recordar por WhatsApp</a>}
          </div>
          {aviso && !wa && can('avisos.enviar') && <div className="small faint">Agrega su número de WhatsApp para poder mandarle recordatorios.</div>}
        </section>

        <section className="glass panel o3">
          <h2 style={{ marginBottom: 4 }}>Abonos</h2>
          {can('abonos.validar') && abonos.filter(a => a.estado === 'pendiente').map(a => <div key={a.id} style={{ marginBlock: 8 }}><AbonoPendiente ev={ev} a={a} /></div>)}
          {abonos.filter(a => !(can('abonos.validar') && a.estado === 'pendiente')).map(a => (
            <div key={a.id} className="abono">
              <span><b>{concepto(ev, a.conceptoId)?.nombre}</b><div className="small muted">{fCorta(a.fecha)} · {a.metodo}</div>
                {a.estado === 'pendiente' && <span className="pill warn">Por validar</span>}
                {a.estado === 'rechazado' && <span className="pill bad" title={a.motivoRechazo}>Rechazado</span>}</span>
              <span style={{ textAlign: 'right' }}>
                <b className={`num ${a.estado === 'rechazado' ? 'faint' : ''}`} style={a.estado === 'rechazado' ? { textDecoration: 'line-through' } : undefined}>{money(a.monto)}</b>
                <div>{a.comprobante
                  ? <button className="linkbtn small" onClick={() => setSheet({ t: 'comp', a: a.id })}>Ver comprobante</button>
                  : <button className="linkbtn small" onClick={() => setSheet({ t: 'comp', a: a.id })} style={{ color: 'var(--faint)' }}>{a.metodo === 'Efectivo' ? 'Efectivo' : 'Sin comprobante'}</button>}</div>
              </span>
            </div>
          ))}
          {!abonos.length && <p className="muted small">Aún no hay abonos.</p>}
        </section>
        </div>

        <div className="col">
        <section className="glass panel o2">
          <div className="between"><h2>{participante ? 'Tus conceptos' : 'Sus conceptos'}</h2>{can('personas.gestionar') && <button className="btn sm ghost" onClick={() => setSheet({ t: 'editar' })}><IcEdit />Editar</button>}</div>
          {p.cargos.map(g => {
            const c = concepto(ev, g.conceptoId)
            if (!c) return null
            const pc = pagado(ev, p.id, c.id), s = siguiente(ev, p, c, hoy)
            let cum = 0
            return (
              <div key={c.id} className="cc">
                <div className="between" style={{ alignItems: 'flex-start' }}>
                  <div><h3>{c.nombre}</h3><div className="small muted">{composicion(g)}</div></div>
                  <span className="num small" style={{ textAlign: 'right' }}><b>{money(pc)}</b><br /><span className="muted">de {money(g.monto)}</span></span>
                </div>
                <Bar value={pct(pc, g.monto)} tone={s?.vencida ? 'bad' : !s ? 'done' : undefined} />
                <div className="cuotas">
                  {plan(c, g.monto).map(q => {
                    cum += q.monto
                    const cls = pc >= cum ? 'paid' : q.fecha < hoy ? 'late' : s && s.fecha === q.fecha ? 'next' : ''
                    return <span key={q.fecha} className={`cuota ${cls}`}><b className="num">{money(q.monto)}</b>{fCorta(q.fecha)}{cls === 'paid' ? ' · pagado' : cls === 'late' ? ' · vencido' : ''}</span>
                  })}
                </div>
                {s ? (
                  <div className="between">
                    <span className={`small ${s.vencida ? 'neg' : 'muted'}`}>{s.vencida ? `Vencido desde el ${fCorta(s.fecha)}` : `Próximo pago ${fCorta(s.fecha)}`}: <b className="num">{money(s.monto)}</b></span>
                    {(can('abonos.registrar') || can('abonos.proponer')) && <button className="btn sm ghost" onClick={() => setSheet({ t: 'abono', c: c.id })}>{participante ? 'Pagar' : 'Abonar'}</button>}
                  </div>
                ) : <span className="pill ok" style={{ alignSelf: 'flex-start' }}>Liquidado</span>}
              </div>
            )
          })}
          {!p.cargos.length && <p className="muted small" style={{ marginTop: 12 }}>{participante ? 'Aún no tienes conceptos asignados.' : 'No tiene conceptos asignados. Toca Editar para asignarle.'}</p>}
          {fuera.length > 0 && <p className="small faint" style={{ margin: '14px 0 0' }}>No participa en: {fuera.map(c => c.nombre).join(', ')}</p>}
        </section>

        </div>

        {can('personas.borrar') && <section className="o5">
          {borrar ? (
            <div className="confirm">
              <span>¿Quitar a {p.nombre} del evento? También se borran sus {abonos.length} abonos. No se puede deshacer.</span>
              <div className="row"><button className="btn sm danger" onClick={borrarPersona}><IcTrash />Sí, quitar</button><button className="btn sm ghost" onClick={() => setBorrar(false)}>Cancelar</button></div>
            </div>
          ) : <button className="linkbtn small danger" onClick={() => setBorrar(true)}>Quitar del evento</button>}
        </section>}
      </div>

      {sheet?.t === 'abono' && <AbonoSheet ev={ev} personaId={p.id} conceptoId={sheet.c} onClose={() => setSheet(null)} />}
      {sheet?.t === 'editar' && <PersonaSheet ev={ev} persona={p} onClose={() => setSheet(null)} />}
      {sheet?.t === 'comp' && <ComprobanteSheet ev={ev} abonoId={sheet.a} onClose={() => setSheet(null)} />}
    </>
  )
}
