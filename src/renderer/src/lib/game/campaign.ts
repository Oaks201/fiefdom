/**
 * Founding a campaign (Ch 2, Ch 5 "The purse", A-03, A-04, A-07, A-18).
 *
 * `foundCampaign` builds the whole starting state: the map, the purse with its founding grant,
 * four buildings at Tier I and Castle I with their four companies, the Milestones, Grace 0, the
 * rivals (a placeholder T10 replaces), and the hidden Border Campaign weeks. The campaign starts at
 * the dawn after founding, so `settledThrough` is the founding day itself and nothing settles
 * until that day has closed.
 */
import { hashSeed } from '../contracts'
import { openContract } from '../ledger'
import type { Ledger } from '../types'
import { addDays, campaignWeek, nextDawnDay, openDay } from './clock'
import { CODEX } from './codex'
import { validateCharter } from './contracts'
import { foundingPurse } from './economy'
import { CampaignError } from './errors'
import { snapshotDay, toHealerDay, weighInsOf } from './ledgerDays'
import { buildMap, fronts as rimFronts } from './map'
import { int } from './rng'
import { RULES, byTier } from './rules'
import { checkGoal, clampPaceCap, currentWeight, healerRange, initialWeightState, toLb, trend } from './weight'
import type {
  BuildingId,
  Campaign,
  CampaignState,
  Charter,
  Company,
  DaySnapshot,
  FrontId,
  FrontState,
  ISODate,
  RivalId,
  RivalState,
  WeekStartsOn
} from './types'

export interface FoundingInput {
  startWeight: number
  goalWeight: number
  /** Defaults to the ledger's unit. */
  unit?: Campaign['unit']
  /** The pace cap in lb a week, 0.3 to 1.0; 0.8 when omitted. */
  targetPace?: number
  heightCm?: number
  sex?: Campaign['sex']
  birthYear?: number
  /** The founding Charter. Its calorie limit may not sit below the Healer's floor. */
  charter: Charter
  /** The IANA zone (A-03): the system zone at founding. */
  timeZone: string
  /** Defaults to the ledger's `settings.weekStartsOn`. */
  weekStartsOn?: WeekStartsOn
  /** Otherwise derived from the founding instant. */
  seed?: number
  /** The ledger as it stands: a legacy contract still open refuses the founding (A-07), and its recent days bootstrap the Healer. */
  ledger: Ledger
  /** Confirmed medical supervision lets the calorie limit sit below the floor (Ch 4, Ch 16). */
  medicalSupervision?: boolean
}

const RIVALS: readonly RivalId[] = ['orc', 'goblin', 'dwarf', 'archmage']

// ── The hidden Border Campaign schedule (Ch 12) ──────────────────────────────

/**
 * Border Campaign weeks: week 10, then every 8 weeks, each shifted −1 to +1 by a seeded draw,
 * through `throughWeek`. Each entry's draw depends only on the seed, the start and its index, so
 * extending the schedule later gives the same weeks as fixing it all at once.
 */
export function borderCampaignWeeks(seed: number, startDate: ISODate, throughWeek: number): number[] {
  const { firstWeek, everyWeeks, jitterWeeks } = RULES.world.borderCampaigns
  const weeks: number[] = []
  for (let k = 0; firstWeek + k * everyWeeks <= throughWeek; k++) {
    weeks.push(firstWeek + k * everyWeeks + int(seed, startDate, `borderCampaign:${k}`, -jitterWeeks, jitterWeeks))
  }
  return weeks
}

// ── The starting forces ──────────────────────────────────────────────────────

/** One company per building at Tier I (Ch 7), named and tagged from the codex. */
export function foundingRoster(): Company[] {
  return CODEX.buildings.map((b) => {
    const entry = CODEX.companies.find((c) => c.source === 'building' && c.building === b.id && c.tier === 1)
    if (!entry) throw new Error(`The codex has no Tier I company for ${b.id}`)
    return {
      id: entry.id,
      name: entry.name,
      source: 'building',
      power: byTier(RULES.buildings.pureCompanyPower, 1),
      tags: [...entry.tags],
      reach: entry.reach,
      items: []
    }
  })
}

/**
 * A rival's starting army (A-18): about 40 power, bought from its own host list strongest
 * affordable first. Host companies carry no tags; they match as their rival's type (Ch 10).
 */
function startingArmy(rival: RivalId): Company[] {
  const host = CODEX.hosts.find((h) => h.rival === rival)
  if (!host) throw new Error(`The codex has no host for ${rival}`)
  const units = [...host.companies].sort((a, b) => b.power - a.power)
  const army: Company[] = []
  let budget = RULES.rivals.start.armyPower
  for (;;) {
    const unit = units.find((u) => u.power <= budget)
    if (!unit) break
    army.push({ id: `${rival}:${unit.id}:${army.length + 1}`, name: unit.name, source: 'host', power: unit.power, tags: [], reach: unit.reach, items: [] })
    budget -= unit.power
  }
  return army
}

/**
 * The rivals at the founding, with A-18's defaults: treasury 150, an army of about 40 power,
 * Respect 20, Tension toward the player, Peace with each neighbor and every front track at 0.
 * Threat is computed at the first week close. T10 replaces this with `initRivals`.
 */
export function foundingRivals(): Record<RivalId, RivalState> {
  const start = RULES.rivals.start
  const rim = rimFronts()
  const out = {} as Record<RivalId, RivalState>
  for (const rival of RIVALS) {
    const mine = rim.filter((f) => f.rivals.includes(rival))
    const disposition: RivalState['disposition'] = { player: start.disposition }
    const frontTracks: RivalState['frontTracks'] = {}
    for (const f of mine) {
      disposition[f.rivals[0] === rival ? f.rivals[1] : f.rivals[0]] = 'peace'
      frontTracks[f.front] = start.frontTrack
    }
    out[rival] = {
      rival,
      treasury: start.treasury,
      companies: startingArmy(rival),
      respect: start.respect,
      threat: 0,
      disposition,
      status: 'active',
      ascendancyStreak: 0,
      specialFund: 0,
      frontTracks
    }
  }
  return out
}

/** Every Rim front at Peace with its track at 0 (A-18). */
export function foundingFronts(): Record<FrontId, FrontState> {
  const out = {} as Record<FrontId, FrontState>
  for (const f of rimFronts()) out[f.front] = { front: f.front, rivals: f.rivals, state: 'peace', track: RULES.rivals.start.frontTrack }
  return out
}

// ── Founding ─────────────────────────────────────────────────────────────────

function zoneDay(now: Date, timeZone: string): ISODate {
  try {
    return openDay(now, timeZone)
  } catch {
    throw new CampaignError(`${timeZone} is not a time zone.`)
  }
}

/**
 * Founds a campaign at `now`. It starts at the next dawn in `timeZone` (A-04). Throws a
 * CampaignError, ready to show, while a legacy contract is open, upcoming or awaiting its
 * weigh-in (A-07), for a goal the Healer refuses, or for a Charter outside its ranges (including
 * a calorie limit below the Healer's floor).
 */
export function foundCampaign(input: FoundingInput, now: Date): CampaignState {
  const { ledger } = input
  if (openContract(ledger)) throw new CampaignError('A ledger contract is still open. Close it with its weigh-in before founding a campaign.')
  if (!(input.startWeight > 0)) throw new CampaignError('The start weight must be a positive weight.')
  if (!(input.goalWeight > 0)) throw new CampaignError('The goal must be a positive weight.')
  const unit = input.unit ?? ledger.settings.unit
  checkGoal(input.goalWeight, unit, input.heightCm)

  const today = zoneDay(now, input.timeZone)
  const startDate = nextDawnDay(now, input.timeZone)
  const weekStartsOn = input.weekStartsOn ?? ledger.settings.weekStartsOn
  const seed = input.seed ?? hashSeed(now.toISOString())
  const startLb = toLb(input.startWeight, unit)
  const goalLb = toLb(input.goalWeight, unit)
  const pace = RULES.momentum.targetPace
  const targetPace = Math.min(clampPaceCap(input.targetPace ?? pace.capLb), pace.ceilingShareOfWeight * startLb)

  // The days the weight and Healer windows look back over, founding day included.
  const prelude: DaySnapshot[] = []
  for (let back = RULES.settlement.preludeDays; back >= 1; back--) {
    prelude.push(snapshotDay(ledger, addDays(startDate, -back), input.charter))
  }
  const weighIns = weighInsOf(prelude)
  const healer = healerRange(prelude.map(toHealerDay), today, trend(weighIns, today), {
    sex: input.sex,
    birthYear: input.birthYear,
    heightCm: input.heightCm,
    weightLb: currentWeight(weighIns, today) ?? startLb
  })
  const charterErrors = validateCharter(input.charter, { floor: healer.floor, medicalSupervision: input.medicalSupervision })
  if (charterErrors.length > 0) throw new CampaignError(charterErrors.join(' '))

  const campaign: Campaign = {
    id: `campaign-${seed.toString(16)}`, // rules-ok: hexadecimal
    seed,
    ruleVersion: RULES.ruleVersion,
    startDate,
    timeZone: input.timeZone,
    startWeight: input.startWeight,
    goalWeight: input.goalWeight,
    unit,
    targetPace,
    status: 'active',
    weekStartsOn,
    ...(input.heightCm !== undefined ? { heightCm: input.heightCm } : {}),
    ...(input.sex !== undefined ? { sex: input.sex } : {}),
    ...(input.birthYear !== undefined ? { birthYear: input.birthYear } : {})
  }
  const buildings = {} as Record<BuildingId, 1>
  for (const b of CODEX.buildings) buildings[b.id] = 1

  return {
    campaign,
    charter: { ...input.charter, duties: [...input.charter.duties], calorieFloor: healer.floor },
    hexes: buildMap(seed),
    buildings,
    castleTier: 1,
    crossings: {},
    roster: foundingRoster(),
    contracts: { history: [], respiteBank: 0 },
    purse: foundingPurse(today),
    weight: { ...initialWeightState(startLb, goalLb), healerFloor: healer.floor },
    rivals: foundingRivals(),
    fronts: foundingFronts(),
    courtships: [],
    deals: [],
    orders: [],
    grandBattles: [],
    coalitions: [],
    worldEvents: [],
    log: [],
    settledThrough: { day: addDays(startDate, -1), week: campaignWeek(startDate, addDays(startDate, -1), weekStartsOn) },
    settlement: {
      snapshots: prelude,
      borderCampaignWeeks: borderCampaignWeeks(seed, startDate, RULES.settlement.borderScheduleAheadWeeks),
      lastLaunch: today
    }
  }
}
