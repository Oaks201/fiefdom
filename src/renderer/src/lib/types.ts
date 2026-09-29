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

export interface DayLog {
  steps?: number
  calories?: number
  /** habit id → done */
  done: Record<string, true>
}

/** A sealed weekly contract. Its terms are immutable; it can only be closed (weigh-in) or burned. */
export interface Contract {
  id: string
  startDate: ISODate
  /** startDate + 6 */
  endDate: ISODate
  /** minimum steps each day */
  stepsGoal: number
  /** minimum calories burned each day */
  caloriesGoal: number
  startWeight: number
  unit: WeightUnit
  sealedAt: string
  finalWeight?: number
  closedOn?: ISODate
  closedAt?: string
  /** optional reflection written at the final weigh-in */
  note?: string
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
  version: 1
  profile: Profile | null
  settings: Settings
  habits: Habit[]
  days: Record<ISODate, DayLog>
  contracts: Contract[]
}

export type Metric = 'steps' | 'calories'
