import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './styles/fonts.css'
import './styles/base.css'
import './styles/desk.css'
import './styles/components.css'
import './styles/chronicle.css'
import './styles/contract.css'
import './styles/archive.css'
import './styles/terms.css'
import './styles/game.css'
import './styles/realm.css'
import './styles/diplomacy.css'
import './styles/battle.css'
import './styles/armory.css'

import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
