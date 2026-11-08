// Service worker mínimo: guarda la app para abrirla sin conexión.
// Estrategia: red primero para navegación; caché primero para archivos con hash.
const CACHE = 'eventi-v2'

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./', './index.html', './manifest.webmanifest', './icono.svg'])))
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))))
  self.clients.claim()
})

self.addEventListener('fetch', e => {
  const { request } = e
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return
  if (request.mode === 'navigate') {
    e.respondWith(fetch(request).then(r => { caches.open(CACHE).then(c => c.put('./index.html', r.clone())); return r }).catch(() => caches.match('./index.html')))
    return
  }
  e.respondWith(caches.match(request).then(hit => hit || fetch(request).then(r => {
    if (r.ok) { const copia = r.clone(); caches.open(CACHE).then(c => c.put(request, copia)) }
    return r
  })))
})

// Al tocar un aviso se abre Eventi en la pantalla correspondiente.
self.addEventListener('notificationclick', e => {
  e.notification.close()
  const url = e.notification.data?.url || './'
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    const c = cs[0]
    if (c) return c.navigate(url).then(x => (x || c).focus()).catch(() => c.focus())
    return self.clients.openWindow(url)
  }))
})

// Avisos push: llegan desde el servidor aunque la app esté cerrada.
self.addEventListener('push', e => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch { d = { texto: e.data ? e.data.text() : '' } }
  e.waitUntil(self.registration.showNotification(d.titulo || 'Eventi', {
    body: d.texto || '',
    tag: d.etiqueta || undefined,
    icon: 'icono-192.png',
    badge: 'icono-192.png',
    data: { url: self.registration.scope + '#' + (d.ruta || '/notificaciones') },
  }))
})
