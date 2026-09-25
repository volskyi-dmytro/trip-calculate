import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted fonts: loading them from Google would send every visitor's IP
// to a third party. Bundled woff2 files are split by unicode-range, so the
// browser only fetches the Latin/Cyrillic subsets a page actually uses.
import '@fontsource-variable/manrope'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/600.css'
import './styles/global.css'           // Tailwind base + global styles
import './styles/route-planner.css'    // Custom route planner (last = highest priority)
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
