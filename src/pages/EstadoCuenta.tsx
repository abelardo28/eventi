import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useStore } from '../data/store'
import { concepto, integrantes, money, plural } from '../domain/calc'
import { estadoGrupo, estadoRegistro, type EstadoRegistro } from '../domain/estadoCuenta'
import { fCompleta, fCorta } from '../domain/fechas'
import { formaDePago } from '../domain/reparto'
import { puede, puedeVerPersona } from '../domain/permisos'
import type { Evento } from '../domain/types'
import { Topbar } from '../ui/kit'
import { IcUpload } from '../ui/icons'
import { useToast } from '../ui/overlay'
import { NoEncontrado } from './NoEncontrado'

const fechasEvento = (ev: Evento) => ev.fin && ev.fin !== ev.fecha ? `${fCompleta(ev.fecha)} al ${fCompleta(ev.fin)}` : fCompleta(ev.fecha)

/** Estado de cuenta imprimible: de un registro (/e/:id/estado/p/:pid) o de un grupo completo (/e/:id/estado/g/:grupo). */
export function EstadoCuenta() {
  const { id, tipo, clave } = useParams()
  const { evento, hoy, usuario } = useStore()
  const { toast } = useToast()
  // El generador de PDF se carga al abrir la página: el iPhone solo deja compartir justo después del toque
  const [pdf, setPdf] = useState<typeof import('../domain/estadoPdf') | null>(null)
  useEffect(() => { import('../domain/estadoPdf').then(setPdf, () => {}) }, [])
  const ev = evento(id)
  if (!ev || !clave) return <NoEncontrado />

  let titulo: string, sub: string, registros: EstadoRegistro[], volver: string
  let totales: { total: number; pagado: number; saldo: number; vencido: number } | null = null
  if (tipo === 'p') {
    const p = ev.personas.find(x => x.id === clave)
    if (!p || !puedeVerPersona(usuario, ev, p)) return <NoEncontrado />
    const e = estadoRegistro(ev, p, hoy)
    titulo = p.nombre
    sub = [p.tipo === 'Familia' ? `Familia · ${plural(integrantes(p), 'persona', 'personas')}` : 'Persona', p.grupo && `Grupo: ${p.grupo}`].filter(Boolean).join(' · ')
    registros = [e]
    volver = `/e/${ev.id}/p/${p.id}`
  } else if (tipo === 'g') {
    if (!puede(usuario, 'evento.ver', ev.id)) return <NoEncontrado />
    const del = ev.personas.filter(x => x.grupo === clave)
    if (!del.length) return <NoEncontrado />
    const g = estadoGrupo(ev, del, hoy)
    titulo = clave
    sub = `Grupo · ${plural(del.length, 'registro', 'registros')} · ${plural(del.reduce((s, x) => s + integrantes(x), 0), 'persona', 'personas')}`
    registros = g.registros
    totales = g
    volver = `/e/${ev.id}/personas`
  } else return <NoEncontrado />

  const t = totales ?? registros[0]
  const tactil = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches

  const guardarPdf = async () => {
    if (!pdf) return
    let blob: Blob
    try { blob = pdf.estadoPdf({ ev, hoy, titulo, sub, registros, totales }) } catch { toast('No se pudo generar el PDF.'); return }
    const nombre = pdf.nombreArchivo(titulo)
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
      <div className="noprint"><Topbar back={volver} /></div>
      <div className="row wrap noprint" style={{ justifyContent: 'flex-end', marginBottom: 12 }}>
        {!tactil && <button className="btn ghost" onClick={() => window.print()}>Imprimir</button>}
        <button className="btn" onClick={guardarPdf} disabled={!pdf}><IcUpload />{tactil ? 'Compartir o guardar PDF' : 'Descargar PDF'}</button>
      </div>

      <article className="glass panel edc">
        <header className="edc-h">
          <div>
            <div className="eyebrow">Estado de cuenta</div>
            <h1>{titulo}</h1>
            <div className="meta">{sub}</div>
          </div>
          <div className="edc-ev small">
            <strong>{ev.nombre}</strong>
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

        {totales && (
          <section className="edc-s">
            <h2>Resumen del grupo</h2>
            <table className="edc-t">
              <thead><tr><th>Registro</th><th>Total</th><th>Pagado</th><th>Saldo</th></tr></thead>
              <tbody>
                {registros.map(r => (
                  <tr key={r.p.id}>
                    <td>{r.p.nombre}<small>{r.p.tipo === 'Familia' ? `Familia · ${plural(integrantes(r.p), 'persona', 'personas')}` : 'Persona'}{r.vencido > 0 && <> · <span className="bad-t">vencido {money(r.vencido)}</span></>}</small></td>
                    <td className="num">{money(r.total)}</td><td className="num">{money(r.pagado)}</td><td className="num">{money(r.saldo)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td>Total del grupo</td><td className="num">{money(totales.total)}</td><td className="num">{money(totales.pagado)}</td><td className="num">{money(totales.saldo)}</td></tr></tfoot>
            </table>
          </section>
        )}

        {registros.map(r => <Detalle key={r.p.id} ev={ev} r={r} conNombre={!!totales} />)}
      </article>
    </>
  )
}

function Detalle({ ev, r, conNombre }: { ev: Evento; r: EstadoRegistro; conNombre: boolean }) {
  return (
    <section className="edc-reg">
      {conNombre && (
        <div className="between edc-regh">
          <h2>{r.p.nombre}</h2>
          <Link className="small noprint" to={`/e/${ev.id}/estado/p/${r.p.id}`}>Solo este registro</Link>
        </div>
      )}
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
