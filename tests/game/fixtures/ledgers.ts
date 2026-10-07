/**
 * Synthetic ledgers for the founding and settlement tests. Every builder returns a fresh v2
 * ledger with three duties (Read, Stretch, Water) and weeks starting on Monday.
 */
import { addDays, dayCloseInstant } from '../../../src/renderer/src/lib/game/clock'
import { createLedger } from '../../../src/renderer/src/lib/ledger'
import type { Charter } from '../../../src/renderer/src/lib/game/types'
import type { Contract, DayLog, Ledger } from '../../../src/renderer/src/lib/types'

export const TZ = 'America/Chicago'
/** 2026-10-07 15:00 in Chicago (CDT, UTC−5): a Wednesday afternoon. */
export const FOUNDED_AT = new Date('2026-10-07T20:00:00Z')
/** The first campaign day when founded at FOUNDED_AT: Thursday 2026-10-08. */
export const START = '2026-10-08'

export const HABITS = [
  { id: 'h-read', name: 'Read', createdOn: '2026-01-01' },
  { id: 'h-stretch', name: 'Stretch', createdOn: '2026-01-01' },
  { id: 'h-water', name: 'Water', createdOn: '2026-01-01' }
]

/** A 50,000 pool, 2,000 kcal and the three duties (by name, as the Charter stores them). */
export function charter(over: Partial<Charter> = {}): Charter {
  return { stepPool: 50_000, calorieLimit: 2_000, duties: ['Read', 'Stretch', 'Water'], ...over }
}

/** An empty ledger with the three duties. */
export function emptyLedger(): Ledger {
  return { ...createLedger(), habits: HABITS.map((h) => ({ ...h })) }
}

/** A day where everything is kept: 8,000 steps, 1,900 kcal logged, all three duties. */
export function goodDay(over: Partial<DayLog> = {}): DayLog {
  return { steps: 8_000, eaten: 1_900, done: { 'h-read': true, 'h-stretch': true, 'h-water': true }, ...over }
}

/** A ledger with `n` days from `from`, each built by `make` (a good day by default). */
export function ledgerWith(from: string, n: number, make: (i: number, date: string) => DayLog | undefined = () => goodDay()): Ledger {
  const ledger = emptyLedger()
  for (let i = 0; i < n; i++) {
    const date = addDays(from, i)
    const day = make(i, date)
    if (day) ledger.days[date] = day
  }
  return ledger
}

/** A steady loser: good days with a weigh-in every Monday and Thursday, 0.8 lb a week down from 217. */
export function steadyLedger(from: string, n: number): Ledger {
  return ledgerWith(from, n, (i, date) => {
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
    const weighIn = weekday === 1 || weekday === 4 ? { weight: Math.round((217 - (0.8 * i) / 7) * 10) / 10 } : {}
    return goodDay({ steps: 7_000 + ((i * 37) % 3_000), ...weighIn })
  })
}

/** The same ledger with one day changed. Never mutates the original. */
export function withDay(ledger: Ledger, date: string, change: (day: DayLog) => DayLog): Ledger {
  const day = ledger.days[date] ?? { done: {} }
  return { ...ledger, days: { ...ledger.days, [date]: change({ ...day, done: { ...day.done } }) } }
}

/** A legacy weekly contract that has not been closed with its weigh-in (A-07). */
export function openLegacyContract(start: string): Contract {
  return {
    id: 'legacy-1',
    kind: 'common',
    startDate: start,
    endDate: addDays(start, 6),
    stepsGoal: 8_000,
    calorieRule: 'limit',
    caloriesGoal: 2_000,
    startWeight: 217,
    unit: 'lb',
    sealedAt: `${start}T12:00:00.000Z`
  }
}

/** The instant `minutes` after 04:00 on `day` in Chicago: just after the previous day closed. */
export function chicago(day: string, minutes = 1): Date {
  return new Date(dayCloseInstant(addDays(day, -1), TZ).getTime() + minutes * 60_000)
}
