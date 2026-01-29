import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { installApiInterceptor } from './utils/api'
import './index.css'

installApiInterceptor()
console.log('App Version: v1.6.0')
if ('serviceWorker' in navigator) {
  try {
    navigator.serviceWorker.getRegistrations?.().then(regs => {
      regs.forEach(r => r.unregister())
    }).catch(() => {})
    caches.keys().then(names => {
      Promise.all(names.map(n => caches.delete(n)))
    }).catch(() => {})
  } catch {}
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
