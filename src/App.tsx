import { useEffect } from 'react'
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom'
import { StoreProvider, useStore } from './data/store'
import { ToastProvider } from './ui/overlay'
import { Home } from './pages/Home'
import { Evento } from './pages/Evento'
import { Persona } from './pages/Persona'
import { NoEncontrado } from './pages/NoEncontrado'

function ScrollArriba() {
  const { pathname } = useLocation()
  const base = pathname.split('/').slice(0, 3).join('/')
  useEffect(() => { window.scrollTo(0, 0) }, [base])
  return null
}

function ErrorGuardado() {
  const { error, limpiarError } = useStore()
  if (!error) return null
  return <div className="error-banner" role="alert"><span>{error}</span><button onClick={limpiarError}>Entendido</button></div>
}

export default function App() {
  return (
    <StoreProvider>
      <ToastProvider>
        <HashRouter>
          <ScrollArriba />
          <main className="app">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/e/:id" element={<Evento />} />
              <Route path="/e/:id/p/:pid" element={<Persona />} />
              <Route path="/e/:id/:tab" element={<Evento />} />
              <Route path="*" element={<NoEncontrado />} />
            </Routes>
          </main>
          <ErrorGuardado />
        </HashRouter>
      </ToastProvider>
    </StoreProvider>
  )
}
