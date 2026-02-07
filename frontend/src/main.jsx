import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// --- PWA REGISTRATION START ---
import { registerSW } from 'virtual:pwa-register'

// This automatically updates the app when you deploy new changes
registerSW({ 
  immediate: true,
  onRegistered(r) {
    console.log('SW Registered: ', r);
  },
  onRegisterError(error) {
    console.error('SW registration error', error);
  }
})
// --- PWA REGISTRATION END ---

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)