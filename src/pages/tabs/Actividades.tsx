import { useState } from 'react'
import { gastado, money, recuperado, totalGastado, totalRecuperado } from '../../domain/calc'
import type { Evento } from '../../domain/types'
import { IcPlus } from '../../ui/icons'
import { Bar } from '../../ui/kit'
import { ActividadSheet, MovimientoSheet } from '../../sheets/ActividadSheets'

const signo = (n: number) => (n >= 0 ? '+' : '−') + money(Math.abs(n))

export function TabActividades({ ev }: { ev: Evento }) {
  const [sheet, setSheet] = useState<{ t: 'nueva' } | { t: 'mov'; id: string; tipo: 'gasto' | 'ingreso' } | null>(null)
  const gast = totalGastado(ev), rec = totalRecuperado(ev)
  const max = Math.max(1, ...ev.actividades.flatMap(a => [gastado(a), recuperado(a)]))

  return (
    <div className="stack">
      <section className="glass panel">
        <div className="trio num" style={{ border: 0, padding: 0 }}>
          <div className="stat"><div className="v">{money(gast)}</div><div className="l">Gastado</div></div>
          <div className="stat"><div className="v">{money(rec)}</div><div className="l">Recuperado</div></div>
          <div className="stat"><div className={`v ${rec - gast >= 0 ? 'pos' : 'neg'}`}>{signo(rec - gast)}</div><div className="l">Ganancia</div></div>
        </div>
      </section>
      {ev.actividades.map(a => {
        const g = gastado(a), r = recuperado(a)
        return (
          <section key={a.id} className="glass panel stack act">
            <div className="between">
              <div><h2>{a.nombre}</h2><div className="small muted">{a.detalle}</div></div>
              <span className={`pill ${a.estado === 'En curso' ? 'warn' : 'neutral'}`}>{a.estado}</span>
            </div>
            <div className="pair num">
              <span className="muted">Gastado</span><Bar value={(g / max) * 100} tone="bad" /><b>{money(g)}</b>
              <span className="muted">Recuperado</span><Bar value={(r / max) * 100} tone="done" /><b>{money(r)}</b>
            </div>
            <div className="between wrap">
              <span className="small">{r - g >= 0 ? 'Ganancia' : 'Pérdida por ahora'} <b className={`num ${r - g >= 0 ? 'pos' : 'neg'}`}>{signo(r - g)}</b></span>
              <span className="row" style={{ gap: 6 }}>
                <button className="btn sm ghost" onClick={() => setSheet({ t: 'mov', id: a.id, tipo: 'gasto' })}>+ Gasto</button>
                <button className="btn sm ghost" onClick={() => setSheet({ t: 'mov', id: a.id, tipo: 'ingreso' })}>+ Ingreso</button>
              </span>
            </div>
            {a.movimientos.length > 0 && (
              <details>
                <summary className="small" style={{ cursor: 'pointer', fontWeight: 600 }}>Movimientos ({a.movimientos.length})</summary>
                {a.movimientos.slice().reverse().map(m => (
                  <div key={m.id} className="abono">
                    <span className="small">{m.nota || (m.tipo === 'gasto' ? 'Gasto' : 'Ingreso')}<div className="muted">{m.fecha}</div></span>
                    <b className={`num small ${m.tipo === 'gasto' ? 'neg' : 'pos'}`}>{m.tipo === 'gasto' ? '−' : '+'}{money(m.monto)}</b>
                  </div>
                ))}
              </details>
            )}
          </section>
        )
      })}
      {!ev.actividades.length && <div className="glass panel empty">Registra rifas, loterías o ventas para llevar lo que se gastó y lo que se recuperó.</div>}
      <button className="btn ghost block" onClick={() => setSheet({ t: 'nueva' })}><IcPlus />Nueva actividad</button>
      {sheet?.t === 'nueva' && <ActividadSheet ev={ev} onClose={() => setSheet(null)} />}
      {sheet?.t === 'mov' && <MovimientoSheet ev={ev} actividadId={sheet.id} tipo={sheet.tipo} onClose={() => setSheet(null)} />}
    </div>
  )
}
