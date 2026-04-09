self.addEventListener('install', function () {
  self.skipWaiting()
})

self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    try {
      var keys = await caches.keys()
      await Promise.all(keys.map(function (key) { return caches.delete(key) }))
    } catch (e) {}
    try {
      await self.registration.unregister()
    } catch (e2) {}
    try {
      await self.clients.claim()
    } catch (e3) {}
  })())
})

self.addEventListener('fetch', function (event) {
  try {
    event.respondWith(fetch(event.request))
  } catch (e) {
    event.respondWith(fetch(event.request))
  }
})
