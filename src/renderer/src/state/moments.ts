/**
 * The big-moment cards (book Ch 17 "Big moments"): Milestones, Grand Battle results, coalitions,
 * victory and the Fall each get a full-screen painted card. Anything can queue one; the shell shows
 * them one at a time. T16 queues the battle, coalition and endgame cards.
 */
import { create } from 'zustand'
import type { TextFacts } from '../lib/game/text'

export interface Moment {
  id: string
  /** The art slot (`milestone.3`, `moment.victory`, …); a placeholder until the art exists. */
  slot: string
  /** Catalog slots for the heading and the words, with their facts. */
  titleId: string
  bodyId?: string
  facts?: TextFacts
  /** A sound id from audio/sfx.ts, played when the card opens. */
  sound?: string
}

interface MomentStore {
  queue: Moment[]
  show(moment: Moment): void
  dismiss(): void
}

export const useMoments = create<MomentStore>((set) => ({
  queue: [],
  show: (moment) => set((s) => (s.queue.some((m) => m.id === moment.id) ? s : { queue: [...s.queue, moment] })),
  dismiss: () => set((s) => ({ queue: s.queue.slice(1) }))
}))
