import { jsPDF } from 'jspdf'
import { autoTable } from 'jspdf-autotable'
import { concepto, integrantes, money, plural } from './calc'
import type { EstadoRegistro } from './estadoCuenta'
import { fCompleta, fCorta } from './fechas'
import { formaDePago } from './reparto'
import type { Evento, ISODate } from './types'

export interface DatosEstado {
  ev: Evento
  hoy: ISODate
  titulo: string
  sub: string
  registros: EstadoRegistro[]
  /** Solo en el estado de cuenta de un grupo. */
  totales: { total: number; pagado: number; saldo: number; vencido: number } | null
}

const TINTA: [number, number, number] = [20, 21, 26]
const GRIS: [number, number, number] = [100, 104, 114]
const LINEA: [number, number, number] = [220, 222, 228]
const ROJO: [number, number, number] = [198, 47, 52]
const VERDE: [number, number, number] = [13, 127, 107]

const fechaAbono = (f: ISODate) => `${fCorta(f)} ${f.slice(0, 4)}`
export const tipoRegistro = (r: EstadoRegistro) => r.p.tipo === 'Familia' ? `Familia · ${plural(integrantes(r.p), 'persona', 'personas')}` : 'Persona'

/** Nombre de archivo sin acentos ni signos. */
export const nombreArchivo = (titulo: string) =>
  'Estado de cuenta - ' + titulo.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s-]/g, '').trim() + '.pdf'

/** Arma el estado de cuenta como PDF (tamaño carta), con texto real para que se pueda buscar y copiar. */
export function estadoPdf(d: DatosEstado): Blob {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const W = doc.internal.pageSize.getWidth(), M = 40
  let y = M

  const texto = (t: string, x: number, size: number, opts: { bold?: boolean; color?: [number, number, number]; align?: 'left' | 'right' } = {}) => {
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal').setFontSize(size).setTextColor(...(opts.color ?? TINTA))
    doc.text(t, x, y, { align: opts.align ?? 'left' })
  }
  const espacio = (n: number) => {
    if (y + n > doc.internal.pageSize.getHeight() - M) { doc.addPage(); y = M }
  }

  // Encabezado
  texto('ESTADO DE CUENTA', M, 8, { color: GRIS, bold: true })
  texto(d.ev.nombre, W - M, 10, { bold: true, align: 'right' })
  y += 22
  texto(d.titulo, M, 20, { bold: true })
  const fechas = d.ev.fin && d.ev.fin !== d.ev.fecha ? `${fCompleta(d.ev.fecha)} al ${fCompleta(d.ev.fin)}` : fCompleta(d.ev.fecha)
  y -= 8; texto(fechas + (d.ev.lugar ? ` · ${d.ev.lugar}` : ''), W - M, 8.5, { color: GRIS, align: 'right' }); y += 8
  y += 16
  texto(d.sub, M, 9.5, { color: GRIS })
  texto(`Generado el ${fCompleta(d.hoy)}`, W - M, 8.5, { color: GRIS, align: 'right' })
  y += 12
  doc.setDrawColor(...LINEA).setLineWidth(0.8).line(M, y, W - M, y)
  y += 16

  // Cajas de totales
  const t = d.totales ?? d.registros[0]
  const cajas: [string, number, [number, number, number]][] = [['TOTAL', t.total, TINTA], ['PAGADO', t.pagado, VERDE], ['SALDO', t.saldo, TINTA]]
  if (t.vencido > 0) cajas.push(['VENCIDO', t.vencido, ROJO])
  const gap = 8, bw = (W - 2 * M - gap * (cajas.length - 1)) / cajas.length
  cajas.forEach(([k, v, c], i) => {
    const x = M + i * (bw + gap)
    doc.setDrawColor(...LINEA).roundedRect(x, y, bw, 42, 6, 6)
    const y0 = y
    y = y0 + 15; texto(k, x + 10, 7.5, { color: GRIS, bold: true })
    y = y0 + 32; texto(money(v), x + 10, 14, { bold: true, color: c })
    y = y0
  })
  y += 60

  const tabla = (head: string[][] | undefined, body: (string | { content: string; styles?: object })[][], foot?: string[][], derecha = [1, 2, 3]) => {
    autoTable(doc, {
      startY: y, head, body, foot, margin: { left: M, right: M }, theme: 'plain',
      styles: { font: 'helvetica', fontSize: 9, textColor: TINTA, cellPadding: { top: 5, bottom: 5, left: 0, right: 6 }, lineColor: LINEA, lineWidth: { bottom: 0.6 } },
      headStyles: { fontSize: 7.5, textColor: GRIS, fontStyle: 'bold' },
      footStyles: { fontStyle: 'bold', lineWidth: { top: 1.2 } },
      columnStyles: Object.fromEntries(derecha.map(i => [i, { halign: 'right' as const, cellWidth: 72 }])),
      didParseCell: c => { if (c.section !== 'body' && derecha.includes(c.column.index)) c.cell.styles.halign = 'right' },
    })
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14
  }
  const subtitulo = (s: string) => { espacio(80); texto(s.toUpperCase(), M, 8, { color: GRIS, bold: true }); y += 4 }
  const conNota = (a: string, b: string) => `${a}\n${b}`

  if (d.totales) {
    texto('Resumen del grupo', M, 12, { bold: true }); y += 4
    tabla([['REGISTRO', 'TOTAL', 'PAGADO', 'SALDO']],
      d.registros.map(r => [conNota(r.p.nombre, tipoRegistro(r) + (r.vencido > 0 ? ` · vencido ${money(r.vencido)}` : '')), money(r.total), money(r.pagado), money(r.saldo)]),
      [['Total del grupo', money(d.totales.total), money(d.totales.pagado), money(d.totales.saldo)]])
    y += 6
  }

  d.registros.forEach((r, i) => {
    if (d.totales) {
      espacio(80)
      if (i > 0 || d.totales) { doc.setDrawColor(...LINEA).setLineWidth(1.2).line(M, y, W - M, y); y += 20 }
      texto(r.p.nombre, M, 13, { bold: true })
      texto(tipoRegistro(r), W - M, 9, { color: GRIS, align: 'right' })
      y += 16
    }
    subtitulo('Conceptos')
    if (r.conceptos.length) {
      tabla([['CONCEPTO', 'TOTAL', 'PAGADO', 'SALDO']],
        r.conceptos.map(c => {
          const nota = [c.detalle, c.saldo <= 0 ? 'Liquidado' : c.proximo && `${c.proximo.vencida ? 'Vencido' : 'Próximo pago'}: ${money(c.proximo.monto)} el ${fCorta(c.proximo.fecha)}`].filter(Boolean).join(' · ')
          return [conNota(c.nombre, nota), money(c.total), money(c.pagado), c.proximo?.vencida ? { content: money(c.saldo), styles: { textColor: ROJO } } : money(c.saldo)]
        }),
        r.conceptos.length > 1 ? [['Total', money(r.total), money(r.pagado), money(r.saldo)]] : undefined)
    } else { texto('Sin conceptos asignados.', M, 9, { color: GRIS }); y += 16 }

    subtitulo('Abonos')
    if (r.abonos.length) tabla([['FECHA', 'CONCEPTO', 'FORMA DE PAGO', 'MONTO']], r.abonos.map(a => [fechaAbono(a.fecha), concepto(d.ev, a.conceptoId)?.nombre ?? '—', formaDePago(d.ev, a), money(a.monto)]), undefined, [3])
    else { texto('Todavía no hay abonos.', M, 9, { color: GRIS }); y += 16 }

    if (r.porValidar.length) {
      subtitulo('Por validar (aún no cuentan en el saldo)')
      tabla(undefined, r.porValidar.map(a => [fechaAbono(a.fecha), concepto(d.ev, a.conceptoId)?.nombre ?? '—', formaDePago(d.ev, a), money(a.monto)]), undefined, [3])
    }
  })

  // Pie con número de página
  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); y = doc.internal.pageSize.getHeight() - 22
    texto(`${d.titulo} · ${d.ev.nombre}`, M, 7.5, { color: GRIS })
    texto(`Página ${i} de ${n}`, W - M, 7.5, { color: GRIS, align: 'right' })
  }
  return doc.output('blob')
}
