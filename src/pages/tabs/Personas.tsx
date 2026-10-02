import { Fragment, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../../data/store'
import { concepto, debido, estadoPersona, money, pagado, pct, totalPersona } from '../../domain/calc'
import type { Evento } from '../../domain/types'
import { puede } from '../../domain/permisos'
import { IcPlus, IcReceipt } from '../../ui/icons'
import { Avatar, Bar } from '../../ui/kit'
import { PersonaSheet } from '../../sheets/PersonaSheet'
import { AbonoSheet } from '../../sheets/AbonoSheet'

export function TabPersonas({ ev }: { ev: Evento }) {
  const { hoy, usuario } = useStore()
  const [q, setQ] = useState('')
  const [sheet, setSheet] = useState<'persona' | 'abono' | null>(null)
  const filtro = q.trim().toLowerCase()
  const lista = ev.personas.filter(p => !filtro || [p.nombre, p.grupo, p.nota].some(t => t?.toLowerCase().includes(filtro)))
  // Con grupos (p. ej. acompañantes por jugador) la lista se ordena y se separa por grupo
  const hayGrupos = ev.personas.some(p => p.grupo)
  const ordenada = hayGrupos ? [...lista].sort((a, b) => (a.grupo ?? '\uffff').localeCompare(b.grupo ?? '\uffff', 'es')) : lista

  return (
    <div className="stack">
      <div className="between">
        <h2 className="titlerow">Personas registradas<span className="badge">{ev.personas.length}</span></h2>
        <span className="small muted">{ev.personas.filter(p => p.tipo === 'Familia').length} familias</span>
      </div>
      <div className="row">
        <input className="inp" id="buscar" type="search" placeholder={hayGrupos ? "Buscar persona, familia o grupo" : "Buscar persona o familia"} value={q} onChange={e => setQ(e.target.value)} style={{ flex: 1 }} />
        {puede(usuario, 'personas.gestionar', ev.id) && <button className="btn" onClick={() => setSheet('persona')}><IcPlus />Agregar</button>}
      </div>
      <section className="glass panel" style={{ paddingBlock: 6 }}>
        <div className="list">
          {ordenada.map((p, i) => {
            const tot = totalPersona(p), pg = pagado(ev, p.id), st = estadoPersona(ev, p, hoy)
            const encabezado = hayGrupos && (i === 0 || ordenada[i - 1].grupo !== p.grupo)
            const delGrupo = ordenada.filter(x => x.grupo === p.grupo)
            return (
              <Fragment key={p.id}>
              {encabezado && (
                <div className="grupo-h">
                  <span>{p.grupo ?? 'Sin grupo'}<span className="badge">{delGrupo.length}</span></span>
                  <span className="num">{money(delGrupo.reduce((s, x) => s + pagado(ev, x.id), 0))} / {money(delGrupo.reduce((s, x) => s + totalPersona(x), 0))}</span>
                </div>
              )}
              <Link className="item" to={`/e/${ev.id}/p/${p.id}`} style={{ textDecoration: 'none' }}>
                <Avatar p={p} />
                <span>
                  <span className="between"><span className="name">{p.nombre}</span><span className="small num muted">{money(pg)} / {money(tot)}</span></span>
                  <div className="sub">{[p.nota, p.cargos.map(g => concepto(ev, g.conceptoId)?.nombre).join(' · ') || 'Sin conceptos asignados'].filter(Boolean).join(' · ')}</div>
                  <Bar value={pct(pg, tot)} tone={st.k === 'bad' ? 'bad' : st.k === 'ok' ? 'done' : undefined} due={pct(debido(ev, hoy, p.id), tot)} />
                </span>
                <span className={`pill ${st.k}`}>{st.k === 'bad' ? 'Atraso' : st.t}</span>
              </Link>
              </Fragment>
            )
          })}
          {!lista.length && <p className="muted small" style={{ padding: '12px 4px' }}>{ev.personas.length ? 'Sin resultados.' : 'Agrega a la primera persona o familia.'}</p>}
        </div>
      </section>
      {puede(usuario, 'abonos.registrar', ev.id) && ev.personas.some(p => p.cargos.length) && <button className="btn ghost block" onClick={() => setSheet('abono')}><IcReceipt />Registrar un abono</button>}
      {sheet === 'persona' && <PersonaSheet ev={ev} onClose={() => setSheet(null)} />}
      {sheet === 'abono' && <AbonoSheet ev={ev} onClose={() => setSheet(null)} />}
    </div>
  )
}
