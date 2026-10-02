import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../data/store'
import { esperado, money, pagado, pct, plural, porValidar, vencido } from '../domain/calc'
import { eventosVisibles, puede } from '../domain/permisos'
import { fCompleta, fLarga } from '../domain/fechas'
import { IcPlus } from '../ui/icons'
import { Bar, Topbar } from '../ui/kit'
import { EventoSheet } from '../sheets/EventoSheet'

export function Home() {
  const { db, hoy, usuario } = useStore()
  const nav = useNavigate()
  const [nuevo, setNuevo] = useState(false)
  const eventos = eventosVisibles(db.eventos, usuario!)
  const crear = puede(usuario, 'evento.crear')

  return (
    <>
      <Topbar />
      <section className="hello">
        <div><div className="eyebrow">{fLarga(hoy)}</div><h1>Tus eventos</h1></div>
        {crear && <button className="btn" onClick={() => setNuevo(true)}><IcPlus />Nuevo evento</button>}
      </section>

      <div className="stack deck d3">
        {eventos.length === 0 && (
          <div className="glass panel empty">
            {crear
              ? <><span>Aún no tienes eventos. Crea el primero para empezar a registrar pagos.</span><button className="btn" onClick={() => setNuevo(true)}><IcPlus />Crear evento</button></>
              : <span>Todavía no tienes eventos asignados. Pide al administrador que te dé acceso.</span>}
          </div>
        )}
        {eventos.map(ev => {
          const esp = esperado(ev), pag = pagado(ev)
          const atras = ev.personas.filter(p => vencido(ev, hoy, p.id) > 0).length
          const pend = porValidar(ev).length
          return (
            <button key={ev.id} className="evcard glass" onClick={() => nav(`/e/${ev.id}`)}>
              <div className="between" style={{ alignItems: 'flex-start' }}>
                <div>
                  <div className="date">{fCompleta(ev.fecha)}</div>
                  <h2>{ev.nombre}</h2>
                  <div className="small muted">{ev.lugar} · {plural(ev.personas.length, 'registro', 'registros')}</div>
                </div>
                <div className="bigpct num">{pct(pag, esp)}<small>%</small></div>
              </div>
              <div style={{ margin: '16px 0 10px' }}><Bar value={pct(pag, esp)} /></div>
              <div className="between small wrap">
                <span className="num"><b>{money(pag)}</b> <span className="muted">de {money(esp)}</span></span>
                <span className="row" style={{ gap: 6 }}>
                  {pend > 0 && <span className="pill warn">{pend} por validar</span>}
                  {atras ? <span className="pill bad">{atras} con atraso</span> : <span className="pill ok">Al corriente</span>}
                </span>
              </div>
            </button>
          )
        })}
      </div>

      <div className="footnote">
        Por ahora los datos se guardan solo en este dispositivo.
      </div>

      {nuevo && <EventoSheet onClose={() => setNuevo(false)} />}
    </>
  )
}
