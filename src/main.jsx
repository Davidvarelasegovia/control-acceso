import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// El service worker solo se registra en la version de PRODUCCION (build).
// En desarrollo provocaba cache obsoleto y hacia creer que los cambios no se veian.
if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((error) => {
        console.log('Error registrando SW:', error)
      })
    })
  } else {
    // Limpia cualquier SW que haya quedado de ejecuciones anteriores
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => registration.unregister())
    })
    if (window.caches) {
      caches.keys().then((keys) => keys.forEach((key) => caches.delete(key)))
    }
  }
}
