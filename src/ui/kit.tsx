import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { EstadoK } from '../domain/calc'
import { initials } from '../domain/calc'
import type { Persona } from '../domain/types'
import { fMes, toDate } from '../domain/fechas'
import { ROLES } from '../domain/permisos'
import { useStore } from '../data/store'
import { IcBack, IcBell, Logo } from './icons'
import { useNotificaciones } from '../data/notificaciones'
import { CuentaSheet } from '../sheets/CuentaSheet'

export function Bar({ value, tone, due, thick }: { value: number; tone?: 'bad' | 'done'; due?: number; thick?: boolean }) {
  return (
    <div className={`bar ${tone ?? ''} ${thick ? 'thick' : ''}`} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ width: `${value}%` }} />
      {due != null && due > 0 && due < 100 && <span className="due" style={{ left: `${due}%` }} title="Lo que debería llevarse a hoy" />}
    </div>
  )
}

export const Pill = ({ k, children }: { k: EstadoK; children: ReactNode }) => <span className={`pill ${k}`}>{children}</span>

export function Avatar({ p, size }: { p: Pick<Persona, 'nombre'> & { tipo?: Persona['tipo'] }; size?: number }) {
  const style = size ? { width: size, height: size, fontSize: Math.round(size / 3.2) } : undefined
  return <span className={`av ${p.tipo === 'Familia' ? 'fam' : ''}`} style={style}>{initials(p.nombre)}</span>
}

export function DateBadge({ fecha, hoy }: { fecha: string; hoy?: boolean }) {
  if (hoy) return <span className="av date-av" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}><b>Hoy</b></span>
  return <span className="av date-av"><b>{toDate(fecha).getDate()}</b><span>{fMes(fecha)}</span></span>
}

function Campana() {
  const nav = useNavigate()
  const { nuevas } = useNotificaciones()
  return (
    <button className="iconbtn campana" onClick={() => nav('/notificaciones')} aria-label={nuevas.length ? `Notificaciones, ${nuevas.length} sin leer` : 'Notificaciones'}>
      <IcBell />{nuevas.length > 0 && <span className="campana-n num">{nuevas.length > 9 ? '9+' : nuevas.length}</span>}
    </button>
  )
}

export function Topbar({ back }: { back?: string }) {
  const nav = useNavigate()
  const { usuario } = useStore()
  const [menu, setMenu] = useState(false)
  return (
    <header className="topbar">
      {back && <button className="iconbtn" onClick={() => nav(back)} aria-label="Regresar"><IcBack /></button>}
      <button className="brand" onClick={() => nav('/')} aria-label="Inicio de Eventi"><Logo /><span>eventi</span></button>
      <span className="spacer" />
      {usuario && <Campana />}
      {usuario && (
        <button className="userbtn" onClick={() => setMenu(true)} aria-label="Mi cuenta">
          <Avatar p={usuario} /><span className="rolchip">{ROLES[usuario.rol].nombre}</span>
        </button>
      )}
      {menu && <CuentaSheet onClose={() => setMenu(false)} />}
    </header>
  )
}

export function Toggle({ id, checked, onChange, label, disabled }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className="toggle">
      <input type="checkbox" id={id} checked={checked} disabled={disabled} aria-label={label} onChange={e => onChange(e.target.checked)} />
      <span />
    </label>
  )
}

export function Stepper({ value, onChange, min = 0, max = 20, label }: { value: number; onChange: (v: number) => void; min?: number; max?: number; label: string }) {
  return (
    <span className="stepper">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} aria-label={`Menos ${label}`}>−</button>
      <output className="num">{value}</output>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} aria-label={`Más ${label}`}>+</button>
    </span>
  )
}

export function Chips<T extends string>({ options, value, onChange }: { options: readonly T[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="chips">
      {options.map(o => <button key={o} type="button" className="chip" aria-pressed={o === value} onClick={() => onChange(o)}>{o}</button>)}
    </div>
  )
}
