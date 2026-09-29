import { create } from 'zustand'
import { todayISO, type ISODate } from '../lib/dates'

/** A single source of "today" that rolls over at midnight while the app stays open. */
export const useClock = create<{ today: ISODate }>(() => ({ today: todayISO() }))

export const useToday = (): ISODate => useClock((s) => s.today)

export function startClock(onRollover: (previous: ISODate, next: ISODate) => void): () => void {
  const tick = (): void => {
    const next = todayISO()
    const previous = useClock.getState().today
    if (next !== previous) {
      useClock.setState({ today: next })
      onRollover(previous, next)
    }
  }
  const id = setInterval(tick, 15_000)
  window.addEventListener('focus', tick)
  document.addEventListener('visibilitychange', tick)
  return () => {
    clearInterval(id)
    window.removeEventListener('focus', tick)
    document.removeEventListener('visibilitychange', tick)
  }
}
