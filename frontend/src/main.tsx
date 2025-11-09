import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'           // Tailwind base + global styles
import 'leaflet/dist/leaflet.css'      // Leaflet styles
import './styles/route-planner.css'    // Custom route planner (last = highest priority)
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
