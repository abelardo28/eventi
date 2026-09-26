import type { Comprobante } from '../domain/types'

const leer = (f: Blob) => new Promise<string>((ok, err) => {
  const r = new FileReader()
  r.onload = () => ok(r.result as string)
  r.onerror = () => err(r.error)
  r.readAsDataURL(f)
})

/**
 * Prepara un comprobante para guardarse: las fotos se reducen (máx. 1400 px, JPEG)
 * para que quepan en el dispositivo; los PDF se aceptan hasta 1.5 MB.
 */
export async function prepararComprobante(file: File): Promise<Comprobante> {
  if (file.type === 'application/pdf') {
    if (file.size > 1.5e6) throw new Error('El PDF pesa más de 1.5 MB. Mándalo como foto o captura de pantalla.')
    return { nombre: file.name, tipo: file.type, data: await leer(file) }
  }
  if (!file.type.startsWith('image/')) throw new Error('Sube una foto o un PDF.')
  const url = await leer(file)
  const img = await new Promise<HTMLImageElement>((ok, err) => { const i = new Image(); i.onload = () => ok(i); i.onerror = err; i.src = url })
  const escala = Math.min(1, 1400 / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * escala)
  canvas.height = Math.round(img.height * escala)
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  return { nombre: file.name.replace(/\.\w+$/, '') + '.jpg', tipo: 'image/jpeg', data: canvas.toDataURL('image/jpeg', 0.72) }
}
