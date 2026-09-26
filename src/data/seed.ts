import type { Actividad, Cargo, Concepto, Db, Evento, Metodo, Persona, Usuario } from '../domain/types'
import { plan, porTarifa } from '../domain/calc'
import { addDays, addMonths } from '../domain/fechas'
import { uid } from './uid'

/** Contraseña de las cuentas de prueba (hash PBKDF2 precalculado). */
export const PASSWORD_DEMO = 'demo1234'
const HASH_DEMO = { hash: '3lFl2SbtisXL1OENpQqFmfAvKvzfNpElaT+rwRRo/Iw=', salt: 'YZ36fTc1p/wvnhajvSml2w==' }

export const CUENTAS_DEMO = [
  { email: 'admin@eventi.demo', rol: 'admin', nombre: 'Abelardo (administrador)' },
  { email: 'capturista@eventi.demo', rol: 'capturista', nombre: 'Rosa Medina (capturista)' },
  { email: 'luis@eventi.demo', rol: 'participante', nombre: 'Luis Hernández (participante)' },
] as const

function comprobanteDemo(monto: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="220" viewBox="0 0 320 220"><rect width="320" height="220" rx="18" fill="#fff"/><rect width="320" height="54" rx="18" fill="#1d3b6e"/><rect y="36" width="320" height="18" fill="#1d3b6e"/><text x="20" y="34" font-family="Arial" font-size="16" fill="#fff" font-weight="700">Banco de ejemplo</text><text x="160" y="100" text-anchor="middle" font-family="Arial" font-size="13" fill="#555">Transferencia exitosa</text><text x="160" y="140" text-anchor="middle" font-family="Arial" font-size="28" font-weight="700" fill="#111">$${monto.toLocaleString('es-MX')}</text><text x="160" y="196" text-anchor="middle" font-family="Arial" font-size="11" fill="#999">Comprobante de ejemplo</text></svg>`
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}

/** Evento de ejemplo con fechas relativas a hoy, para que siempre se vea "vivo". */
export function datosEjemplo(hoy: string): Db {
  const mes = (n: number) => addMonths(hoy.slice(0, 8) + '01', n)
  const T: Record<string, Concepto> = {
    ins: { id: uid('c'), nombre: 'Inscripción', base: 800, tarifa: null, cuotas: [{ fecha: addDays(hoy, -10), pct: 100 }] },
    hos: { id: uid('c'), nombre: 'Hospedaje', base: 2500, tarifa: { adulto: 2500, menor: 1500 }, cuotas: [{ fecha: mes(0), pct: 34 }, { fecha: mes(1), pct: 33 }, { fecha: mes(2), pct: 33 }] },
    tra: { id: uid('c'), nombre: 'Transporte', base: 1200, tarifa: { adulto: 1200, menor: 800 }, cuotas: [{ fecha: addDays(hoy, -5), pct: 50 }, { fecha: addDays(hoy, 25), pct: 50 }] },
    uni: { id: uid('c'), nombre: 'Uniformes', base: 950, tarifa: null, cuotas: [{ fecha: addDays(hoy, 10), pct: 100 }] },
  }
  const gente: [string, Persona['tipo'], Record<string, number | [number, number]>][] = [
    ['Luis Hernández', 'Familia', { ins: 1, uni: 1, hos: [2, 2], tra: [2, 2] }],
    ['Carlos Ramírez', 'Persona', { ins: 1, uni: 1, hos: [1, 0], tra: [1, 0] }],
    ['Jorge Medina', 'Familia', { ins: 1, uni: 1, hos: [2, 0], tra: [2, 0] }],
    ['Diego Salazar', 'Persona', { ins: 1, uni: 1 }],
    ['Andrés Pineda', 'Persona', { ins: 1, uni: 1, hos: [1, 0], tra: [1, 0] }],
    ['Miguel Torres', 'Persona', { ins: 1, uni: 1, tra: [1, 0] }],
    ['Raúl Cervantes', 'Familia', { ins: 1, uni: 2, hos: [2, 1], tra: [2, 1] }],
    ['Fernando Ibarra', 'Persona', { ins: 1, uni: 1, hos: [1, 0], tra: [1, 0] }],
    ['Familia Valdez', 'Familia', { hos: [2, 3], tra: [2, 3] }],
    ['Iván Castro', 'Persona', { hos: 1800, tra: [1, 0] }],
  ]
  const usuarios: Usuario[] = CUENTAS_DEMO.map(c => ({
    id: uid('u'), nombre: c.nombre.replace(/ \(.*\)$/, ''), email: c.email, telefono: '', rol: c.rol, activo: true, eventos: null, creado: hoy, ...HASH_DEMO,
  }))
  const avance = [0.72, 0.85, 0.62, 0.5, 1, 0.3, 0.7, 0.18, 0.55, 1]
  const conceptos = [T.ins, T.hos, T.tra, T.uni]
  const personas: Persona[] = gente.map(([nombre, tipo, cs], i) => ({
    id: uid('p'), nombre, tipo, telefono: '667 555 0' + String(101 + i).slice(-3),
    usuarioId: i === 0 ? usuarios[2].id : null,
    cargos: Object.entries(cs).map(([k, v]): Cargo => {
      const c = T[k]
      if (Array.isArray(v)) return { conceptoId: c.id, adultos: v[0], menores: v[1], monto: porTarifa(c, v[0], v[1]) }
      if (c.tarifa) return { conceptoId: c.id, adultos: null, menores: null, monto: v }
      return { conceptoId: c.id, adultos: null, menores: null, cantidad: v, monto: c.base * v }
    }),
  }))
  const act = (nombre: string, detalle: string, estado: Actividad['estado'], g: number, r: number, dias: number): Actividad => ({
    id: uid('x'), nombre, detalle, estado,
    movimientos: [
      { id: uid('m'), tipo: 'gasto', monto: g, fecha: addDays(hoy, -dias - 7), nota: 'Compra del premio' },
      { id: uid('m'), tipo: 'ingreso', monto: r, fecha: addDays(hoy, -dias), nota: 'Venta de boletos' },
    ],
  })
  const ev: Evento = {
    id: uid('e'), nombre: 'Torneo Beisbol Regional (ejemplo)', fecha: addDays(hoy, 50), fin: addDays(hoy, 52), lugar: 'Mazatlán, Sin.',
    conceptos, personas, abonos: [], envios: [],
    actividades: [
      act('Rifa 1', 'Pantalla 55"', 'Terminada', 7500, 14000, 30),
      act('Rifa 2', 'Bicicleta de montaña', 'En curso', 4200, 3150, 2),
      act('Lotería', 'Noche de lotería en el club', 'Terminada', 1800, 5350, 20),
      act('Venta de antojitos', 'Juego de temporada', 'Terminada', 2600, 4100, 12),
    ],
    recordatorios: { diasAntes: 3, hora: '09:00', whatsapp: true, push: true, repetirVencidos: true, cadaDias: 3 },
  }
  const metodos: Metodo[] = ['Transferencia', 'Efectivo', 'Depósito']
  let k = 0
  personas.forEach((p, i) => p.cargos.forEach((g, j) => {
    const c = conceptos.find(x => x.id === g.conceptoId)!
    const f = c === T.ins ? Math.min(1, avance[i] * 1.5) : avance[i]
    let rest = Math.min(g.monto, Math.round((g.monto * f) / 100) * 100)
    for (const q of plan(c, g.monto)) {
      if (rest <= 0) break
      const m = Math.min(q.monto, rest)
      rest -= m
      let fecha = addDays(q.fecha, -2 - ((i + j) % 6))
      if (fecha > hoy) fecha = addDays(hoy, -((i + j) % 9))
      ev.abonos.push({ id: uid('a'), personaId: p.id, conceptoId: c.id, monto: m, fecha, metodo: metodos[k++ % 3], comprobante: null, estado: 'validado', registradoPor: usuarios[0].id })
    }
  }))
  // Un comprobante que subió el participante y espera validación
  const luis = personas[0]
  ev.abonos.push({ id: uid('a'), personaId: luis.id, conceptoId: T.hos.id, monto: 1000, fecha: addDays(hoy, -1), metodo: 'Transferencia',
    comprobante: { nombre: 'transferencia.svg', tipo: 'image/svg+xml', data: comprobanteDemo(1000) }, estado: 'pendiente', registradoPor: usuarios[2].id })
  ev.abonos.sort((a, b) => b.fecha.localeCompare(a.fecha))
  return { version: 2, eventos: [ev], usuarios }
}
