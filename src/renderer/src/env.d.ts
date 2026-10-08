/// <reference types="vite/client" />
import type { FiefdomBridge } from '../../shared/api'

declare global {
  interface Window {
    /** Present only inside the Electron app (see src/preload). */
    fiefdom?: FiefdomBridge
    /** Development builds only (A-09): campaign time travel and prepared scenarios (T15), from the devtools console. */
    fiefdomDev?: {
      advanceDays(days: number): void
      now(): Date
      scenario?(id: string): boolean
      /** The campaign as the store holds it, for scripts such as T17's end-to-end run (read only). */
      campaign(): import('./lib/game/types').CampaignState | null
    }
  }

  interface ImportMetaEnv {
    /** Development builds only (A-09): an ISO instant the campaign treats as "now". */
    readonly FIEFDOM_DEV_NOW?: string
  }
}

export {}
