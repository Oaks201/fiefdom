/**
 * Pure operations on the ledger. Every function returns a new ledger and never mutates its input,
 * which keeps React rendering predictable and makes the rules easy to test.
 */
import { addDays, daysInRange, isISODate, maxDate, type ISODate } from './dates'
import type { Contract, DayLog, Habit, Ledger, Metric, Profile, Settings, SoundSettings, WeightUnit } from './types'

export const LEDGER_VERSION = 1 as const

export const LIMITS = {
  steps: { min: 0, max: 200_000 },
  calories: { min: 0, max: 20_000 },
  stepsGoal: { min: 100, max: 100_000 },
  caloriesGoal: { min: 10, max: 10_000 },
  weight: { lb: { min: 50, max: 1000 }, kg: { min: 20, max: 450 } },
  habitName: 80,
  note: 2000,
  /** how far ahead a contract may be dated */
  startAheadDays: 7
} as const

export class LedgerError extends Error {}

export const DEFAULT_SOUND: SoundSettings = { music: true, musicVolume: 0.5, effects: true, effectsVolume: 0.7 }

export function createLedger(): Ledger {
  return {
    version: LEDGER_VERSION,
    profile: null,
    settings: { unit: 'lb', weekStartsOn: 1, sound: { ...DEFAULT_SOUND } },
    habits: [],
    days: {},
    contracts: []
  }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function isHabitActive(h: Habit, date: ISODate): boolean {
  return h.createdOn <= date && (!h.retiredOn || date < h.retiredOn)
}

export function activeHabits(ledger: Ledger, date: ISODate): Habit[] {
  return ledger.habits.filter((h) => isHabitActive(h, date))
}

export function dayLog(ledger: Ledger, date: ISODate): DayLog {
  return ledger.days[date] ?? EMPTY_DAY
}
const EMPTY_DAY: DayLog = Object.freeze({ done: Object.freeze({}) }) as DayLog

export function contractOn(ledger: Ledger, date: ISODate): Contract | undefined {
  return ledger.contracts.find((c) => c.startDate <= date && date <= c.endDate)
}

/** The contract that hasn't been closed with a final weigh-in yet (there is at most one). */
export function openContract(ledger: Ledger): Contract | undefined {
  return ledger.contracts.find((c) => !c.closedAt)
}

export function lastContract(ledger: Ledger): Contract | undefined {
  return ledger.contracts.length ? ledger.contracts[ledger.contracts.length - 1] : undefined
}

/** Dates a new contract may begin on. Empty when a contract is still open. */
export function allowedStartDates(ledger: Ledger, today: ISODate): ISODate[] {
  if (openContract(ledger)) return []
  const last = lastContract(ledger)
  const earliest = last ? maxDate(today, addDays(last.endDate, 1)) : today
  const latest = addDays(today, LIMITS.startAheadDays)
  return earliest <= latest ? daysInRange(earliest, latest) : []
}

// ---------------------------------------------------------------------------
// Days: steps, calories, duties
// ---------------------------------------------------------------------------

function isEmptyDay(d: DayLog): boolean {
  return d.steps === undefined && d.calories === undefined && Object.keys(d.done).length === 0
}

function putDay(ledger: Ledger, date: ISODate, day: DayLog): Ledger {
  const days = { ...ledger.days }
  if (isEmptyDay(day)) delete days[date]
  else days[date] = day
  return { ...ledger, days }
}

export function clampMetric(metric: Metric, value: number): number {
  const { min, max } = LIMITS[metric]
  return Math.min(max, Math.max(min, Math.round(value)))
}

export function setMetric(ledger: Ledger, date: ISODate, metric: Metric, value: number | undefined): Ledger {
  const current = dayLog(ledger, date)
  const next: DayLog = { ...current, done: { ...current.done } }
  if (value === undefined || !Number.isFinite(value)) delete next[metric]
  else next[metric] = clampMetric(metric, value)
  return putDay(ledger, date, next)
}

export function toggleDuty(ledger: Ledger, date: ISODate, habitId: string): Ledger {
  const habit = ledger.habits.find((h) => h.id === habitId)
  if (!habit || !isHabitActive(habit, date)) return ledger
  const current = dayLog(ledger, date)
  const done = { ...current.done }
  if (done[habitId]) delete done[habitId]
  else done[habitId] = true
  return putDay(ledger, date, { ...current, done })
}

// ---------------------------------------------------------------------------
// Habits
// ---------------------------------------------------------------------------

export function cleanName(name: string, max: number = LIMITS.habitName): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, max)
}

export function addHabit(ledger: Ledger, habit: { id: string; name: string; createdOn: ISODate }): Ledger {
  const name = cleanName(habit.name)
  if (!name) throw new LedgerError('A duty needs a name.')
  return { ...ledger, habits: [...ledger.habits, { id: habit.id, name, createdOn: habit.createdOn }] }
}

export function renameHabit(ledger: Ledger, id: string, name: string): Ledger {
  const clean = cleanName(name)
  if (!clean) throw new LedgerError('A duty needs a name.')
  return { ...ledger, habits: ledger.habits.map((h) => (h.id === id ? { ...h, name: clean } : h)) }
}

/**
 * Removes a duty from `fromDate` onward; earlier days keep their record of it.
 * If that would leave it with no days at all, it is deleted outright.
 */
export function retireHabit(ledger: Ledger, id: string, fromDate: ISODate): Ledger {
  const habit = ledger.habits.find((h) => h.id === id)
  if (!habit) return ledger
  const erase = fromDate <= habit.createdOn

  const days: Record<ISODate, DayLog> = {}
  for (const [date, log] of Object.entries(ledger.days)) {
    if (log.done[id] && (erase || date >= fromDate)) {
      const done = { ...log.done }
      delete done[id]
      const next = { ...log, done }
      if (!isEmptyDay(next)) days[date] = next
    } else {
      days[date] = log
    }
  }
  const habits = erase
    ? ledger.habits.filter((h) => h.id !== id)
    : ledger.habits.map((h) => (h.id === id ? { ...h, retiredOn: fromDate } : h))
  return { ...ledger, habits, days }
}

export function moveHabit(ledger: Ledger, id: string, toIndex: number): Ledger {
  const from = ledger.habits.findIndex((h) => h.id === id)
  if (from < 0) return ledger
  const habits = [...ledger.habits]
  const [h] = habits.splice(from, 1)
  habits.splice(Math.max(0, Math.min(habits.length, toIndex)), 0, h)
  return { ...ledger, habits }
}

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------

export interface ContractDraft {
  startDate: ISODate
  stepsGoal: number
  caloriesGoal: number
  startWeight: number
  unit: WeightUnit
}

export function roundWeight(w: number): number {
  return Math.round(w * 10) / 10
}

export function validateWeight(weight: number, unit: WeightUnit): string | null {
  const { min, max } = LIMITS.weight[unit]
  if (!Number.isFinite(weight)) return 'Enter your weight.'
  if (weight < min || weight > max) return `Weight must be between ${min} and ${max} ${unit}.`
  return null
}

/** Returns a problem to show the user, or null when the draft may be sealed. */
export function validateDraft(ledger: Ledger, draft: ContractDraft, today: ISODate): string | null {
  if (openContract(ledger)) return 'A contract is already in force. Close or burn it first.'
  if (!allowedStartDates(ledger, today).includes(draft.startDate)) return 'Choose a start date from the list.'
  const s = LIMITS.stepsGoal
  if (!Number.isInteger(draft.stepsGoal) || draft.stepsGoal < s.min || draft.stepsGoal > s.max)
    return `Daily steps must be between ${s.min.toLocaleString('en-US')} and ${s.max.toLocaleString('en-US')}.`
  const c = LIMITS.caloriesGoal
  if (!Number.isInteger(draft.caloriesGoal) || draft.caloriesGoal < c.min || draft.caloriesGoal > c.max)
    return `Daily calories must be between ${c.min} and ${c.max.toLocaleString('en-US')}.`
  return validateWeight(draft.startWeight, draft.unit)
}

export function sealContract(
  ledger: Ledger,
  draft: ContractDraft,
  ctx: { id: string; today: ISODate; now: string }
): Ledger {
  const problem = validateDraft(ledger, draft, ctx.today)
  if (problem) throw new LedgerError(problem)
  const contract: Contract = {
    id: ctx.id,
    startDate: draft.startDate,
    endDate: addDays(draft.startDate, 6),
    stepsGoal: draft.stepsGoal,
    caloriesGoal: draft.caloriesGoal,
    startWeight: roundWeight(draft.startWeight),
    unit: draft.unit,
    sealedAt: ctx.now
  }
  const contracts = [...ledger.contracts, contract].sort((a, b) => a.startDate.localeCompare(b.startDate))
  return { ...ledger, contracts, settings: { ...ledger.settings, unit: draft.unit } }
}

export function canWeighIn(contract: Contract, today: ISODate): boolean {
  return !contract.closedAt && today >= contract.endDate
}

export function closeContract(
  ledger: Ledger,
  id: string,
  input: { finalWeight: number; note?: string },
  ctx: { today: ISODate; now: string }
): Ledger {
  const contract = ledger.contracts.find((c) => c.id === id)
  if (!contract) throw new LedgerError('That contract no longer exists.')
  if (contract.closedAt) throw new LedgerError('That contract is already closed.')
  if (!canWeighIn(contract, ctx.today)) throw new LedgerError('The final weigh-in opens on the last day of the contract.')
  const problem = validateWeight(input.finalWeight, contract.unit)
  if (problem) throw new LedgerError(problem)
  const note = input.note ? input.note.trim().slice(0, LIMITS.note) : ''
  const closed: Contract = {
    ...contract,
    finalWeight: roundWeight(input.finalWeight),
    closedOn: ctx.today,
    closedAt: ctx.now,
    ...(note ? { note } : {})
  }
  return { ...ledger, contracts: ledger.contracts.map((c) => (c.id === id ? closed : c)) }
}

/**
 * Burning a contract destroys it together with its progress: the steps and calories logged on
 * its days are erased (so is the reputation they earned). Duties are not part of a contract and stay.
 */
export function burnContract(ledger: Ledger, id: string): Ledger {
  const contract = ledger.contracts.find((c) => c.id === id)
  if (!contract) return ledger
  let next: Ledger = { ...ledger, contracts: ledger.contracts.filter((c) => c.id !== id) }
  for (const date of daysInRange(contract.startDate, contract.endDate)) {
    const log = next.days[date]
    if (!log || (log.steps === undefined && log.calories === undefined)) continue
    const { steps: _s, calories: _c, ...rest } = log
    next = putDay(next, date, rest)
  }
  return next
}

// ---------------------------------------------------------------------------
// Profile & settings
// ---------------------------------------------------------------------------

export function setProfile(ledger: Ledger, profile: Profile): Ledger {
  return {
    ...ledger,
    profile: {
      title: cleanName(profile.title, 24),
      name: cleanName(profile.name, 40),
      holding: cleanName(profile.holding, 40)
    }
  }
}

export function setSettings(ledger: Ledger, patch: Partial<Settings>): Ledger {
  return { ...ledger, settings: { ...ledger.settings, ...patch } }
}

export function setSound(ledger: Ledger, patch: Partial<SoundSettings>): Ledger {
  const sound = { ...ledger.settings.sound, ...patch }
  sound.musicVolume = clamp01(sound.musicVolume)
  sound.effectsVolume = clamp01(sound.effectsVolume)
  return { ...ledger, settings: { ...ledger.settings, sound } }
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0
}

// ---------------------------------------------------------------------------
// Loading: accept whatever is on disk, keep everything that is valid.
// ---------------------------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string'
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isUnit = (v: unknown): v is WeightUnit => v === 'lb' || v === 'kg'

export function normalizeLedger(raw: unknown): Ledger {
  const base = createLedger()
  if (!isObj(raw)) return base

  const p = raw.profile
  const profile: Profile | null =
    isObj(p) && isStr(p.name) && isStr(p.title) && isStr(p.holding)
      ? { name: p.name, title: p.title, holding: p.holding }
      : null

  const s = isObj(raw.settings) ? raw.settings : {}
  const snd = isObj(s.sound) ? s.sound : {}
  const settings: Settings = {
    unit: isUnit(s.unit) ? s.unit : base.settings.unit,
    weekStartsOn: s.weekStartsOn === 0 ? 0 : 1,
    sound: {
      music: typeof snd.music === 'boolean' ? snd.music : DEFAULT_SOUND.music,
      musicVolume: isNum(snd.musicVolume) ? clamp01(snd.musicVolume) : DEFAULT_SOUND.musicVolume,
      effects: typeof snd.effects === 'boolean' ? snd.effects : DEFAULT_SOUND.effects,
      effectsVolume: isNum(snd.effectsVolume) ? clamp01(snd.effectsVolume) : DEFAULT_SOUND.effectsVolume
    }
  }

  const habits: Habit[] = []
  const seen = new Set<string>()
  for (const h of Array.isArray(raw.habits) ? raw.habits : []) {
    if (!isObj(h) || !isStr(h.id) || !isStr(h.name) || !isISODate(h.createdOn) || seen.has(h.id)) continue
    seen.add(h.id)
    habits.push({ id: h.id, name: h.name, createdOn: h.createdOn, ...(isISODate(h.retiredOn) ? { retiredOn: h.retiredOn } : {}) })
  }

  const days: Record<ISODate, DayLog> = {}
  if (isObj(raw.days)) {
    for (const [date, d] of Object.entries(raw.days)) {
      if (!isISODate(date) || !isObj(d)) continue
      const done: Record<string, true> = {}
      if (isObj(d.done)) for (const [k, v] of Object.entries(d.done)) if (v === true && seen.has(k)) done[k] = true
      const log: DayLog = { done }
      if (isNum(d.steps)) log.steps = clampMetric('steps', d.steps)
      if (isNum(d.calories)) log.calories = clampMetric('calories', d.calories)
      if (!isEmptyDay(log)) days[date] = log
    }
  }

  const contracts: Contract[] = []
  for (const c of Array.isArray(raw.contracts) ? raw.contracts : []) {
    if (
      !isObj(c) ||
      !isStr(c.id) ||
      !isISODate(c.startDate) ||
      !isNum(c.stepsGoal) ||
      !isNum(c.caloriesGoal) ||
      !isNum(c.startWeight) ||
      !isUnit(c.unit)
    )
      continue
    const contract: Contract = {
      id: c.id,
      startDate: c.startDate,
      endDate: addDays(c.startDate, 6),
      stepsGoal: c.stepsGoal,
      caloriesGoal: c.caloriesGoal,
      startWeight: c.startWeight,
      unit: c.unit,
      sealedAt: isStr(c.sealedAt) ? c.sealedAt : new Date(0).toISOString()
    }
    if (isNum(c.finalWeight) && isStr(c.closedAt)) {
      contract.finalWeight = c.finalWeight
      contract.closedAt = c.closedAt
      contract.closedOn = isISODate(c.closedOn) ? c.closedOn : contract.endDate
      if (isStr(c.note) && c.note.trim()) contract.note = c.note
    }
    contracts.push(contract)
  }
  contracts.sort((a, b) => a.startDate.localeCompare(b.startDate))

  return { version: LEDGER_VERSION, profile, settings, habits, days, contracts }
}
