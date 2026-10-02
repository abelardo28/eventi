import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../../data/store'
import { avancePago, cargo, composicion, esperado, money, pagado, pct, plural } from '../../domain/calc'
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
    <div className="stack deck">
      {ev.conceptos.map(c => <TarjetaConcepto key={c.id} ev={ev} c={c} hoy={hoy} onEditar={gestiona ? () => setSheet({ c }) : undefined} />)}
      {!ev.conceptos.length && <div className="glass panel empty">Este evento no tiene conceptos todavía.</div>}
      {gestiona && <button className="btn ghost block" onClick={() => setSheet({})}><IcPlus />Agregar concepto</button>}
      {sheet && <ConceptoSheet key={sheet.c?.id ?? 'nuevo'} ev={ev} concepto={sheet.c} onClose={() => setSheet(null)} />}
    </div>
  )
}

type Filtro = 'cubrieron' | 'faltan' | 'todos'

/** Tarjeta de un concepto. Tocar una fecha de pago (o el total) filtra la lista de a quién se le cobra. */
function TarjetaConcepto({ ev, c, hoy, onEditar }: { ev: Evento; c: Concepto; hoy: string; onEditar?: () => void }) {
  const [sel, setSel] = useState<number | 'total' | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('cubrieron')
  const [abierto, setAbierto] = useState(false)
  const asign = ev.personas.filter(x => cargo(x, c.id))
  const e = esperado(ev, c.id), p = pagado(ev, null, c.id)
  const montos = asign.map(x => cargo(x, c.id)!.monto)
  const indice = sel === 'total' ? null : sel
  const filas = sel === null ? [] : asign.map(x => ({ x, ...avancePago(ev, x, c, indice) }))
  const cubrieron = filas.filter(f => f.completo).length
  const visibles = filtro === 'todos' ? filas : filas.filter(f => (filtro === 'cubrieron') === f.completo)

  const elegir = (k: number | 'total') => {
    if (sel === k) { setSel(null); return }
    setSel(k); setAbierto(true)
    // Si nadie ha cubierto ese pago, se muestra de entrada a quienes les falta
    const n = asign.filter(x => avancePago(ev, x, c, k === 'total' ? null : k).completo).length
    setFiltro(n ? 'cubrieron' : 'faltan')
  }
  const chip = (k: number | 'total', titulo: string, n: number, cls: string, verbo: string) => (
    <button key={k} type="button" className={`cuota ${cls} ${sel === k ? 'sel' : ''}`} aria-pressed={sel === k} onClick={() => elegir(k)}>
      <b className="num">{titulo}</b>{n}/{asign.length} {verbo}
    </button>
  )

  return (
    <section className="glass panel stack">
      <div className="between" style={{ alignItems: 'flex-start' }}>
        <div><h2>{c.nombre}</h2>
          <div className="small muted num">{c.tarifa ? `${money(c.tarifa.adulto)} por adulto · ${money(c.tarifa.menor)} por menor` : `${money(c.base)} por persona`}</div></div>
        <div className="row" style={{ gap: 8 }}>
          <div className="bigpct num" style={{ fontSize: 30 }}>{pct(p, e)}<small>%</small></div>
          {onEditar && <button className="iconbtn" aria-label={`Editar ${c.nombre}`} onClick={onEditar}><IcEdit size={16} /></button>}
        </div>
      </div>
      <Bar value={pct(p, e)} />
      <div className="small muted num">
        {money(p)} de {money(e)} · {plural(asign.length, 'registro', 'registros')}
        {asign.length > 0 && ` · de ${money(Math.min(...montos))} a ${money(Math.max(...montos))}`}
      </div>
      <div className="cuotas">
        {c.cuotas.map((q, i) => {
          const n = asign.filter(x => avancePago(ev, x, c, i).completo).length
          return chip(i, `${fCorta(q.fecha)} · ${q.pct}%`, n, q.fecha < hoy ? (n < asign.length ? 'late' : 'paid') : '', 'cubrieron')
        })}
        {c.cuotas.length > 1 && (() => {
          const n = asign.filter(x => avancePago(ev, x, c, null).completo).length
          return chip('total', `Total · ${money(e)}`, n, `total ${n === asign.length && n > 0 ? 'paid' : ''}`, 'liquidaron')
        })()}
      </div>
      {asign.length > 0 && (
        <details open={abierto} onToggle={ev2 => setAbierto((ev2.currentTarget as HTMLDetailsElement).open)}>
          <summary className="small" style={{ cursor: 'pointer', fontWeight: 600 }}>
            Ver a quién se le cobra{sel !== null && <span className="muted"> · {sel === 'total' ? 'total' : `pago del ${fCorta(c.cuotas[sel].fecha)}`}</span>}
          </summary>
          {sel !== null && (
            <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
              <div className="chips">
                <button type="button" className="chip" aria-pressed={filtro === 'cubrieron'} onClick={() => setFiltro('cubrieron')}>{sel === 'total' ? 'Liquidaron' : 'Cubrieron'} {cubrieron}</button>
                <button type="button" className="chip" aria-pressed={filtro === 'faltan'} onClick={() => setFiltro('faltan')}>Faltan {filas.length - cubrieron}</button>
                <button type="button" className="chip" aria-pressed={filtro === 'todos'} onClick={() => setFiltro('todos')}>Todos {filas.length}</button>
              </div>
              <button type="button" className="linkbtn small" onClick={() => setSel(null)}>Quitar filtro</button>
            </div>
          )}
          {sel !== null && visibles.length > 0 && (
            <div className="small muted num" style={{ marginTop: 8 }}>
              {filtro === 'faltan' ? 'Falta cobrar' : 'Cubierto'}: <b>{money(visibles.reduce((s, f) => s + (filtro === 'faltan' ? f.monto - f.cubierto : f.cubierto), 0))}</b>
              {filtro === 'todos' && <> de {money(visibles.reduce((s, f) => s + f.monto, 0))}</>}
            </div>
          )}
          <div className="list" style={{ marginTop: 6 }}>
            {sel === null
              ? asign.map(x => {
                const g = cargo(x, c.id)!
                return (
                  <Link key={x.id} className="item" to={`/e/${ev.id}/p/${x.id}`} style={{ gridTemplateColumns: '32px 1fr auto', paddingBlock: 8, textDecoration: 'none' }}>
                    <Avatar p={x} size={32} />
                    <span><span className="name small">{x.nombre}</span><div className="sub">{composicion(g)}</div></span>
                    <span className="num small"><b>{money(g.monto)}</b></span>
                  </Link>
                )
              })
              : visibles.map(({ x, monto, cubierto, completo }) => (
                <Link key={x.id} className="item" to={`/e/${ev.id}/p/${x.id}`} style={{ gridTemplateColumns: '32px 1fr auto', paddingBlock: 8, textDecoration: 'none' }}>
                  <Avatar p={x} size={32} />
                  <span><span className="name small">{x.nombre}</span>
                    <div className="sub num">{completo ? composicion(cargo(x, c.id)!) : cubierto > 0 ? `Lleva ${money(cubierto)} de ${money(monto)}` : `Debe ${money(monto)}`}</div></span>
                  <span className="num small" style={{ textAlign: 'right' }}><b>{money(completo ? monto : monto - cubierto)}</b>
                    <div className={`small ${completo ? 'pos' : 'neg'}`}>{completo ? 'cubierto' : 'falta'}</div></span>
                </Link>
              ))}
            {sel !== null && !visibles.length && <p className="small muted" style={{ padding: '8px 4px' }}>{filtro === 'cubrieron' ? 'Nadie ha cubierto este pago todavía.' : 'Todos cubrieron este pago.'}</p>}
          </div>
        </details>
      )}
    </section>
  )
}
