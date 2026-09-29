/// <reference types="vite/client" />
import type { FiefdomBridge } from '../../shared/api'

declare global {
  interface Window {
    /** Present only inside the Electron app (see src/preload). */
    fiefdom?: FiefdomBridge
  }
}

export {}
