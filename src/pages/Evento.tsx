import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../data/store'
import { porValidar, vencido } from '../domain/calc'
import { puede } from '../domain/permisos'
import { diasEntre, fCorta } from '../domain/fechas'
import { Topbar } from '../ui/kit'
import { NoEncontrado } from './NoEncontrado'
import { TabResumen } from './tabs/Resumen'
import { TabPersonas } from './tabs/Personas'
import { TabConceptos } from './tabs/Conceptos'
import { TabActividades } from './tabs/Actividades'
import { TabAvisos } from './tabs/Avisos'
import { ImportarSheet } from '../sheets/ImportarSheet'
import { EditarEventoSheet } from '../sheets/EventoSheet'
import { IcEdit, IcUpload } from '../ui/icons'

const TABS = [
  ['resumen', 'Resumen'],
  ['personas', 'Personas'],
  ['conceptos', 'Conceptos'],
  ['actividades', 'Actividades'],
  ['avisos', 'Avisos'],
] as const
type Tab = (typeof TABS)[number][0]

export function Evento() {
  const { id, tab = 'resumen' } = useParams()
  const { evento, hoy, usuario } = useStore()
  const nav = useNavigate()
  const [importar, setImportar] = useState(false)
  const [editar, setEditar] = useState(false)
  const ev = evento(id)
  if (!ev || !puede(usuario, 'evento.ver', ev.id)) return <NoEncontrado />
  const actual = (TABS.some(t => t[0] === tab) ? tab : 'resumen') as Tab
  const atraso = ev.personas.some(p => vencido(ev, hoy, p.id) > 0)
  const dias = diasEntre(hoy, ev.fecha)

  return (
    <>
      <Topbar back="/" />
      <section className="evhead">
        <h1>{ev.nombre}</h1>
        <div className="meta">
          {fCorta(ev.fecha)}{ev.fin ? ` – ${fCorta(ev.fin)}` : ''} · {ev.lugar} · {dias > 0 ? `faltan ${dias} días` : dias === 0 ? 'es hoy' : 'ya pasó'}
        </div>
        {(puede(usuario, 'evento.editar', ev.id) || puede(usuario, 'datos.importar', ev.id)) && (
          <div className="evacc">
            {puede(usuario, 'evento.editar', ev.id) && <button className="btn sm ghost" onClick={() => setEditar(true)}><IcEdit />Editar evento</button>}
            {puede(usuario, 'datos.importar', ev.id) && <button className="btn sm ghost" onClick={() => setImportar(true)}><IcUpload />Importar Excel</button>}
          </div>
        )}
      </section>
      <nav className="tabs glass" role="tablist">
        {TABS.map(([k, l]) => (
          <button key={k} className="tab" role="tab" aria-selected={actual === k} onClick={() => nav(`/e/${ev.id}/${k}`, { replace: true })}>
            {l}{k === 'personas' && <span className="badge">{ev.personas.length}</span>}{k === 'personas' && atraso && <span className="dot" aria-label="con atrasos" />}{k === 'resumen' && porValidar(ev).length > 0 && <span className="dot" style={{ background: 'var(--accent)' }} aria-label="abonos por validar" />}
          </button>
        ))}
      </nav>
      {actual === 'resumen' && <TabResumen ev={ev} />}
      {actual === 'personas' && <TabPersonas ev={ev} />}
      {actual === 'conceptos' && <TabConceptos ev={ev} />}
      {actual === 'actividades' && <TabActividades ev={ev} />}
      {actual === 'avisos' && <TabAvisos ev={ev} />}
      {editar && <EditarEventoSheet ev={ev} onClose={() => setEditar(false)} />}
      {importar && <ImportarSheet ev={ev} onClose={() => setImportar(false)} />}
    </>
  )
}
