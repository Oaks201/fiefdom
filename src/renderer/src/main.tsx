import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@fontsource/cinzel/500.css'
import '@fontsource/cinzel/700.css'
import '@fontsource/cinzel/900.css'
import '@fontsource/eb-garamond/400.css'
import '@fontsource/eb-garamond/400-italic.css'
import '@fontsource/eb-garamond/500.css'
import '@fontsource/eb-garamond/600.css'
import '@fontsource/im-fell-english/400.css'
import '@fontsource/im-fell-english/400-italic.css'

import './styles/fonts.css'
import './styles/base.css'
import './styles/desk.css'
import './styles/components.css'
import './styles/chronicle.css'
import './styles/contract.css'
import './styles/archive.css'

import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
