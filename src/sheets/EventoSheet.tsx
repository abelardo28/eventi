import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../data/store'
import { uid } from '../data/uid'
import { money, plural } from '../domain/calc'
import { aConcepto, cuotasMensuales, problemaConcepto, type BorradorConcepto } from '../domain/conceptos'
import { addDays, addMonths, mesesHasta } from '../domain/fechas'
import type { Evento } from '../domain/types'
import { IcEdit, IcPlus, IcTrash } from '../ui/icons'
import { Sheet, useToast } from '../ui/overlay'
import { ConceptoCampos } from './ConceptoSheet'
import { PLANTILLAS } from '../domain/mensajes'
import { puede } from '../domain/permisos'

type Fila = BorradorConcepto & { key: string }

/** Conceptos sugeridos; se pueden editar o quitar antes de crear el evento. */
function sugeridos(hoy: string, fecha: string): Fila[] {
  const meses = mesesHasta(hoy, fecha)
  const pagos = (n: number) => cuotasMensuales(meses[0] ?? addDays(hoy, 15), Math.min(n, Math.max(1, meses.length)))
  return [
    { key: uid('k'), nombre: 'Inscripción', porEdad: false, adulto: 800, menor: 0, cuotas: pagos(1) },
    { key: uid('k'), nombre: 'Hospedaje', porEdad: true, adulto: 2500, menor: 1500, cuotas: pagos(meses.length) },
    { key: uid('k'), nombre: 'Transporte', porEdad: true, adulto: 1200, menor: 800, cuotas: pagos(meses.length) },
    { key: uid('k'), nombre: 'Uniformes', porEdad: false, adulto: 950, menor: 0, cuotas: pagos(1) },
  ]
}

export function EventoSheet({ onClose }: { onClose: () => void }) {
  const { hoy, agregarEvento } = useStore()
  const { toast } = useToast()
  const nav = useNavigate()
  const [nombre, setNombre] = useState('')
  const [fecha, setFecha] = useState(addMonths(hoy, 2))
  const [lugar, setLugar] = useState('')
  const [filas, setFilas] = useState<Fila[]>(() => sugeridos(hoy, addMonths(hoy, 2)))
  const [abierta, setAbierta] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cambiar = (key: string, b: BorradorConcepto) => { setFilas(xs => xs.map(x => (x.key === key ? { ...b, key } : x))); setError(null) }
  const quitar = (key: string) => { setFilas(xs => xs.filter(x => x.key !== key)); if (abierta === key) setAbierta(null) }
  const agregar = () => {
    const key = uid('k')
    setFilas(xs => [...xs, { key, nombre: '', porEdad: false, adulto: 0, menor: 0, cuotas: cuotasMensuales(addDays(hoy, 15), 1) }])
    setAbierta(key)
  }

  const crear = () => {
    if (!nombre.trim()) { setError('Ponle nombre al evento'); return }
    for (const f of filas) {
      const p = problemaConcepto(f, filas.filter(x => x.key !== f.key).map(x => x.nombre))
      if (p) { setError(p); setAbierta(f.key); return }
    }
    const ev: Evento = {
      id: uid('e'), nombre: nombre.trim(), fecha, lugar: lugar.trim() || 'Por definir',
      conceptos: filas.map(f => aConcepto(f, uid('c'))), personas: [], abonos: [], actividades: [], envios: [],
      recordatorios: { diasAntes: 3, hora: '09:00', whatsapp: true, push: false, repetirVencidos: true, cadaDias: 3, plantillas: { ...PLANTILLAS } },
    }
    agregarEvento(ev)
    onClose()
    nav(`/e/${ev.id}/personas`)
    toast('Evento creado. Ahora agrega personas o familias')
  }

  return (
    <Sheet title="Nuevo evento" onClose={onClose} onSubmit={crear}>
      <label className="f">Nombre del evento<input className="inp" id="ne-n" value={nombre} onChange={e => { setNombre(e.target.value); setError(null) }} placeholder="Ej. Torneo Beisbol Veteranos" autoFocus /></label>
      <div className="grid2">
        <label className="f">Fecha<input className="inp" id="ne-f" type="date" value={fecha} min={hoy} onChange={e => setFecha(e.target.value || fecha)} /></label>
        <label className="f">Lugar<input className="inp" id="ne-l" value={lugar} onChange={e => setLugar(e.target.value)} placeholder="Ciudad o sede" /></label>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <div className="titlerow" style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>Conceptos<span className="badge">{filas.length}</span></div>
        {filas.map((f, i) => abierta === f.key
          ? (
            <div key={f.key} className="concepto-edit stack" style={{ gap: 10 }}>
              <ConceptoCampos b={f} onChange={b => cambiar(f.key, b)} idp={`ne-c${i}`} />
              <div className="row">
                <button type="button" className="btn sm" onClick={() => {
                  const p = problemaConcepto(f, filas.filter(x => x.key !== f.key).map(x => x.nombre))
                  if (p) setError(p); else { setAbierta(null); setError(null) }
                }}>Listo</button>
                <button type="button" className="btn sm ghost" onClick={() => quitar(f.key)}><IcTrash />Quitar</button>
              </div>
            </div>
          )
          : (
            <div key={f.key} className="concepto-fila">
              <span>
                <b>{f.nombre || 'Sin nombre'}</b>
                <div className="small muted num">
                  {f.porEdad ? `${money(f.adulto)} adulto · ${money(f.menor)} menor` : `${money(f.adulto)} por persona`} · {plural(f.cuotas.length, 'pago', 'pagos')}
                </div>
              </span>
              <button type="button" className="iconbtn" aria-label={`Editar ${f.nombre || 'concepto'}`} onClick={() => setAbierta(f.key)}><IcEdit size={16} /></button>
              <button type="button" className="iconbtn" aria-label={`Quitar ${f.nombre || 'concepto'}`} onClick={() => quitar(f.key)}><IcTrash size={16} /></button>
            </div>
          ))}
        {!filas.length && <div className="small muted">Sin conceptos. Puedes agregarlos ahora o después.</div>}
        <button type="button" className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={agregar}><IcPlus />Agregar concepto</button>
      </div>
      {error && <div className="small neg" role="alert">{error}</div>}
      <button className="btn block" type="submit">Crear evento</button>
    </Sheet>
  )
}

/** Cambia nombre, fechas y lugar de un evento; el administrador también puede borrarlo. */
export function EditarEventoSheet({ ev, onClose }: { ev: Evento; onClose: () => void }) {
  const { editarEvento, borrarEvento, usuario } = useStore()
  const { toast } = useToast()
  const nav = useNavigate()
  const [nombre, setNombre] = useState(ev.nombre)
  const [fecha, setFecha] = useState(ev.fecha)
  const [fin, setFin] = useState(ev.fin ?? '')
  const [lugar, setLugar] = useState(ev.lugar)
  const [borrar, setBorrar] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const guardar = () => {
    if (!nombre.trim()) { setError('Ponle nombre al evento'); return }
    if (fin && fin < fecha) { setError('La fecha de fin no puede ser antes del inicio'); return }
    const ok = editarEvento(ev.id, e => {
      e.nombre = nombre.trim(); e.fecha = fecha; e.lugar = lugar.trim() || 'Por definir'
      if (fin && fin !== fecha) e.fin = fin; else delete e.fin
    })
    if (ok) { toast('Evento actualizado'); onClose() }
  }

  return (
    <Sheet title="Editar evento" onClose={onClose} onSubmit={guardar}>
      <label className="f">Nombre del evento<input className="inp" id="ee-n" value={nombre} onChange={e => { setNombre(e.target.value); setError(null) }} autoFocus /></label>
      <div className="grid2">
        <label className="f">Empieza<input className="inp" id="ee-f" type="date" value={fecha} onChange={e => { setFecha(e.target.value || fecha); setError(null) }} /></label>
        <label className="f">Termina (opcional)<input className="inp" id="ee-fin" type="date" value={fin} min={fecha} onChange={e => { setFin(e.target.value); setError(null) }} /></label>
      </div>
      <label className="f">Lugar<input className="inp" id="ee-l" value={lugar} onChange={e => setLugar(e.target.value)} placeholder="Ciudad o sede" /></label>
      {error && <div className="small neg" role="alert">{error}</div>}
      <button className="btn block" type="submit">Guardar cambios</button>
      {puede(usuario, 'evento.borrar', ev.id) && (borrar ? (
        <div className="confirm">
          <span>¿Borrar «{ev.nombre}» con sus {plural(ev.personas.length, 'persona', 'personas')} y {plural(ev.abonos.length, 'abono', 'abonos')}? No se puede deshacer.</span>
          <div className="row">
            <button type="button" className="btn sm danger" onClick={() => { borrarEvento(ev.id); onClose(); nav('/'); toast('Evento borrado') }}><IcTrash />Sí, borrar</button>
            <button type="button" className="btn sm ghost" onClick={() => setBorrar(false)}>Cancelar</button>
          </div>
        </div>
      ) : <button type="button" className="linkbtn small danger" style={{ alignSelf: 'flex-start' }} onClick={() => setBorrar(true)}>Borrar evento</button>)}
    </Sheet>
  )
}
