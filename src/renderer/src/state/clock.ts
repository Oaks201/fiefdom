import { create } from 'zustand'
import { todayISO, type ISODate } from '../lib/dates'

let devOffsetMs = 0

/**
 * The app's "now": the real time, or in development the time-travel override (A-09). The ledger's
 * calendar and the campaign's clock both read it, so moving it moves the whole app.
 */
export function appNow(): Date {
  const real = new Date()
  if (!import.meta.env.DEV) return real
  const fixed = import.meta.env.FIEFDOM_DEV_NOW ? new Date(import.meta.env.FIEFDOM_DEV_NOW) : null
  const base = fixed && !Number.isNaN(fixed.getTime()) ? fixed : real
  return new Date(base.getTime() + devOffsetMs)
}

/** Re-renders what reads "now" when dev time travel moves it (A-09). */
export const useDevClock = create<{ offsetMs: number }>(() => ({ offsetMs: 0 }))

/** A single source of "today" that rolls over at midnight while the app stays open. */
export const useClock = create<{ today: ISODate }>(() => ({ today: todayISO(appNow()) }))

export const useToday = (): ISODate => useClock((s) => s.today)

let rollover: ((previous: ISODate, next: ISODate) => void) | null = null

/** Re-reads today and, when the date has changed, rolls the calendar over. */
function tick(): void {
  const next = todayISO(appNow())
  const previous = useClock.getState().today
  if (next !== previous) {
    useClock.setState({ today: next })
    rollover?.(previous, next)
  }
}

export function startClock(onRollover: (previous: ISODate, next: ISODate) => void): () => void {
  rollover = onRollover
  tick()
  const id = setInterval(tick, 15_000)
  window.addEventListener('focus', tick)
  document.addEventListener('visibilitychange', tick)
  return () => {
    rollover = null
    clearInterval(id)
    window.removeEventListener('focus', tick)
    document.removeEventListener('visibilitychange', tick)
  }
}

/** Development only (A-09): moves "now" by `ms` and rolls the calendar to match. A no-op in production. */
export function devShiftNow(ms: number): void {
  if (!import.meta.env.DEV) return
  devOffsetMs += ms
  useDevClock.setState({ offsetMs: devOffsetMs })
  tick()
}
