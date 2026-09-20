import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { OverlayHud } from './pages/OverlayHud'
import './styles.css'

const isOverlay =
  new URLSearchParams(window.location.search).get('overlay') === '1' ||
  window.location.hash === '#overlay'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isOverlay ? <OverlayHud /> : <App />}
  </StrictMode>,
)
