/**
 * Reputation is never stored — it is recalculated from the ledger, so editing a past day
 * simply re-tells history. Everything a player can earn (or stake) is listed here.
 */
import { addDays, type ISODate } from './dates'
import { calorieMetricOf, caloriesKept, contractsRep, CONTRACT_REP, overLimit, stepsKept } from './contracts'
import { activeHabits, contractOn, dayLog } from './ledger'
import type { Contract, Ledger } from './types'

export const DAY_REP = {
  steps: CONTRACT_REP.stepsDay,
  calories: CONTRACT_REP.caloriesDay,
  duty: 4,
  perfect: 5,
  /** each consecutive perfect day before this one adds +1, up to +10 */
  streakStep: 1,
  streakCap: 10
} as const

export interface RepLine {
  key: string
  label: string
  amount: number
}

export interface DayRep {
  date: ISODate
  lines: RepLine[]
  total: number
  contract?: Contract
  stepsMet: boolean | null
  caloriesMet: boolean | null
  /** ate past the contract's calorie limit */
  caloriesOver: boolean
  dutiesTotal: number
  dutiesDone: number
  /** there was something to do this day (a contract or at least one duty) */
  applicable: boolean
  perfect: boolean
  /** length of the perfect-day streak ending on this date (0 when not perfect) */
  streak: number
}

export function evaluateDay(ledger: Ledger, date: ISODate, prevStreak: number): DayRep {
  const contract = contractOn(ledger, date)
  const log = dayLog(ledger, date)
  const habits = activeHabits(ledger, date)
  const dutiesDone = habits.filter((h) => log.done[h.id]).length
  const calories = contract ? log[calorieMetricOf(contract)] : undefined
  const stepsMet = contract ? stepsKept(contract, log.steps) : null
  const caloriesMet = contract ? caloriesKept(contract, calories) : null
  const applicable = !!contract || habits.length > 0
  const perfect = applicable && stepsMet !== false && caloriesMet !== false && dutiesDone === habits.length

  const lines: RepLine[] = []
  if (stepsMet) lines.push({ key: 'steps', label: 'Steps goal met', amount: DAY_REP.steps })
  if (caloriesMet && contract)
    lines.push({
      key: 'calories',
      label: contract.calorieRule === 'limit' ? 'Within the calorie limit' : 'Calories goal met',
      amount: DAY_REP.calories
    })
  if (dutiesDone > 0)
    lines.push({
      key: 'duties',
      label: dutiesDone === 1 ? '1 duty kept' : `${dutiesDone} duties kept`,
      amount: dutiesDone * DAY_REP.duty
    })
  const streak = perfect ? prevStreak + 1 : 0
  if (perfect) {
    lines.push({ key: 'perfect', label: 'A perfect day', amount: DAY_REP.perfect })
    const bonus = Math.min(prevStreak * DAY_REP.streakStep, DAY_REP.streakCap)
    if (bonus > 0) lines.push({ key: 'streak', label: `Streak, day ${streak}`, amount: bonus })
  }
  return {
    date,
    lines,
    total: lines.reduce((s, l) => s + l.amount, 0),
    contract,
    stepsMet,
    caloriesMet,
    caloriesOver: contract ? overLimit(contract, calories) : false,
    dutiesTotal: habits.length,
    dutiesDone,
    applicable,
    perfect,
    streak
  }
}

export interface RepSummary {
  total: number
  fromDays: number
  /** bonuses and wager returns, less the reputation staked on wagers */
  fromContracts: number
  days: Map<ISODate, DayRep>
  currentStreak: number
  bestStreak: number
  firstDate: ISODate | null
}

/** The first date anything could have earned reputation. */
export function firstRelevantDate(ledger: Ledger): ISODate | null {
  let first: ISODate | null = null
  const consider = (d: ISODate): void => {
    if (first === null || d < first) first = d
  }
  ledger.habits.forEach((h) => consider(h.createdOn))
  ledger.contracts.forEach((c) => {
    if (!c.burnedAt) consider(c.startDate)
  })
  Object.keys(ledger.days).forEach(consider)
  return first
}

export function computeReputation(ledger: Ledger, today: ISODate): RepSummary {
  const days = new Map<ISODate, DayRep>()
  const first = firstRelevantDate(ledger)
  let fromDays = 0
  let streak = 0
  let best = 0

  if (first !== null && first <= today) {
    for (let date = first; date <= today; date = addDays(date, 1)) {
      const rep = evaluateDay(ledger, date, streak)
      days.set(date, rep)
      fromDays += rep.total
      streak = rep.streak
      best = Math.max(best, streak)
    }
  }

  const fromContracts = contractsRep(ledger, today)

  // An unfinished today doesn't break the streak — it just hasn't joined it yet.
  const todayRep = days.get(today)
  const yesterdayRep = days.get(addDays(today, -1))
  const currentStreak = todayRep?.perfect ? todayRep.streak : (yesterdayRep?.streak ?? 0)

  return {
    total: fromDays + fromContracts,
    fromDays,
    fromContracts,
    days,
    currentStreak,
    bestStreak: best,
    firstDate: first
  }
}

/** Reputation for any date, including ones outside the computed range. */
export function dayRepFor(summary: RepSummary, ledger: Ledger, date: ISODate): DayRep {
  return summary.days.get(date) ?? evaluateDay(ledger, date, 0)
}

/** How many of the day's goals were met, out of how many there were. */
export function dayProgress(rep: DayRep): { met: number; total: number } {
  const total = (rep.contract ? 2 : 0) + rep.dutiesTotal
  const met = (rep.stepsMet ? 1 : 0) + (rep.caloriesMet ? 1 : 0) + rep.dutiesDone
  return { met, total }
}
