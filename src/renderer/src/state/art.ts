/**
 * The art manifest (book Ch 17 "Placeholders first", A-08): which art slots have a real file.
 * Loaded once from `game-assets/manifest.json` (served from src/renderer/public); a missing or
 * unreadable manifest just means every slot shows its placeholder. Art never blocks code.
 */
import { create } from 'zustand'

export interface ArtSlot {
  file: string | null
  kind: string
  size: [number, number]
}

interface ArtStore {
  status: 'idle' | 'loading' | 'ready'
  slots: Record<string, ArtSlot>
  load(): void
}

export const useArt = create<ArtStore>((set, get) => ({
  status: 'idle',
  slots: {},
  load() {
    if (get().status !== 'idle') return
    set({ status: 'loading' })
    fetch('game-assets/manifest.json', { cache: 'no-store' })
      .then((r): Promise<unknown> | null => (r.ok ? r.json() : null))
      .then((slots) => set({ status: 'ready', slots: slots && typeof slots === 'object' ? (slots as Record<string, ArtSlot>) : {} }))
      .catch(() => set({ status: 'ready', slots: {} }))
  }
}))

/** The URL of a slot's file, or null while it has none. */
export function artUrl(slot: ArtSlot | undefined): string | null {
  return slot?.file ? `game-assets/${slot.file}` : null
}
