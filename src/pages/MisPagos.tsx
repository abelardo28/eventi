import { Link } from 'react-router-dom'
import { useStore } from '../data/store'
import { estadoPersona, money, pagado, pct, totalPersona } from '../domain/calc'
import { fCompleta, fLarga } from '../domain/fechas'
import { misRegistros } from '../domain/permisos'
import { Bar, Topbar } from '../ui/kit'

/** Inicio del participante: sus registros en cada evento y su avance. */
export function MisPagos() {
  const { db, hoy, usuario } = useStore()
  const regs = misRegistros(db.eventos, usuario!)

  return (
    <>
      <Topbar />
      <section className="hello">
        <div><div className="eyebrow">{fLarga(hoy)}</div><h1>Hola, {usuario!.nombre.split(' ')[0]}</h1></div>
      </section>
      <div className="stack deck d3">
        {regs.map(({ ev, p }) => {
          const tot = totalPersona(p), pg = pagado(ev, p.id), st = estadoPersona(ev, p, hoy)
          const pend = ev.abonos.filter(a => a.personaId === p.id && a.estado === 'pendiente').length
          return (
            <Link key={ev.id + p.id} className="evcard glass" to={`/e/${ev.id}/p/${p.id}`} style={{ textDecoration: 'none' }}>
              <div className="between" style={{ alignItems: 'flex-start' }}>
                <div>
                  <div className="date">{fCompleta(ev.fecha)}</div>
                  <h2>{ev.nombre}</h2>
                  <div className="small muted">{p.nombre}</div>
                </div>
                <div className="bigpct num">{pct(pg, tot)}<small>%</small></div>
              </div>
              <div style={{ margin: '16px 0 10px' }}><Bar value={pct(pg, tot)} tone={st.k === 'bad' ? 'bad' : st.k === 'ok' ? 'done' : undefined} /></div>
              <div className="between small wrap">
                <span className="num"><b>{money(pg)}</b> <span className="muted">de {money(tot)}</span></span>
                <span className="row" style={{ gap: 6 }}>
                  {pend > 0 && <span className="pill warn">{pend} por validar</span>}
                  <span className={`pill ${st.k}`}>{st.t}</span>
                </span>
              </div>
            </Link>
          )
        })}
        {!regs.length && (
          <div className="glass panel empty">
            <span>Todavía no vemos tus pagos. Pide al organizador que te registre con tu WhatsApp{usuario!.telefono ? ` (${usuario!.telefono})` : ''} o que vincule tu cuenta.</span>
          </div>
        )}
      </div>
    </>
  )
}
