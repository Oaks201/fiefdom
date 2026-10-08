/**
 * One simulated campaign (T13): founded with `foundCampaign`, played by a policy, settled day by
 * day with `settle` against the profile's synthetic ledger, measured, and checked against Ch 15's
 * invariants: no loss before week 36 (44 at Grace III); rings 0 to 2 never change owner; settling a
 * sample of days again (and from a clock set back a week) changes nothing; every purse gain has a
 * behavior, battle or land source; no Momentum above the target pace.
 *
 * A campaign stops at its end: the Fall, or the victory (the Reign that follows decides no target).
 * Every series that runs by week or month is cut at the last settled week.
 *
 * Pure apart from the clock-free rules it imports: the same options always give the same result.
 */
import { tierOffer } from '../src/renderer/src/lib/game/buildings'
import { foundCampaign } from '../src/renderer/src/lib/game/campaign'
import { addDays, campaignWeek, dayCloseInstant, isWeekCloseDay } from '../src/renderer/src/lib/game/clock'
import { settleViolations, PURSE_SOURCES, sourcePrefix } from '../src/renderer/src/lib/game/dev/invariants'
import { balance } from '../src/renderer/src/lib/game/economy'
import { realmEffects } from '../src/renderer/src/lib/game/effects'
import { RULES } from '../src/renderer/src/lib/game/rules'
import { benchmarkConsistency, benchmarkContractMultiplier, benchmarkIncome } from '../src/renderer/src/lib/game/rivals'
import { draw } from '../src/renderer/src/lib/game/rng'
import { settle } from '../src/renderer/src/lib/game/settle'
import { BUILDING_IDS, RIVAL_IDS, type CampaignState, type GraceLevel, type ISODate } from '../src/renderer/src/lib/game/types'
import { FOUNDED_AT, START, TZ, isRoughDay, ledgerFor } from './ledgerGen'
import { act, type PolicyId } from './policy'
import { JOURNEY, profileOf, type ProfileId } from './profiles'

export interface RunOptions {
  seed: number
  profile: ProfileId
  policy: PolicyId
  weeks: number
  /** The rules variant the worker runs under (`base`, `income`, or `<lever>:<step>`). */
  variant: string
}

export interface RunResult {
  seed: number
  profile: ProfileId
  policy: PolicyId
  variant: string
  status: CampaignState['campaign']['status']
  /** The last campaign week settled (the week the campaign ended, or the horizon). */
  lastWeek: number
  wonWeek?: number
  fallWeek?: number
  /** Weeks an Ultimatum was issued, and the Sieges fought (won or lost). */
  ultimatums: number[]
  sieges: { week: number; won: boolean }[]
  /** Weeks the Herald warned of a rival's Power (1.3× from week 32). */
  warnings: number[]
  /** The longest Ascendancy streak any rival reached (4 starts an Ultimatum). */
  maxAscendancyStreak: number
  resolutions: { rival: string; how: string; week: number }[]
  /** Weeks a coalition formed. */
  coalitions: number[]
  grandBattles: { fought: number; won: number; perMonth: number[]; byTrigger: Record<string, number> }
  /** Hexes held at the end of each 4-week month, from the founding to the end: the player's and each rival's. */
  hexes: Record<string, number[]>
  borderCampaignHexes: number
  firstMonth: { assaults: number; repulsed: number }
  assaults: { total: number; repulsed: number }
  /** Behavior income by campaign week, from week 1, as posted. */
  income: number[]
  /** The same without any reputation bonus still in force (the income check's measure). */
  incomeBase: number[]
  /** `incomeBase` over the first 48 weeks, by source (duties, steps, momentum, contract…). */
  incomeBySource: Record<string, number>
  /** The week the first contract of each length (in days) was sealed; Accords aside. */
  firstTerm: Record<string, number>
  /** The hidden benchmark's income BI by week, at Grace 0 and as the rivals earned it. */
  benchmark: number[]
  benchmarkGrace: number[]
  /** Reputation spent, by what it bought. */
  spend: Record<string, number>
  binds: {
    /** Week closes at which a Tier IV the purse could pay for was held back by Dominion alone. */
    tierIVDominionWeeks: number
    contracts: number
    /** Contracts that paid nothing: Q at or below the payout curve's start. */
    zeroPayContracts: number
    grandLost: number
  }
  /** The week each trophy arrived (A-156 asks how early). */
  trophyWeeks: number[]
  /** Mean Realm Consistency at the week closes. */
  q: number
  /** Milestones broken by the end. */
  milestones: number
  violations: string[]
}

const BEHAVIOR: ReadonlySet<string> = new Set(PURSE_SOURCES.behavior)
const MONTH_WEEKS = RULES.grandBattles.monthWeeks
const WEEK = RULES.clock.daysPerWeek
/** Days per campaign on which settlement is repeated to check Test 9. */
const IDEMPOTENCE_SAMPLES = 6
/** A violation that already starts with its day. */
const DATED = /^\d{4}-\d{2}-\d{2}: /
/** The income check's window (Ch 15). */
const BOOK_WEEKS = 48
const TENTH = 10

/** The instant just after `day` closes in the campaign's zone. */
function after(day: ISODate): Date {
  return new Date(dayCloseInstant(day, TZ).getTime() + 60_000)
}

function weekOf(day: ISODate): number {
  return campaignWeek(START, day, 1)
}

/** The Crown's Grace at each week's close, from the log, for the benchmark the rivals earned. */
function graceByWeek(state: CampaignState, weeks: number): GraceLevel[] {
  const out: GraceLevel[] = []
  let level: GraceLevel = 0
  const changes = state.log.flatMap((e) => (e.kind === 'grace' ? [{ week: weekOf(e.day), to: e.to }] : []))
  for (let w = 1; w <= weeks; w++) {
    for (const c of changes) if (c.week === w) level = c.to
    out.push(level)
  }
  return out
}

function fingerprint(state: CampaignState): string {
  const text = JSON.stringify(state)
  let h = 0
  for (let i = 0; i < text.length; i++) h = (Math.imul(h, 31) + text.charCodeAt(i)) | 0
  return `${text.length}:${h}`
}

const tenth = (v: number): number => Math.round(v * TENTH) / TENTH

/** Drives one campaign and measures it. */
export function runCampaign(o: RunOptions): RunResult {
  const profile = profileOf(o.profile)
  const days = o.weeks * WEEK
  const ledger = ledgerFor(profile, o.seed, days)
  const charter = { stepPool: JOURNEY.stepPool, calorieLimit: JOURNEY.calorieLimit, duties: [...JOURNEY.duties] }
  const founded = foundCampaign({ startWeight: JOURNEY.startLb, goalWeight: JOURNEY.goalLb, charter, timeZone: TZ, seed: o.seed, ledger }, FOUNDED_AT)
  let state = settle(founded, ledger, after(addDays(START, -1)), { launch: true }).state
  const violations: string[] = []
  const hexes: Record<string, number[]> = { player: [], ...Object.fromEntries(RIVAL_IDS.map((r) => [r, []])) }
  const bonusOn = new Map<ISODate, number>()
  let tierIVDominionWeeks = 0
  let maxAscendancyStreak = 0
  let contractNo = 0
  const nextId = (): string => `sim-${(contractNo += 1)}`
  const countHexes = (): void => {
    hexes.player.push(state.hexes.filter((h) => h.owner === 'player').length)
    for (const r of RIVAL_IDS) hexes[r].push(state.hexes.filter((h) => h.owner === r).length)
  }

  for (let i = 0; i < days; i++) {
    const today = addDays(START, i)
    if (isWeekCloseDay(addDays(today, -1), state.campaign.weekStartsOn)) {
      // Lever binding: a Tier IV the purse could pay for, held back by Dominion alone.
      const held = BUILDING_IDS.some((b) => {
        const offer = tierOffer(state, b)
        return state.buildings[b] === 3 && offer.reason?.code === 'dominion' && balance(state.purse) >= offer.cost
      })
      if (held) tierIVDominionWeeks += 1
    }
    state = act(state, today, { policy: o.policy, rough: isRoughDay(profile, o.seed, today), nextId })
    bonusOn.set(today, realmEffects(state).reputationBonus.value)
    const now = after(today)
    const before = state
    state = settle(state, ledger, now).state
    // The runtime invariants the app checks in development (T17), settling again on a sample of days (Test 9).
    const sampled = draw(o.seed, today, 'sim:idempotence') < IDEMPOTENCE_SAMPLES / days
    for (const v of settleViolations({ before, after: state, ledger, now, resettle: sampled })) violations.push(DATED.test(v) ? v : `${today}: ${v}`)
    // And on the same days, a clock set back a week changes nothing either.
    if (sampled && fingerprint(settle(state, ledger, after(addDays(today, -WEEK))).state) !== fingerprint(state)) violations.push(`${today}: settling with the clock set back changed the campaign`)
    for (const r of RIVAL_IDS) maxAscendancyStreak = Math.max(maxAscendancyStreak, state.rivals[r].ascendancyStreak)
    if (isWeekCloseDay(today, state.campaign.weekStartsOn) && weekOf(today) % MONTH_WEEKS === 0) countHexes()
    if (state.campaign.status !== 'active') break
  }

  const lastWeek = weekOf(state.settledThrough.day)
  // A campaign that ended mid-month holds what it held at its end for the rest of that month.
  if (hexes.player.length < Math.ceil(lastWeek / MONTH_WEEKS)) countHexes()
  const end = state.log.find((e) => e.kind === 'campaignEnd')
  const endWeek = end ? weekOf(end.day) : undefined
  const grace = graceByWeek(state, lastWeek)

  const income = Array.from({ length: lastWeek }, () => 0)
  const incomeBase = Array.from({ length: lastWeek }, () => 0)
  const incomeBySource: Record<string, number> = {}
  const spend: Record<string, number> = {}
  for (const p of state.purse.events) {
    const w = weekOf(p.date)
    if (p.kind === 'earn' && BEHAVIOR.has(sourcePrefix(p.source)) && w >= 1 && w <= lastWeek) {
      const bare = p.amount / (1 + (bonusOn.get(p.date) ?? 0))
      income[w - 1] += p.amount
      incomeBase[w - 1] += bare
      if (w <= BOOK_WEEKS) incomeBySource[sourcePrefix(p.source)] = (incomeBySource[sourcePrefix(p.source)] ?? 0) + bare
    }
    if (p.kind === 'spend' || p.kind === 'pledge') spend[sourcePrefix(p.source)] = (spend[sourcePrefix(p.source)] ?? 0) + p.amount
  }
  const benchmark = Array.from({ length: lastWeek }, (_, i) => benchmarkIncome(benchmarkConsistency(i + 1, 0), benchmarkContractMultiplier(i + 1)))
  const benchmarkGrace = Array.from({ length: lastWeek }, (_, i) => benchmarkIncome(benchmarkConsistency(i + 1, grace[i] ?? 0), benchmarkContractMultiplier(i + 1)))
  const fought = state.log.flatMap((e) => (e.kind === 'grandBattle' && e.stage === 'fought' ? [e] : []))
  const perMonth = Array.from({ length: Math.ceil(lastWeek / MONTH_WEEKS) }, () => 0)
  for (const e of fought) perMonth[Math.floor((weekOf(e.day) - 1) / MONTH_WEEKS)] += 1
  const byTrigger: Record<string, number> = {}
  for (const e of fought) byTrigger[e.trigger] = (byTrigger[e.trigger] ?? 0) + 1
  const assaults = state.log.flatMap((e) => (e.kind === 'assault' && e.outcome !== 'revealed' ? [e] : []))
  const firstMonth = assaults.filter((e) => weekOf(e.day) <= MONTH_WEEKS)
  const contracts = state.log.flatMap((e) => (e.kind === 'contract' && e.outcome === 'paid' ? [e] : []))
  const closes = state.weight.weeks.map((w) => w.realmConsistency)
  const firstTerm: Record<string, number> = {}
  for (const e of state.log) {
    if (e.kind === 'contractSealed' && e.contractKind !== 'accord' && firstTerm[e.termDays] === undefined) firstTerm[e.termDays] = weekOf(e.startDate)
  }

  return {
    seed: o.seed,
    profile: o.profile,
    policy: o.policy,
    variant: o.variant,
    status: state.campaign.status,
    lastWeek,
    ...(end && end.kind === 'campaignEnd' && end.outcome === 'won' ? { wonWeek: endWeek } : {}),
    ...(end && end.kind === 'campaignEnd' && end.outcome === 'fallen' ? { fallWeek: endWeek } : {}),
    ultimatums: state.log.flatMap((e) => (e.kind === 'ascendancy' && e.stage === 'ultimatum' ? [weekOf(e.day)] : [])),
    sieges: fought.filter((e) => e.trigger === 'siege').map((e) => ({ week: weekOf(e.day), won: e.result !== 'defeat' })),
    warnings: state.log.flatMap((e) => (e.kind === 'ascendancy' && e.stage === 'warning' ? [weekOf(e.day)] : [])),
    maxAscendancyStreak,
    resolutions: state.log.flatMap((e) => (e.kind === 'rivalResolved' ? [{ rival: e.rival, how: e.how, week: weekOf(e.day) }] : [])),
    coalitions: state.log.flatMap((e) => (e.kind === 'coalition' && e.stage === 'formed' ? [weekOf(e.day)] : [])),
    grandBattles: { fought: fought.length, won: fought.filter((e) => e.result !== 'defeat').length, perMonth, byTrigger },
    hexes,
    borderCampaignHexes: state.log.filter((e) => e.kind === 'borderCampaign' && e.taken).length,
    firstMonth: { assaults: firstMonth.length, repulsed: firstMonth.filter((e) => e.outcome === 'repulsed').length },
    assaults: { total: assaults.length, repulsed: assaults.filter((e) => e.outcome === 'repulsed').length },
    income: income.map(tenth),
    incomeBase: incomeBase.map(tenth),
    incomeBySource: Object.fromEntries(Object.entries(incomeBySource).map(([k, v]) => [k, tenth(v)]).sort()),
    firstTerm,
    benchmark: benchmark.map(tenth),
    benchmarkGrace: benchmarkGrace.map(tenth),
    spend: Object.fromEntries(Object.entries(spend).map(([k, v]) => [k, tenth(Math.abs(v))]).sort()),
    binds: {
      tierIVDominionWeeks,
      contracts: contracts.length,
      zeroPayContracts: contracts.filter((e) => e.payout === 0).length,
      grandLost: fought.filter((e) => e.result === 'defeat').length
    },
    trophyWeeks: state.log.flatMap((e) => (e.kind === 'trophy' && e.item ? [weekOf(e.day)] : [])),
    q: closes.length > 0 ? Math.round((closes.reduce((s, v) => s + v, 0) / closes.length) * 1000) / 1000 : 0,
    milestones: state.log.filter((e) => e.kind === 'milestone').length,
    violations
  }
}
