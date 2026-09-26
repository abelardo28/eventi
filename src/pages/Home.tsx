import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../data/store'
import { esperado, money, pagado, pct, plural, vencido } from '../domain/calc'
import { fCompleta, fLarga } from '../domain/fechas'
import { IcPlus } from '../ui/icons'
import { Bar, Topbar } from '../ui/kit'
import { EventoSheet } from '../sheets/EventoSheet'

export function Home() {
  const { db, hoy, restablecer } = useStore()
  const nav = useNavigate()
  const [nuevo, setNuevo] = useState(false)
  const [confirmar, setConfirmar] = useState(false)

  return (
    <>
      <Topbar />
      <section className="hello">
        <div><div className="eyebrow">{fLarga(hoy)}</div><h1>Tus eventos</h1></div>
        <button className="btn" onClick={() => setNuevo(true)}><IcPlus />Nuevo evento</button>
      </section>

      <div className="stack">
        {db.eventos.length === 0 && (
          <div className="glass panel empty">
            <span>Aún no tienes eventos. Crea el primero para empezar a registrar pagos.</span>
            <button className="btn" onClick={() => setNuevo(true)}><IcPlus />Crear evento</button>
          </div>
        )}
        {db.eventos.map(ev => {
          const esp = esperado(ev), pag = pagado(ev)
          const atras = ev.personas.filter(p => vencido(ev, hoy, p.id) > 0).length
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
                {atras ? <span className="pill bad">{atras} con atraso</span> : <span className="pill ok">Al corriente</span>}
              </div>
            </button>
          )
        })}
      </div>

      <div className="footnote">
        Por ahora los datos se guardan solo en este dispositivo.{' '}
        {confirmar
          ? <><button className="linkbtn small danger" onClick={() => { restablecer(); setConfirmar(false) }}>Sí, borrar todo y cargar el ejemplo</button> · <button className="linkbtn small" onClick={() => setConfirmar(false)}>Cancelar</button></>
          : <button className="linkbtn small" onClick={() => setConfirmar(true)}>Restablecer datos de ejemplo</button>}
      </div>

      {nuevo && <EventoSheet onClose={() => setNuevo(false)} />}
    </>
  )
}
