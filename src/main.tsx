import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { installApiInterceptor } from './utils/api'
import './index.css'

installApiInterceptor()
console.log(`App version: v1.7.16 (Build Time: ${new Date().toISOString()}) - Fixed purchase order creation by using client-side fallback to avoid CORS`)
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
