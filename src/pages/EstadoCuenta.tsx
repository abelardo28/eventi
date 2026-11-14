import { Fragment, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useStore } from '../data/store'
import { concepto, integrantes, money, plural, totalPersona } from '../domain/calc'
import { estadoGrupo, subtotalesPorGrupo, tipoRegistro, type EstadoRegistro, type SubtotalGrupo } from '../domain/estadoCuenta'
import { fCompleta, fCorta } from '../domain/fechas'
import { formaDePago } from '../domain/reparto'
import { puede, puedeVerPersona } from '../domain/permisos'
import type { Evento } from '../domain/types'
import { Topbar } from '../ui/kit'
import { IcUpload } from '../ui/icons'
import { useToast } from '../ui/overlay'
import { NoEncontrado } from './NoEncontrado'

const fechasEvento = (ev: Evento) => ev.fin && ev.fin !== ev.fecha ? `${fCompleta(ev.fecha)} al ${fCompleta(ev.fin)}` : fCompleta(ev.fecha)

/** Casilla de un grupo: marcada si están todos, a medias si solo algunos. */
function CasillaGrupo({ todos, alguno, onChange }: { todos: boolean; alguno: boolean; onChange: (v: boolean) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (ref.current) ref.current.indeterminate = alguno && !todos }, [todos, alguno])
  return <input ref={ref} type="checkbox" checked={todos} onChange={e => onChange(e.target.checked)} />
}

/** Estado de cuenta del evento (/e/:id/estado): se eligen los registros y sale en pantalla, PDF o impreso. */
export function EstadoCuenta() {
  const { id } = useParams()
  const { evento, hoy, usuario } = useStore()
  const { toast } = useToast()
  // El generador de PDF se carga al abrir la página: el iPhone solo deja compartir justo después del toque
  const [pdf, setPdf] = useState<typeof import('../domain/estadoPdf') | null>(null)
  useEffect(() => { import('../domain/estadoPdf').then(setPdf, () => {}) }, [])
  // El logo también se carga antes, para no perder el toque en el iPhone
  const [logo, setLogo] = useState<string | null>(null)
  useEffect(() => {
    fetch('icono-192.png').then(r => (r.ok ? r.blob() : Promise.reject())).then(b => new Promise<string>(ok => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.readAsDataURL(b) })).then(setLogo, () => {})
  }, [])
  // null = todos los registros
  const [elegidos, setElegidos] = useState<Set<string> | null>(null)
  // null = todos los conceptos
  const [cElegidos, setCElegidos] = useState<Set<string> | null>(null)
  const ev = evento(id)
  const participante = usuario?.rol === 'participante'
  if (!ev || !(participante || puede(usuario, 'evento.ver', ev.id))) return <NoEncontrado />
  // El participante solo ve (y elige entre) sus propios registros
  const visibles = ev.personas.filter(p => puedeVerPersona(usuario, ev, p))
  if (!visibles.length) return <NoEncontrado />

  const orden = [...visibles].sort((a, b) => (a.grupo ?? '\uffff').localeCompare(b.grupo ?? '\uffff', 'es') || a.nombre.localeCompare(b.nombre, 'es'))
  const sel = elegidos ?? new Set(orden.map(p => p.id))
  const elegir = (ids: string[], v: boolean) => {
    const n = new Set(sel)
    ids.forEach(i => (v ? n.add(i) : n.delete(i)))
    setElegidos(n)
  }
  const hayGrupos = orden.some(p => p.grupo)
  const porGrupo = [...new Set(orden.map(p => p.grupo ?? ''))].map(g => ({ g, ps: orden.filter(p => (p.grupo ?? '') === g) }))

  // Conceptos que aparecen en estos registros (cargos o abonos)
  const usados = new Set([...visibles.flatMap(p => p.cargos.map(g => g.conceptoId)), ...ev.abonos.filter(a => visibles.some(p => p.id === a.personaId)).map(a => a.conceptoId)])
  const lista = ev.conceptos.filter(c => usados.has(c.id))
  const cSel = cElegidos ?? new Set(lista.map(c => c.id))
  const cIncluidos = lista.filter(c => cSel.has(c.id))
  const todosConceptos = cIncluidos.length === lista.length
  const elegirConcepto = (cid: string, v: boolean) => { const n = new Set(cSel); if (v) n.add(cid); else n.delete(cid); setCElegidos(n) }

  const marcados = orden.filter(p => sel.has(p.id))
  // Con un filtro de conceptos se quitan los registros que no tienen nada de esos conceptos
  const conAlgo = (p: (typeof orden)[number]) => p.cargos.some(g => cSel.has(g.conceptoId)) || ev.abonos.some(a => a.personaId === p.id && cSel.has(a.conceptoId))
  const incluidos = todosConceptos ? marcados : marcados.filter(conAlgo)
  const todo = marcados.length === orden.length && !participante
  const unGrupo = !todo && !participante && incluidos.length > 0 && incluidos.every(p => p.grupo && p.grupo === incluidos[0].grupo) ? incluidos[0].grupo! : null
  const est = estadoGrupo(ev, incluidos, hoy, todosConceptos ? undefined : cSel)
  const registros: EstadoRegistro[] = est.registros
  const totales = est
  const ambito: 'grupo' | 'evento' | 'seleccion' = todo ? 'evento' : unGrupo ? 'grupo' : 'seleccion'
  const sg = unGrupo ? [] : subtotalesPorGrupo(registros)
  const grupos: SubtotalGrupo[] = sg.length > 1 && !participante ? sg : []
  const cuantos = `${plural(incluidos.length, 'registro', 'registros')} · ${plural(incluidos.reduce((s, x) => s + integrantes(x), 0), 'persona', 'personas')}`
  const titulo = participante ? (incluidos.length === 1 ? incluidos[0].nombre : usuario!.nombre) : unGrupo ?? ev.nombre
  const deConceptos = todosConceptos ? '' : ` · ${cIncluidos.length === 1 ? 'Concepto' : 'Conceptos'}: ${cIncluidos.map(c => c.nombre).join(', ')}`
  const sub = (participante ? `${incluidos.length === 1 ? 'Mi registro' : 'Mis registros'} · ${cuantos}` : todo ? `Todo el evento · ${cuantos}` : unGrupo ? `Grupo · ${cuantos}` : `Selección · ${cuantos}`) + deConceptos
  const t = totales
  const tactil = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches

  const guardarPdf = async () => {
    if (!pdf || !incluidos.length) return
    let blob: Blob
    try { blob = pdf.estadoPdf({ ev, hoy, titulo, sub, registros, totales, ambito, grupos, logo }) } catch { toast('No se pudo generar el PDF.'); return }
    const nombre = pdf.nombreArchivo(participante || unGrupo ? `${titulo} - ${ev.nombre}` : ev.nombre)
    const archivo = new File([blob], nombre, { type: 'application/pdf' })
    // En el celular se abre el menú de compartir (Guardar en Archivos, WhatsApp, Imprimir…)
    if (tactil && navigator.canShare?.({ files: [archivo] })) {
      try { await navigator.share({ files: [archivo] }); return } catch (e) { if ((e as Error).name === 'AbortError') return }
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = nombre
    document.body.append(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  return (
    <>
      <div className="noprint"><Topbar back={participante ? '/' : `/e/${ev.id}`} /></div>
      <div className="row wrap noprint" style={{ justifyContent: 'flex-end', marginBottom: 12 }}>
        {!tactil && <button className="btn ghost" onClick={() => window.print()} disabled={!incluidos.length}>Imprimir</button>}
        <button className="btn" onClick={guardarPdf} disabled={!pdf || !incluidos.length}><IcUpload />{tactil ? 'Compartir o guardar PDF' : 'Descargar PDF'}</button>
      </div>

      {lista.length > 1 && <section className="glass panel stack noprint" style={{ marginBottom: 14 }}>
        <div className="between wrap">
          <span><b>¿Qué conceptos?</b><div className="small muted">{cIncluidos.length} de {plural(lista.length, 'concepto', 'conceptos')}</div></span>
          <span className="row" style={{ gap: 6 }}>
            <button className="btn sm ghost" onClick={() => setCElegidos(null)} disabled={todosConceptos}>Todos</button>
            <button className="btn sm ghost" onClick={() => setCElegidos(new Set())} disabled={!cIncluidos.length}>Ninguno</button>
          </span>
        </div>
        <div className="sel-reg">
          {lista.map(c => (
            <label key={c.id} className="sel-p">
              <input type="checkbox" checked={cSel.has(c.id)} onChange={e => elegirConcepto(c.id, e.target.checked)} />
              <span className="name">{c.nombre}</span>
            </label>
          ))}
        </div>
      </section>}

      {orden.length > 1 && <section className="glass panel stack noprint" style={{ marginBottom: 14 }}>
        <div className="between wrap">
          <span><b>¿A quién incluyo?</b><div className="small muted">{marcados.length} de {plural(orden.length, 'registro', 'registros')}</div></span>
          <span className="row" style={{ gap: 6 }}>
            <button className="btn sm ghost" onClick={() => setElegidos(null)} disabled={todo}>Todos</button>
            <button className="btn sm ghost" onClick={() => setElegidos(new Set())} disabled={!marcados.length}>Ninguno</button>
          </span>
        </div>
        <div className="sel-reg">
          {porGrupo.map(({ g, ps }) => (
            <Fragment key={g}>
              {hayGrupos && (
                <label className="sel-g">
                  <CasillaGrupo todos={ps.every(p => sel.has(p.id))} alguno={ps.some(p => sel.has(p.id))} onChange={v => elegir(ps.map(p => p.id), v)} />
                  <span>{g || 'Sin grupo'}</span>
                  <span className="badge gente">{plural(ps.reduce((s, x) => s + integrantes(x), 0), 'persona', 'personas')}</span>
                </label>
              )}
              {ps.map(p => (
                <label key={p.id} className="sel-p">
                  <input type="checkbox" checked={sel.has(p.id)} onChange={e => elegir([p.id], e.target.checked)} />
                  <span><span className="name">{p.nombre}</span><div className="sub">{p.tipo === 'Familia' ? `Familia · ${plural(integrantes(p), 'persona', 'personas')}` : 'Persona'}</div></span>
                  <span className="small num muted">{money(todosConceptos ? totalPersona(p) : p.cargos.reduce((t, g) => t + (cSel.has(g.conceptoId) ? g.monto : 0), 0))}</span>
                </label>
              ))}
            </Fragment>
          ))}
        </div>
      </section>}
      {!incluidos.length ? <div className="glass panel empty noprint">{!cIncluidos.length ? 'Marca al menos un concepto para armar el estado de cuenta.' : !marcados.length ? 'Marca al menos un registro para armar el estado de cuenta.' : 'Los registros marcados no tienen nada de esos conceptos.'}</div> : (
      <article className="glass panel edc">
        <header className="edc-h">
          <div>
            <div className="eyebrow">Estado de cuenta</div>
            <h1>{titulo}</h1>
            <div className="meta">{sub}</div>
          </div>
          <div className="edc-ev small">
            {ambito !== 'evento' && <strong>{ev.nombre}</strong>}
            <span>{fechasEvento(ev)}{ev.lugar && ` · ${ev.lugar}`}</span>
            <span className="muted">Generado el {fCompleta(hoy)}</span>
          </div>
        </header>

        <div className="edc-tot">
          <div><span>Total</span><b className="num">{money(t.total)}</b></div>
          <div><span>Pagado</span><b className="num ok-t">{money(t.pagado)}</b></div>
          <div><span>Saldo</span><b className="num">{money(t.saldo)}</b></div>
          {t.vencido > 0 && <div><span>Vencido</span><b className="num bad-t">{money(t.vencido)}</b></div>}
        </div>

        {registros.length > 1 && (
          <section className="edc-s">
            {grupos.length > 0 && (
              <>
                <h2>Por grupo</h2>
                <table className="edc-t" style={{ marginBottom: 18 }}>
                  <thead><tr><th>Grupo</th><th>Total</th><th>Pagado</th><th>Saldo</th></tr></thead>
                  <tbody>
                    {grupos.map(g => (
                      <tr key={g.nombre}>
                        <td>{g.nombre}<small>{plural(g.registros, 'registro', 'registros')} · {plural(g.personas, 'persona', 'personas')}</small></td>
                        <td className="num">{money(g.total)}</td><td className="num">{money(g.pagado)}</td><td className="num">{money(g.saldo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            <h2>{ambito === 'grupo' ? 'Resumen del grupo' : 'Resumen por registro'}</h2>
            <table className="edc-t">
              <thead><tr><th>Registro</th><th>Total</th><th>Pagado</th><th>Saldo</th></tr></thead>
              <tbody>
                {registros.map(r => (
                  <tr key={r.p.id}>
                    <td>{r.p.nombre}<small>{tipoRegistro(r)}{ambito !== 'grupo' && r.p.grupo && ` · ${r.p.grupo}`}{r.vencido > 0 && <> · <span className="bad-t">vencido {money(r.vencido)}</span></>}</small></td>
                    <td className="num">{money(r.total)}</td><td className="num">{money(r.pagado)}</td><td className="num">{money(r.saldo)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td>{ambito === 'evento' ? 'Total del evento' : ambito === 'seleccion' ? 'Total de la selección' : 'Total del grupo'}</td><td className="num">{money(totales.total)}</td><td className="num">{money(totales.pagado)}</td><td className="num">{money(totales.saldo)}</td></tr></tfoot>
            </table>
          </section>
        )}

        {registros.map(r => <Detalle key={r.p.id} ev={ev} r={r} />)}
      </article>
      )}
    </>
  )
}

function Detalle({ ev, r }: { ev: Evento; r: EstadoRegistro }) {
  return (
    <section className="edc-reg">
      <div className="between edc-regh">
        <h2>{r.p.nombre}</h2>
        <span className="small muted">{tipoRegistro(r)}{r.p.grupo && ` · ${r.p.grupo}`}</span>
      </div>
      <div className="edc-s">
        <h3>Conceptos</h3>
        {r.conceptos.length ? (
          <table className="edc-t">
            <thead><tr><th>Concepto</th><th>Total</th><th>Pagado</th><th>Saldo</th></tr></thead>
            <tbody>
              {r.conceptos.map((c, i) => (
                <tr key={i}>
                  <td>{c.nombre}<small>{[c.detalle, c.saldo <= 0 ? 'Liquidado' : c.proximo && `${c.proximo.vencida ? 'Vencido' : 'Próximo pago'}: ${money(c.proximo.monto)} el ${fCorta(c.proximo.fecha)}`].filter(Boolean).join(' · ')}</small></td>
                  <td className="num">{money(c.total)}</td><td className="num">{money(c.pagado)}</td><td className={`num${c.proximo?.vencida ? ' bad-t' : ''}`}>{money(c.saldo)}</td>
                </tr>
              ))}
            </tbody>
            {r.conceptos.length > 1 && <tfoot><tr><td>Total</td><td className="num">{money(r.total)}</td><td className="num">{money(r.pagado)}</td><td className="num">{money(r.saldo)}</td></tr></tfoot>}
          </table>
        ) : <p className="small muted">Sin conceptos asignados.</p>}
      </div>
      <div className="edc-s">
        <h3>Abonos</h3>
        {r.abonos.length ? (
          <table className="edc-t ab">
            <thead><tr><th>Fecha</th><th>Concepto</th><th>Monto</th></tr></thead>
            <tbody>
              {r.abonos.map(a => (
                <tr key={a.id}>
                  <td className="num">{fCorta(a.fecha)} {a.fecha.slice(0, 4)}</td>
                  <td>{concepto(ev, a.conceptoId)?.nombre ?? '—'}<small>{formaDePago(ev, a)}</small></td>
                  <td className="num">{money(a.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="small muted">Todavía no hay abonos.</p>}
      </div>
      {r.porValidar.length > 0 && (
        <div className="edc-s">
          <h3>Por validar</h3>
          <p className="small muted">Comprobantes enviados que aún no cuentan en el saldo.</p>
          <table className="edc-t">
            <tbody>
              {r.porValidar.map(a => (
                <tr key={a.id}>
                  <td className="num">{fCorta(a.fecha)} {a.fecha.slice(0, 4)}</td>
                  <td>{concepto(ev, a.conceptoId)?.nombre ?? '—'}<small>{formaDePago(ev, a)}</small></td>
                  <td className="num">{money(a.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
