import { Link } from 'react-router-dom'
import { Topbar } from '../ui/kit'

export function NoEncontrado() {
  return (
    <>
      <Topbar back="/" />
      <div className="glass panel empty" style={{ marginTop: 24 }}>
        <span>No encontramos lo que buscas. Puede que se haya borrado.</span>
        <Link className="btn" to="/">Ir a mis eventos</Link>
      </div>
    </>
  )
}
