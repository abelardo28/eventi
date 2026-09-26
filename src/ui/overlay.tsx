import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { IcClose } from './icons'

/* ---------- Hoja inferior (formularios) ---------- */

export function Sheet({ title, onClose, onSubmit, children }: { title: string; onClose: () => void; onSubmit?: (e: FormEvent) => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', k)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = prev }
  }, [onClose])
  return (
    <div className="scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <form className="sheet stack" role="dialog" aria-modal="true" aria-label={title} noValidate
        onSubmit={e => { e.preventDefault(); onSubmit?.(e) }}>
        <div className="grab" />
        <div className="between">
          <h2 style={{ fontSize: 19, fontWeight: 400 }}>{title}</h2>
          <button type="button" className="iconbtn" onClick={onClose} aria-label="Cerrar"><IcClose /></button>
        </div>
        {children}
      </form>
    </div>
  )
}

/* ---------- Avisos breves ---------- */

interface Toast { id: number; node: ReactNode; rich: boolean }
const ToastCtx = createContext<{ toast: (t: string) => void; notice: (n: ReactNode) => void } | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const n = useRef(0)
  const add = useCallback((node: ReactNode, rich: boolean) => {
    const id = ++n.current
    setItems(xs => [...xs, { id, node, rich }])
    setTimeout(() => setItems(xs => xs.filter(x => x.id !== id)), 4200)
  }, [])
  const api = useMemo(() => ({ toast: (t: string) => add(t, false), notice: (node: ReactNode) => add(node, true) }), [add])
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map(t => <div key={t.id} className={`toast ${t.rich ? '' : 'plain'}`}>{t.node}</div>)}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast() {
  const c = useContext(ToastCtx)
  if (!c) throw new Error('useToast fuera de ToastProvider')
  return c
}
