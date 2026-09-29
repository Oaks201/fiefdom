import { create } from 'zustand'
import { todayISO, type ISODate } from '../lib/dates'

export type Page = 'chronicle' | 'contract' | 'archive'

interface UIState {
  page: Page
  /** the day shown in the Chronicle */
  date: ISODate
  /** contract opened from the Archive */
  archiveId: string | null
  profileOpen: boolean
  settingsOpen: boolean
  go(page: Page): void
  setDate(date: ISODate): void
  openArchive(id: string | null): void
  setProfileOpen(open: boolean): void
  setSettingsOpen(open: boolean): void
  /** jump to a day in the Chronicle from anywhere */
  showDay(date: ISODate): void
}

export const useUI = create<UIState>((set) => ({
  page: 'chronicle',
  date: todayISO(),
  archiveId: null,
  profileOpen: false,
  settingsOpen: false,
  go: (page) => set({ page }),
  setDate: (date) => set({ date }),
  openArchive: (archiveId) => set({ archiveId }),
  setProfileOpen: (profileOpen) => set({ profileOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
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
