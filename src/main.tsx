import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { installApiInterceptor } from './utils/api'
import './index.css'

declare const __APP_VERSION__: string

// iOS Safari 错误处理
window.addEventListener('error', (e) => {
  console.error('Global error:', e.error)
})

window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled rejection:', e.reason)
})

// 检查 iOS Safari
const isIOSSafari = /iP(ad|hone|od).+Version\/[\d\.]+.*Safari/i.test(navigator.userAgent)
if (isIOSSafari) {
  console.log('iOS Safari detected, applying compatibility fixes')
  document.body.classList.add('ios-safari')
}

installApiInterceptor()
console.log('App version:', __APP_VERSION__)

const rootElement = document.getElementById('root')
if (!rootElement) {
  console.error('Root element not found')
} else {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
