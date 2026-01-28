import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { installApiInterceptor } from './utils/api'
import './index.css'

installApiInterceptor()
console.log('App Version: v1.3.3')
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
