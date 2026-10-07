/**
 * Reading the ledger (Appendix A: "there is no import step"). Settlement copies each closed day's
 * inputs into a `DaySnapshot` (A-02) and every score, income line and weight rule reads those
 * snapshots, never the ledger itself. The ledger stays the source of truth for health data, and
 * nothing here ever changes it.
 */
import { dayLog } from '../ledger'
import type { Habit, Ledger } from '../types'
import { toLb } from './weight'
import type { Charter, DayRecord, DaySnapshot, HealerDay, ISODate, WeighIn } from './types'

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/** The ledger habit a sworn duty names: by habit id first, then by name. */
export function habitForDuty(habits: readonly Habit[], duty: string): Habit | undefined {
  return habits.find((h) => h.id === duty) ?? habits.find((h) => sameName(h.name, duty))
}

/** How many of the Charter's duties the ledger marks done on `date`. */
export function dutiesKept(ledger: Ledger, date: ISODate, charter: Charter): number {
  const done = dayLog(ledger, date).done
  return charter.duties.filter((duty) => {
    const habit = habitForDuty(ledger.habits, duty)
    return habit !== undefined && done[habit.id] === true
  }).length
}

/**
 * The day's inputs as settlement reads them: steps, food logged, duties kept and sworn under
 * `charter`, the weigh-in in lb and Fitbit's total burned. `streak` and `paid` are settlement's
 * own and start empty.
 */
export function snapshotDay(ledger: Ledger, date: ISODate, charter: Charter): DaySnapshot {
  const day = dayLog(ledger, date)
  const snapshot: DaySnapshot = {
    date,
    dutiesKept: dutiesKept(ledger, date, charter),
    dutiesSworn: charter.duties.length,
    streak: 0
  }
  if (day.steps !== undefined) snapshot.steps = day.steps
  if (day.eaten !== undefined) snapshot.eaten = day.eaten
  if (day.weight !== undefined) snapshot.weightLb = toLb(day.weight, ledger.settings.unit)
  if (day.burned !== undefined) snapshot.burned = day.burned
  return snapshot
}

/** True when two snapshots hold the same ledger inputs (settlement's own fields are ignored). */
export function sameInputs(a: DaySnapshot, b: DaySnapshot): boolean {
  return (
    a.date === b.date &&
    a.steps === b.steps &&
    a.eaten === b.eaten &&
    a.dutiesKept === b.dutiesKept &&
    a.dutiesSworn === b.dutiesSworn &&
    a.weightLb === b.weightLb &&
    a.burned === b.burned
  )
}

/** A snapshot as the score rules read it (T04). */
export function toDayRecord(s: DaySnapshot): DayRecord {
  return {
    date: s.date,
    dutiesKept: s.dutiesKept,
    dutiesSworn: s.dutiesSworn,
    ...(s.steps !== undefined ? { steps: s.steps } : {}),
    ...(s.eaten !== undefined ? { eaten: s.eaten } : {})
  }
}

/** A snapshot as the Healer reads it (T05). */
export function toHealerDay(s: DaySnapshot): HealerDay {
  return {
    date: s.date,
    ...(s.eaten !== undefined ? { eaten: s.eaten } : {}),
    ...(s.burned !== undefined ? { burned: s.burned } : {})
  }
}

/** The snapshots' weigh-ins in lb, oldest first (T05 reads weights in lb). */
export function weighInsOf(snapshots: readonly DaySnapshot[]): WeighIn[] {
  return snapshots
    .filter((s) => s.weightLb !== undefined)
    .map((s) => ({ date: s.date, weight: s.weightLb as number }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** Snapshots from `from` through `to`, both included, oldest first. */
export function snapshotsBetween(snapshots: readonly DaySnapshot[], from: ISODate, to: ISODate): DaySnapshot[] {
  return snapshots.filter((s) => s.date >= from && s.date <= to)
}
