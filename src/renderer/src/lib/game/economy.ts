/**
 * Behavior income and the purse (Ch 5 "Where reputation comes from" and "The purse").
 *
 * Income functions return unrounded `PurseLine`s, each naming its source; `post` rounds each one
 * to 0.1 as it enters the purse (A-11). The purse is an explicit event ledger: its balance is the
 * sum of its events, and it never goes below zero.
 */
import { CampaignError } from './errors'
import { RULES, byTier } from './rules'
import type { ISODate, PurseEvent, PurseEventKind, PurseLine, PurseState } from './types'

// ── Behavior income ──────────────────────────────────────────────────────────

/** The Merchant Hall's reputation bonus at a tier (+2% at I to +15% at V). */
export function merchantHallBonus(tier: number): number {
  return byTier(RULES.reputation.merchantHallBonus, tier)
}

/** A gain with the reputation bonus applied. `bonus` is the realm's total rate from effects (A-31). */
export function withBonus(amount: number, bonus: number): number {
  return amount * (1 + bonus)
}

export interface DayBehavior {
  dutiesKept: number
  dutiesSworn: number
  foodLogged: boolean
  /** Perfect days in a row just before this one. */
  priorStreak: number
}

export interface DailyIncome {
  lines: PurseLine[]
  perfect: boolean
  /** The perfect-day streak ending on this day (0 when it is not perfect). */
  streak: number
}

/**
 * The day's reputation: duties 12 × share kept; a perfect day (every duty kept and food logged)
 * +5; and on a perfect day the streak, +1 per perfect day in a row before it, up to +7.
 */
export function dailyIncome(day: DayBehavior, bonus: number): DailyIncome {
  const rules = RULES.reputation.daily
  const share = day.dutiesSworn > 0 ? Math.min(day.dutiesKept, day.dutiesSworn) / day.dutiesSworn : 0
  const perfect = day.dutiesSworn > 0 && day.dutiesKept >= day.dutiesSworn && day.foodLogged
  const lines: PurseLine[] = []
  const earn = (source: string, amount: number): void => {
    if (amount > 0) lines.push({ kind: 'earn', source, amount: withBonus(amount, bonus) })
  }
  earn('duties', rules.duties * share)
  if (perfect) {
    earn('perfectDay', rules.perfectDay)
    earn('streak', Math.min(rules.streakCap, rules.streakPerDay * day.priorStreak))
  }
  return { lines, perfect, streak: perfect ? day.priorStreak + 1 : 0 }
}

export interface WeekBehavior {
  /** The week's pillars S_w, T_w and D_w, each 0 to 1. */
  steps: number
  table: number
  duties: number
  /** Momentum M, 0 to 1 (from T05). */
  momentum: number
  /** Days in the week: 7, or fewer in a partial week 1 (A-04). */
  days: number
}

/** The share of a full week's amount that a week of `days` days pays (A-04). */
export function weekShare(days: number): number {
  return Math.min(1, days / RULES.clock.daysPerWeek)
}

/**
 * The week's reputation: steps 70 × share of the pool (capped at 70), calories 70 × T_w, a
 * flawless week +50 (all three pillars at 100%), and Momentum 60 × M. All prorate in a partial
 * week 1.
 */
export function weeklyIncome(week: WeekBehavior, bonus: number): PurseLine[] {
  const rules = RULES.reputation.weekly
  const share = weekShare(week.days)
  const lines: PurseLine[] = []
  const earn = (source: string, amount: number): void => {
    if (amount > 0) lines.push({ kind: 'earn', source, amount: withBonus(amount * share, bonus) })
  }
  earn('steps', rules.steps * Math.min(1, week.steps))
  earn('calories', rules.calories * Math.min(1, week.table))
  if (week.steps >= 1 && week.table >= 1 && week.duties >= 1) earn('flawless', rules.flawless)
  earn('momentum', rules.momentum * Math.min(1, Math.max(0, week.momentum)))
  return lines
}

export interface VillageHeld {
  hexId: string
  ring: number
  /** Settling after a conquest: half tithes (Ch 6). */
  settling?: boolean
  /** Scorched at any point this week: no tithe (Ch 10). */
  scorched?: boolean
}

/**
 * Tithes, 4 × ring per village held, one line per village. A Settling village pays half and a
 * scorched one nothing. `mult` is the tithe multiplier from effects; tithes prorate in week 1.
 */
export function tithes(villages: readonly VillageHeld[], mult: number, bonus: number, days: number): PurseLine[] {
  const share = weekShare(days)
  return villages.flatMap((v) => {
    if (v.scorched) return []
    const settling = v.settling ? RULES.land.settling.titheShare : 1
    const amount = RULES.reputation.weekly.tithePerRing * v.ring * settling * mult * share
    return amount > 0 ? [{ kind: 'tithe' as const, source: `tithe:${v.hexId}`, amount: withBonus(amount, bonus) }] : []
  })
}

// ── The purse ────────────────────────────────────────────────────────────────

/** Gains are positive and losses negative; `adjust` may be either. */
const SIGN: Record<PurseEventKind, 1 | -1 | 0> = {
  earn: 1,
  return: 1,
  spoils: 1,
  tithe: 1,
  pledge: -1,
  spend: -1,
  tribute: -1,
  adjust: 0
}

/** Rounds to the purse's posting precision (0.1), symmetric about zero (A-11). */
export function roundPosting(amount: number): number {
  const steps = 1 / RULES.reputation.rounding
  const rounded = (Math.sign(amount) * Math.round(Math.abs(amount) * steps)) / steps
  return rounded === 0 ? 0 : rounded
}

/** The exact balance: the sum of every event. */
export function balance(purse: PurseState): number {
  return roundPosting(purse.events.reduce((sum, e) => sum + e.amount, 0))
}

/** The balance as the player sees it: a whole number, rounded down (A-11). */
export function displayBalance(purse: PurseState): number {
  return Math.floor(balance(purse))
}

export interface Posting {
  date: ISODate
  kind: PurseEventKind
  /** The size of the gain or loss. For `adjust`, its signed value. */
  amount: number
  source: string
  /** Defaults to the next sequential id. */
  id?: string
}

/**
 * Posts one event, rounded to 0.1 and signed by its kind. Refuses anything that would take the
 * balance below zero: a `spend` or `pledge` the purse can't cover, or a negative `adjust` larger
 * than the balance. `tribute` takes only what the purse holds. A posting that rounds to zero
 * leaves the purse unchanged.
 */
export function post(purse: PurseState, p: Posting): PurseState {
  if (!p.source) throw new CampaignError('Every purse event needs a source.')
  const sign = SIGN[p.kind]
  let amount = sign === 0 ? roundPosting(p.amount) : sign * roundPosting(Math.abs(p.amount))
  const held = balance(purse)
  if (amount < 0 && -amount > held) {
    if (p.kind !== 'tribute') throw new CampaignError(`The purse holds ${held}; ${-amount} is needed.`)
    amount = -held
  }
  if (amount === 0) return purse
  const event: PurseEvent = { id: p.id ?? `pe-${purse.events.length + 1}`, date: p.date, kind: p.kind, amount, source: p.source }
  return { events: [...purse.events, event] }
}

/** Posts every line in order on `date`. */
export function postAll(purse: PurseState, date: ISODate, lines: readonly PurseLine[]): PurseState {
  return lines.reduce((acc, line) => post(acc, { date, ...line }), purse)
}

/** A spend the purse must cover in full; refused when the exact balance is short (A-11). */
export function spend(purse: PurseState, date: ISODate, amount: number, source: string): PurseState {
  return post(purse, { date, kind: 'spend', amount, source })
}

/** Tribute takes at most the balance (Ch 5 rule 2). */
export function tribute(purse: PurseState, date: ISODate, amount: number, source: string): PurseState {
  return post(purse, { date, kind: 'tribute', amount, source })
}

/** A new campaign's purse: the founding grant of 100. */
export function foundingPurse(date: ISODate): PurseState {
  return post({ events: [] }, { date, kind: 'earn', amount: RULES.clock.foundingGrant, source: 'founding' })
}
