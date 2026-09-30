import {
  MONTHS,
  daysInRange,
  diffDays,
  formatRange,
  formatShort,
  parts,
  WEEKDAYS,
  weekday,
  type ISODate
} from './dates'
import { contractOn, dayLog } from './ledger'
import type { Contract, DayLog, Ledger, Metric, SwornDuty } from './types'

export type ContractStatus = 'upcoming' | 'active' | 'awaiting' | 'closed' | 'burned'
export type ContractGrade = 'gilded' | 'honored' | 'wanting'

export const CONTRACT_REP = {
  stepsDay: 10,
  caloriesDay: 10,
  /** common contracts: closing with a final weigh-in */
  honored: 25,
  /** common contracts: every term kept, every day */
  flawless: 50
} as const

/** What a wager repays at the weigh-in, as a multiple of its stake. A burned wager repays nothing. */
export const WAGER_RETURN: Record<ContractGrade, number> = { gilded: 3, honored: 2, wanting: 0.5 }

/** Share of a week's goals that must be met for the contract to count as honored. */
export const HONORED_SHARE = 0.7

export function wagerReturn(stake: number, grade: ContractGrade): number {
  return Math.floor(stake * WAGER_RETURN[grade])
}

export function contractStatus(c: Contract, today: ISODate): ContractStatus {
  if (c.burnedAt) return 'burned'
  if (c.closedAt) return 'closed'
  if (today < c.startDate) return 'upcoming'
  if (today <= c.endDate) return 'active'
  return 'awaiting'
}

// ---------------------------------------------------------------------------
// Calories: a limit on what is eaten (or, for older contracts, a floor on what is burned)
// ---------------------------------------------------------------------------

/** Which number a contract judges calories by. */
export function calorieMetricOf(c: Contract): Metric {
  return c.calorieRule === 'limit' ? 'eaten' : 'calories'
}

/** The calorie tally the Chronicle keeps on a day: calories eaten, unless the day's contract still counts calories burned. */
export function calorieMetricFor(ledger: Ledger, date: ISODate): Metric {
  const c = contractOn(ledger, date)
  return c ? calorieMetricOf(c) : 'eaten'
}

export function stepsKept(c: Contract, steps: number | undefined): boolean {
  return (steps ?? 0) >= c.stepsGoal
}

/**
 * Under a limit, a day counts only once its calories are recorded and they fall within the range —
 * going over (or, when a minimum is set, under) earns no stamp.
 */
export function caloriesKept(c: Contract, value: number | undefined): boolean {
  if (c.calorieRule === 'burn') return (value ?? 0) >= c.caloriesGoal
  if (value === undefined) return false
  return value <= c.caloriesGoal && (c.caloriesMin === undefined || value >= c.caloriesMin)
}

export function overLimit(c: Contract, value: number | undefined): boolean {
  return c.calorieRule === 'limit' && value !== undefined && value > c.caloriesGoal
}

export function calorieValue(c: Contract, log: DayLog): number | undefined {
  return log[calorieMetricOf(c)]
}

/** "no more than 2,000" / "between 1,600 and 2,000" / "at least 500 (burned)" — for compact labels. */
export function calorieTermShort(c: Contract): string {
  const n = (v: number): string => v.toLocaleString('en-US')
  if (c.calorieRule === 'burn') return `${n(c.caloriesGoal)}+ burned`
  return c.caloriesMin !== undefined ? `${n(c.caloriesMin)}–${n(c.caloriesGoal)} eaten` : `≤ ${n(c.caloriesGoal)} eaten`
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export interface ContractDayEval {
  date: ISODate
  steps?: number
  /** the calories the contract judges: eaten under a limit, burned under the older rule */
  calories?: number
  stepsMet: boolean
  caloriesMet: boolean
  /** ate past the limit */
  caloriesOver: boolean
  /** sworn duties kept that day */
  dutiesKept: number
  /** day hasn't happened yet */
  future: boolean
  isToday: boolean
}

export interface ContractEval {
  contract: Contract
  status: ContractStatus
  days: ContractDayEval[]
  stepsDays: number
  caloriesDays: number
  bothDays: number
  /** the duties sworn at the sealing (none for contracts sealed before duties were sworn) */
  duties: SwornDuty[]
  /** sworn duties kept, summed over the week */
  dutiesKept: number
  /** every daily goal of the week: steps, calories and each sworn duty, seven times over */
  goalsTotal: number
  goalsMet: number
  totalSteps: number
  totalCalories: number
  loggedDays: number
  /** 1…7 while the contract runs; 0 before, 8 after */
  dayNumber: number
  weightDelta?: number
  grade?: ContractGrade
  /** fraction of the week's goals met */
  score: number
  flawless: boolean
  /** reputation staked at the sealing (wagers) */
  stake: number
  /** +10 for each day the steps goal, and each day the calorie term, was kept */
  dailyRep: number
  /** paid at the weigh-in: the honored and flawless bonuses, or a wager's return */
  closingRep: number
  /** everything the contract has meant for your reputation so far */
  reputation: number
}

export function gradeFor(goalsMet: number, goalsTotal: number): ContractGrade {
  if (goalsTotal > 0 && goalsMet >= goalsTotal) return 'gilded'
  // whole-number arithmetic, so a week sitting exactly on the line is never lost to rounding
  if (goalsMet * 100 >= goalsTotal * Math.round(HONORED_SHARE * 100)) return 'honored'
  return 'wanting'
}

export function evaluateContract(ledger: Ledger, c: Contract, today: ISODate): ContractEval {
  const status = contractStatus(c, today)
  const burned = status === 'burned'
  const duties = c.duties ?? []
  const days = daysInRange(c.startDate, c.endDate).map((date): ContractDayEval => {
    // A burned contract's progress burned with it.
    const log = burned ? EMPTY : dayLog(ledger, date)
    const calories = calorieValue(c, log)
    return {
      date,
      steps: log.steps,
      calories,
      stepsMet: !burned && stepsKept(c, log.steps),
      caloriesMet: !burned && caloriesKept(c, calories),
      caloriesOver: overLimit(c, calories),
      dutiesKept: duties.filter((d) => log.done[d.id]).length,
      future: date > today,
      isToday: date === today
    }
  })
  const stepsDays = days.filter((d) => d.stepsMet).length
  const caloriesDays = days.filter((d) => d.caloriesMet).length
  const bothDays = days.filter((d) => d.stepsMet && d.caloriesMet).length
  const dutiesKept = days.reduce((sum, d) => sum + d.dutiesKept, 0)
  const goalsTotal = 7 * (2 + duties.length)
  const goalsMet = stepsDays + caloriesDays + dutiesKept
  const closed = status === 'closed'
  const grade = closed ? gradeFor(goalsMet, goalsTotal) : undefined
  const flawless = goalsMet === goalsTotal
  const stake = c.kind === 'wager' ? (c.stake ?? 0) : 0

  const dailyRep = stepsDays * CONTRACT_REP.stepsDay + caloriesDays * CONTRACT_REP.caloriesDay
  let closingRep = 0
  if (closed && grade) {
    closingRep = c.kind === 'wager' ? wagerReturn(stake, grade) : CONTRACT_REP.honored + (flawless ? CONTRACT_REP.flawless : 0)
  }

  const offset = diffDays(c.startDate, today)
  return {
    contract: c,
    status,
    days,
    stepsDays,
    caloriesDays,
    bothDays,
    duties,
    dutiesKept,
    goalsTotal,
    goalsMet,
    totalSteps: days.reduce((sum, d) => sum + (d.steps ?? 0), 0),
    totalCalories: days.reduce((sum, d) => sum + (d.calories ?? 0), 0),
    loggedDays: days.filter((d) => d.steps !== undefined || d.calories !== undefined).length,
    dayNumber: offset < 0 ? 0 : offset > 6 ? 8 : offset + 1,
    weightDelta: c.finalWeight !== undefined ? Math.round((c.finalWeight - c.startWeight) * 10) / 10 : undefined,
    grade,
    score: goalsTotal ? goalsMet / goalsTotal : 0,
    flawless,
    stake,
    dailyRep,
    closingRep,
    reputation: dailyRep + closingRep - stake
  }
}
const EMPTY: DayLog = Object.freeze({ done: Object.freeze({}) }) as DayLog

/**
 * Reputation that contracts themselves add or take away, beyond what each day earns: common contracts
 * pay their bonuses at the weigh-in; a wager takes its stake at the sealing and repays at the weigh-in.
 */
export function contractsRep(ledger: Ledger, today: ISODate): number {
  let total = 0
  for (const c of ledger.contracts) {
    const ev = evaluateContract(ledger, c, today)
    total += ev.closingRep - ev.stake
  }
  return total
}

export const GRADE_INFO: Record<ContractGrade, { label: string; seal: 'gold' | 'crimson' | 'ash'; blurb: string }> = {
  gilded: { label: 'Gilded', seal: 'gold', blurb: 'Every term kept, every day.' },
  honored: { label: 'Honored', seal: 'crimson', blurb: 'The terms were kept in good faith.' },
  wanting: { label: 'Found Wanting', seal: 'ash', blurb: 'The terms were not met.' }
}

export const STATUS_INFO: Record<Exclude<ContractStatus, 'closed'>, { label: string; seal: 'royal' | 'amber' | 'forest' | 'ash' }> = {
  upcoming: { label: 'Awaiting its first day', seal: 'forest' },
  active: { label: 'In force', seal: 'royal' },
  awaiting: { label: 'Awaiting weigh-in', seal: 'amber' },
  burned: { label: 'Burned', seal: 'ash' }
}

export type SealColorName = 'gold' | 'crimson' | 'ash' | 'royal' | 'amber' | 'forest'

/** The seal colour and caption that describe a contract's state or outcome. */
export function sealFor(ev: ContractEval): { color: SealColorName; label: string } {
  if (ev.status === 'closed' && ev.grade) {
    const g = GRADE_INFO[ev.grade]
    return { color: g.seal, label: g.label }
  }
  const s = STATUS_INFO[ev.status === 'closed' ? 'active' : ev.status]
  return { color: s.seal, label: s.label }
}

export function hashSeed(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Everything a search query can match against, lower-cased. */
export function contractHaystack(ev: ContractEval): string {
  const c = ev.contract
  const a = parts(c.startDate)
  const b = parts(c.endDate)
  const words = [
    formatRange(c.startDate, c.endDate),
    formatShort(c.startDate),
    formatShort(c.endDate),
    MONTHS[a.m],
    MONTHS[b.m],
    String(a.y),
    String(b.y),
    WEEKDAYS[weekday(c.startDate)],
    c.startDate,
    c.endDate,
    String(c.stepsGoal),
    c.stepsGoal.toLocaleString('en-US'),
    String(c.caloriesGoal),
    c.caloriesGoal.toLocaleString('en-US'),
    c.calorieRule === 'limit' ? 'limit eaten eat' : 'burned burn',
    `${c.startWeight}`,
    c.finalWeight !== undefined ? `${c.finalWeight}` : '',
    c.unit,
    c.note ?? '',
    ...ev.duties.map((d) => d.name)
  ]
  if (c.kind === 'wager') words.push(`wager stake staked ${ev.stake}`)
  else words.push('common')
  if (ev.grade === 'gilded') words.push('gilded gold flawless perfect')
  if (ev.grade === 'honored') words.push('honored honoured kept')
  if (ev.grade === 'wanting') words.push('found wanting failed short missed')
  if (ev.status === 'active') words.push('active open current in force')
  if (ev.status === 'awaiting') words.push('awaiting weigh-in open')
  if (ev.status === 'upcoming') words.push('upcoming open')
  if (ev.status === 'burned') words.push('burned burnt ash forfeit')
  if (ev.weightDelta !== undefined) words.push(ev.weightDelta < 0 ? 'lost' : ev.weightDelta > 0 ? 'gained' : 'held')
  return words.join(' ').toLowerCase()
}

export function matchesQuery(haystack: string, query: string): boolean {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
  return tokens.every((t) => haystack.includes(t))
}
