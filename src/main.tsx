import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { installApiInterceptor } from './utils/api'
import './index.css'

installApiInterceptor()
console.log('App Version: 2026-01-16-DEBUG-11')
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
