export type ISODate = string // "2026-09-25"

export interface Cuota {
  fecha: ISODate
  /** Porcentaje del total de cada cargo que vence en esta fecha. */
  pct: number
}

export interface Tarifa {
  adulto: number
  menor: number
}

export interface Concepto {
  id: string
  nombre: string
  /** Monto por persona cuando no hay tarifa por adulto/menor. */
  base: number
  tarifa: Tarifa | null
  cuotas: Cuota[]
}

/** Lo que a una persona o familia le toca pagar de un concepto. */
export interface Cargo {
  conceptoId: string
  monto: number
  adultos: number | null
  menores: number | null
  cantidad?: number
}

export type TipoRegistro = 'Persona' | 'Familia'

export interface Persona {
  id: string
  nombre: string
  tipo: TipoRegistro
  telefono: string
  cargos: Cargo[]
}

export type Metodo = 'Efectivo' | 'Transferencia' | 'Depósito'

export interface Comprobante {
  nombre: string
  tipo: string
  /** data: URL mientras no haya almacenamiento en la nube. */
  data: string
}

export interface Abono {
  id: string
  personaId: string
  conceptoId: string
  monto: number
  fecha: ISODate
  metodo: Metodo
  comprobante: Comprobante | null
}

export interface Movimiento {
  id: string
  tipo: 'gasto' | 'ingreso'
  monto: number
  fecha: ISODate
  nota: string
}

export interface Actividad {
  id: string
  nombre: string
  detalle: string
  estado: 'En curso' | 'Terminada'
  movimientos: Movimiento[]
}

export interface ConfigRecordatorios {
  diasAntes: number
  hora: string
  whatsapp: boolean
  push: boolean
  repetirVencidos: boolean
  cadaDias: number
}

export type Canal = 'WhatsApp' | 'Push'

export interface Envio {
  id: string
  fecha: ISODate
  personaId: string
  conceptoId: string
  canal: Canal
}

export interface Evento {
  id: string
  nombre: string
  fecha: ISODate
  fin?: ISODate
  lugar: string
  conceptos: Concepto[]
  personas: Persona[]
  abonos: Abono[]
  actividades: Actividad[]
  recordatorios: ConfigRecordatorios
  envios: Envio[]
}

export interface Db {
  version: 1
  eventos: Evento[]
}
