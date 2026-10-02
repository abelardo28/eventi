import { Link } from 'react-router-dom'
import { useStore } from '../../data/store'
import { cargo, concepto, debido, esperado, money, pagado, pct, plan, plural, porValidar, totalGastado, totalRecuperado, vencido } from '../../domain/calc'
import { puede } from '../../domain/permisos'
import { AbonoPendiente } from '../../ui/Pendientes'
import { addDays, fCorta } from '../../domain/fechas'
import type { Evento } from '../../domain/types'
import { Avatar, Bar, DateBadge } from '../../ui/kit'

export function TabResumen({ ev }: { ev: Evento }) {
  const { hoy, usuario } = useStore()
  const pendientes = puede(usuario, 'abonos.validar', ev.id) ? porValidar(ev) : []
  const esp = esperado(ev), pag = pagado(ev), v = vencido(ev, hoy), deb = debido(ev, hoy)
  const gast = totalGastado(ev), rec = totalRecuperado(ev)
  const atrasados = ev.personas.map(p => ({ p, v: vencido(ev, hoy, p.id) })).filter(x => x.v > 0).sort((a, b) => b.v - a.v)
  const prox = ev.conceptos.flatMap(c => c.cuotas.map((q, i) => ({
    c, q, i,
    total: ev.personas.reduce((s, p) => { const g = cargo(p, c.id); return s + (g ? plan(c, g.monto)[i].monto : 0) }, 0),
  }))).filter(x => x.q.fecha >= hoy).sort((a, b) => a.q.fecha.localeCompare(b.q.fecha))

  if (ev.personas.length === 0) {
    return (
      <div className="glass panel empty">
        <span>Todavía no hay personas en este evento. Agrega personas o familias y asígnales sus conceptos.</span>
        <Link className="btn" to={`/e/${ev.id}/personas`}>Agregar personas</Link>
      </div>
    )
  }

  return (
    <div className="stack-lg deck">
      {pendientes.length > 0 && (
        <section className="glass panel stack">
          <div className="between"><h2>Por validar</h2><span className="pill warn">{pendientes.length}</span></div>
          <div className="small muted">Comprobantes que subieron los participantes. No cuentan en los totales hasta que los valides.</div>
          {pendientes.map(a => <AbonoPendiente key={a.id} ev={ev} a={a} mostrarPersona />)}
        </section>
      )}
      <section className="glass panel stack">
        <div className="between"><span className="eyebrow">Recaudado</span>{v > 0 ? <span className="pill bad">{money(v)} vencido</span> : <span className="pill ok">Sin atrasos</span>}</div>
        <div className="hero num">{pct(pag, esp)}<small>%</small></div>
        <Bar value={pct(pag, esp)} thick due={pct(deb, esp)} />
        <div className="small muted">La marca muestra lo que debería llevarse cobrado a hoy ({money(deb)}).</div>
        <div className="trio num">
          <div className="stat"><div className="v">{money(pag)}</div><div className="l">Cobrado</div></div>
          <div className="stat"><div className="v">{money(esp - pag)}</div><div className="l">Por cobrar</div></div>
          <div className="stat"><div className="v neg">{money(v)}</div><div className="l">Vencido</div></div>
        </div>
      </section>

      <section className="glass panel stack">
        <h2>Por concepto</h2>
        {ev.conceptos.map(c => {
          const e = esperado(ev, c.id), p = pagado(ev, null, c.id), n = ev.personas.filter(x => cargo(x, c.id)).length
          return (
            <div key={c.id} className="stack" style={{ gap: 7 }}>
              <div className="between small"><span><b>{c.nombre}</b> <span className="faint">· {plural(n, 'registro', 'registros')}</span></span><span className="num muted">{money(p)} / {money(e)}</span></div>
              <Bar value={pct(p, e)} due={pct(debido(ev, hoy, null, c.id), e)} />
            </div>
          )
        })}
      </section>

      <section className="glass panel stack">
        <h2>Balance</h2>
        <div className="ledger num">
          <span className="muted">Pagos y abonos</span><span>{money(pag)}</span>
          <span className="muted">Recuperado en actividades</span><span className="pos">+{money(rec)}</span>
          <span className="muted">Gastado en actividades</span><span className="neg">−{money(gast)}</span>
          <span className="tot">Fondo disponible</span><span className="tot">{money(pag + rec - gast)}</span>
        </div>
      </section>

      <section className="glass panel stack">
        <div className="between"><h2>Con atraso</h2><span className="small muted">{atrasados.length} de {ev.personas.length}</span></div>
        {atrasados.length ? (
          <div className="list">
            {atrasados.slice(0, 5).map(x => (
              <Link key={x.p.id} className="item" to={`/e/${ev.id}/p/${x.p.id}`} style={{ textDecoration: 'none' }}>
                <Avatar p={x.p} />
                <span><span className="name">{x.p.nombre}</span>
                  <div className="sub">{x.p.cargos.filter(g => vencido(ev, hoy, x.p.id, g.conceptoId) > 0).map(g => concepto(ev, g.conceptoId)?.nombre).join(', ')}</div></span>
                <b className="num neg">{money(x.v)}</b>
              </Link>
            ))}
          </div>
        ) : <p className="muted small">Nadie tiene pagos vencidos.</p>}
      </section>

      <section className="glass panel stack">
        <h2>Próximas fechas</h2>
        <div className="list">
          {prox.slice(0, 4).map(x => (
            <div key={x.c.id + x.i} className="item" style={{ gridTemplateColumns: '46px 1fr auto' }}>
              <DateBadge fecha={x.q.fecha} />
              <span><span className="name">{x.c.nombre}</span>
                <div className="sub">Pago {x.i + 1} de {x.c.cuotas.length} ({x.q.pct}%) · aviso el {fCorta(addDays(x.q.fecha, -ev.recordatorios.diasAntes))}</div></span>
              <b className="num">{money(x.total)}</b>
            </div>
          ))}
          {!prox.length && <p className="muted small">No hay pagos pendientes.</p>}
        </div>
      </section>
    </div>
  )
}
