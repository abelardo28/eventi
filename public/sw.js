// Service worker mínimo: guarda la app para abrirla sin conexión.
// Estrategia: red primero para navegación; caché primero para archivos con hash.
const CACHE = 'eventi-v1'

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
