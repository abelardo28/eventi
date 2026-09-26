import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../../data/store'
import { cargo, composicion, esperado, money, pagado, pct, plan, plural } from '../../domain/calc'
import { fCorta } from '../../domain/fechas'
import type { Concepto, Evento } from '../../domain/types'
import { puede } from '../../domain/permisos'
import { IcEdit, IcPlus } from '../../ui/icons'
import { Avatar, Bar } from '../../ui/kit'
import { ConceptoSheet } from '../../sheets/ConceptoSheet'

export function TabConceptos({ ev }: { ev: Evento }) {
  const { hoy, usuario } = useStore()
  const [sheet, setSheet] = useState<{ c?: Concepto } | null>(null)
  const gestiona = puede(usuario, 'conceptos.gestionar', ev.id)

  return (
    <div className="stack">
      {ev.conceptos.map(c => {
        const asign = ev.personas.filter(x => cargo(x, c.id))
        const e = esperado(ev, c.id), p = pagado(ev, null, c.id)
        const montos = asign.map(x => cargo(x, c.id)!.monto)
        return (
          <section key={c.id} className="glass panel stack">
            <div className="between" style={{ alignItems: 'flex-start' }}>
              <div><h2>{c.nombre}</h2>
                <div className="small muted num">{c.tarifa ? `${money(c.tarifa.adulto)} por adulto · ${money(c.tarifa.menor)} por menor` : `${money(c.base)} por persona`}</div></div>
              <div className="row" style={{ gap: 8 }}>
                <div className="bigpct num" style={{ fontSize: 30 }}>{pct(p, e)}<small>%</small></div>
                {gestiona && <button className="iconbtn" aria-label={`Editar ${c.nombre}`} onClick={() => setSheet({ c })}><IcEdit size={16} /></button>}
              </div>
            </div>
            <Bar value={pct(p, e)} />
            <div className="small muted num">
              {money(p)} de {money(e)} · {plural(asign.length, 'registro', 'registros')}
              {asign.length > 0 && ` · de ${money(Math.min(...montos))} a ${money(Math.max(...montos))}`}
            </div>
            <div className="cuotas">
              {c.cuotas.map((q, i) => {
                const cubrieron = asign.filter(x => {
                  const pl = plan(c, cargo(x, c.id)!.monto)
                  const cum = pl.slice(0, i + 1).reduce((s, y) => s + y.monto, 0)
                  return pagado(ev, x.id, c.id) >= cum
                }).length
                const cls = q.fecha < hoy ? (cubrieron < asign.length ? 'late' : 'paid') : ''
                return <span key={i} className={`cuota ${cls}`}><b className="num">{fCorta(q.fecha)} · {q.pct}%</b>{cubrieron}/{asign.length} cubrieron</span>
              })}
            </div>
            {asign.length > 0 && (
              <details>
                <summary className="small" style={{ cursor: 'pointer', fontWeight: 600 }}>Ver a quién se le cobra</summary>
                <div className="list" style={{ marginTop: 6 }}>
                  {asign.map(x => {
                    const g = cargo(x, c.id)!
                    return (
                      <Link key={x.id} className="item" to={`/e/${ev.id}/p/${x.id}`} style={{ gridTemplateColumns: '32px 1fr auto', paddingBlock: 8, textDecoration: 'none' }}>
                        <Avatar p={x} size={32} />
                        <span><span className="name small">{x.nombre}</span><div className="sub">{composicion(g)}</div></span>
                        <span className="num small"><b>{money(g.monto)}</b></span>
                      </Link>
                    )
                  })}
                </div>
              </details>
            )}
          </section>
        )
      })}
      {!ev.conceptos.length && <div className="glass panel empty">Este evento no tiene conceptos todavía.</div>}
      {gestiona && <button className="btn ghost block" onClick={() => setSheet({})}><IcPlus />Agregar concepto</button>}
      {sheet && <ConceptoSheet key={sheet.c?.id ?? 'nuevo'} ev={ev} concepto={sheet.c} onClose={() => setSheet(null)} />}
    </div>
  )
}
