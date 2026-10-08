import { create } from 'zustand'
import { todayISO, type ISODate } from '../lib/dates'
import type { RivalId } from '../lib/game/types'

/** The pages; the Realm, Diplomacy and Armory appear only once a campaign is founded (T14). */
export type Page = 'chronicle' | 'contract' | 'archive' | 'realm' | 'diplomacy' | 'armory'

interface UIState {
  page: Page
  /** the day shown in the Chronicle */
  date: ISODate
  /** contract opened from the Archive */
  archiveId: string | null
  profileOpen: boolean
  settingsOpen: boolean
  /** The founding wizard (T14). */
  foundingOpen: boolean
  /** The rival court Diplomacy shows first, and a hex to offer from it (T15: the hex panel's "buy"). */
  rivalFocus: { rival: RivalId; hexId?: string } | null
  go(page: Page): void
  setDate(date: ISODate): void
  openArchive(id: string | null): void
  setProfileOpen(open: boolean): void
  setSettingsOpen(open: boolean): void
  setFoundingOpen(open: boolean): void
  /** Opens Diplomacy at `rival`'s court, with `hexId` picked out in its deals. */
  goDiplomacy(rival: RivalId, hexId?: string): void
  setRivalFocus(focus: { rival: RivalId; hexId?: string } | null): void
  /** jump to a day in the Chronicle from anywhere */
  showDay(date: ISODate): void
}

export const useUI = create<UIState>((set) => ({
  page: 'chronicle',
  date: todayISO(),
  archiveId: null,
  profileOpen: false,
  settingsOpen: false,
  foundingOpen: false,
  rivalFocus: null,
  go: (page) => set({ page }),
  setDate: (date) => set({ date }),
  openArchive: (archiveId) => set({ archiveId }),
  setProfileOpen: (profileOpen) => set({ profileOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setFoundingOpen: (foundingOpen) => set({ foundingOpen }),
  goDiplomacy: (rival, hexId) => set({ page: 'diplomacy', rivalFocus: { rival, ...(hexId ? { hexId } : {}) } }),
  setRivalFocus: (rivalFocus) => set({ rivalFocus }),
  showDay: (date) => set({ page: 'chronicle', date, archiveId: null })
}))

/** True while any dialog is open — page shortcuts stand down. */
export function isDialogOpen(): boolean {
  return document.querySelector('.modal-backdrop') !== null
}

/** True when the keyboard event is aimed at a text field. */
export function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null
  if (!t) return false
  return t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT'
}
