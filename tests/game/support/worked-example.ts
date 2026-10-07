import { addDays } from '../../../src/renderer/src/lib/game/clock'
import type { DayRecord } from '../../../src/renderer/src/lib/game/types'

/** 2026-10-05 is a Monday; the game tests use weeks that start on Monday. */
export const MONDAY = '2026-10-05'

/** The Ch 4 worked example's terms: a 50,000 pool and a 2,000 kcal limit (Healer floor 1,550). */
export const TERMS = { stepPool: 50_000, calorieLimit: 2_000, floor: 1_550 }

/** `n` consecutive day records from `from`, every duty of 3 kept unless `make` says otherwise. */
export function days(n: number, from: string, make: (i: number) => Partial<DayRecord> = () => ({})): DayRecord[] {
  return Array.from({ length: n }, (_, i) => ({ date: addDays(from, i), dutiesKept: 3, dutiesSworn: 3, ...make(i) }))
}

/** The Ch 4 worked example (E-01): 46,000 of 50,000 steps; food 6 of 7 days averaging 1,950; 19 of 21 duties. */
export function workedExampleWeek(from = MONDAY): DayRecord[] {
  const eaten = [1_900, 2_000, 1_950, 1_950, 2_000, 1_900, undefined]
  const kept = [3, 3, 3, 3, 3, 2, 2]
  const steps = [7_000, 6_000, 7_000, 6_000, 7_000, 6_000, 7_000]
  return days(7, from, (i) => ({ steps: steps[i], eaten: eaten[i], dutiesKept: kept[i] }))
}
