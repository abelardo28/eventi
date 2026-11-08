// Eventi: manda los avisos push que la base dejó en `push_cola`.
// Se publica en Supabase → Edge Functions con el nombre "eventi-push" y SIN verificación de JWT
// (no recibe datos: solo despacha lo que ya está en la cola, así que llamarla de más no hace daño).
//
// GET  → devuelve la llave pública con la que cada dispositivo se suscribe (la crea la primera vez).
// POST → manda los avisos pendientes.
import { createClient } from 'npm:@supabase/supabase-js@2'
import * as webpush from 'jsr:@negrel/webpush@0.5.0'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
const json = (x: unknown, status = 200) => new Response(JSON.stringify(x), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

/** Las llaves VAPID viven en push_config; si no hay, se crean y se guardan (solo una vez). */
async function llaves(): Promise<{ par: CryptoKeyPair; publica: string }> {
  let { data } = await db.from('push_config').select('vapid, publica').eq('id', 1).maybeSingle()
  if (!data?.vapid) {
    const nuevo = await webpush.generateVapidKeys({ extractable: true })
    const vapid = await webpush.exportVapidKeys(nuevo)
    const publica = await webpush.exportApplicationServerKey(nuevo)
    await db.from('push_config').upsert({ id: 1 }, { onConflict: 'id', ignoreDuplicates: true })
    await db.from('push_config').update({ vapid, publica }).eq('id', 1).is('vapid', null)
    ;({ data } = await db.from('push_config').select('vapid, publica').eq('id', 1).single())
  }
  return { par: await webpush.importVapidKeys(data!.vapid), publica: data!.publica }
}

async function despachar() {
  // Se apartan los pendientes en un solo paso para que dos llamadas no manden lo mismo
  const { data: cola, error } = await db.from('push_cola').update({ enviado: new Date().toISOString() })
    .is('enviado', null).gte('creado', new Date(Date.now() - 2 * 864e5).toISOString()).select()
  if (error) throw error
  if (!cola?.length) return { enviados: 0 }

  const usuarios = [...new Set(cola.map(x => x.usuario))]
  const { data: subs } = await db.from('push_suscripciones').select().in('usuario', usuarios)
  if (!subs?.length) return { enviados: 0, sinDispositivo: cola.length }

  const { par } = await llaves()
  const servidor = await webpush.ApplicationServer.new({ contactInformation: 'https://abelardo28.github.io/eventi/', vapidKeys: par })
  let enviados = 0
  const vencidas: string[] = []
  await Promise.all(cola.flatMap(aviso => subs.filter(s => s.usuario === aviso.usuario).map(async s => {
    try {
      await servidor.subscribe({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } })
        .pushTextMessage(JSON.stringify({ titulo: aviso.titulo, texto: aviso.texto, ruta: aviso.ruta, etiqueta: aviso.etiqueta }), { urgency: webpush.Urgency.High, ttl: 86400 })
      enviados++
    } catch (e) {
      const st = (e as webpush.PushMessageError).response?.status
      if (st === 404 || st === 410) vencidas.push(s.endpoint) // el dispositivo ya no acepta avisos
      else console.error('push', st, String(e))
    }
  })))
  if (vencidas.length) await db.from('push_suscripciones').delete().in('endpoint', vencidas)
  // Limpieza: lo enviado hace más de 30 días
  await db.from('push_cola').delete().lt('creado', new Date(Date.now() - 30 * 864e5).toISOString())
  return { enviados, quitados: vencidas.length }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    if (req.method === 'GET') return json({ clave: (await llaves()).publica })
    return json(await despachar())
  } catch (e) {
    console.error(e)
    return json({ error: String((e as Error).message ?? e) }, 500)
  }
})
