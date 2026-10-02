import type { Abono, Actividad, Cargo, Concepto, Evento, Metodo, Movimiento, Persona, TipoRegistro } from './types'
import { porTarifa, repartirPct } from './calc'
import { addDays } from './fechas'

/**
 * Importación desde Excel. Recibe las hojas ya leídas (filas de celdas) y arma un plan que se muestra
 * antes de aplicarlo. Los encabezados se reconocen por sinónimos y sin importar acentos ni mayúsculas.
 */

export type Celda = string | number | boolean | Date | null | undefined
export interface Hoja { sheet: string; data: Celda[][] }
export type TipoHoja = 'cuentas' | 'conceptos' | 'personas' | 'pagos' | 'gastos'
export interface Aviso { hoja: string; fila: number; texto: string; grave: boolean }

export interface PlanImport {
  hojas: { nombre: string; tipo: TipoHoja | null; filas: number }[]
  conceptos: Concepto[]
  personas: Persona[]
  /** Cargos que se agregan a personas que ya existían en el evento. */
  cargosNuevos: { personaId: string; cargo: Cargo }[]
  abonos: Abono[]
  actividades: Actividad[]
  /** Movimientos que se agregan a actividades que ya existían. */
  movimientos: { actividadId: string; mov: Movimiento }[]
  avisos: Aviso[]
}

export const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim()

const HOJAS: Record<Exclude<TipoHoja, 'cuentas'>, string[]> = {
  conceptos: ['conceptos', 'concepto', 'tarifas', 'costos'],
  personas: ['personas', 'participantes', 'familias', 'integrantes', 'jugadores', 'lista'],
  pagos: ['pagos', 'abonos', 'cobros', 'depositos'],
  gastos: ['gastos', 'actividades', 'movimientos', 'ingresos', 'rifas'],
}

/** Nombres que se tratan como el mismo concepto (Hotel = Hospedaje). */
const SINONIMOS_CONCEPTO = [
  ['hospedaje', 'hotel', 'habitacion', 'hospedaje hotel', 'alojamiento'],
  ['transporte', 'camion', 'autobus', 'traslado', 'transportacion'],
  ['inscripcion', 'inscripciones', 'registro'],
  ['uniformes', 'uniforme'],
]
const r2 = (n: number) => Math.round(n * 100) / 100

const COL = {
  nombre: ['nombre', 'persona', 'familia', 'participante', 'jugador', 'quien', 'nombre completo', 'responsable'],
  concepto: ['concepto', 'por concepto de', 'rubro'],
  monto: ['monto', 'importe', 'cantidad', 'abono', 'pago', 'total', 'monto pagado', 'monto abonado'],
  adulto: ['monto', 'monto adulto', 'adulto', 'por adulto', 'costo', 'precio', 'tarifa', 'tarifa adulto', 'monto por persona', 'costo adulto', 'total'],
  menor: ['monto menor', 'menor', 'por menor', 'tarifa menor', 'costo menor', 'nino', 'monto nino'],
  fecha: ['fecha', 'dia', 'fecha de pago', 'fecha pago'],
  metodo: ['forma de pago', 'metodo', 'metodo de pago', 'tipo de pago', 'medio'],
  tipo: ['tipo', 'movimiento', 'tipo de movimiento'],
  telefono: ['whatsapp', 'telefono', 'celular', 'tel', 'numero', 'movil'],
  adultos: ['adultos', 'num adultos', 'no adultos', 'cantidad adultos'],
  menores: ['menores', 'ninos', 'num menores', 'no menores', 'cantidad menores'],
  actividad: ['actividad', 'rifa', 'evento'],
  nota: ['nota', 'descripcion', 'detalle', 'concepto', 'comentario'],
  gasto: ['gasto', 'gastado', 'egreso', 'salida', 'se gasto'],
  ingreso: ['ingreso', 'recuperado', 'entrada', 'venta', 'se recupero'],
} as const

/** Índice de la primera columna cuyo encabezado coincide con algún sinónimo (y que no esté ya usada). */
function columna(enc: string[], sinonimos: readonly string[], usadas: Set<number>): number {
  for (const s of sinonimos) {
    const i = enc.findIndex((h, j) => !usadas.has(j) && h === s)
    if (i >= 0) { usadas.add(i); return i }
  }
  return -1
}

export function numero(v: Celda): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  const t = v.replace(/[$\s]|mxn|pesos/gi, '')
  const negativo = /^\(.*\)$/.test(t) || t.startsWith('-')
  const limpio = t.replace(/[()-]/g, '').replace(/,(?=\d{3}(\D|$))/g, '').replace(',', '.')
  const n = Number(limpio)
  return limpio && Number.isFinite(n) ? (negativo ? -n : n) : null
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Acepta fechas de Excel, `2026-10-01`, `1/10/2026` (día/mes/año) o `1/10/26`. */
export function fecha(v: Celda): string | null {
  if (v instanceof Date && !isNaN(+v)) return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`
  if (typeof v === 'number' && v > 20000 && v < 80000) { // número de serie de Excel
    const d = new Date(Date.UTC(1899, 11, 30) + v * 864e5)
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  }
  if (typeof v !== 'string') return null
  const s = v.trim()
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (m) return valida(+m[1], +m[2], +m[3])
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/)
  if (m) return valida(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1])
  return null
}
function valida(a: number, m: number, d: number): string | null {
  const x = new Date(Date.UTC(a, m - 1, d))
  return x.getUTCMonth() === m - 1 && x.getUTCDate() === d ? `${a}-${pad(m)}-${pad(d)}` : null
}

const texto = (v: Celda) => (v instanceof Date ? fecha(v) ?? '' : String(v ?? '').trim())
const vacia = (r: Celda[]) => r.every(c => c == null || String(c).trim() === '')

function metodo(v: Celda): Metodo {
  const t = norm(v)
  if (t.startsWith('efec') || t === 'cash') return 'Efectivo'
  if (t.startsWith('dep')) return 'Depósito'
  if (t.startsWith('trans') || t.includes('spei')) return 'Transferencia'
  return 'Efectivo'
}

/** Busca la fila de encabezados: la primera con al menos dos textos reconocibles. */
function encabezados(data: Celda[][]): number {
  for (let i = 0; i < Math.min(data.length, 10); i++) {
    const r = data[i] ?? []
    if (r.filter(c => typeof c === 'string' && /[a-z]/i.test(c)).length >= 2) return i
  }
  return 0
}

/**
 * Hoja de control "una fila por persona" con columnas Total X / Anticipo X por concepto
 * (p. ej. Total Hotel, Anticipo Hotel, Total Transporte…). Devuelve los pares encontrados.
 */
export function paresTotalAnticipo(encOriginal: Celda[]): { nombre: string; total: number; anticipo: number }[] {
  const enc = encOriginal.map(norm)
  const out: { nombre: string; total: number; anticipo: number }[] = []
  enc.forEach((e, i) => {
    const m = e.match(/^(total|costo|monto) (.+)$/)
    if (!m || /^(general|anticipo|anticipos|abonado|pagado|pagos?|saldo)$/.test(m[2])) return
    const j = enc.findIndex(x => new RegExp(`^(anticipo|anticipos|abono|abonos|abonado|pagado|pagos?) ${m[2]}$`).test(x))
    if (j < 0) return
    const original = String(encOriginal[i] ?? '').trim().split(/\s+/).slice(1).join(' ')
    out.push({ nombre: original.charAt(0).toUpperCase() + original.slice(1), total: i, anticipo: j })
  })
  return out
}

export function tipoDeHoja(h: Hoja): TipoHoja | null {
  const n = norm(h.sheet)
  if (paresTotalAnticipo(h.data[encabezados(h.data)] ?? []).length) return 'cuentas'
  for (const [t, ns] of Object.entries(HOJAS) as [TipoHoja, string[]][]) if (ns.some(x => n === x || n.startsWith(x + ' '))) return t
  // Sin nombre reconocible: se adivina por las columnas
  const enc = (h.data[encabezados(h.data)] ?? []).map(norm)
  const tiene = (xs: readonly string[]) => enc.some(e => xs.includes(e))
  if (tiene(COL.gasto) || tiene(COL.ingreso) || tiene(COL.actividad)) return 'gastos'
  if (tiene(COL.nombre) && tiene(COL.concepto) && tiene(COL.monto)) return 'pagos'
  if (tiene(COL.nombre) && (tiene(COL.telefono) || tiene(COL.adultos))) return 'personas'
  if (tiene(COL.concepto) && tiene(COL.adulto)) return 'conceptos'
  return null
}

let contador = 0
const nuevoId = (p: string) => `${p}_i${Date.now().toString(36)}${(contador++).toString(36)}`

export function planImportacion(ev: Evento, hojas: Hoja[], opciones: { hoy: string; usuarioId?: string | null }): PlanImport {
  const plan: PlanImport = { hojas: [], conceptos: [], personas: [], cargosNuevos: [], abonos: [], actividades: [], movimientos: [], avisos: [] }
  const aviso = (hoja: string, fila: number, t: string, grave = true) => plan.avisos.push({ hoja, fila, texto: t, grave })
  const tipos = hojas.map(h => ({ h, tipo: tipoDeHoja(h) }))
  // Orden fijo: primero conceptos, luego personas, pagos y gastos (cada uno depende del anterior)
  const orden: TipoHoja[] = ['conceptos', 'cuentas', 'personas', 'pagos', 'gastos']
  for (const { h, tipo } of tipos) plan.hojas.push({ nombre: h.sheet, tipo, filas: Math.max(0, h.data.length - encabezados(h.data) - 1) })

  const conceptos = () => [...ev.conceptos, ...plan.conceptos]
  const buscarConcepto = (n: string) => {
    const k = norm(n), grupo = SINONIMOS_CONCEPTO.find(g => g.includes(k)) ?? [k]
    return conceptos().find(c => norm(c.nombre) === k) ?? conceptos().find(c => grupo.includes(norm(c.nombre)))
  }
  const personas = () => [...ev.personas, ...plan.personas]
  const buscarPersona = (n: string) => {
    const k = norm(n)
    return personas().find(p => norm(p.nombre) === k) ?? personas().find(p => norm(p.nombre).replace(/^familia /, '') === k.replace(/^familia /, ''))
  }
  const cargoDe = (p: Persona, cid: string) => p.cargos.find(g => g.conceptoId === cid) ?? plan.cargosNuevos.find(x => x.personaId === p.id && x.cargo.conceptoId === cid)?.cargo
  const asignar = (p: Persona, g: Cargo) => { if (ev.personas.includes(p)) plan.cargosNuevos.push({ personaId: p.id, cargo: g }); else p.cargos.push(g) }
  const cargoPorTarifa = (c: Concepto, adultos: number, menores: number, monto?: number | null): Cargo =>
    c.tarifa ? { conceptoId: c.id, adultos, menores, monto: monto ?? porTarifa(c, adultos, menores) }
      : { conceptoId: c.id, adultos: null, menores: null, cantidad: 1, monto: monto ?? c.base }

  for (const tipo of orden) for (const { h, tipo: t } of tipos) {
    if (t !== tipo) continue
    const ie = encabezados(h.data)
    const enc = (h.data[ie] ?? []).map(norm)
    const usadas = new Set<number>()
    const filas = h.data.slice(ie + 1).map((r, k) => ({ r, n: ie + k + 2 })).filter(x => !vacia(x.r))

    if (tipo === 'cuentas') {
      const pares = paresTotalAnticipo(h.data[ie] ?? [])
      pares.forEach(x => { usadas.add(x.total); usadas.add(x.anticipo) })
      const cN = (() => { const i = enc.findIndex(e => /nombre/.test(e)); return i >= 0 ? i : columna(enc, COL.nombre, usadas) })()
      usadas.add(cN)
      const cG = enc.findIndex((e, i) => !usadas.has(i) && /jugador|familiar de|grupo|equipo|acompana a/.test(e))
      const cNotas = enc.map((e, i) => (!usadas.has(i) && i !== cG && /parentesco|habitacion|cuarto|relacion|nota/.test(e) ? i : -1)).filter(i => i >= 0)
      if (cN < 0) { aviso(h.sheet, ie + 1, 'Falta la columna con el nombre de cada persona.'); continue }
      // Sin la fila de totales ni las notas al pie
      const datos = filas.filter(({ r }) => !/^(totales?|notas?)\b/.test(norm(r.find(v => v != null && String(v).trim() !== '') ?? '')))
      // Conceptos de la hoja: el que ya existe en el evento (Hotel = Hospedaje) o uno nuevo con el monto más común
      const mapa = new Map<number, Concepto>()
      for (const par of pares) {
        let c = buscarConcepto(par.nombre)
        if (!c) {
          const totales = datos.map(f => numero(f.r[par.total])).filter((v): v is number => v != null && v > 0)
          const anticipos = datos.map(f => numero(f.r[par.anticipo])).filter((v): v is number => v != null && v > 0)
          if (!totales.length && !anticipos.length) continue
          const cuenta = new Map<number, number>(); totales.forEach(v => cuenta.set(v, (cuenta.get(v) ?? 0) + 1))
          const base = totales.length ? [...cuenta].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0] : Math.max(...anticipos)
          c = { id: nuevoId('c'), nombre: par.nombre, base, tarifa: null, cuotas: [{ fecha: addDays(ev.fecha, -15), pct: 100 }] }
          plan.conceptos.push(c)
          aviso(h.sheet, ie + 1, `Se crea el concepto ${par.nombre} con un solo pago el ${addDays(ev.fecha, -15).split('-').reverse().join('/')}. Puedes cambiar sus fechas en Conceptos.`, false)
        }
        mapa.set(par.total, c)
      }
      let grupo = '', sinFecha = false
      for (const { r, n } of datos) {
        if (cG >= 0 && texto(r[cG])) grupo = texto(r[cG])
        const nombre = texto(r[cN])
        if (!nombre) continue
        const nota = cNotas.map(i => texto(r[i])).filter(Boolean).join(' · ')
        let p = personas().find(x => norm(x.nombre) === norm(nombre) && norm(x.grupo) === norm(grupo))
        if (!p) {
          p = { id: nuevoId('p'), nombre, tipo: 'Persona', telefono: '', cargos: [], ...(grupo && { grupo }), ...(nota && { nota }) }
          plan.personas.push(p)
        }
        let algo = false
        for (const par of pares) {
          const c = mapa.get(par.total)
          if (!c) continue
          const total = numero(r[par.total]), anticipo = numero(r[par.anticipo])
          if (total && total > 0) {
            algo = true
            const g = cargoDe(p, c.id)
            if (!g) asignar(p, { conceptoId: c.id, adultos: null, menores: null, cantidad: 1, monto: r2(total) })
            else if (r2(g.monto) !== r2(total)) aviso(h.sheet, n, `${nombre}: en Eventi su ${c.nombre} es ${g.monto.toLocaleString('es-MX')} y en el Excel ${total.toLocaleString('es-MX')}; se deja el de Eventi.`, false)
          }
          if (anticipo && anticipo > 0) {
            algo = true
            if (!cargoDe(p, c.id)) {
              // Sin total en el Excel: se toma su anticipo como total para no inventar un monto
              asignar(p, { conceptoId: c.id, adultos: null, menores: null, cantidad: 1, monto: r2(anticipo) })
              aviso(h.sheet, n, `${nombre} tiene anticipo de ${c.nombre} pero no total; se pone ${anticipo.toLocaleString('es-MX')} como total. Corrígelo en su ficha cuando lo sepas.`, false)
            }
            // Solo se registra la diferencia con lo que Eventi ya tiene, así reimportar el archivo actualizado no duplica
            const ya = ev.abonos.filter(a => a.personaId === p.id && a.conceptoId === c.id && a.estado !== 'rechazado').reduce((s, a) => s + a.monto, 0)
              + plan.abonos.filter(a => a.personaId === p.id && a.conceptoId === c.id).reduce((s, a) => s + a.monto, 0)
            const dif = r2(anticipo - ya)
            if (dif > 0) {
              sinFecha = true
              plan.abonos.push({
                id: nuevoId('a'), personaId: p.id, conceptoId: c.id, monto: dif, fecha: opciones.hoy, metodo: 'Efectivo',
                comprobante: null, estado: 'validado', registradoPor: opciones.usuarioId ?? null, origen: 'importado',
              })
            } else if (dif < 0) aviso(h.sheet, n, `${nombre}: Eventi ya tiene ${ya.toLocaleString('es-MX')} de ${c.nombre}, más que el anticipo del Excel (${anticipo.toLocaleString('es-MX')}). No se cambia nada.`, false)
          }
        }
        if (!algo) aviso(h.sheet, n, `${nombre} no tiene montos; se agrega sin conceptos.`, false)
      }
      if (sinFecha) aviso(h.sheet, ie + 1, 'Los anticipos no traen fecha ni forma de pago: se registran con la fecha de hoy, en efectivo.', false)
    }

    if (tipo === 'conceptos') {
      let cN = columna(enc, COL.concepto, usadas)
      if (cN < 0) cN = columna(enc, ['nombre'], usadas)
      const cMenor = columna(enc, COL.menor, usadas), cAdulto = columna(enc, COL.adulto, usadas)
      const cFechas = enc.map((e, i) => (!usadas.has(i) && /^(fecha|pago|vence)/.test(e) ? i : -1)).filter(i => i >= 0)
      if (cN < 0 || cAdulto < 0) { aviso(h.sheet, ie + 1, 'Faltan las columnas "Concepto" y "Monto".'); continue }
      for (const { r, n } of filas) {
        const nombre = texto(r[cN])
        if (!nombre) continue
        if (buscarConcepto(nombre)) { aviso(h.sheet, n, `${nombre} ya existe; se usa el que ya tienes.`, false); continue }
        const adulto = numero(r[cAdulto]), menor = cMenor >= 0 ? numero(r[cMenor]) : null
        if (!(adulto && adulto > 0)) { aviso(h.sheet, n, `${nombre}: falta el monto.`); continue }
        let fechas = cFechas.flatMap((i): Celda[] => (typeof r[i] === 'string' ? String(r[i]).split(/[,;\n]+/) : [r[i]])).map(v => fecha(v)).filter((f): f is string => !!f)
        fechas = [...new Set(fechas)].sort()
        if (!fechas.length) { fechas = [addDays(ev.fecha, -15)]; aviso(h.sheet, n, `${nombre}: sin fechas de pago; se puso un solo pago 15 días antes del evento.`, false) }
        const pcts = repartirPct(fechas.length)
        plan.conceptos.push({
          id: nuevoId('c'), nombre, base: adulto,
          tarifa: menor != null ? { adulto, menor } : null,
          cuotas: fechas.map((f, i) => ({ fecha: f, pct: pcts[i] })),
        })
      }
    }

    if (tipo === 'personas') {
      const cN = columna(enc, COL.nombre, usadas), cTel = columna(enc, COL.telefono, usadas)
      const cA = columna(enc, COL.adultos, usadas), cM = columna(enc, COL.menores, usadas), cT = columna(enc, COL.tipo, usadas)
      // Cada columna con el nombre de un concepto es el monto total que le toca pagar
      const cConc = enc.map((e, i) => ({ i, c: usadas.has(i) ? undefined : buscarConcepto(e) })).filter(x => x.c) as { i: number; c: Concepto }[]
      if (cN < 0) { aviso(h.sheet, ie + 1, 'Falta la columna "Nombre".'); continue }
      const sinConcepto = enc.filter((e, i) => e && !usadas.has(i) && !cConc.some(x => x.i === i))
      if (sinConcepto.length) aviso(h.sheet, ie + 1, `Columnas que no son conceptos del evento y se ignoran: ${sinConcepto.join(', ')}.`, false)
      for (const { r, n } of filas) {
        const nombre = texto(r[cN])
        if (!nombre) continue
        const adultos = Math.max(0, Math.round(numero(r[cA]) ?? 1)), menores = Math.max(0, Math.round(numero(r[cM]) ?? 0))
        const tipoT = norm(r[cT])
        const tipoR: TipoRegistro = tipoT.startsWith('fam') || /^familia /i.test(nombre) || adultos + menores > 1 ? 'Familia' : 'Persona'
        let p = buscarPersona(nombre)
        const existe = !!p
        if (!p) { p = { id: nuevoId('p'), nombre, tipo: tipoR, telefono: cTel >= 0 ? texto(r[cTel]) : '', cargos: [] }; plan.personas.push(p) }
        for (const { i, c } of cConc) {
          const v = r[i]
          if (v == null || String(v).trim() === '') continue
          const monto = numero(v)
          const marca = monto == null && /^(x|si|s|✓|1)$/i.test(String(v).trim())
          if (monto == null && !marca) { aviso(h.sheet, n, `${nombre}: no entiendo "${String(v)}" en ${c.nombre}.`); continue }
          if (monto != null && monto <= 0) continue
          if (cargoDe(p, c.id)) { if (existe) aviso(h.sheet, n, `${nombre} ya tenía ${c.nombre}; se deja su monto actual.`, false); continue }
          asignar(p, cargoPorTarifa(c, adultos, menores, monto))
        }
      }
    }

    if (tipo === 'pagos') {
      const cN = columna(enc, COL.nombre, usadas), cC = columna(enc, COL.concepto, usadas)
      const cF = columna(enc, COL.fecha, usadas), cMe = columna(enc, COL.metodo, usadas), cMo = columna(enc, COL.monto, usadas)
      if (cN < 0 || cC < 0 || cMo < 0) { aviso(h.sheet, ie + 1, 'Faltan columnas: se necesitan "Nombre", "Concepto" y "Monto".'); continue }
      for (const { r, n } of filas) {
        const nombre = texto(r[cN]), conc = texto(r[cC]), monto = numero(r[cMo])
        if (!nombre && !monto) continue
        const p = buscarPersona(nombre), c = buscarConcepto(conc)
        if (!p) { aviso(h.sheet, n, `No encontré a "${nombre}". Agrégalo en la hoja Personas.`); continue }
        if (!c) { aviso(h.sheet, n, `No existe el concepto "${conc}".`); continue }
        if (!(monto && monto > 0)) { aviso(h.sheet, n, `${nombre}: el monto no es válido.`); continue }
        const f = cF >= 0 ? fecha(r[cF]) : null
        if (cF >= 0 && r[cF] != null && String(r[cF]).trim() !== '' && !f) aviso(h.sheet, n, `${nombre}: no entiendo la fecha "${String(r[cF])}"; se usa hoy.`, false)
        const dia = f ?? opciones.hoy
        const dup = ev.abonos.some(a => a.personaId === p.id && a.conceptoId === c.id && a.monto === monto && a.fecha === dia && a.estado !== 'rechazado')
        if (dup) { aviso(h.sheet, n, `${nombre}: ya estaba registrado ese abono de ${c.nombre}; no se duplica.`, false); continue }
        if (!cargoDe(p, c.id)) {
          const g = cargoPorTarifa(c, 1, 0)
          asignar(p, g)
          aviso(h.sheet, n, `${nombre} no tenía ${c.nombre}; se le asigna con ${g.monto.toLocaleString('es-MX')} (revísalo después).`, false)
        }
        plan.abonos.push({
          id: nuevoId('a'), personaId: p.id, conceptoId: c.id, monto, fecha: dia, metodo: cMe >= 0 ? metodo(r[cMe]) : 'Efectivo',
          comprobante: null, estado: 'validado', registradoPor: opciones.usuarioId ?? null, origen: 'importado',
        })
      }
    }

    if (tipo === 'gastos') {
      const cA = columna(enc, COL.actividad, usadas), cG = columna(enc, COL.gasto, usadas), cI = columna(enc, COL.ingreso, usadas)
      const cT = columna(enc, COL.tipo, usadas), cF = columna(enc, COL.fecha, usadas), cMo = columna(enc, COL.monto, usadas), cNo = columna(enc, COL.nota, usadas)
      if (cMo < 0 && cG < 0 && cI < 0) { aviso(h.sheet, ie + 1, 'Falta la columna "Monto" (o "Gasto" e "Ingreso").'); continue }
      const buscarAct = (n: string) => [...ev.actividades, ...plan.actividades].find(a => norm(a.nombre) === norm(n))
      for (const { r, n } of filas) {
        const nombre = cA >= 0 ? texto(r[cA]) : h.sheet
        if (!nombre) { aviso(h.sheet, n, 'Falta el nombre de la actividad.'); continue }
        const dia = (cF >= 0 ? fecha(r[cF]) : null) ?? opciones.hoy
        const nota = cNo >= 0 ? texto(r[cNo]) : ''
        const movs: Movimiento[] = []
        if (cG >= 0 || cI >= 0) {
          const g = cG >= 0 ? numero(r[cG]) : null, i = cI >= 0 ? numero(r[cI]) : null
          if (g) movs.push({ id: nuevoId('m'), tipo: 'gasto', monto: Math.abs(g), fecha: dia, nota })
          if (i) movs.push({ id: nuevoId('m'), tipo: 'ingreso', monto: Math.abs(i), fecha: dia, nota })
        } else {
          const m = numero(r[cMo])
          if (!m) { aviso(h.sheet, n, `${nombre}: el monto no es válido.`); continue }
          const t = cT >= 0 ? norm(r[cT]) : ''
          let tipoMov: Movimiento['tipo']
          if (/^(ingreso|recuper|entrada|venta|ganancia)/.test(t)) tipoMov = 'ingreso'
          else if (/^(gasto|egreso|salida|compra)/.test(t)) tipoMov = 'gasto'
          else if (t) { aviso(h.sheet, n, `${nombre}: el tipo "${texto(r[cT])}" debe ser Gasto o Ingreso.`); continue }
          else tipoMov = m > 0 && /^ingreso/.test(norm(h.sheet)) ? 'ingreso' : 'gasto'
          movs.push({ id: nuevoId('m'), tipo: tipoMov, monto: Math.abs(m), fecha: dia, nota })
        }
        if (!movs.length) continue
        let act = buscarAct(nombre)
        if (!act) { act = { id: nuevoId('ac'), nombre, detalle: '', estado: 'En curso', movimientos: [] }; plan.actividades.push(act) }
        const existente = ev.actividades.includes(act)
        for (const mov of movs) {
          if (existente && act.movimientos.some(x => x.tipo === mov.tipo && x.monto === mov.monto && x.fecha === mov.fecha)) {
            aviso(h.sheet, n, `${nombre}: ese ${mov.tipo} ya estaba registrado; no se duplica.`, false); continue
          }
          if (existente) plan.movimientos.push({ actividadId: act.id, mov }); else act.movimientos.push(mov)
        }
      }
    }
  }
  return plan
}

export const resumenPlan = (p: PlanImport) => ({
  conceptos: p.conceptos.length,
  personas: p.personas.length,
  cargos: p.personas.reduce((s, x) => s + x.cargos.length, 0) + p.cargosNuevos.length,
  abonos: p.abonos.length,
  totalAbonos: p.abonos.reduce((s, a) => s + a.monto, 0),
  actividades: p.actividades.length,
  movimientos: p.actividades.reduce((s, a) => s + a.movimientos.length, 0) + p.movimientos.length,
  errores: p.avisos.filter(a => a.grave).length,
})

/** Aplica el plan sobre una copia editable del evento. */
export function aplicarPlan(ev: Evento, p: PlanImport) {
  ev.conceptos.push(...structuredClone(p.conceptos))
  ev.personas.push(...structuredClone(p.personas))
  for (const { personaId, cargo } of p.cargosNuevos) {
    const per = ev.personas.find(x => x.id === personaId)
    if (per && !per.cargos.some(g => g.conceptoId === cargo.conceptoId)) per.cargos.push({ ...cargo })
  }
  ev.abonos.unshift(...structuredClone(p.abonos).sort((a, b) => b.fecha.localeCompare(a.fecha)))
  ev.actividades.push(...structuredClone(p.actividades))
  for (const { actividadId, mov } of p.movimientos) ev.actividades.find(a => a.id === actividadId)?.movimientos.push({ ...mov })
}

/** Hojas de ejemplo para la plantilla descargable. */
export function plantillaImportacion(ev: Evento): { sheet: string; data: (string | number)[][] }[] {
  const cs = ev.conceptos.length ? ev.conceptos : [
    { nombre: 'Hospedaje', tarifa: { adulto: 2500, menor: 1500 }, base: 2500, cuotas: [{ fecha: '2026-10-01' }, { fecha: '2026-11-01' }] },
    { nombre: 'Inscripción', tarifa: null, base: 800, cuotas: [{ fecha: '2026-10-15' }] },
  ]
  const f = (s: string) => s.split('-').reverse().join('/')
  return [
    { sheet: 'Conceptos', data: [['Concepto', 'Monto adulto', 'Monto menor', 'Fechas de pago'],
      ...cs.map(c => [c.nombre, c.tarifa?.adulto ?? c.base, c.tarifa ? c.tarifa.menor : '', c.cuotas.map(q => f(q.fecha)).join(', ')])] },
    { sheet: 'Personas', data: [['Nombre', 'WhatsApp', 'Adultos', 'Menores', ...cs.map(c => c.nombre)],
      ['Familia López', '667 555 0101', 2, 2, ...cs.map(c => (c.tarifa ? porTarifaSimple(c, 2, 2) : c.base))],
      ['Carlos Ramírez', '667 555 0102', 1, 0, ...cs.map(c => c.tarifa?.adulto ?? c.base)]] },
    { sheet: 'Pagos', data: [['Fecha', 'Nombre', 'Concepto', 'Monto', 'Forma de pago'],
      ['01/09/2026', 'Familia López', cs[0].nombre, 2000, 'Transferencia'], ['05/09/2026', 'Carlos Ramírez', cs[0].nombre, 500, 'Efectivo']] },
    { sheet: 'Gastos', data: [['Actividad', 'Fecha', 'Descripción', 'Gasto', 'Ingreso'],
      ['Rifa 1', '10/08/2026', 'Compra del premio', 1800, ''], ['Rifa 1', '30/08/2026', 'Venta de boletos', '', 4200]] },
  ]
}
const porTarifaSimple = (c: { tarifa: { adulto: number; menor: number } | null; base: number }, a: number, m: number) =>
  c.tarifa ? c.tarifa.adulto * a + c.tarifa.menor * m : c.base
