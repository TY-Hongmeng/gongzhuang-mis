// Kill-switch Service Worker for development
// This SW takes control immediately, clears caches, and unregisters itself.

self.addEventListener('install', (event) => {
  // Activate immediately
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      // Identify itself
      console.log('[KillSW] Activated, clearing caches and unregistering');
      // Clear all caches
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch {}
    try {
      // Unregister this SW to fully disable control
      await self.registration.unregister();
      console.log('[KillSW] Unregistered current service worker');
    } catch {}
    // Claim clients to ensure immediate control until unregister completes
    try {
      await self.clients.claim();
    } catch {}
  })());
});

// Pass-through network for all requests to avoid any interception issues
self.addEventListener('fetch', (event) => {
  try {
    const req = event.request;
    event.respondWith(fetch(req));
  } catch (e) {
    // If anything goes wrong, fallback to direct network
    event.respondWith(fetch(event.request));
  }
});