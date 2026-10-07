import type { ISODate } from './dates'

export type WeightUnit = 'lb' | 'kg'

export interface Profile {
  title: string
  name: string
  holding: string
}

/** A binary daily habit ("duty"). It appears on every day from `createdOn` until `retiredOn` (exclusive). */
export interface Habit {
  id: string
  name: string
  createdOn: ISODate
  retiredOn?: ISODate
}

/**
 * What a day can record:
 * - `steps`    steps walked
 * - `eaten`    calories eaten (kept under a contract's calorie limit)
 * - `calories` calories burned (the rule of contracts sealed before the calorie limit)
 */
export type Metric = 'steps' | 'eaten' | 'calories'

export const METRICS: readonly Metric[] = ['steps', 'eaten', 'calories']

/**
 * What Fitbit can report for a day: the tallies, plus `burned`, the total calories burned
 * (resting included). `burned` is read-only: never typed by hand, never a tally, never scored (A-06).
 */
export type SyncedMetric = Metric | 'burned'

export interface DayLog {
  steps?: number
  eaten?: number
  calories?: number
  /** total calories burned, resting included, as Fitbit reported it; only for the Healer's range (A-06) */
  burned?: number
  /** a weigh-in typed by hand, in `settings.unit` (A-05) */
  weight?: number
  /** habit id → done */
  done: Record<string, true>
  /** Metrics typed in by hand (or cleared by hand). Fitbit sync never overwrites these. */
  manual?: Partial<Record<Metric, true>>
  /** The last value Fitbit reported for each metric, kept so a hand-typed number can be swapped back. */
  synced?: Partial<Record<Metric, number>>
}

/**
 * How a contract judges calories.
 * - `limit`: eat no more than `caloriesGoal` (and, when set, no fewer than `caloriesMin`).
 * - `burn`:  burn at least `caloriesGoal` — how contracts worked before the calorie limit.
 */
export type CalorieRule = 'limit' | 'burn'

/**
 * - `common`: earns reputation for keeping its terms.
 * - `wager`:  reputation is staked when it is sealed and repaid, multiplied, at the weigh-in. Burning it forfeits the stake.
 */
export type ContractKind = 'common' | 'wager'

/** A duty as it was sworn into a contract. */
export interface SwornDuty {
  id: string
  name: string
}

/** A sealed weekly contract. Its terms are immutable; it can only be closed (weigh-in) or burned. */
export interface Contract {
  id: string
  kind: ContractKind
  startDate: ISODate
  /** startDate + 6 */
  endDate: ISODate
  /** minimum steps each day */
  stepsGoal: number
  calorieRule: CalorieRule
  /** `limit`: the most calories to eat each day · `burn`: the fewest calories to burn each day */
  caloriesGoal: number
  /** `limit` only: the fewest calories to eat each day, when the contract names a range */
  caloriesMin?: number
  /** `wager` only: the reputation staked at the sealing */
  stake?: number
  /** Duties sworn at the sealing. Absent on contracts sealed before duties were part of the terms. */
  duties?: SwornDuty[]
  startWeight: number
  unit: WeightUnit
  sealedAt: string
  finalWeight?: number
  closedOn?: ISODate
  closedAt?: string
  /** optional reflection written at the final weigh-in */
  note?: string
  /** A burned wager stays in the Archive as ash, so the forfeited stake is remembered. */
  burnedOn?: ISODate
  burnedAt?: string
}

export interface SoundSettings {
  music: boolean
  /** 0 … 1 */
  musicVolume: number
  effects: boolean
  /** 0 … 1 */
  effectsVolume: number
}

export interface Settings {
  unit: WeightUnit
  weekStartsOn: 0 | 1
  sound: SoundSettings
}

export interface Ledger {
  version: 2
  profile: Profile | null
  settings: Settings
  habits: Habit[]
  days: Record<ISODate, DayLog>
  contracts: Contract[]
}
