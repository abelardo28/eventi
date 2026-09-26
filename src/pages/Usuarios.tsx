import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useStore } from '../data/store'
import { misRegistros, puede, ROLES } from '../domain/permisos'
import type { Rol, Usuario } from '../domain/types'
import { IcPlus } from '../ui/icons'
import { Avatar, Topbar } from '../ui/kit'
import { UsuarioSheet } from '../sheets/UsuarioSheet'

const ORDEN: Rol[] = ['admin', 'capturista', 'participante']

export function Usuarios() {
  const { db, usuario } = useStore()
  const [sheet, setSheet] = useState<{ u?: Usuario } | null>(null)
  const [filtro, setFiltro] = useState<Rol | 'todos'>('todos')
  if (!puede(usuario, 'usuarios.gestionar')) return <Navigate to="/" replace />

  const lista = db.usuarios.filter(u => filtro === 'todos' || u.rol === filtro)
    .sort((a, b) => ORDEN.indexOf(a.rol) - ORDEN.indexOf(b.rol) || a.nombre.localeCompare(b.nombre))
  const cuenta = (r: Rol) => db.usuarios.filter(u => u.rol === r).length

  return (
    <>
      <Topbar back="/" />
      <section className="hello">
        <div><div className="eyebrow">Administración</div><h1>Usuarios y roles</h1></div>
        <button className="btn" onClick={() => setSheet({})}><IcPlus />Nuevo usuario</button>
      </section>
      <nav className="tabs glass" role="tablist">
        <button className="tab" role="tab" aria-selected={filtro === 'todos'} onClick={() => setFiltro('todos')}>Todos {db.usuarios.length}</button>
        {ORDEN.map(r => <button key={r} className="tab" role="tab" aria-selected={filtro === r} onClick={() => setFiltro(r)}>{ROLES[r].nombre} {cuenta(r)}</button>)}
      </nav>
      <section className="glass panel" style={{ paddingBlock: 6 }}>
        <div className="list">
          {lista.map(u => {
            const alcance = u.rol === 'capturista'
              ? (u.eventos === null ? 'Todos los eventos' : `${u.eventos.length} evento${u.eventos.length === 1 ? '' : 's'}`)
              : u.rol === 'participante'
                ? (() => { const r = misRegistros(db.eventos, u); return r.length ? r.map(x => x.p.nombre).join(', ') : 'Sin vincular a un registro' })()
                : 'Control total'
            return (
              <button key={u.id} className="item" onClick={() => setSheet({ u })}>
                <Avatar p={u} />
                <span>
                  <span className="name">{u.nombre}{u.id === usuario!.id && <span className="faint small"> (tú)</span>}</span>
                  <div className="sub">{u.email}</div>
                  <div className="sub">{alcance}</div>
                </span>
                <span className="stack" style={{ gap: 4, alignItems: 'flex-end' }}>
                  <span className={`pill ${u.rol === 'admin' ? 'warn' : u.rol === 'capturista' ? 'ok' : 'neutral'}`}>{ROLES[u.rol].nombre}</span>
                  {!u.activo && <span className="pill bad">Desactivado</span>}
                </span>
              </button>
            )
          })}
          {!lista.length && <p className="muted small" style={{ padding: '12px 4px' }}>No hay usuarios con ese rol.</p>}
        </div>
      </section>
      <section className="stack" style={{ marginTop: 16 }}>
        {ORDEN.map(r => <div key={r} className="small muted"><b style={{ color: 'var(--ink)' }}>{ROLES[r].nombre}:</b> {ROLES[r].descripcion}</div>)}
      </section>
      {sheet && <UsuarioSheet usuario={sheet.u} onClose={() => setSheet(null)} />}
    </>
  )
}
