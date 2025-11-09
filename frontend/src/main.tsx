import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'           // Import global styles and Tailwind FIRST
import './styles/route-planner.css'    // Route planner specific styles
import 'leaflet/dist/leaflet.css'      // Leaflet map styles
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
