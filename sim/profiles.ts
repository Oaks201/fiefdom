/**
 * The simulator's behavior profiles (T13; version 1's Ch 11 profiles, extended by v2 Ch 15 with a
 * weight trend). Each is a player's habits as a few shares; the ledger generator turns them into
 * days. The "4-week score" is the book's estimate of what the profile scores; the report compares
 * it with what the engine actually measures.
 */

export type ProfileId = 'perfect' | 'steadfast' | 'steadfastPlateau' | 'committed' | 'wavering' | 'casual'

export interface Profile {
  id: ProfileId
  name: string
  /** Share of the sworn duties kept on a normal day. */
  duties: number
  /** A typical week's steps against the step pool (1.04 = 104%). */
  steps: number
  /** Share of days with food logged. */
  food: number
  /** A logged day's calories against the limit, on average (1.02 = 2% over). */
  calories: number
  /** One rough week in this many (adherence drops by more than half for 7 days), or none. */
  roughEvery: number | null
  /** The book's 4-week score for the profile. */
  bookScore: number
  /** The weight trend, lb a week. */
  lbPerWeek: number
  /** The long plateau: no loss at all from this campaign week on. */
  plateauFromWeek?: number
}

export const PROFILES: readonly Profile[] = [
  { id: 'perfect', name: 'Perfect', duties: 1, steps: 1.2, food: 1, calories: 0.95, roughEvery: null, bookScore: 1, lbPerWeek: 0.8 },
  { id: 'steadfast', name: 'Steadfast', duties: 0.93, steps: 1.04, food: 0.96, calories: 1.01, roughEvery: 12, bookScore: 0.89, lbPerWeek: 0.8 },
  { id: 'steadfastPlateau', name: 'Steadfast, long plateau', duties: 0.93, steps: 1.04, food: 0.96, calories: 1.01, roughEvery: 12, bookScore: 0.89, lbPerWeek: 0.8, plateauFromWeek: 9 },
  { id: 'committed', name: 'Committed', duties: 0.85, steps: 0.97, food: 0.9, calories: 1.02, roughEvery: 9, bookScore: 0.79, lbPerWeek: 0.6 },
  { id: 'wavering', name: 'Wavering', duties: 0.72, steps: 0.87, food: 0.8, calories: 1.04, roughEvery: 7, bookScore: 0.65, lbPerWeek: 0.4 },
  { id: 'casual', name: 'Casual', duties: 0.55, steps: 0.72, food: 0.65, calories: 1.06, roughEvery: 6, bookScore: 0.48, lbPerWeek: 0.2 }
]

export function profileOf(id: ProfileId): Profile {
  const p = PROFILES.find((x) => x.id === id)
  if (!p) throw new Error(`No profile ${id}`)
  return p
}

/** In a rough week each kind of adherence falls to this share of normal ("drops by more than half"). */
export const ROUGH_SHARE = 0.4

/** Weight noise: up to this many lb either way, drawn each week (Ch 15). */
export const WEIGHT_NOISE_LB = 1.5

/** One 3-week plateau every 12 weeks (Ch 15). */
export const PLATEAU = { everyWeeks: 12, weeks: 3 }

/** Rich's journey and Charter (Ch 15 "Behavior profiles"). */
export const JOURNEY = { startLb: 217, goalLb: 168, stepPool: 50_000, calorieLimit: 2_000, duties: ['Read', 'Stretch', 'Water'] }
