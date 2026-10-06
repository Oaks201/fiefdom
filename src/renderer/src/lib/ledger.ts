/**
 * Pure operations on the ledger. Every function returns a new ledger and never mutates its input,
 * which keeps React rendering predictable and makes the rules easy to test.
 */
import { addDays, daysInRange, formatRange, formatShort, isISODate, maxDate, type ISODate } from './dates'
import {
  METRICS,
  type Contract,
  type ContractKind,
  type DayLog,
  type Habit,
  type Ledger,
  type Metric,
  type Profile,
  type Settings,
  type SoundSettings,
  type SwornDuty,
  type SyncedMetric,
  type WeightUnit
} from './types'

/** 2 added hand-typed weigh-ins and Fitbit's total calories burned to the day log (A-05, A-06). */
export const LEDGER_VERSION = 2 as const

const LB_PER_KG = 2.2046226218

export const LIMITS = {
  steps: { min: 0, max: 200_000 },
  eaten: { min: 0, max: 20_000 },
  calories: { min: 0, max: 20_000 },
  /** total calories burned, resting included */
  burned: { min: 0, max: 20_000 },
  stepsGoal: { min: 100, max: 100_000 },
  /** the most a contract may allow you to eat in a day, and the least */
  calorieLimit: { min: 800, max: 10_000 },
  /** calories burned, for contracts sealed before the calorie limit */
  caloriesGoal: { min: 10, max: 10_000 },
  stake: { min: 10, max: 1_000_000 },
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

const fmt = (n: number): string => n.toLocaleString('en-US')

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

export function isBurned(c: Contract): boolean {
  return !!c.burnedAt
}

/** The contract that binds a day. Burned contracts bind nothing. */
export function contractOn(ledger: Ledger, date: ISODate): Contract | undefined {
  return ledger.contracts.find((c) => !c.burnedAt && c.startDate <= date && date <= c.endDate)
}

/** The contract that hasn't been closed with a final weigh-in (or burned) yet — there is at most one. */
export function openContract(ledger: Ledger): Contract | undefined {
  return ledger.contracts.find((c) => !c.closedAt && !c.burnedAt)
}

/** The latest contract that still stands (burned ones don't). */
export function lastContract(ledger: Ledger): Contract | undefined {
  for (let i = ledger.contracts.length - 1; i >= 0; i--) if (!ledger.contracts[i].burnedAt) return ledger.contracts[i]
  return undefined
}

/** The most recently sealed contract of any kind, burned or not — a good template for the next one. */
export function lastSealed(ledger: Ledger): Contract | undefined {
  let latest: Contract | undefined
  for (const c of ledger.contracts) if (!latest || c.sealedAt >= latest.sealedAt) latest = c
  return latest
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

function hasKeys(o: object | undefined): boolean {
  return !!o && Object.keys(o).length > 0
}

function isEmptyDay(d: DayLog): boolean {
  return (
    METRICS.every((m) => d[m] === undefined) &&
    d.burned === undefined &&
    d.weight === undefined &&
    !hasKeys(d.done) &&
    !hasKeys(d.manual)
  )
}

/** Drops bookkeeping that no longer means anything. */
function tidy(day: DayLog): DayLog {
  const next: DayLog = { ...day }
  if (next.synced) {
    const synced = { ...next.synced }
    for (const m of METRICS) if (synced[m] !== undefined && next[m] === undefined && !next.manual?.[m]) delete synced[m]
    if (hasKeys(synced)) next.synced = synced
    else delete next.synced
  }
  if (next.manual && !hasKeys(next.manual)) delete next.manual
  return next
}

function putDay(ledger: Ledger, date: ISODate, day: DayLog): Ledger {
  const days = { ...ledger.days }
  const clean = tidy(day)
  if (isEmptyDay(clean)) delete days[date]
  else days[date] = clean
  return { ...ledger, days }
}

function copyDay(d: DayLog): DayLog {
  return {
    ...d,
    done: { ...d.done },
    ...(d.manual ? { manual: { ...d.manual } } : {}),
    ...(d.synced ? { synced: { ...d.synced } } : {})
  }
}

export function clampMetric(metric: SyncedMetric, value: number): number {
  const { min, max } = LIMITS[metric]
  return Math.min(max, Math.max(min, Math.round(value)))
}

/**
 * Records a number typed by hand. It is marked as yours, so Fitbit will never overwrite it.
 * Clearing a number Fitbit had filled in keeps it clear; clearing anything else simply empties it.
 */
export function setMetric(ledger: Ledger, date: ISODate, metric: Metric, value: number | undefined): Ledger {
  const next = copyDay(dayLog(ledger, date))
  const manual = { ...next.manual }
  if (value === undefined || !Number.isFinite(value)) {
    delete next[metric]
    if (next.synced?.[metric] !== undefined) manual[metric] = true
    else delete manual[metric]
  } else {
    next[metric] = clampMetric(metric, value)
    manual[metric] = true
  }
  next.manual = manual
  return putDay(ledger, date, next)
}

/** Swaps a hand-typed number for the one Fitbit reported, and lets Fitbit keep it up to date again. */
export function adoptSyncedValue(ledger: Ledger, date: ISODate, metric: Metric): Ledger {
  const current = dayLog(ledger, date)
  const synced = current.synced?.[metric]
  if (synced === undefined) return ledger
  const next = copyDay(current)
  next[metric] = synced
  if (next.manual) delete next.manual[metric]
  return putDay(ledger, date, next)
}

/** Where the number shown for a metric came from. */
export function metricSource(day: DayLog, metric: Metric): 'fitbit' | 'hand' | null {
  if (day[metric] === undefined) return null
  return !day.manual?.[metric] && day.synced?.[metric] !== undefined ? 'fitbit' : 'hand'
}

export interface SyncedPoint {
  date: ISODate
  metric: SyncedMetric
  value: number
}

const isSyncedMetric = (m: unknown): m is SyncedMetric => m === 'burned' || METRICS.includes(m as Metric)

/**
 * Folds numbers reported by Fitbit into the ledger. Hand-typed numbers are never replaced — Fitbit's
 * figure is only remembered beside them. A zero means Fitbit has nothing for that day (no food logged,
 * the tracker not worn), so it never counts as a record. Total calories burned is Fitbit's alone:
 * it is simply kept up to date, with no hand-typed side to protect.
 */
export function mergeSynced(ledger: Ledger, points: readonly SyncedPoint[]): Ledger {
  let next = ledger
  for (const p of points) {
    if (!isISODate(p.date) || !isSyncedMetric(p.metric) || typeof p.value !== 'number' || !Number.isFinite(p.value)) continue
    if (p.metric === 'burned') {
      next = mergeBurned(next, p.date, clampMetric('burned', p.value))
      continue
    }
    const day = dayLog(next, p.date)
    const manual = !!day.manual?.[p.metric]
    const before = day.synced?.[p.metric]
    const value = clampMetric(p.metric, p.value)
    if (value > 0) {
      if (before === value && (manual || day[p.metric] === value)) continue
      const d = copyDay(day)
      d.synced = { ...d.synced, [p.metric]: value }
      if (!manual) d[p.metric] = value
      next = putDay(next, p.date, d)
    } else if (before !== undefined) {
      const d = copyDay(day)
      if (d.synced) delete d.synced[p.metric]
      if (!manual) delete d[p.metric]
      next = putDay(next, p.date, d)
    }
  }
  return next
}

function mergeBurned(ledger: Ledger, date: ISODate, value: number): Ledger {
  const day = dayLog(ledger, date)
  if (value > 0) {
    if (day.burned === value) return ledger
    return putDay(ledger, date, { ...copyDay(day), burned: value })
  }
  if (day.burned === undefined) return ledger
  const d = copyDay(day)
  delete d.burned
  return putDay(ledger, date, d)
}

// ---------------------------------------------------------------------------
// Weigh-ins (A-05): typed by hand, in the ledger's unit
// ---------------------------------------------------------------------------

/** Records the weight for a day, or clears it with `undefined`. */
export function setWeight(ledger: Ledger, date: ISODate, weight: number | undefined): Ledger {
  if (!isISODate(date)) throw new LedgerError('That is not a day of the ledger.')
  const current = dayLog(ledger, date)
  if (weight === undefined) {
    if (current.weight === undefined) return ledger
    const next = copyDay(current)
    delete next.weight
    return putDay(ledger, date, next)
  }
  const problem = validateWeight(weight, ledger.settings.unit)
  if (problem) throw new LedgerError(problem)
  const rounded = roundWeight(weight)
  if (current.weight === rounded) return ledger
  return putDay(ledger, date, { ...copyDay(current), weight: rounded })
}

/** Every weigh-in in the ledger, oldest first. */
export function weighIns(ledger: Ledger): { date: ISODate; weight: number }[] {
  const list: { date: ISODate; weight: number }[] = []
  for (const [date, d] of Object.entries(ledger.days)) if (d.weight !== undefined) list.push({ date, weight: d.weight })
  return list.sort((a, b) => a.date.localeCompare(b.date))
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
// Habits ("duties"). While a contract is open its duties are sworn: none may be added, renamed or struck.
// ---------------------------------------------------------------------------

/**
 * The open contract that holds the duties fixed, if there is one. A contract sealed before duties
 * were sworn into contracts has none to hold, so it leaves the roll free.
 */
export function dutiesSwornUnder(ledger: Ledger): Contract | undefined {
  const c = openContract(ledger)
  return c?.duties ? c : undefined
}

export function swornMessage(c: Contract): string {
  return `Your duties are sworn under the contract of ${formatRange(c.startDate, c.endDate)}. They can be changed once it is closed or burned.`
}

function assertDutiesFree(ledger: Ledger): void {
  const c = dutiesSwornUnder(ledger)
  if (c) throw new LedgerError(swornMessage(c))
}

export function cleanName(name: string, max: number = LIMITS.habitName): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, max)
}

export function addHabit(ledger: Ledger, habit: { id: string; name: string; createdOn: ISODate }): Ledger {
  assertDutiesFree(ledger)
  const name = cleanName(habit.name)
  if (!name) throw new LedgerError('A duty needs a name.')
  return { ...ledger, habits: [...ledger.habits, { id: habit.id, name, createdOn: habit.createdOn }] }
}

export function renameHabit(ledger: Ledger, id: string, name: string): Ledger {
  assertDutiesFree(ledger)
  const clean = cleanName(name)
  if (!clean) throw new LedgerError('A duty needs a name.')
  return { ...ledger, habits: ledger.habits.map((h) => (h.id === id ? { ...h, name: clean } : h)) }
}

/**
 * The first day a duty may be struck from: the day after the last contract it was sworn under,
 * so a sealed week keeps the duties it was judged by.
 */
export function retireFloor(ledger: Ledger, id: string): ISODate | undefined {
  let floor: ISODate | undefined
  for (const c of ledger.contracts) {
    if (c.burnedAt || !c.duties?.some((d) => d.id === id)) continue
    const after = addDays(c.endDate, 1)
    if (!floor || after > floor) floor = after
  }
  return floor
}

/**
 * Removes a duty from `fromDate` onward (never earlier than `retireFloor`); earlier days keep their
 * record of it. If that would leave it with no days at all, it is deleted outright.
 */
export function retireHabit(ledger: Ledger, id: string, fromDate: ISODate): Ledger {
  assertDutiesFree(ledger)
  const habit = ledger.habits.find((h) => h.id === id)
  if (!habit) return ledger
  const floor = retireFloor(ledger, id)
  const from = floor && fromDate < floor ? floor : fromDate
  const erase = from <= habit.createdOn

  const days: Record<ISODate, DayLog> = {}
  for (const [date, log] of Object.entries(ledger.days)) {
    if (log.done[id] && (erase || date >= from)) {
      const done = { ...log.done }
      delete done[id]
      const next = tidy({ ...log, done })
      if (!isEmptyDay(next)) days[date] = next
    } else {
      days[date] = log
    }
  }
  const habits = erase
    ? ledger.habits.filter((h) => h.id !== id)
    : ledger.habits.map((h) => (h.id === id ? { ...h, retiredOn: from } : h))
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
  kind: ContractKind
  startDate: ISODate
  stepsGoal: number
  /** the most calories to eat each day */
  caloriesGoal: number
  /** optionally, the fewest calories to eat each day */
  caloriesMin?: number
  /** wagers only: reputation staked at the sealing */
  stake?: number
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

function intWithin(n: number | undefined, r: { min: number; max: number }): boolean {
  return n !== undefined && Number.isInteger(n) && n >= r.min && n <= r.max
}

/**
 * Returns a problem to show the user, or null when the draft may be sealed.
 * `balance` is the reputation held right now — a wager can stake no more than that.
 */
export function validateDraft(ledger: Ledger, draft: ContractDraft, today: ISODate, balance: number): string | null {
  if (openContract(ledger)) return 'A contract is already in force. Close or burn it first.'
  if (!allowedStartDates(ledger, today).includes(draft.startDate)) return 'Choose a start date from the list.'
  const s = LIMITS.stepsGoal
  if (!intWithin(draft.stepsGoal, s)) return `Daily steps must be between ${fmt(s.min)} and ${fmt(s.max)}.`
  const c = LIMITS.calorieLimit
  if (!intWithin(draft.caloriesGoal, c)) return `The daily calorie limit must be between ${fmt(c.min)} and ${fmt(c.max)}.`
  if (draft.caloriesMin !== undefined) {
    if (!Number.isInteger(draft.caloriesMin) || draft.caloriesMin < 0) return 'The daily minimum must be a whole number of calories.'
    if (draft.caloriesMin >= draft.caloriesGoal) return 'The daily minimum must be below the calorie limit.'
  }
  if (draft.kind === 'wager') {
    const k = LIMITS.stake
    if (draft.stake === undefined || !Number.isInteger(draft.stake) || draft.stake < k.min) return `A wager stakes at least ${k.min} reputation.`
    if (draft.stake > k.max) return `A wager stakes at most ${fmt(k.max)} reputation.`
    if (draft.stake > balance)
      return balance < k.min ? `You need at least ${k.min} reputation to wager.` : `You hold only ${fmt(Math.max(0, balance))} reputation to stake.`
  }
  return validateWeight(draft.startWeight, draft.unit)
}

/** Seals a draft. Every duty on the roll on its first day is sworn into it. */
export function sealContract(
  ledger: Ledger,
  draft: ContractDraft,
  ctx: { id: string; today: ISODate; now: string; balance: number }
): Ledger {
  const problem = validateDraft(ledger, draft, ctx.today, ctx.balance)
  if (problem) throw new LedgerError(problem)
  const duties: SwornDuty[] = activeHabits(ledger, draft.startDate).map((h) => ({ id: h.id, name: h.name }))
  const contract: Contract = {
    id: ctx.id,
    kind: draft.kind,
    startDate: draft.startDate,
    endDate: addDays(draft.startDate, 6),
    stepsGoal: draft.stepsGoal,
    calorieRule: 'limit',
    caloriesGoal: draft.caloriesGoal,
    ...(draft.caloriesMin ? { caloriesMin: draft.caloriesMin } : {}),
    ...(draft.kind === 'wager' ? { stake: draft.stake } : {}),
    duties,
    startWeight: roundWeight(draft.startWeight),
    unit: draft.unit,
    sealedAt: ctx.now
  }
  return { ...ledger, contracts: sortContracts([...ledger.contracts, contract]), settings: { ...ledger.settings, unit: draft.unit } }
}

function sortContracts(list: Contract[]): Contract[] {
  return [...list].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.sealedAt.localeCompare(b.sealedAt))
}

export function canWeighIn(contract: Contract, today: ISODate): boolean {
  return !contract.closedAt && !contract.burnedAt && today >= contract.endDate
}

export function closeContract(
  ledger: Ledger,
  id: string,
  input: { finalWeight: number; note?: string },
  ctx: { today: ISODate; now: string }
): Ledger {
  const contract = ledger.contracts.find((c) => c.id === id)
  if (!contract) throw new LedgerError('That contract no longer exists.')
  if (contract.burnedAt) throw new LedgerError('That contract has been burned.')
  if (contract.closedAt) throw new LedgerError('That contract is already closed.')
  if (!canWeighIn(contract, ctx.today)) throw new LedgerError(`The final weigh-in opens on the last day of the contract, ${formatShort(contract.endDate)}.`)
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
 * Burning a contract destroys it together with its progress: the steps and calories recorded on
 * its days are erased (so is the reputation they earned). Duties checked off on those days are kept,
 * and so are weigh-ins and Fitbit's total calories burned, which were never the contract's progress.
 * A common contract vanishes; a wager stays in the Archive as ash, its stake forfeit.
 */
export function burnContract(ledger: Ledger, id: string, ctx: { today: ISODate; now: string }): Ledger {
  const contract = ledger.contracts.find((c) => c.id === id)
  if (!contract || contract.burnedAt) return ledger
  const contracts =
    contract.kind === 'wager'
      ? ledger.contracts.map((c) => (c.id === id ? { ...c, burnedOn: ctx.today, burnedAt: ctx.now } : c))
      : ledger.contracts.filter((c) => c.id !== id)
  let next: Ledger = { ...ledger, contracts }
  for (const date of daysInRange(contract.startDate, contract.endDate)) {
    const log = next.days[date]
    if (!log || (METRICS.every((m) => log[m] === undefined) && !hasKeys(log.manual) && !hasKeys(log.synced))) continue
    const rest: DayLog = {
      done: log.done,
      ...(log.burned !== undefined ? { burned: log.burned } : {}),
      ...(log.weight !== undefined ? { weight: log.weight } : {})
    }
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

function normalizeDay(d: Record<string, unknown>, habitIds: Set<string>): DayLog {
  const done: Record<string, true> = {}
  if (isObj(d.done)) for (const [k, v] of Object.entries(d.done)) if (v === true && habitIds.has(k)) done[k] = true
  const log: DayLog = { done }
  const manual: Partial<Record<Metric, true>> = {}
  const synced: Partial<Record<Metric, number>> = {}
  for (const m of METRICS) {
    if (isNum(d[m])) log[m] = clampMetric(m, d[m])
    if (isObj(d.manual) && d.manual[m] === true) manual[m] = true
    if (isObj(d.synced) && isNum(d.synced[m]) && d.synced[m] > 0) synced[m] = clampMetric(m, d.synced[m])
    // Numbers from before Fitbit sync existed were all typed by hand.
    if (log[m] !== undefined && synced[m] === undefined) manual[m] = true
  }
  // Fitbit's alone: never marked as typed by hand.
  if (isNum(d.burned) && d.burned > 0) log.burned = clampMetric('burned', d.burned)
  if (isNum(d.weight) && d.weight > 0) log.weight = d.weight
  if (hasKeys(manual)) log.manual = manual
  if (hasKeys(synced)) log.synced = synced
  return tidy(log)
}

function normalizeContract(c: Record<string, unknown>): Contract | null {
  if (!isStr(c.id) || !isISODate(c.startDate) || !isNum(c.stepsGoal) || !isNum(c.caloriesGoal) || !isNum(c.startWeight) || !isUnit(c.unit)) return null
  // Contracts sealed before the calorie limit counted calories burned.
  const calorieRule = c.calorieRule === 'limit' ? 'limit' : 'burn'
  const kind = c.kind === 'wager' && isNum(c.stake) && c.stake > 0 ? 'wager' : 'common'
  const contract: Contract = {
    id: c.id,
    kind,
    startDate: c.startDate,
    endDate: addDays(c.startDate, 6),
    stepsGoal: c.stepsGoal,
    calorieRule,
    caloriesGoal: c.caloriesGoal,
    startWeight: c.startWeight,
    unit: c.unit,
    sealedAt: isStr(c.sealedAt) ? c.sealedAt : new Date(0).toISOString()
  }
  if (calorieRule === 'limit' && isNum(c.caloriesMin) && c.caloriesMin > 0 && c.caloriesMin < c.caloriesGoal) contract.caloriesMin = c.caloriesMin
  if (kind === 'wager') contract.stake = Math.round(c.stake as number)
  if (Array.isArray(c.duties)) {
    const seen = new Set<string>()
    contract.duties = []
    for (const d of c.duties) {
      if (!isObj(d) || !isStr(d.id) || !isStr(d.name) || seen.has(d.id)) continue
      seen.add(d.id)
      contract.duties.push({ id: d.id, name: d.name })
    }
  }
  if (isNum(c.finalWeight) && isStr(c.closedAt)) {
    contract.finalWeight = c.finalWeight
    contract.closedAt = c.closedAt
    contract.closedOn = isISODate(c.closedOn) ? c.closedOn : contract.endDate
    if (isStr(c.note) && c.note.trim()) contract.note = c.note
  }
  if (isStr(c.burnedAt)) {
    contract.burnedAt = c.burnedAt
    contract.burnedOn = isISODate(c.burnedOn) ? c.burnedOn : contract.startDate
  }
  return contract
}

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
      const log = normalizeDay(d, seen)
      if (!isEmptyDay(log)) days[date] = log
    }
  }

  const contracts: Contract[] = []
  const ids = new Set<string>()
  for (const c of Array.isArray(raw.contracts) ? raw.contracts : []) {
    const contract = isObj(c) ? normalizeContract(c) : null
    if (!contract || ids.has(contract.id)) continue
    ids.add(contract.id)
    contracts.push(contract)
  }

  const sorted = sortContracts(contracts)
  // A version 1 ledger kept weights only on its contracts; they become the first weigh-ins (A-05).
  if (!(isNum(raw.version) && raw.version >= LEDGER_VERSION)) copyContractWeights(days, sorted, settings.unit)

  return { version: LEDGER_VERSION, profile, settings, habits, days, contracts: sorted }
}

function convertWeight(weight: number, from: WeightUnit, to: WeightUnit): number {
  if (from === to) return weight
  return roundWeight(from === 'kg' ? weight * LB_PER_KG : weight / LB_PER_KG)
}

/** Puts each contract's start and final weight on its start and close dates, where that day has no weight yet. */
function copyContractWeights(days: Record<ISODate, DayLog>, contracts: readonly Contract[], unit: WeightUnit): void {
  for (const c of contracts) {
    const readings: [ISODate, number][] = [[c.startDate, c.startWeight]]
    if (c.finalWeight !== undefined && c.closedOn) readings.push([c.closedOn, c.finalWeight])
    for (const [date, weight] of readings) {
      if (!(weight > 0) || days[date]?.weight !== undefined) continue
      days[date] = { ...(days[date] ?? { done: {} }), weight: convertWeight(weight, c.unit, unit) }
    }
  }
}
