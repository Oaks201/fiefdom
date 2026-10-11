/**
 * The art manifest (book Ch 17 "Placeholders first", A-08): which art slots have a real file.
 * Bundled from the public manifest so Electron's file:// build works offline. Development
 * accepts manifest edits live and can refresh dropped-in files without changing game state.
 */
import { create } from 'zustand'
import manifest from '../../public/game-assets/manifest.json'
import type { CampaignState } from '../lib/game/types'
import { portraitChoice, standingOf, type PortraitChoice } from '../lib/game/view/playerPortrait'

export interface ArtSlot {
  file: string | null
  kind: string
  size: [number, number]
}

interface ArtStore {
  status: 'idle' | 'loading' | 'ready'
  slots: Record<string, ArtSlot>
  revision: number
  load(): void
  reload(): void
}

export const useArt = create<ArtStore>((set, get) => ({
  status: 'idle',
  slots: {},
  revision: 0,
  load() {
    if (get().status !== 'idle') return
    set({ status: 'ready', slots: manifest as unknown as Record<string, ArtSlot> })
  },
  reload() {
    if (!import.meta.env.DEV || get().status === 'loading') return
    set({ status: 'loading' })
    fetch('game-assets/manifest.json', { cache: 'no-store' })
      .then((r): Promise<unknown> | null => (r.ok ? r.json() : null))
      .then((slots) => set((s) => ({ status: 'ready', slots: slots && typeof slots === 'object' ? (slots as Record<string, ArtSlot>) : s.slots, revision: s.revision + 1 })))
      .catch(() => set({ status: 'ready' }))
  }
}))

if (import.meta.hot) {
  import.meta.hot.accept('../../public/game-assets/manifest.json', (next) => {
    if (next) useArt.setState((s) => ({ status: 'ready', slots: next.default as Record<string, ArtSlot>, revision: s.revision + 1 }))
  })
}

/** The URL of a slot's file, or null while it has none. */
export function artUrl(slot: ArtSlot | undefined, revision = 0): string | null {
  return slot?.file ? `game-assets/${slot.file}${import.meta.env.DEV ? `?v=${revision}` : ''}` : null
}

/**
 * The player's portrait wherever it appears (the Audience, the standing card): the file their tier
 * and path call for, and the files to try while it is missing, from playerPortraits.json. This one
 * function picks it. Not a manifest slot: the files are found by name in the portraits folder.
 */
export function getPlayerPortrait(campaign: CampaignState | null): PortraitChoice {
  return portraitChoice(campaign ? standingOf(campaign) : null)
}
