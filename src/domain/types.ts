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
  /** Cuenta de participante vinculada (puede ver su estado de cuenta y subir comprobantes). */
  usuarioId?: string | null
  /** Agrupa registros, p. ej. los acompañantes de un jugador ("familiar de"). */
  grupo?: string
  /** Parentesco, habitación u otro dato libre. */
  nota?: string
}

/** 'Actividad' = parte de la ganancia de una rifa, lotería o venta abonada a un concepto. */
export type Metodo = 'Efectivo' | 'Transferencia' | 'Depósito' | 'Actividad'

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
  /** Los abonos que sube un participante quedan pendientes hasta que alguien los valida. */
  estado: EstadoAbono
  registradoPor?: string | null
  validadoPor?: string | null
  /** Cuándo se registró y cuándo se validó o rechazó (fecha y hora ISO). */
  creado?: string
  resuelto?: string
  /** Los abonos importados de Excel no generan notificaciones. */
  origen?: 'importado'
  /** Actividad de donde salió el dinero cuando metodo es 'Actividad'. */
  actividadId?: string
  motivoRechazo?: string
}

export type EstadoAbono = 'validado' | 'pendiente' | 'rechazado'

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
  /** Textos de los mensajes; si falta alguno se usa el de `PLANTILLAS`. */
  plantillas?: Partial<Plantillas>
}

/** Textos con variables entre llaves: {nombre}, {evento}, {concepto}, {monto}, {fecha}, {estado}. */
export interface Plantillas {
  whatsappProximo: string
  whatsappVencido: string
  pushTitulo: string
  pushTexto: string
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

export type Rol = 'admin' | 'capturista' | 'participante'

export interface Usuario {
  id: string
  nombre: string
  email: string
  telefono: string
  rol: Rol
  activo: boolean
  /** Capturista: eventos que puede trabajar; null = todos. */
  eventos: string[] | null
  /** PBKDF2-SHA256 en base64 (solo mientras no haya servidor de autenticación). */
  hash: string
  salt: string
  debeCambiarPassword?: boolean
  creado: ISODate
  /** Notificaciones leídas: todo lo anterior a `notifLeidasHasta` más las marcadas una a una. */
  notifLeidasHasta?: string
  notifLeidas?: string[]
}

export interface Db {
  version: 2
  eventos: Evento[]
  usuarios: Usuario[]
}
