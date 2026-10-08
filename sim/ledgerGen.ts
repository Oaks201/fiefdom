/**
 * The synthetic ledger (T13; Ch 15 "How to simulate" step 1): a seeded profile turned into days of
 * steps, food logged with its calories, duties kept, and weigh-ins on Mondays and Thursdays along
 * the profile's weight trend with ±1.5 lb of weekly noise and one 3-week plateau every 12 weeks.
 * Rough weeks (1 in N) drop every kind of adherence by more than half for 7 days.
 *
 * Every draw goes through the game's own seeded `rng` (labels `sim:…`), so the same seed always
 * gives the same ledger.
 */
import { addDays, campaignWeek } from '../src/renderer/src/lib/game/clock'
import { chance, roll } from '../src/renderer/src/lib/game/rng'
import type { ISODate } from '../src/renderer/src/lib/game/types'
import { createLedger } from '../src/renderer/src/lib/ledger'
import type { DayLog, Ledger } from '../src/renderer/src/lib/types'
import { JOURNEY, PLATEAU, ROUGH_SHARE, WEIGHT_NOISE_LB, type Profile } from './profiles'

/** The campaign's founding and first day, and the days before it the Healer reads (A-125). */
export const FOUNDED_AT = new Date('2026-10-07T20:00:00Z')
export const START: ISODate = '2026-10-08'
export const TZ = 'America/Chicago'
export const LEAD_DAYS = 28

export const HABITS = JOURNEY.duties.map((name, i) => ({ id: `h-${i + 1}`, name, createdOn: '2026-01-01' }))

/** The campaign week a day falls in (weeks start on Monday, as the ledger's settings say). */
function weekOfDay(day: ISODate): number {
  return day < START ? 0 : campaignWeek(START, day, 1)
}

/** Whether campaign week `week` is one of the profile's rough weeks (seeded per week). */
export function isRoughWeek(profile: Profile, seed: number, week: number): boolean {
  return profile.roughEvery !== null && week > 0 && chance(seed, START, `sim:rough:${week}`, 1 / profile.roughEvery)
}

/** Whether `day` falls in a rough week. */
export function isRoughDay(profile: Profile, seed: number, day: ISODate): boolean {
  return isRoughWeek(profile, seed, weekOfDay(day))
}

/** The weight trend's lb lost by the start of campaign week `week`, plateaus included. */
function lostByWeek(profile: Profile, seed: number, week: number): number {
  let lost = 0
  for (let w = 1; w < week; w++) {
    const plateau = (w - 1) % PLATEAU.everyWeeks >= PLATEAU.everyWeeks - PLATEAU.weeks
    const longPlateau = profile.plateauFromWeek !== undefined && w >= profile.plateauFromWeek
    if (!plateau && !longPlateau) lost += profile.lbPerWeek
  }
  return lost + roll(seed, START, `sim:weightNoise:${week}`, -WEIGHT_NOISE_LB, WEIGHT_NOISE_LB)
}

/** One ledger day for the profile. */
export function dayFor(profile: Profile, seed: number, day: ISODate): DayLog {
  const rough = isRoughDay(profile, seed, day)
  const share = (p: number): number => (rough ? p * ROUGH_SHARE : p)
  const done: Record<string, true> = {}
  for (const h of HABITS) if (chance(seed, day, `sim:duty:${h.id}`, share(profile.duties))) done[h.id] = true
  const steps = Math.round((JOURNEY.stepPool / 7) * share(profile.steps) * roll(seed, day, 'sim:steps', 0.75, 1.25))
  const out: DayLog = { steps, done }
  if (chance(seed, day, 'sim:food', share(profile.food))) out.eaten = Math.round(JOURNEY.calorieLimit * profile.calories * roll(seed, day, 'sim:kcal', 0.96, 1.04))
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay()
  if (weekday === 1 || weekday === 4) out.weight = Math.round((JOURNEY.startLb - lostByWeek(profile, seed, weekOfDay(day))) * 10) / 10
  return out
}

/** A ledger from 28 days before the start through `days` campaign days and a week beyond. */
export function ledgerFor(profile: Profile, seed: number, days: number): Ledger {
  const ledger: Ledger = { ...createLedger(), habits: HABITS.map((h) => ({ ...h })) }
  ledger.settings = { ...ledger.settings, sound: { music: false, musicVolume: 0, effects: false, effectsVolume: 0 } }
  const from = addDays(START, -LEAD_DAYS)
  for (let i = 0; i < days + LEAD_DAYS + 7; i++) {
    const day = addDays(from, i)
    ledger.days[day] = dayFor(profile, seed, day)
  }
  return ledger
}
