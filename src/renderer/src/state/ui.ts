import { create } from 'zustand'
import { todayISO, type ISODate } from '../lib/dates'
import { appNow } from './clock'
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
  /** How to play (F1 or ?). */
  helpOpen: boolean
  /** The section How to play opens at (Patch 7, E8: a rule's ? opens its home), or null for the top. */
  helpSection: string | null
  /** The Grand Battle screen (T16): a route over the page, not a tab; `replay` plays a fought battle back. */
  battle: { id: string; replay: boolean } | null
  /** The day's skirmishes (D-12): a route like the battle's, at one of the day's fights (the next to play when null); `replay` plays a fought one back. */
  skirmish: { day: ISODate; fight: string | null; replay: boolean } | null
  /** The rival court Diplomacy shows first, and a hex to offer from it (T15: the hex panel's "buy"). */
  rivalFocus: { rival: RivalId; hexId?: string } | null
  go(page: Page): void
  setDate(date: ISODate): void
  openArchive(id: string | null): void
  setProfileOpen(open: boolean): void
  setSettingsOpen(open: boolean): void
  setFoundingOpen(open: boolean): void
  setHelpOpen(open: boolean): void
  /** Opens How to play at `section` (a guide section id). */
  openHelp(section: string): void
  openBattle(id: string, replay?: boolean): void
  closeBattle(): void
  openSkirmish(day: ISODate, fight?: string | null, replay?: boolean): void
  closeSkirmish(): void
  /** Opens Diplomacy at `rival`'s court, with `hexId` picked out in its deals. */
  goDiplomacy(rival: RivalId, hexId?: string): void
  setRivalFocus(focus: { rival: RivalId; hexId?: string } | null): void
  /** jump to a day in the Chronicle from anywhere */
  showDay(date: ISODate): void
}

export const useUI = create<UIState>((set) => ({
  page: 'chronicle',
  date: todayISO(appNow()),
  archiveId: null,
  profileOpen: false,
  settingsOpen: false,
  foundingOpen: false,
  helpOpen: false,
  helpSection: null,
  rivalFocus: null,
  battle: null,
  skirmish: null,
  go: (page) => set({ page, battle: null, skirmish: null }),
  openBattle: (id, replay = false) => set({ battle: { id, replay }, skirmish: null }),
  closeBattle: () => set({ battle: null }),
  openSkirmish: (day, fight = null, replay = false) => set({ skirmish: { day, fight, replay }, battle: null }),
  closeSkirmish: () => set({ skirmish: null }),
  setDate: (date) => set({ date }),
  openArchive: (archiveId) => set({ archiveId }),
  setProfileOpen: (profileOpen) => set({ profileOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setFoundingOpen: (foundingOpen) => set({ foundingOpen }),
  setHelpOpen: (helpOpen) => set({ helpOpen, helpSection: null }),
  openHelp: (helpSection) => set({ helpOpen: true, helpSection }),
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
