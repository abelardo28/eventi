import type { Usuario } from './types'

/**
 * Contraseñas con PBKDF2-SHA256 (Web Crypto). Mientras la app no tenga servidor, las cuentas
 * viven en el dispositivo; esto evita guardar contraseñas en texto plano, pero la seguridad
 * real llega con el servidor de autenticación (ver supabase/).
 */
const ITER = 120_000
const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)))
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0))

export async function hashPassword(password: string, salt?: string): Promise<{ hash: string; salt: string }> {
  const sal = salt ? unb64(salt) : crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: ITER }, key, 256)
  return { hash: b64(bits), salt: b64(sal) }
}

export async function verificarPassword(u: Pick<Usuario, 'hash' | 'salt'>, password: string): Promise<boolean> {
  const { hash } = await hashPassword(password, u.salt)
  // Comparación en tiempo constante
  if (hash.length !== u.hash.length) return false
  let diff = 0
  for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ u.hash.charCodeAt(i)
  return diff === 0
}

export const normalizarEmail = (e: string) => e.trim().toLowerCase()
export const emailValido = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())

export function problemaPassword(p: string): string | null {
  if (p.length < 8) return 'La contraseña debe tener al menos 8 caracteres.'
  if (!/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(p) || !/\d/.test(p)) return 'Usa letras y números en la contraseña.'
  return null
}

/** Contraseña temporal legible para compartir al crear un usuario. */
export function passwordTemporal(): string {
  const letras = 'abcdefghjkmnpqrstuvwxyz', nums = '23456789'
  const r = crypto.getRandomValues(new Uint32Array(8))
  const pick = (set: string, i: number) => set[r[i] % set.length]
  return [0, 1, 2, 3].map(i => pick(letras, i)).join('') + '-' + [4, 5, 6, 7].map(i => pick(nums, i)).join('')
}
