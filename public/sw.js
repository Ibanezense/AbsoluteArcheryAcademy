const CACHE_NAME = 'archery-shell-v1'
const OFFLINE_URL = '/offline'
const STATIC_ASSETS = [
  OFFLINE_URL,
  '/favicon-32x32.png',
  '/favicon-96x96.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

function isSafeStaticRequest(request) {
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return false
  if (url.pathname.startsWith('/api/')) return false
  return ['style', 'script', 'font', 'image'].includes(request.destination)
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL)),
    )
    return
  }

  if (!isSafeStaticRequest(request)) return

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request).then((response) => {
        const responseCopy = response.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(request, responseCopy))
        return response
      })
    }),
  )
})
