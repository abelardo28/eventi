// "Recordar sesión": si se marca, la sesión queda guardada en el dispositivo; si no, se pierde
// al cerrar la app o la pestaña (se guarda en sessionStorage).
const CLAVE = 'eventi-recordar'

export const recordarSesion = () => { try { return localStorage.getItem(CLAVE) !== '0' } catch { return true } }
export const fijarRecordar = (v: boolean) => { try { localStorage.setItem(CLAVE, v ? '1' : '0') } catch { /* sin almacenamiento */ } }

/** Dónde vive la sesión, según la casilla "Recordar sesión". */
export const almacenSesion = {
  getItem(k: string): string | null {
    try { return localStorage.getItem(k) ?? sessionStorage.getItem(k) } catch { return null }
  },
  setItem(k: string, v: string) {
    try {
      if (recordarSesion()) { localStorage.setItem(k, v); sessionStorage.removeItem(k) }
      else { sessionStorage.setItem(k, v); localStorage.removeItem(k) }
    } catch { /* sin almacenamiento: la sesión dura lo que la pestaña */ }
  },
  removeItem(k: string) {
    try { localStorage.removeItem(k); sessionStorage.removeItem(k) } catch { /* nada */ }
  },
}
