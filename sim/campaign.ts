/**
 * One simulated campaign (T13): founded with `foundCampaign`, played by a policy, settled day by
 * day with `settle` against the profile's synthetic ledger, measured, and checked against Ch 15's
 * invariants: no loss before week 36 (44 at Grace III); rings 0 to 2 never change owner; settling a
 * sample of days again changes nothing; every purse gain has a behavior, battle or land source; no
 * Momentum above the target pace.
 *
 * Pure apart from the clock-free rules it imports: the same options always give the same result.
 */
import { tierOffer } from '../src/renderer/src/lib/game/buildings'
import { foundCampaign } from '../src/renderer/src/lib/game/campaign'
import { addDays, campaignWeek, dayCloseInstant, isWeekCloseDay } from '../src/renderer/src/lib/game/clock'
import { balance } from '../src/renderer/src/lib/game/economy'
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
  /** The rules variant the worker runs under (`base`, `income`, or `<lever>:<delta>`). */
  variant: string
}

export interface RunResult {
  seed: number
  profile: ProfileId
  policy: PolicyId
  variant: string
  status: CampaignState['campaign']['status']
  lastWeek: number
  wonWeek?: number
  fallWeek?: number
  /** Weeks an Ultimatum was issued. */
  ultimatums: number[]
  resolutions: { rival: string; how: string; week: number }[]
  /** Weeks a coalition formed. */
  coalitions: number[]
  grandBattles: { fought: number; won: number; perMonth: number[] }
  /** Hexes held at the end of each 4-week month: the player's and each rival's. */
  hexes: Record<string, number[]>
  borderCampaignHexes: number
  firstMonth: { assaults: number; repulsed: number }
  /** Behavior income (no tithes, spoils or land) by campaign week, from week 1. */
  income: number[]
  /** The hidden benchmark's income BI by week, at Grace 0 and as the rivals earned it. */
  benchmark: number[]
  benchmarkGrace: number[]
  /** Reputation spent, by what it bought. */
  spend: Record<string, number>
  binds: { tierIVDominion: boolean; contracts: number; zeroPayContracts: number; grandLost: number }
  /** Mean Realm Consistency at the week closes. */
  q: number
  violations: string[]
}

const BEHAVIOR = new Set(['duties', 'perfectDay', 'streak', 'steps', 'calories', 'flawless', 'momentum', 'contract', 'correction'])
const BATTLE = new Set(['defense', 'assault', 'grandBattle', 'mythicHunt', 'royalHunt', 'tribute'])
const LAND = new Set(['tithe', 'courtship', 'deal', 'goblinOffer', 'auction', 'uprising', 'reclaim'])
/** Gains that are neither: the founding grant and the Bank's interest on the purse. */
const OTHER = new Set(['founding', 'interest', 'dev'])
const GAINS = new Set(['earn', 'return', 'spoils', 'tithe', 'adjust', 'interest'])
const MONTH_WEEKS = RULES.grandBattles.monthWeeks
const IDEMPOTENCE_SAMPLES = 6

/** The instant just after `day` closes in the campaign's zone. */
function after(day: ISODate): Date {
  return new Date(dayCloseInstant(day, TZ).getTime() + 60_000)
}

function weekOf(day: ISODate): number {
  return campaignWeek(START, day, 1)
}

function graceByWeek(state: CampaignState, weeks: number): GraceLevel[] {
  const out: GraceLevel[] = []
  let level: GraceLevel = 0
  const changes = state.log.filter((e) => e.kind === 'grace').map((e) => ({ week: weekOf(e.day), to: e.kind === 'grace' ? e.to : 0 }))
  for (let w = 1; w <= weeks; w++) {
    for (const c of changes) if (c.week === w) level = c.to as GraceLevel
    out.push(level)
  }
  return out
}

function sourceOf(source: string): string {
  return source.split(':')[0]
}

function fingerprint(state: CampaignState): string {
  const text = JSON.stringify(state)
  let h = 0
  for (let i = 0; i < text.length; i++) h = (Math.imul(h, 31) + text.charCodeAt(i)) | 0
  return `${text.length}:${h}`
}

/** Drives one campaign and measures it. */
export function runCampaign(o: RunOptions): RunResult {
  const profile = profileOf(o.profile)
  const days = o.weeks * RULES.clock.daysPerWeek
  const ledger = ledgerFor(profile, o.seed, days)
  const charter = { stepPool: JOURNEY.stepPool, calorieLimit: JOURNEY.calorieLimit, duties: [...JOURNEY.duties] }
  const founded = foundCampaign({ startWeight: JOURNEY.startLb, goalWeight: JOURNEY.goalLb, charter, timeZone: TZ, seed: o.seed, ledger }, FOUNDED_AT)
  let state = settle(founded, ledger, after(addDays(START, -1)), { launch: true }).state
  const violations: string[] = []
  const hexes: Record<string, number[]> = { player: [], ...Object.fromEntries(RIVAL_IDS.map((r) => [r, []])) }
  let tierIVDominion = false
  let contractNo = 0
  const nextId = (): string => `sim-${(contractNo += 1)}`

  for (let i = 0; i < days; i++) {
    const today = addDays(START, i)
    const weekStart = isWeekCloseDay(addDays(today, -1), state.campaign.weekStartsOn)
    if (weekStart) {
      // Lever binding: a Tier IV the purse could pay for, held back by Dominion alone.
      for (const b of BUILDING_IDS) {
        const offer = tierOffer(state, b)
        if (state.buildings[b] === 3 && offer.reason?.code === 'dominion' && balance(state.purse) >= offer.cost) tierIVDominion = true
      }
    }
    state = act(state, today, { policy: o.policy, rough: isRoughDay(profile, o.seed, today), nextId })
    const now = after(today)
    state = settle(state, ledger, now).state
    // Test 9: settling again, now or from an earlier instant, changes nothing.
    if (draw(o.seed, today, 'sim:idempotence') < IDEMPOTENCE_SAMPLES / days) {
      const before = fingerprint(state)
      const again = settle(state, ledger, now).state
      const earlier = settle(state, ledger, after(addDays(today, -RULES.clock.daysPerWeek))).state
      if (fingerprint(again) !== before || fingerprint(earlier) !== before) violations.push(`${today}: settling again changed the campaign`)
    }
    if (isWeekCloseDay(today, state.campaign.weekStartsOn) && weekOf(today) % MONTH_WEEKS === 0) {
      hexes.player.push(state.hexes.filter((h) => h.owner === 'player').length)
      for (const r of RIVAL_IDS) hexes[r].push(state.hexes.filter((h) => h.owner === r).length)
    }
    if (state.campaign.status === 'fallen') break
  }

  const lastWeek = weekOf(state.settledThrough.day)
  const grace = graceByWeek(state, lastWeek)
  const ring = new Map(state.hexes.map((h) => [h.id, h.ring]))
  const end = state.log.find((e) => e.kind === 'campaignEnd')
  const endWeek = end ? weekOf(end.day) : undefined

  // The invariants (Ch 15).
  if (end && end.kind === 'campaignEnd' && end.outcome === 'fallen') {
    const from = (grace[(endWeek ?? 1) - 1] ?? 0) >= 3 ? RULES.defeat.ascendancy.fromWeekGraceIII : RULES.defeat.ascendancy.fromWeek
    if ((endWeek ?? 0) < from) violations.push(`fell in week ${endWeek} at Grace ${grace[(endWeek ?? 1) - 1]}`)
  }
  for (const e of state.log) {
    if (e.kind === 'hexTransfer' && e.to !== 'player' && (ring.get(e.hexId) ?? 9) <= RULES.land.protectedThroughRing) violations.push(`${e.day}: ring ${ring.get(e.hexId)} hex ${e.hexId} passed to ${e.to}`)
  }
  for (const p of state.purse.events) {
    if (!GAINS.has(p.kind)) continue
    const src = sourceOf(p.source)
    if (!BEHAVIOR.has(src) && !BATTLE.has(src) && !LAND.has(src) && !OTHER.has(src)) violations.push(`${p.date}: a ${p.kind} of ${p.amount} from "${p.source}"`)
  }
  for (const w of state.weight.weeks) {
    if (w.momentum > 1 + 1e-9) violations.push(`week ${w.week}: Momentum ${w.momentum} above the target pace`)
    if (w.tooFast && w.momentum > RULES.momentum.tooFast.heldMw + 1e-9) violations.push(`week ${w.week}: Momentum ${w.momentum} while too fast`)
  }

  const income = Array.from({ length: lastWeek }, () => 0)
  const spend: Record<string, number> = {}
  for (const p of state.purse.events) {
    const w = weekOf(p.date)
    if (p.kind === 'earn' && BEHAVIOR.has(sourceOf(p.source)) && w >= 1 && w <= lastWeek) income[w - 1] += p.amount
    if (p.kind === 'spend' || p.kind === 'pledge') spend[sourceOf(p.source)] = (spend[sourceOf(p.source)] ?? 0) + p.amount
  }
  const benchmark = Array.from({ length: lastWeek }, (_, i) => benchmarkIncome(benchmarkConsistency(i + 1, 0), benchmarkContractMultiplier(i + 1)))
  const benchmarkGrace = Array.from({ length: lastWeek }, (_, i) => benchmarkIncome(benchmarkConsistency(i + 1, grace[i] ?? 0), benchmarkContractMultiplier(i + 1)))
  const fought = state.log.filter((e) => e.kind === 'grandBattle' && e.stage === 'fought')
  const perMonth = Array.from({ length: Math.ceil(lastWeek / MONTH_WEEKS) }, () => 0)
  for (const e of fought) perMonth[Math.floor((weekOf(e.day) - 1) / MONTH_WEEKS)] += 1
  const firstMonthAssaults = state.log.filter((e) => e.kind === 'assault' && weekOf(e.day) <= MONTH_WEEKS && e.outcome !== 'revealed')
  const contracts = state.log.filter((e) => e.kind === 'contract' && e.outcome === 'paid')
  const closes = state.weight.weeks.map((w) => w.realmConsistency)

  return {
    seed: o.seed,
    profile: o.profile,
    policy: o.policy,
    variant: o.variant,
    status: state.campaign.status,
    lastWeek,
    ...(end && end.kind === 'campaignEnd' && end.outcome === 'won' ? { wonWeek: endWeek } : {}),
    ...(end && end.kind === 'campaignEnd' && end.outcome === 'fallen' ? { fallWeek: endWeek } : {}),
    ultimatums: state.log.filter((e) => e.kind === 'ascendancy' && e.stage === 'ultimatum').map((e) => weekOf(e.day)),
    resolutions: state.log.flatMap((e) => (e.kind === 'rivalResolved' ? [{ rival: e.rival, how: e.how, week: weekOf(e.day) }] : [])),
    coalitions: state.log.filter((e) => e.kind === 'coalition' && e.stage === 'formed').map((e) => weekOf(e.day)),
    grandBattles: { fought: fought.length, won: fought.filter((e) => e.kind === 'grandBattle' && e.result !== 'defeat').length, perMonth },
    hexes,
    borderCampaignHexes: state.log.filter((e) => e.kind === 'borderCampaign' && e.taken).length,
    firstMonth: { assaults: firstMonthAssaults.length, repulsed: firstMonthAssaults.filter((e) => e.kind === 'assault' && e.outcome === 'repulsed').length },
    income: income.map((v) => Math.round(v * 10) / 10),
    benchmark: benchmark.map((v) => Math.round(v * 10) / 10),
    benchmarkGrace: benchmarkGrace.map((v) => Math.round(v * 10) / 10),
    spend: Object.fromEntries(Object.entries(spend).map(([k, v]) => [k, Math.round(Math.abs(v) * 10) / 10]).sort()),
    binds: {
      tierIVDominion,
      contracts: contracts.length,
      zeroPayContracts: contracts.filter((e) => e.kind === 'contract' && e.payout === 0).length,
      grandLost: fought.filter((e) => e.kind === 'grandBattle' && e.result === 'defeat').length
    },
    q: closes.length > 0 ? Math.round((closes.reduce((s, v) => s + v, 0) / closes.length) * 1000) / 1000 : 0,
    violations
  }
}
