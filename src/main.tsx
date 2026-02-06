import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { installApiInterceptor } from './utils/api'
import './index.css'

installApiInterceptor()
console.log('App version: 1.8.2')
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
