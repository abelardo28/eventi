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
      </section>
      <nav className="tabs glass" role="tablist">
        {TABS.map(([k, l]) => (
          <button key={k} className="tab" role="tab" aria-selected={actual === k} onClick={() => nav(`/e/${ev.id}/${k}`, { replace: true })}>
            {l}{k === 'personas' && atraso && <span className="dot" aria-label="con atrasos" />}{k === 'resumen' && porValidar(ev).length > 0 && <span className="dot" style={{ background: 'var(--accent)' }} aria-label="abonos por validar" />}
          </button>
        ))}
      </nav>
      {actual === 'resumen' && <TabResumen ev={ev} />}
      {actual === 'personas' && <TabPersonas ev={ev} />}
      {actual === 'conceptos' && <TabConceptos ev={ev} />}
      {actual === 'actividades' && <TabActividades ev={ev} />}
      {actual === 'avisos' && <TabAvisos ev={ev} />}
    </>
  )
}
