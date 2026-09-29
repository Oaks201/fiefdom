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
import { dayLog } from './ledger'
import type { Contract, Ledger } from './types'

export type ContractStatus = 'upcoming' | 'active' | 'awaiting' | 'closed'
export type ContractGrade = 'gilded' | 'honored' | 'wanting'

export const CONTRACT_REP = {
  stepsDay: 10,
  caloriesDay: 10,
  honored: 25,
  flawless: 50
} as const

export function contractStatus(c: Contract, today: ISODate): ContractStatus {
  if (c.closedAt) return 'closed'
  if (today < c.startDate) return 'upcoming'
  if (today <= c.endDate) return 'active'
  return 'awaiting'
}

export interface ContractDayEval {
  date: ISODate
  steps?: number
  calories?: number
  stepsMet: boolean
  caloriesMet: boolean
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
  totalSteps: number
  totalCalories: number
  loggedDays: number
  /** 1…7 while the contract runs; 0 before, 8 after */
  dayNumber: number
  weightDelta?: number
  grade?: ContractGrade
  /** fraction of the 14 daily goals met */
  score: number
  reputation: number
  flawless: boolean
}

export function gradeFor(stepsDays: number, caloriesDays: number): ContractGrade {
  const met = stepsDays + caloriesDays
  if (met >= 14) return 'gilded'
  if (met >= 10) return 'honored'
  return 'wanting'
}

export function evaluateContract(ledger: Ledger, c: Contract, today: ISODate): ContractEval {
  const days = daysInRange(c.startDate, c.endDate).map((date): ContractDayEval => {
    const log = dayLog(ledger, date)
    return {
      date,
      steps: log.steps,
      calories: log.calories,
      stepsMet: (log.steps ?? 0) >= c.stepsGoal,
      caloriesMet: (log.calories ?? 0) >= c.caloriesGoal,
      future: date > today,
      isToday: date === today
    }
  })
  const stepsDays = days.filter((d) => d.stepsMet).length
  const caloriesDays = days.filter((d) => d.caloriesMet).length
  const bothDays = days.filter((d) => d.stepsMet && d.caloriesMet).length
  const status = contractStatus(c, today)
  const flawless = bothDays === 7
  const closed = status === 'closed'

  const reputation =
    stepsDays * CONTRACT_REP.stepsDay +
    caloriesDays * CONTRACT_REP.caloriesDay +
    (closed ? CONTRACT_REP.honored : 0) +
    (closed && flawless ? CONTRACT_REP.flawless : 0)

  const offset = diffDays(c.startDate, today)
  return {
    contract: c,
    status,
    days,
    stepsDays,
    caloriesDays,
    bothDays,
    totalSteps: days.reduce((sum, d) => sum + (d.steps ?? 0), 0),
    totalCalories: days.reduce((sum, d) => sum + (d.calories ?? 0), 0),
    loggedDays: days.filter((d) => d.steps !== undefined || d.calories !== undefined).length,
    dayNumber: offset < 0 ? 0 : offset > 6 ? 8 : offset + 1,
    weightDelta: c.finalWeight !== undefined ? Math.round((c.finalWeight - c.startWeight) * 10) / 10 : undefined,
    grade: closed ? gradeFor(stepsDays, caloriesDays) : undefined,
    score: (stepsDays + caloriesDays) / 14,
    reputation,
    flawless
  }
}

export const GRADE_INFO: Record<ContractGrade, { label: string; seal: 'gold' | 'crimson' | 'ash'; blurb: string }> = {
  gilded: { label: 'Gilded', seal: 'gold', blurb: 'Every term kept, every day.' },
  honored: { label: 'Honored', seal: 'crimson', blurb: 'The terms were kept in good faith.' },
  wanting: { label: 'Found Wanting', seal: 'ash', blurb: 'The terms were not met.' }
}

export const STATUS_INFO: Record<Exclude<ContractStatus, 'closed'>, { label: string; seal: 'royal' | 'amber' | 'forest' }> = {
  upcoming: { label: 'Awaiting its first day', seal: 'forest' },
  active: { label: 'In force', seal: 'royal' },
  awaiting: { label: 'Awaiting weigh-in', seal: 'amber' }
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
    `${c.startWeight}`,
    c.finalWeight !== undefined ? `${c.finalWeight}` : '',
    c.unit,
    c.note ?? ''
  ]
  if (ev.grade === 'gilded') words.push('gilded gold flawless perfect')
  if (ev.grade === 'honored') words.push('honored honoured kept')
  if (ev.grade === 'wanting') words.push('found wanting failed short missed')
  if (ev.status === 'active') words.push('active open current in force')
  if (ev.status === 'awaiting') words.push('awaiting weigh-in open')
  if (ev.status === 'upcoming') words.push('upcoming open')
  if (ev.weightDelta !== undefined) words.push(ev.weightDelta < 0 ? 'lost' : ev.weightDelta > 0 ? 'gained' : 'held')
  return words.join(' ').toLowerCase()
}

export function matchesQuery(haystack: string, query: string): boolean {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
  return tokens.every((t) => haystack.includes(t))
}
