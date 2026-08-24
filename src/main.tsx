import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { installApiInterceptor } from './utils/api'
import './index.css'

declare const __APP_VERSION__: string

;(window as any).__APP_BOOT_STAGE__ = 'main-init'

window.addEventListener('error', (e) => {
  console.error('Global error:', e.error)
})

window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled rejection:', e.reason)
})

if (import.meta.env.DEV) {
  try {
    const nodes = document.querySelectorAll('vite-error-overlay, #vite-error-overlay, .vite-error-overlay')
    nodes.forEach((el) => el.remove())
  } catch {}

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((registration) => registration.unregister())
    }).catch(() => {})

    caches.keys().then((names) => {
      Promise.all(names.map((name) => caches.delete(name)))
    }).catch(() => {})
  }
}

// 检查 iOS Safari
const isIOSSafari = /iP(ad|hone|od).+Version\/[\d\.]+.*Safari/i.test(navigator.userAgent)
if (isIOSSafari) {
  console.log('iOS Safari detected, applying compatibility fixes')
  document.body.classList.add('ios-safari')
}

const bootSearch = new URLSearchParams(window.location.search)
const forceSafeMode = bootSearch.get('boot_safe') === '1'
const isIOSEmbedded = /iP(hone|ad|od)/i.test(navigator.userAgent) && /MicroMessenger|baiduboxapp|Baidu/i.test(navigator.userAgent)
const host = typeof window !== 'undefined' ? String(window.location?.host || '') : ''
const isStaticFallbackHost = /vercel\.app/i.test(host)

if (!forceSafeMode && (!isIOSEmbedded || isStaticFallbackHost)) {
  setTimeout(() => {
    try {
      ;(window as any).__APP_BOOT_STAGE__ = 'interceptor'
      installApiInterceptor()
    } catch (error) {
      console.error('installApiInterceptor failed:', error)
    }
  }, 0)
} else {
  console.log('Boot safe mode: skip api interceptor')
}

console.log('App version:', __APP_VERSION__)

const rootElement = document.getElementById('root')
if (!rootElement) {
  console.error('Root element not found')
} else {
  ;(window as any).__APP_BOOT_STAGE__ = 'render'
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
  ;(window as any).__APP_BOOT_DONE__ = true
}
