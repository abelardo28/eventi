import { useState } from 'react'
import readXlsxFile from 'read-excel-file/browser'
import writeXlsxFile from 'write-excel-file/browser'
import { useStore } from '../data/store'
import { money, plural } from '../domain/calc'
import { aplicarPlan, planImportacion, plantillaImportacion, resumenPlan, type Hoja, type PlanImport } from '../domain/importar'
import type { Evento } from '../domain/types'
import { IcUpload } from '../ui/icons'
import { Sheet, useToast } from '../ui/overlay'

const NOMBRE_TIPO = { conceptos: 'Conceptos', personas: 'Personas y montos', pagos: 'Pagos', gastos: 'Gastos e ingresos' } as const

/** Vaciar conceptos, personas, pagos y gastos desde un Excel, con vista previa antes de guardar. */
export function ImportarSheet({ ev, onClose }: { ev: Evento; onClose: () => void }) {
  const { hoy, usuario, editarEvento } = useStore()
  const { toast } = useToast()
  const [archivo, setArchivo] = useState<string | null>(null)
  const [plan, setPlan] = useState<PlanImport | null>(null)
  const [leyendo, setLeyendo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const leer = async (f: File | undefined) => {
    if (!f) return
    setLeyendo(true); setError(null); setPlan(null); setArchivo(f.name)
    try {
      if (!/\.xlsx$/i.test(f.name)) throw new Error('Guarda el archivo como Excel (.xlsx) e inténtalo de nuevo.')
      const hojas = (await readXlsxFile(f)) as unknown as Hoja[]
      setPlan(planImportacion(ev, hojas, { hoy, usuarioId: usuario?.id }))
    } catch (e) {
      setError(e instanceof Error && e.message.startsWith('Guarda') ? e.message : 'No pude leer el archivo. Revisa que sea un Excel (.xlsx) sin contraseña.')
    } finally { setLeyendo(false) }
  }

  const plantilla = async () => {
    try {
      await writeXlsxFile(plantillaImportacion(ev).map(h => ({ sheet: h.sheet, data: h.data.map((r, i) => r.map(v => (i === 0 ? { value: v, fontWeight: 'bold' as const } : { value: v }))) })))
        .toFile('Plantilla Eventi.xlsx')
    } catch { toast('No se pudo descargar la plantilla en este navegador') }
  }

  const r = plan ? resumenPlan(plan) : null
  const nada = !r || (r.conceptos + r.personas + r.cargos + r.abonos + r.movimientos === 0)

  const importar = () => {
    if (!plan || nada) return
    if (editarEvento(ev.id, e => aplicarPlan(e, plan))) {
      toast(`Importado: ${[r!.conceptos && plural(r!.conceptos, 'concepto', 'conceptos'), r!.personas && plural(r!.personas, 'persona', 'personas'), r!.abonos && plural(r!.abonos, 'pago', 'pagos'), r!.movimientos && plural(r!.movimientos, 'movimiento', 'movimientos')].filter(Boolean).join(', ')}`)
      onClose()
    }
  }

  return (
    <Sheet title="Importar desde Excel" onClose={onClose} onSubmit={importar}>
      <div className="small muted">
        Puedes subir un Excel con hojas llamadas <b>Conceptos</b>, <b>Personas</b>, <b>Pagos</b> y <b>Gastos</b>. No tienen que estar todas.
        En Personas, cada columna con el nombre de un concepto es lo que le toca pagar a esa persona o familia.
      </div>
      <button type="button" className="linkbtn small" style={{ alignSelf: 'flex-start' }} onClick={plantilla}>Descargar plantilla de ejemplo</button>
      <div className={`drop ${plan ? 'has' : ''}`}>
        <IcUpload size={22} style={{ display: 'block', margin: '0 auto 4px' }} />
        <b>{leyendo ? 'Leyendo…' : archivo ?? 'Elegir archivo de Excel'}</b><br />{archivo ? 'Toca para elegir otro' : 'Archivo .xlsx'}
        <input type="file" id="imp-file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e => { leer(e.target.files?.[0]); e.target.value = '' }} aria-label="Elegir archivo de Excel" />
      </div>
      {error && <div className="small neg" role="alert">{error}</div>}
      {plan && r && (
        <div className="stack" style={{ gap: 10 }}>
          <div className="stack" style={{ gap: 4 }}>
            {plan.hojas.map(h => (
              <div key={h.nombre} className="between small">
                <span>{h.nombre}</span>
                {h.tipo ? <span className="pill ok">{NOMBRE_TIPO[h.tipo]}</span> : <span className="pill neutral">No reconocida</span>}
              </div>
            ))}
          </div>
          <div className="impgrid">
            <span><b className="num">{r.conceptos}</b>conceptos nuevos</span>
            <span><b className="num">{r.personas}</b>personas nuevas</span>
            <span><b className="num">{r.cargos}</b>montos asignados</span>
            <span><b className="num">{r.abonos}</b>pagos · {money(r.totalAbonos)}</span>
            <span><b className="num">{r.actividades}</b>actividades nuevas</span>
            <span><b className="num">{r.movimientos}</b>gastos e ingresos</span>
          </div>
          {plan.avisos.length > 0 && (
            <details open={r.errores > 0}>
              <summary className="small" style={{ cursor: 'pointer', fontWeight: 600 }}>
                {r.errores ? `${plural(r.errores, 'fila no se importará', 'filas no se importarán')}` : 'Notas'} · {plural(plan.avisos.length, 'aviso', 'avisos')}
              </summary>
              <ul className="implist">
                {plan.avisos.map((a, i) => <li key={i} className={a.grave ? 'neg' : 'muted'}><b>{a.hoja}, fila {a.fila}:</b> {a.texto}</li>)}
              </ul>
            </details>
          )}
          {nada && <div className="small muted">No encontré nada nuevo para importar.</div>}
          <div className="small faint">Los pagos entran como validados. Si importas el mismo archivo otra vez, lo que ya estaba no se duplica.</div>
        </div>
      )}
      <button className="btn block" type="submit" disabled={nada || leyendo}>Importar</button>
    </Sheet>
  )
}
