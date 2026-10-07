/// <reference types="vite/client" />
import type { FiefdomBridge } from '../../shared/api'

declare global {
  interface Window {
    /** Present only inside the Electron app (see src/preload). */
    fiefdom?: FiefdomBridge
    /** Development builds only (A-09): campaign time travel, from the devtools console. */
    fiefdomDev?: { advanceDays(days: number): void; now(): Date }
  }

  interface ImportMetaEnv {
    /** Development builds only (A-09): an ISO instant the campaign treats as "now". */
    readonly FIEFDOM_DEV_NOW?: string
  }
}

export {}
