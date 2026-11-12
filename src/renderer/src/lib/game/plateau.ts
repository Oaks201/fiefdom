/**
 * Rules 3.14.0 (D-68, D-77, B1): the plateau siege. When the weekly readings stall, `stallReadings` in a row
 * after the campaign's low with none below it, a siege on the plateau begins. While it stands, each day kept
 * well (a day score of `wearDayScore` or more: duties, food logged and steps) adds a day of wear, and so does a
 * rest day (D-54); wear never fades, and it waits while the player is away. The first reading below the low
 * breaks it, paying `perWear` reputation a day of wear, at most `maxReward`, at the close of that weigh-in's
 * day: the payment comes from the days kept, never from how much was lost. A too-fast trend makes the break
 * wait (A-43). A regain only lengthens the siege; a new one needs a new low, which is real progress.
 *
 * Pure: settle.ts hands it the readings and the day.
 */
import { RULES } from './rules'
import type { ISODate, PlateauSiege, WeighIn } from './types'

const P = RULES.plateauSiege

/** The low `readings` stalled on: the first lowest reading, once `stallReadings` readings after it have none below it; else null. */
export function stalledLow(readings: readonly WeighIn[]): WeighIn | null {
  if (readings.length === 0) return null
  let low = 0
  for (let i = 1; i < readings.length; i++) if (readings[i].weight < readings[low].weight) low = i
  return readings.length - 1 - low >= P.stallReadings ? readings[low] : null
}

/** Whether a day wears the plateau: a rest day, or a day kept well. */
export function wearsOn(rest: boolean, dayScore: number): boolean {
  return rest || dayScore >= P.wearDayScore
}

/** What breaking a siege of `wear` days pays, before the reputation bonus. */
export function siegeReward(wear: number): number {
  return Math.min(P.maxReward, P.perWear * Math.max(0, wear))
}

export interface PlateauWeek {
  /** The siege standing after this weight week, if one does. */
  siege?: PlateauSiege
  begun?: true
  /** It broke this week, with the wear it had and what that pays before the bonus. */
  broken?: { wear: number; reward: number }
  /** A reading below the low came while the trend was too fast: the break waits (A-43). */
  waiting?: true
}

/**
 * The siege at the weight week settled on `day`: a standing one broken by `reading` (the week's own) below its
 * low, unless `tooFast`; else, with none standing, one begun when the campaign's readings through `day` stall.
 */
export function plateauWeek(siege: PlateauSiege | undefined, readings: readonly WeighIn[], reading: WeighIn | undefined, day: ISODate, tooFast: boolean): PlateauWeek {
  if (siege) {
    if (!reading || reading.weight >= siege.low) return { siege }
    if (tooFast) return { siege, waiting: true }
    return { broken: { wear: siege.wear, reward: siegeReward(siege.wear) } }
  }
  const low = stalledLow(readings)
  return low ? { siege: { low: low.weight, lowOn: low.date, begunOn: day, wear: 0 }, begun: true } : {}
}
