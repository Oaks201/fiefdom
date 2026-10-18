/**
 * The Dawn tidings card (Patch 6, D-47; spec section 3): which campaign day it was last dismissed for,
 * and whether it shows at all. Both live in this computer's browser storage, as the portrait's seen
 * note does (C-79): neither is game state, and neither belongs in the health ledger. Every read and
 * write is guarded, so a failing store shows the card and breaks nothing.
 */
import { create } from 'zustand'
import type { ISODate } from '../lib/game/types'

const SEEN_KEY = 'fiefdom.dawnTidings.seen'
const OFF_KEY = 'fiefdom.dawnTidings.off'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Storage is unavailable: the card is remembered for this session only.
  }
}

export interface DawnTidingsCheck {
  /** The campaign's open day, or null without a campaign. */
  openDay: ISODate | null
  /** The day the card was last dismissed for. */
  seen: ISODate | null
  /** The Settings switch. */
  on: boolean
  /** The campaign can still be played (`isPlayable`). */
  playable: boolean
  /** Another card or dialog is open: the Homecoming, a big moment, the founding wizard, Settings, the guide. */
  blocked: boolean
}

/** Whether the card shows now (C-78): once per campaign day, never over another card. */
export function dawnTidingsDue(c: DawnTidingsCheck): boolean {
  return c.on && c.playable && !c.blocked && c.openDay !== null && c.seen !== c.openDay
}

interface DawnTidingsStore {
  seen: ISODate | null
  on: boolean
  /** Dismissed for `day`: it doesn't show again until the next campaign day. */
  dismiss(day: ISODate): void
  setOn(on: boolean): void
}

export const useDawnTidings = create<DawnTidingsStore>((set) => ({
  seen: read(SEEN_KEY),
  on: read(OFF_KEY) !== '1',
  dismiss(day) {
    write(SEEN_KEY, day)
    set({ seen: day })
  },
  setOn(on) {
    write(OFF_KEY, on ? null : '1')
    set({ on })
  }
}))
