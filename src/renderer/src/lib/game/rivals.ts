/**
 * The four rivals (Ch 12; Ch 10 "The day's threats"; Ch 6 rival bids; A-04, A-17, A-18, A-20,
 * A-23 to A-26, A-33, A-37, A-38).
 *
 * - **The hidden benchmark.** Every rival earns `BI × its multiplier + its tithes` a week, where BI
 *   is the income of a Benchmark Lord keeping the player's Charter at consistency `b`. Neither `b`
 *   nor the income ever reaches the screen.
 * - **The weekly turn** (`rivalTurn`, the `rivalTurn` week phase): for each active rival in a seeded
 *   order it earns, splits its budget above a 100 reserve by personality, buys companies, expands,
 *   fortifies, spends on its special, sets its disposition toward the player and plans next week's
 *   conquest attempt. Raids need nothing more: T08 draws next week's raiders from the dispositions
 *   set here.
 * - **Village bids.** A rival's expansion bid waits for the next week close, so the player's bids
 *   placed in the meantime meet it there. `rivalBidsAtClose` runs just before courtships resolve:
 *   a rival bid on a village the player courts joins that courtship as a second suitor, and each
 *   rival counter-bids on its own villages the player courts (step 8). Bids nobody else made resolve
 *   in `resolveRivalCourtships` (land.ts).
 * - **Fronts** (`settleFronts`, the `fronts` phase): the week's daily skirmishes, war losses, and
 *   Peace pulling the track back to 0. **Border Campaigns** (`borderCampaigns`) in the hidden
 *   weeks, then `drawFronts` sets every front's state for the coming week.
 * - **Respect, Threat, Power and disposition** as pure functions, for T12, T13 and the screens.
 * - **What the player sees** (`rivalView`): bands and text ids, never a hidden number.
 *
 * The Archmage's Long Night and Veil of Fog reach daily combat through `COMBAT_HOOKS`, installed
 * when this module loads; the Orc's Warhost reaches T12 as a `WarhostRequest`.
 *
 * Pure and deterministic: randomness goes through `rng.ts` on the week close's date, with labels
 * `rivals:order`, `rival:<id>:den:<n>`, `conquest:<id>:day`, `warhost:target`, `summoning:hex`,
 * `skirmish:<front>` (on each day of the week), `front:<front>` and `borderCampaign:<front>`.
 */
import { CODEX } from './codex'
import { addDays, diffDays, weekOf } from './clock'
import { COMBAT_HOOKS, armyValue, band, baseArmyValue, defenseFor, effectiveGarrison, planConquest, type Band } from './combat'
import { payoutCurve } from './contracts'
import { balance, weekShare } from './economy'
import { realmEffects } from './effects'
import { blocksConquest, callToArmsOn, fortificationCap, fortificationCost, placeRivalBid, resistance, tradeValue } from './land'
import { borderHexesOf, fronts as rimFronts, hexIndex, isClaimableKind, nearestTo, touches } from './map'
import { RULES, base, type DeepReadonly } from './rules'
import { chance, draw, int, pick, roll, shuffle } from './rng'
import { refreshRoster, roster } from './roster'
import { adjustRespect, coalitionPartners, inCoalition, patchRival, replaceHex, toRival } from './state'
import type { HostUnitEntry } from './codex'
import {
  FRONT_IDS,
  RIVAL_IDS,
  type CampaignState,
  type Company,
  type DayRecord,
  type Disposition,
  type Effects,
  type Emit,
  type FrontId,
  type FrontState,
  type GraceLevel,
  type HexState,
  type ISODate,
  type Owner,
  type Pillars,
  type RivalId,
  type RivalMemory,
  type RivalSpend,
  type RivalState,
  type WeekStartsOn
} from './types'

const SPENDS: readonly RivalSpend[] = ['army', 'expand', 'fortify', 'special']

// ── Small helpers ────────────────────────────────────────────────────────────

function sum(values: readonly number[]): number {
  return values.reduce((s, x) => s + x, 0)
}

function patchMemory(state: CampaignState, rival: RivalId, patch: Partial<RivalMemory>): CampaignState {
  const r = state.rivals[rival]
  return patchRival(state, rival, { ai: { ...r.ai, ...patch } })
}

function isActive(state: CampaignState, rival: RivalId): boolean {
  return state.rivals[rival].status === 'active'
}

/** What a hex is worth to a rival choosing where to grow: the Dominion it would give on a road, 2 × ring (A-25). */
function dominionValue(hex: HexState): number {
  return RULES.map.dominion.roadPerRing * hex.ring
}

/** Unspent reputation: the treasury and the special fund it is saving (Ch 12 "treasury"). */
export function holdings(r: RivalState): number {
  return r.treasury + r.specialFund
}

// ── The founding (A-18) ──────────────────────────────────────────────────────

/** A rival's host companies from its Appendix C list, strongest first (the commander apart). */
export function hostUnits(rival: RivalId): DeepReadonly<HostUnitEntry>[] {
  const host = CODEX.hosts.find((h) => h.rival === rival)
  if (!host) throw new Error(`The codex has no host for ${rival}`)
  return [...host.companies].sort((a, b) => b.power - a.power)
}

/** The next free number for a rival company's id (`<rival>:<unit>:<n>`). */
function nextCompanyNo(companies: readonly Company[]): number {
  let max = 0
  for (const c of companies) {
    const n = Number(c.id.slice(c.id.lastIndexOf(':') + 1))
    if (Number.isFinite(n) && n > max) max = n
  }
  return max + 1
}

/** A company bought from a rival's host list. Host companies carry no tags: they match as their rival's type (Ch 10). */
export function hostCompany(rival: RivalId, unit: DeepReadonly<HostUnitEntry>, n: number): Company {
  return { id: `${rival}:${unit.id}:${n}`, name: unit.name, source: 'host', power: unit.power, tags: [], reach: unit.reach, items: [] }
}

/** A rival's starting army (A-18): about 40 power from its own host list, strongest affordable first. */
export function startingArmy(rival: RivalId): Company[] {
  const units = hostUnits(rival)
  const army: Company[] = []
  let budget = RULES.rivals.start.armyPower
  for (;;) {
    const unit = units.find((u) => u.power <= budget)
    if (!unit) break
    army.push(hostCompany(rival, unit, army.length + 1))
    budget -= unit.power
  }
  return army
}

/**
 * The rivals at the founding (A-18): treasury 150, an army of about 40 power, Respect 20, Tension
 * toward the player (so raids come from day 1), Peace with each neighbor on a Rim front with the
 * track at 0. Threat is computed at the first week close. The start is the same for every seed;
 * `map` must give every rival land.
 */
export function initRivals(_seed: number, map: readonly HexState[]): Record<RivalId, RivalState> {
  const start = RULES.rivals.start
  const rim = rimFronts()
  const out = {} as Record<RivalId, RivalState>
  for (const rival of RIVAL_IDS) {
    if (!map.some((h) => h.owner === rival)) throw new Error(`The map gives ${rival} no land`)
    const disposition: RivalState['disposition'] = { player: start.disposition }
    const frontTracks: RivalState['frontTracks'] = {}
    for (const f of rim.filter((x) => x.rivals.includes(rival))) {
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

// ── The hidden benchmark (Ch 12) ─────────────────────────────────────────────

/** `b` for a campaign week: 72 / 78 / 82 / 86% by phase, 3 points lower at Grace II and 6 at Grace III, never below 70%. */
export function benchmarkConsistency(week: number, grace: GraceLevel = 0): number {
  const bm = RULES.rivals.benchmark
  let b = bm.phases[0].b
  for (const p of bm.phases) if (week >= p.fromWeek) b = p.b
  return Math.max(bm.floor, b - (bm.graceEase[grace] ?? 0))
}

/** The benchmark's contract multiplier `L`: 1.0 in weeks 1–2, 1.4 from week 3, 1.7 from week 10, 2.0 from week 21. */
export function benchmarkContractMultiplier(week: number): number {
  let L = RULES.rivals.benchmark.contractMultiplier[0].L
  for (const m of RULES.rivals.benchmark.contractMultiplier) if (week >= m.fromWeek) L = m.L
  return L
}

/**
 * BI = 84b + 5P + P(P − 1)/2 + 140b + 60 + 70 × L × f(b), P = round(7b³): duties kept at `b`,
 * P perfect days with their streak, steps and calories at `b`, full Momentum, and a 7-day contract
 * at score `b`. Every term comes from the player's own reward rules.
 */
export function benchmarkIncome(b: number, L: number): number {
  const daily = RULES.reputation.daily
  const weekly = RULES.reputation.weekly
  const days = RULES.clock.daysPerWeek
  const P = Math.round(RULES.rivals.benchmark.perfectDaysPerB3 * b ** 3) // rules-ok: the book's b³
  return (
    daily.duties * days * b +
    daily.perfectDay * P +
    (daily.streakPerDay * P * (P - 1)) / 2 +
    (weekly.steps + weekly.calories) * b +
    weekly.momentum +
    RULES.contracts.payoutPerDay * days * L * payoutCurve(b)
  )
}

/** A rival's tithes: 4 × ring for each village it holds. */
export function rivalTithes(state: CampaignState, rival: RivalId): number {
  return sum(state.hexes.filter((h) => h.owner === rival && h.village).map((h) => RULES.reputation.weekly.tithePerRing * h.ring))
}

/** A rival's income for a campaign week of `days` days: BI × its multiplier + its tithes, prorated in a partial week 1 (A-04). */
export function rivalIncome(state: CampaignState, rival: RivalId, week: number, days: number = RULES.clock.daysPerWeek): number {
  const bi = benchmarkIncome(benchmarkConsistency(week, state.weight.grace), benchmarkContractMultiplier(week))
  return (bi * RULES.rivals.incomeMult[rival] + rivalTithes(state, rival)) * weekShare(days)
}

// ── Power, Threat and disposition (Ch 12, Ch 14) ─────────────────────────────

/** Power = 0.5 × treasury + 3 × AV + 10 × Σ ring of hexes held. */
export function power(treasury: number, armyValueOf: number, ringsHeld: number): number {
  const p = RULES.defeat.power
  return p.treasury * treasury + p.army * armyValueOf + p.perRing * ringsHeld
}

function ringsHeld(state: CampaignState, owner: Owner): number {
  return sum(state.hexes.filter((h) => h.owner === owner).map((h) => h.ring))
}

/** The player's Army value for Power and the army bands: only their best (banners + 2) companies (A-24). */
export function playerArmyValue(state: CampaignState, effects: Effects = realmEffects(state)): number {
  const best = roster(state, {}, effects)
    .map((c) => c.power)
    .sort((a, b) => b - a)
    .slice(0, effects.banners.value + RULES.grandBattles.companiesOverBanners)
  return sum(best)
}

export function playerPower(state: CampaignState, effects: Effects = realmEffects(state)): number {
  return power(balance(state.purse), playerArmyValue(state, effects), ringsHeld(state, 'player'))
}

/** A rival's Power, its treasury counting what its special fund has saved. */
export function rivalPower(state: CampaignState, rival: RivalId, date?: ISODate): number {
  return power(holdings(state.rivals[rival]), armyValue(state, rival, date), ringsHeld(state, rival))
}

export interface ThreatInput {
  playerPower: number
  averageRivalPower: number
  /** Rivals resolved so far. */
  resolved: number
  /** The player's hexes touching this rival's land. */
  borderHexes: number
  /** The player took this rival's land in the last 4 weeks. */
  tookLand: boolean
}

/** Threat = 40 × min(2, player Power ÷ average rival Power) + 15 × resolved, +10 on 3+ shared hexes, +10 for land taken in 4 weeks, at most 100. */
export function threatScore(i: ThreatInput): number {
  const t = RULES.rivals.threat
  const ratio = i.averageRivalPower > 0 ? i.playerPower / i.averageRivalPower : t.ratioCap
  let value = t.ratioWeight * Math.min(t.ratioCap, ratio) + t.perResolved * i.resolved
  if (i.borderHexes >= t.border.minHexes) value += t.border.bonus
  if (i.tookLand) value += t.recentLand.bonus
  return Math.min(t.max, value)
}

export interface DispositionInput {
  threat: number
  /** The player took its land in the last 2 weeks. */
  tookLand: boolean
  /** It is in a coalition against the player. */
  inCoalition: boolean
  respect: number
  /** No hostile act either way in the last 4 weeks. */
  quiet: boolean
}

/** War at Threat 60, land taken in 2 weeks or a coalition; Peace at Respect 50 and 4 quiet weeks; otherwise Tension. */
export function dispositionFor(i: DispositionInput): Disposition {
  const d = RULES.rivals.disposition
  if (i.threat >= d.warThreat || i.tookLand || i.inCoalition) return 'war'
  if (i.respect >= d.peaceRespect && i.quiet) return 'peace'
  return 'tension'
}

/** The `days` days ending `end` (inclusive): a test for an event's day. */
function window(end: ISODate, days: number): (day: ISODate) => boolean {
  const from = addDays(end, 1 - days)
  return (day) => from <= day && day <= end
}

function weeksToDays(weeks: number): number {
  return weeks * RULES.clock.daysPerWeek
}

/** The player took `rival`'s land (by conquest or by courting a village away) in the `days` days ending `day`. */
export function tookLandFrom(state: CampaignState, rival: RivalId, day: ISODate, days: number): boolean {
  const inside = window(day, days)
  return state.log.some((e) => e.kind === 'hexTransfer' && e.from === rival && e.to === 'player' && (e.how === 'conquest' || e.how === 'influence') && inside(e.day))
}

/**
 * A hostile act between the player and `rival` in the `days` days ending `day` (A-149): one of its
 * raids or conquest attempts struck (won or lost), the player assaulted its land, or a hex passed
 * between them by conquest or influence.
 */
export function hostileAct(state: CampaignState, rival: RivalId, day: ISODate, days: number): boolean {
  const inside = window(day, days)
  return state.log.some((e) => {
    if (!inside(e.day)) return false
    if (e.kind === 'defense') return e.rival === rival
    if (e.kind === 'assault') return e.owner === rival
    if (e.kind === 'hexTransfer') {
      const between = (e.from === rival && e.to === 'player') || (e.from === 'player' && e.to === rival)
      return between && (e.how === 'conquest' || e.how === 'influence')
    }
    return false
  })
}

/** The player's hexes touching `rival`'s land. */
export function sharedBorder(state: CampaignState, rival: RivalId): number {
  const byId = hexIndex(state.hexes)
  return state.hexes.filter((h) => h.owner === 'player' && touches(byId, h.id, rival)).length
}

/** `rival`'s Threat now (Ch 12): its view of the player's Power against the active rivals' average. */
export function threatOf(state: CampaignState, rival: RivalId, day: ISODate, effects: Effects = realmEffects(state)): number {
  const date = addDays(day, 1)
  const active = RIVAL_IDS.filter((r) => isActive(state, r))
  const average = active.length > 0 ? sum(active.map((r) => rivalPower(state, r, date))) / active.length : 0
  return threatScore({
    playerPower: playerPower(state, effects),
    averageRivalPower: average,
    resolved: RIVAL_IDS.length - active.length,
    borderHexes: sharedBorder(state, rival),
    tookLand: tookLandFrom(state, rival, day, weeksToDays(RULES.rivals.threat.recentLand.weeks))
  })
}

// ── Respect (Ch 12; `adjustRespect` in state.ts changes it) ──────────────────

/** What a rival's Respect opens (Ch 12 thresholds): for T08 (weaker raids), T09 (deals) and T13 (Accords). */
export interface RespectEffects {
  /** Its raids strike 10% weaker. */
  raidsWeaker: boolean
  /** It sells the player a hex (the Goblin from 25, the others from 50). */
  sellsHex: boolean
  /** It buys a hex from the player. */
  buysHex: boolean
  pact: boolean
  envoy: boolean
  accordTalks: boolean
  callToArms: boolean
  accordEasier: boolean
}

export function respectEffects(rival: RivalId, respect: number): RespectEffects {
  const th = RULES.respect.thresholds
  return {
    raidsWeaker: respect >= th.raidsWeaker,
    sellsHex: respect >= (rival === 'goblin' ? th.goblinBuysHex : th.buyHex),
    buysHex: respect >= th.sellHex,
    pact: respect >= th.pact,
    envoy: respect >= th.envoy,
    accordTalks: respect >= th.accordTalks,
    callToArms: respect >= th.callToArms,
    accordEasier: respect >= th.accordEasier
  }
}

/** The week's behavior as the prized habits read it. */
export interface WeekHabits {
  /** The campaign days of the week. */
  days: readonly DayRecord[]
  pillars: Pillars
}

/** A battle of any kind the player lost in the days `from` through `to`: a defense, a repulsed assault or a Grand Battle. */
function lostBattle(state: CampaignState, from: ISODate, to: ISODate): boolean {
  return state.log.some((e) => {
    if (e.day < from || e.day > to) return false
    if (e.kind === 'defense') return e.outcome === 'defeat'
    if (e.kind === 'assault') return e.outcome === 'repulsed'
    if (e.kind === 'grandBattle') return e.stage === 'fought' && e.result === 'defeat'
    return false
  })
}

/**
 * Whether the week ending `day` was one of the habit `rival` prizes (A-38): the Orc, no lost battle
 * of any kind; the Goblin, the budget score at 100% with food logged on 5 days or more; the
 * Archmage, every sworn duty kept every day; the Dwarf, the step pool met.
 */
export function prizedWeek(state: CampaignState, rival: RivalId, habits: WeekHabits, day: ISODate, weekStartsOn: WeekStartsOn): boolean {
  const entry = CODEX.rivals.find((r) => r.id === rival)
  if (!entry || habits.days.length === 0) return false
  switch (entry.prizes) {
    case 'noLostBattle':
      return !lostBattle(state, weekOf(day, weekStartsOn), day)
    case 'calorieAverage':
      return habits.pillars.table >= 1 && habits.days.filter((d) => d.eaten !== undefined).length >= RULES.rivals.goblinPrizedFoodDays
    case 'allDuties':
      return habits.days.every((d) => d.dutiesSworn > 0 && d.dutiesKept >= d.dutiesSworn)
    case 'stepPool':
      return habits.pillars.steps >= 1
  }
}

// ── The weekly turn (Ch 12 steps 1 to 8) ─────────────────────────────────────

export interface RivalWeek {
  /** The week's last day; its close is the week close. */
  day: ISODate
  week: number
  weekStartsOn: WeekStartsOn
  /** Campaign days in this week: 7, or fewer in a partial week 1 (A-04). */
  days: number
  /** The Valor a rival expects the player to defend with: the week's average (step 7). */
  valor: number
  habits: WeekHabits
  emit: Emit
}

/** The Orc's Warhost (step 6): an Incursion-style Grand Battle at the player's border, for T12's queue. */
export interface WarhostRequest {
  rival: RivalId
  hexId: string
  day: ISODate
}

export interface RivalTurnResult {
  state: CampaignState
  warhosts: WarhostRequest[]
}

/** Each point of power costs 10 × (1 + AV / 150). */
export function armyPointCost(av: number): number {
  const c = RULES.rivals.armyCost
  return c.perPower * (1 + av / c.armyScale)
}

/**
 * The week close's rival turn: Respect for the prized habit (A-38), then each active rival's turn
 * in a seeded order. Settles once: the `rivalTurn` phase runs it once per week close.
 */
export function rivalTurn(input: CampaignState, w: RivalWeek): RivalTurnResult {
  let state = input
  const effects = realmEffects(state)
  const active = RIVAL_IDS.filter((r) => isActive(state, r))
  for (const rival of active) {
    if (prizedWeek(state, rival, w.habits, w.day, w.weekStartsOn)) state = adjustRespect(state, rival, RULES.respect.change.prizedWeek, 'prizedWeek', w.emit)
  }
  const warhosts: WarhostRequest[] = []
  for (const rival of shuffle(state.campaign.seed, w.day, 'rivals:order', active)) {
    const turn = oneTurn(state, rival, w, effects)
    state = turn.state
    if (turn.warhost) warhosts.push(turn.warhost)
  }
  return { state, warhosts }
}

interface Spending {
  state: CampaignState
  spent: number
}

/** One rival's turn. `effects` are the player's realm effects at the close: rival turns never change them. */
function oneTurn(input: CampaignState, rival: RivalId, w: RivalWeek, effects: Effects): { state: CampaignState; warhost?: WarhostRequest } {
  // 1. Earn.
  let state = patchRival(input, rival, { treasury: input.rivals[rival].treasury + rivalIncome(input, rival, w.week, w.days) })

  // 2. Split the budget above the reserve.
  const budget = Math.max(0, state.rivals[rival].treasury - RULES.rivals.reserve)
  const split = RULES.rivals.budget[rival]
  const spent: Record<RivalSpend, number> = { army: 0, expand: 0, fortify: 0, special: 0 }

  // 3. Army.
  let step: Spending = buyArmy(state, rival, budget * split.army)
  state = step.state
  spent.army = step.spent

  // 4. Expand.
  step = expand(state, rival, budget * split.expand, w)
  state = step.state
  spent.expand = step.spent

  // 5. Fortify; the Dwarf's special share is the Deep Halls, spent on more walls at its discount (A-150).
  const deepHalls = rival === 'dwarf' ? split.special : 0
  step = fortifyBorder(state, rival, budget * (split.fortify + deepHalls))
  state = step.state
  spent.fortify = step.spent

  // 6. Special.
  let warhost: WarhostRequest | undefined
  if (rival !== 'dwarf') {
    const amount = budget * split.special
    const r = state.rivals[rival]
    state = patchRival(state, rival, { treasury: r.treasury - amount, specialFund: r.specialFund + amount })
    spent.special = amount
    if (rival === 'orc') ({ state, warhost } = warhostFund(state, w))
    else if (rival === 'goblin') state = market(state, w)
    else state = rituals(state, w)
  }

  // 7. Disposition toward the player, and next week's conquest attempt.
  state = setDisposition(state, rival, w, effects)
  state = planConquests(state, rival, w, effects)

  // The Herald's rumor: what this turn spent most on.
  const top = SPENDS.reduce<RivalSpend | undefined>((best, s) => (spent[s] > 0 && (!best || spent[s] > spent[best]) ? s : best), undefined)
  const ai: RivalMemory = { ...state.rivals[rival].ai }
  if (top) ai.rumor = top
  else delete ai.rumor
  state = patchRival(state, rival, { ai })
  return warhost ? { state, warhost } : { state }
}

/** Step 3: whole companies from its host list, strongest affordable first, each priced at the AV before it joins. */
function buyArmy(state: CampaignState, rival: RivalId, allowance: number): Spending {
  const units = hostUnits(rival)
  const companies = [...state.rivals[rival].companies]
  let left = allowance
  let spent = 0
  for (;;) {
    const perPoint = armyPointCost(sum(companies.map((c) => c.power)))
    const unit = units.find((u) => u.power * perPoint <= left)
    if (!unit) break
    const cost = unit.power * perPoint
    companies.push(hostCompany(rival, unit, nextCompanyNo(companies)))
    left -= cost
    spent += cost
  }
  if (spent === 0) return { state, spent }
  return { state: patchRival(state, rival, { companies, treasury: state.rivals[rival].treasury - spent }), spent }
}

/**
 * Neutral hexes `rival` may expand into: `claimableBy(…, 'rivalExpand')` (A-25, A-110), checked
 * here for the neutral hexes touching its land only: claimable, not a Lair Mouth, outside rings 0 to 2.
 */
function expansionCandidates(state: CampaignState, rival: RivalId): HexState[] {
  const byId = hexIndex(state.hexes)
  return state.hexes.filter(
    (h) => h.owner === 'neutral' && isClaimableKind(h) && h.kind !== 'lairMouth' && h.ring > RULES.land.protectedThroughRing && touches(byId, h.id, rival)
  )
}

/**
 * Step 4 (A-25): up to one target (the Goblin two). The best affordable village by
 * (2 × ring) ÷ bid, bidding 1.1 × its loyalty (the Goblin 1.3 ×); the bid leaves the treasury now
 * and resolves at the next week close. With no village affordable, the most valuable beast den
 * that 0.5 × AV beats at an average roll, taken if 0.5 × AV × roll(0.85–1.15) ≥ its garrison.
 */
function expand(input: CampaignState, rival: RivalId, allowance: number, w: RivalWeek): Spending {
  const ex = RULES.rivals.expansion
  const { seed } = input.campaign
  let state = input
  let left = allowance
  let spent = 0
  const tried = new Set<string>()
  const worth = (v: { hex: HexState; bid: number }): number => dominionValue(v.hex) / v.bid
  for (let i = 0; i < ex.targets[rival]; i++) {
    const candidates = expansionCandidates(state, rival).filter((h) => !tried.has(h.id))
    const courting = new Set((state.rivals[rival].ai?.courting ?? []).map((c) => c.hexId))
    const villages = candidates
      .filter((h) => h.village && !courting.has(h.id))
      .map((hex) => ({ hex, bid: ex.villageBidMult[rival] * resistance(hex) }))
      .filter((v) => v.bid > 0 && v.bid <= left)
    if (villages.length > 0) {
      const best = villages.reduce((a, b) => (worth(b) > worth(a) || (worth(b) === worth(a) && b.hex.ring > a.hex.ring) ? b : a))
      tried.add(best.hex.id)
      const r = state.rivals[rival]
      state = patchRival(state, rival, {
        treasury: r.treasury - best.bid,
        ai: { ...r.ai, courting: [...(r.ai?.courting ?? []), { hexId: best.hex.id, bid: best.bid, placedOn: w.day }] }
      })
      left -= best.bid
      spent += best.bid
      continue
    }
    const av = armyValue(state, rival, addDays(w.day, 1))
    const dens = candidates.filter((h) => !h.village && !h.mythic && ex.denArmyShare * av >= effectiveGarrison(h))
    if (dens.length === 0) break
    const den = dens.reduce((a, b) => (b.ring > a.ring || (b.ring === a.ring && effectiveGarrison(b) < effectiveGarrison(a)) ? b : a))
    tried.add(den.id)
    const rolled = roll(seed, w.day, `rival:${rival}:den:${i}`, -ex.roll, ex.roll)
    if (ex.denArmyShare * av * (1 + rolled) >= effectiveGarrison(den)) {
      state = replaceHex(state, toRival(den, rival))
      w.emit('hexTransfer', { hexId: den.id, from: 'neutral', to: rival, how: 'conquest' })
    }
  }
  return { state, spent }
}

/** What raising a rival hex to `level` costs: 15 / 35 / 70 × ring, the Dwarf's level 4 at 120 × ring (A-145), × `mult`. */
function rivalFortificationCost(level: number, ring: number, mult: number): number {
  if (level <= RULES.land.fortificationMax) return fortificationCost(level, ring, mult)
  return RULES.rivalAi.dwarfLevel4CostPerRing * ring * mult
}

/**
 * Step 5: one level at a time on its border hexes (those touching land it doesn't hold), the
 * ones facing the player first, then the least fortified, then the innermost. The Dwarf reaches
 * level 4, and its Deep Halls make every level 25% cheaper.
 */
function fortifyBorder(input: CampaignState, rival: RivalId, allowance: number): Spending {
  let state = input
  let left = allowance
  let spent = 0
  const mult = rival === 'dwarf' ? 1 - RULES.rivals.special.dwarfFortifyDiscount : 1
  const cap = fortificationCap(rival)
  const order = new Map(state.hexes.map((h, i) => [h.id, i]))
  for (;;) {
    const byId = hexIndex(state.hexes)
    const candidates = borderHexesOf(state.hexes, rival)
      .filter((h) => isClaimableKind(h) && h.fortification < cap)
      .map((h) => ({ hex: h, facing: touches(byId, h.id, 'player'), cost: rivalFortificationCost(h.fortification + 1, h.ring, mult) }))
      .filter((c) => c.cost <= left)
      .sort(
        (a, b) =>
          Number(b.facing) - Number(a.facing) ||
          a.hex.fortification - b.hex.fortification ||
          a.hex.ring - b.hex.ring ||
          (order.get(a.hex.id) ?? 0) - (order.get(b.hex.id) ?? 0)
      )
    const pickHex = candidates[0]
    if (!pickHex) break
    state = replaceHex(state, { ...pickHex.hex, fortification: (pickHex.hex.fortification + 1) as HexState['fortification'] })
    left -= pickHex.cost
    spent += pickHex.cost
  }
  if (spent === 0) return { state, spent }
  return { state: patchRival(state, rival, { treasury: state.rivals[rival].treasury - spent }), spent }
}

/** Whether `rival` would strike the player now: not at Peace, and no Truce, pact or Accord in force tomorrow. */
function hostileNow(state: CampaignState, rival: RivalId, day: ISODate): boolean {
  return state.rivals[rival].disposition.player !== 'peace' && !blocksConquest(state, rival, addDays(day, 1))
}

/** The player's border hex (rings 1 to 5) nearest `rival`'s land, ties drawn. */
function nearestBorderHex(state: CampaignState, rival: RivalId, day: ISODate, label: string): string | undefined {
  const border = borderHexesOf(state.hexes, 'player').filter(isClaimableKind)
  const nearest = nearestTo(border, state.hexes.filter((h) => h.owner === rival))
  return nearest.length > 0 ? pick(state.campaign.seed, day, label, nearest.map((h) => h.id)) : undefined
}

/**
 * The Orc's Warhost fund (step 6): at 600 saved it launches an Incursion-style host at the player's
 * border hex nearest its land, for T12 to announce, and the fund resets. It waits while the Orc is
 * at Peace with the player or held off by a Truce, pact or Accord (A-151).
 */
function warhostFund(state: CampaignState, w: RivalWeek): { state: CampaignState; warhost?: WarhostRequest } {
  const r = state.rivals.orc
  if (r.specialFund < RULES.rivals.special.orcWarhostFund || !hostileNow(state, 'orc', w.day)) return { state }
  const hexId = nearestBorderHex(state, 'orc', w.day, 'warhost:target')
  if (!hexId) return { state }
  w.emit('rivalNews', { rival: 'orc', news: 'warhost', hexId })
  return { state: patchRival(state, 'orc', { specialFund: 0 }), warhost: { rival: 'orc', hexId, day: w.day } }
}

/**
 * The Goblin's Market (step 6, A-147), paid from its fund: first mercenaries for every rival at War
 * with the player that has none (+15% AV for 2 weeks, costing that power at the rival's army
 * price), then, at most once every 4 weeks, one hex bought from another rival's border: one that
 * touches its land, never a Gate, a capital or a hex in rings 0 to 2, from a rival not at War with
 * it, at that rival's trade price, paid into that rival's treasury.
 */
function market(input: CampaignState, w: RivalWeek): CampaignState {
  let state = input
  const merc = RULES.rivals.special.goblinMercenaries
  for (const target of RIVAL_IDS) {
    const t = state.rivals[target]
    if (t.status !== 'active' || t.disposition.player !== 'war') continue
    if (t.ai?.mercenariesUntil !== undefined && t.ai.mercenariesUntil > w.day) continue
    const av = baseArmyValue(state, target)
    const cost = RULES.rivalAi.mercenaryCostShare * merc.armyBonus * av * armyPointCost(av)
    if (cost <= 0 || state.rivals.goblin.specialFund < cost) continue
    state = patchRival(state, 'goblin', { specialFund: state.rivals.goblin.specialFund - cost })
    state = patchMemory(state, target, { mercenariesUntil: addDays(w.day, weeksToDays(merc.weeks)) })
    w.emit('rivalNews', { rival: 'goblin', news: 'mercenaries', other: target })
  }

  const last = state.rivals.goblin.ai?.marketWeek
  if (last !== undefined && w.week - last < RULES.rivalAi.marketEveryWeeks) return state
  const byId = hexIndex(state.hexes)
  const fund = state.rivals.goblin.specialFund
  const offers = state.hexes
    .filter((h) => {
      if (h.owner === 'player' || h.owner === 'neutral' || h.owner === 'goblin') return false
      if (!isActive(state, h.owner) || !isClaimableKind(h) || h.kind === 'gate' || h.kind === 'lairMouth' || h.mythic) return false
      if (h.ring <= RULES.land.protectedThroughRing || !touches(byId, h.id, 'goblin')) return false
      return state.rivals.goblin.disposition[h.owner] !== 'war'
    })
    .map((hex) => ({ hex, seller: hex.owner as RivalId, price: tradeValue(hex.owner as RivalId, hex) }))
    .filter((o) => o.price <= fund)
  if (offers.length === 0) return state
  const best = offers.reduce((a, b) => (dominionValue(b.hex) / b.price > dominionValue(a.hex) / a.price ? b : a))
  state = patchRival(state, 'goblin', { specialFund: fund - best.price })
  state = patchMemory(state, 'goblin', { marketWeek: w.week })
  state = patchRival(state, best.seller, { treasury: state.rivals[best.seller].treasury + best.price })
  state = replaceHex(state, toRival(best.hex, 'goblin'))
  w.emit('hexTransfer', { hexId: best.hex.id, from: best.seller, to: 'goblin', how: 'trade' })
  w.emit('rivalNews', { rival: 'goblin', news: 'marketBuy', hexId: best.hex.id, other: best.seller })
  return state
}

// ── The Archmage's Rituals (Appendix C) ──────────────────────────────────────

const RITUALS = [...CODEX.rituals].sort((a, b) => a.order - b.order)

function ritualNumber(id: string, key: string): number {
  const value = CODEX.rituals.find((r) => r.id === id)?.params[key]
  if (typeof value !== 'number') throw new Error(`The codex gives ritual ${id} no number "${key}"`)
  return value
}

/**
 * Rituals (step 6): one every 6 weeks once 400 is saved, in the codex's order and round again,
 * the first no earlier than week 6, and only while the Archmage would strike the player (A-148).
 */
function rituals(input: CampaignState, w: RivalWeek): CampaignState {
  const r = input.rivals.archmage
  const ritual = RULES.rivals.special.archmageRitual
  const last = r.ai?.lastRitualWeek
  const due = last === undefined ? w.week >= RULES.rivalAi.firstRitualWeek : w.week - last >= ritual.everyWeeks
  if (!due || r.specialFund < ritual.cost || !hostileNow(input, 'archmage', w.day)) return input
  const cast = r.ai?.ritualsCast ?? 0
  const entry = RITUALS[cast % RITUALS.length]
  let state = patchRival(input, 'archmage', { specialFund: r.specialFund - ritual.cost })
  state = patchMemory(state, 'archmage', { ritualsCast: cast + 1, lastRitualWeek: w.week })
  const { emit, day } = w
  switch (entry.id) {
    case 'longNight': {
      const until = addDays(day, ritualNumber(entry.id, 'days'))
      emit('ritual', { ritualId: entry.id, until })
      return patchMemory(state, 'archmage', { longNightUntil: until })
    }
    case 'veilOfFog': {
      const until = addDays(day, ritualNumber(entry.id, 'days'))
      emit('ritual', { ritualId: entry.id, until })
      return patchMemory(state, 'archmage', { veilUntil: until })
    }
    case 'summoning': {
      const byId = hexIndex(state.hexes)
      const spots = state.hexes.filter(
        (h) => h.owner === 'neutral' && isClaimableKind(h) && h.kind !== 'lairMouth' && !h.village && !h.mythic && touches(byId, h.id, 'player')
      )
      if (spots.length === 0) {
        emit('ritual', { ritualId: entry.id })
        return state
      }
      const hex = byId.get(pick(state.campaign.seed, day, 'summoning:hex', spots.map((h) => h.id))) as HexState
      emit('ritual', { ritualId: entry.id, hexId: hex.id })
      return replaceHex(state, { ...hex, mythic: true, garrison: RULES.combat.strength.mythic * base(hex.ring), garrisonDamage: 0 })
    }
    case 'curseOfWeariness': {
      let next = refreshRoster(state)
      const stored = new Set(next.roster.map((c) => c.id))
      const strongest = roster(next).filter((c) => stored.has(c.id)).reduce<Company | undefined>((a, c) => (!a || c.power > a.power ? c : a), undefined)
      if (!strongest) {
        emit('ritual', { ritualId: entry.id })
        return next
      }
      const until = addDays(day, ritualNumber(entry.id, 'days'))
      next = { ...next, roster: next.roster.map((c) => (c.id === strongest.id ? { ...c, wearyUntil: c.wearyUntil && c.wearyUntil > until ? c.wearyUntil : until } : c)) }
      emit('ritual', { ritualId: entry.id, companyId: strongest.id, until })
      return next
    }
    default:
      emit('ritual', { ritualId: entry.id })
      return state
  }
}

/** The day falls inside a ritual that holds through `until` for `days` days. */
function ritualHolds(date: ISODate, until: ISODate | undefined, days: number): boolean {
  return until !== undefined && date <= until && diffDays(date, until) < days
}

/** The Long Night holds on `date`: mythic threats are twice as common. */
export function longNightOn(state: CampaignState, date: ISODate): boolean {
  return ritualHolds(date, state.rivals.archmage.ai?.longNightUntil, ritualNumber('longNight', 'days'))
}

/** The Veil of Fog holds on `date`: tidings show no strength bands. */
export function veilOn(state: CampaignState, date: ISODate): boolean {
  return ritualHolds(date, state.rivals.archmage.ai?.veilUntil, ritualNumber('veilOfFog', 'days'))
}

let hooksInstalled = false

/** Wraps daily combat's hooks with the Long Night and the Veil of Fog. Runs once, when this module loads. */
function installCombatHooks(): void {
  if (hooksInstalled) return
  hooksInstalled = true
  const mix = COMBAT_HOOKS.threatMix
  const bands = COMBAT_HOOKS.bandsHidden
  COMBAT_HOOKS.threatMix = (state, date, given) => {
    const out = mix(state, date, given)
    return longNightOn(state, date) ? { ...out, mythic: out.mythic * ritualNumber('longNight', 'mythicThreatMult') } : out
  }
  COMBAT_HOOKS.bandsHidden = (state, date) => bands(state, date) || veilOn(state, date)
}

installCombatHooks()

// ── Step 7: disposition and conquest attempts ────────────────────────────────

function setDisposition(state: CampaignState, rival: RivalId, w: RivalWeek, effects: Effects): CampaignState {
  const r = state.rivals[rival]
  const threat = threatOf(state, rival, w.day, effects)
  const d = RULES.rivals.disposition
  const to = dispositionFor({
    threat,
    tookLand: tookLandFrom(state, rival, w.day, weeksToDays(d.warLandTakenWeeks)),
    inCoalition: inCoalition(state, rival, w.day),
    respect: r.respect,
    quiet: !hostileAct(state, rival, w.day, weeksToDays(d.peaceQuietWeeks))
  })
  const from = r.disposition.player
  if (from !== to) w.emit('disposition', { rival, from, to })
  return patchRival(state, rival, { threat, disposition: { ...r.disposition, player: to } })
}

/**
 * Next week's conquest attempt (step 7, A-146): only at War and from week 6, on the player's
 * border hex in ring 3 or beyond touching its land with the weakest expected defense, if
 * 0.5 × AV ≥ 0.8 × that defense (every company defending at the week's average Valor). It strikes
 * on a seeded day 2 to 7 days after the close and is announced the day before. T08's
 * `planConquest` checks Truces, pacts and the rest.
 */
function planConquests(input: CampaignState, rival: RivalId, w: RivalWeek, effects: Effects): CampaignState {
  const ai = RULES.rivalAi
  if (input.rivals[rival].disposition.player !== 'war' || w.week + 1 < RULES.combat.noConquestBeforeWeek) return input
  let state = input
  const rules = RULES.rivals.conquestAttempt
  const byId = hexIndex(state.hexes)
  const targeted = new Set<string>()
  for (let i = 0; i < ai.conquestPlansPerWeek; i++) {
    const offset = int(state.campaign.seed, w.day, `conquest:${rival}:day:${i}`, ai.conquestDays.min, ai.conquestDays.max)
    const date = addDays(w.day, offset)
    const av = armyValue(state, rival, date)
    const targets = state.hexes
      .filter((h) => h.owner === 'player' && h.ring >= RULES.combat.conquestMinRing && h.status !== 'contested' && !targeted.has(h.id) && touches(byId, h.id, rival))
      .map((h) => ({ hex: h, defense: defenseFor(state, { hexId: h.id, kind: 'conquest', rival, valor: w.valor, day: date }, effects).defense }))
      .filter((t) => rules.armyShare * av >= rules.defenseShare * t.defense)
    if (targets.length === 0) break
    const target = targets.reduce((a, b) => (b.defense < a.defense ? b : a))
    targeted.add(target.hex.id)
    const plan = planConquest(state, { rival, hexId: target.hex.id, announcedOn: addDays(date, -1) })
    if (plan.ok) state = plan.state
  }
  return state
}

// ── Step 8 and the second suitor, at the next week close (Ch 6, Ch 12) ────────

/**
 * Runs at a week close just before courtships resolve (A-152). First, a rival's pending village
 * bid on a village the player is courting joins that courtship as a second suitor. Then each
 * active rival counter-bids on its own villages the player is courting: 60% of its reserve (the
 * Goblin 100%), the reserve being its treasury up to 100, shared evenly between them. Counter-bids
 * leave the treasury now and are never refunded.
 */
export function rivalBidsAtClose(input: CampaignState, day: ISODate): CampaignState {
  const due = input.courtships.filter((c) => c.placedOn <= day)
  if (due.length === 0) return input
  const courted = new Set(due.map((c) => c.hexId))
  let state = input

  for (const rival of RIVAL_IDS) {
    const courting = state.rivals[rival].ai?.courting ?? []
    const joining = courting.filter((c) => c.placedOn <= day && courted.has(c.hexId))
    if (joining.length === 0) continue
    for (const c of joining) state = placeRivalBid(state, rival, c.hexId, c.bid)
    state = patchMemory(state, rival, { courting: courting.filter((c) => !joining.includes(c)) })
  }

  const byId = hexIndex(state.hexes)
  for (const rival of RIVAL_IDS) {
    if (!isActive(state, rival)) continue
    const own = due.filter((c) => byId.get(c.hexId)?.owner === rival)
    if (own.length === 0) continue
    const r = state.rivals[rival]
    const pool = RULES.rivals.counterBidReserveShare[rival] * Math.max(0, Math.min(r.treasury, RULES.rivals.reserve))
    const each = pool / own.length
    if (each <= 0) continue
    for (const c of own) state = placeRivalBid(state, rival, c.hexId, each)
    state = patchRival(state, rival, { treasury: r.treasury - each * own.length })
  }
  return state
}

// ── Rival-versus-rival fronts (Ch 12) ────────────────────────────────────────

function withTrack(state: CampaignState, front: FrontState, track: number, frontState: Disposition = front.state): CampaignState {
  const [a, b] = front.rivals
  const ra = state.rivals[a]
  const rb = state.rivals[b]
  return {
    ...state,
    fronts: { ...state.fronts, [front.front]: { ...front, state: frontState, track } },
    rivals: {
      ...state.rivals,
      [a]: { ...ra, frontTracks: { ...ra.frontTracks, [front.front]: track }, disposition: { ...ra.disposition, [b]: frontState } },
      [b]: { ...rb, frontTracks: { ...rb.frontTracks, [front.front]: track === 0 ? 0 : -track }, disposition: { ...rb.disposition, [a]: frontState } }
    }
  }
}

/** Every company of `rival` loses `share` of its power, so the AV falls by that share. */
function loseArmy(state: CampaignState, rival: RivalId, share: number): CampaignState {
  const r = state.rivals[rival]
  return patchRival(state, rival, { companies: r.companies.map((c) => ({ ...c, power: c.power * (1 - share) })) })
}

function clampTrack(track: number): number {
  const t = RULES.rivals.fronts.track
  return Math.min(t.max, Math.max(t.min, track))
}

/**
 * The `fronts` week phase (A-153): for each front at War this week, one skirmish for each day of
 * the week (each drawn on its own day, won with a chance of the rival's share of the two AVs)
 * moves the track a step toward the winner, from −3 to +3, then the war costs both sides 5% of
 * their AV. A front at Peace moves its track a step toward 0 (A-37). The Herald hears when a
 * rival becomes Emboldened (+3) or Humbled (−3); both act on next week's raids.
 */
export function settleFronts(input: CampaignState, w: RivalWeek): CampaignState {
  let state = input
  const fr = RULES.rivals.fronts
  const start = weekOf(w.day, w.weekStartsOn) > state.campaign.startDate ? weekOf(w.day, w.weekStartsOn) : state.campaign.startDate
  for (const id of FRONT_IDS) {
    const front = state.fronts[id]
    const [a, b] = front.rivals
    let track = front.track
    if (front.state === 'war' && isActive(state, a) && isActive(state, b)) {
      for (let d = start; d <= w.day; d = addDays(d, 1)) {
        const avA = armyValue(state, a, d)
        const avB = armyValue(state, b, d)
        const share = avA + avB > 0 ? avA / (avA + avB) : 1 / 2
        track = clampTrack(track + (chance(state.campaign.seed, d, `skirmish:${id}`, share) ? fr.skirmishesPerDay : -fr.skirmishesPerDay))
      }
      state = loseArmy(loseArmy(state, a, fr.warArmyLoss), b, fr.warArmyLoss)
    } else if (front.state === 'peace' && track !== 0) {
      track = track > 0 ? Math.max(0, track - fr.peaceStep) : Math.min(0, track + fr.peaceStep)
    }
    if (track !== front.track && Math.abs(track) === fr.track.max) w.emit('front', { front: id, state: front.state, track })
    state = withTrack(state, state.fronts[id], track)
  }
  return state
}

/** The chance a front goes to War in a week: 40% if it touches the Orc, otherwise 25%. */
export function frontWarChance(front: FrontId): number {
  const rivals = CODEX.fronts.find((f) => f.id === front)?.rivals ?? []
  return rivals.includes('orc') ? RULES.rivals.fronts.warChance.touchingOrc : RULES.rivals.fronts.warChance.other
}

/**
 * Draws each front's state for the coming week from the seed (A-144): War at its war chance, then
 * Peace or Tension. A call to arms in force holds it at War; a front between coalition partners
 * (Ch 13) or with a resolved rival is at Peace.
 */
export function drawFronts(input: CampaignState, w: RivalWeek): CampaignState {
  let state = input
  const tomorrow = addDays(w.day, 1)
  const calls = callToArmsOn(state, tomorrow)
  for (const id of FRONT_IDS) {
    const front = state.fronts[id]
    const [a, b] = front.rivals
    const p = frontWarChance(id)
    const u = draw(state.campaign.seed, w.day, `front:${id}`)
    let next: Disposition = u < p ? 'war' : u < p + (1 - p) * RULES.rivalAi.frontPeaceShareOfRest ? 'peace' : 'tension'
    if (calls.some((c) => (c.rival === a && c.target === b) || (c.rival === b && c.target === a))) next = 'war'
    if (coalitionPartners(state, a, b, tomorrow) || !isActive(state, a) || !isActive(state, b)) next = 'peace'
    if (next !== front.state) w.emit('front', { front: id, state: next, track: front.track })
    state = withTrack(state, front, front.track, next)
  }
  return state
}

// ── Border Campaigns (Ch 12) ─────────────────────────────────────────────────

/**
 * The hex a Border Campaign strikes: one the defender holds that touches the attacker's land (the
 * weakest garrison, then map order), or else the defender's hex nearest the front's battlefields
 * (ties drawn). Never a Gate, a capital, a Lair Mouth, a hex in rings 0 to 2 or a player's hex.
 */
export function borderCampaignTarget(state: CampaignState, attacker: RivalId, defender: RivalId, front: FrontId, day: ISODate): HexState | undefined {
  const byId = hexIndex(state.hexes)
  const eligible = state.hexes.filter(
    (h) => h.owner === defender && isClaimableKind(h) && h.kind !== 'gate' && h.kind !== 'capital' && h.kind !== 'lairMouth' && h.ring > RULES.land.protectedThroughRing
  )
  if (eligible.length === 0) return undefined
  const touching = eligible.filter((h) => touches(byId, h.id, attacker))
  if (touching.length > 0) return touching.reduce((a, b) => (effectiveGarrison(b) < effectiveGarrison(a) ? b : a))
  const nearest = nearestTo(eligible, rimFronts().find((f) => f.front === front)?.battlefields ?? [])
  if (nearest.length === 0) return undefined
  return byId.get(pick(state.campaign.seed, day, `borderCampaign:${front}:target`, nearest.map((h) => h.id)))
}

/**
 * The `borderCampaigns` week phase. In a hidden Border Campaign week, on each front at War, the
 * rival whose track stands at +2 or more attacks the other (never a coalition partner). The hex
 * falls if 0.5 × AV × roll(0.85–1.15) ≥ its garrison (fortification counted); win or lose, both
 * lose 5% of their AV. Respect toward the player doesn't change. Then the fronts are drawn for the
 * coming week (`drawFronts`).
 */
export function borderCampaigns(input: CampaignState, w: RivalWeek): CampaignState {
  let state = input
  const bc = RULES.world.borderCampaigns
  if (state.settlement.borderCampaignWeeks.includes(w.week)) {
    for (const id of FRONT_IDS) {
      const front = state.fronts[id]
      if (front.state !== 'war') continue
      const [a, b] = front.rivals
      if (!isActive(state, a) || !isActive(state, b) || coalitionPartners(state, a, b, w.day)) continue
      const sides: [RivalId, RivalId] | null = front.track >= bc.attackerTrack ? [a, b] : front.track <= -bc.attackerTrack ? [b, a] : null
      if (!sides) continue
      const [attacker, defender] = sides
      const target = borderCampaignTarget(state, attacker, defender, id, w.day)
      if (!target) continue
      const rolled = roll(state.campaign.seed, w.day, `borderCampaign:${id}`, -bc.roll, bc.roll)
      const taken = bc.armyShare * armyValue(state, attacker, w.day) * (1 + rolled) >= effectiveGarrison(target)
      if (taken) {
        state = replaceHex(state, toRival(target, attacker))
        w.emit('hexTransfer', { hexId: target.id, from: defender, to: attacker, how: 'borderCampaign' })
      }
      w.emit('borderCampaign', { attacker, defender, hexId: target.id, taken })
      state = loseArmy(loseArmy(state, attacker, bc.armyLoss), defender, bc.armyLoss)
    }
  }
  return drawFronts(state, w)
}

// ── What the player sees (Ch 12) ─────────────────────────────────────────────

export type TreasuryBand = 'meager' | 'modest' | 'prosperous' | 'mighty'
export type ArmyBand = Band

/** A rival as the Diplomacy screen may show it. Numbers other than Respect appear only when revealed. */
export interface RivalView {
  rival: RivalId
  status: RivalState['status']
  disposition: Disposition
  respect: number
  treasuryBand: TreasuryBand
  /** Its AV against the player's best (banners + 2) companies (A-24). */
  armyBand: ArmyBand
  /** Herald rumor text ids (`herald.rumor.*`). */
  rumors: string[]
  /** Its treasury, with the Spy Network (or the Spymaster, for a neighbor). */
  treasury?: number
  /** Its Army value, with the Spy Network. */
  army?: number
}

/** Meager under 300, Modest under 800, Prosperous under 2,000, Mighty above. */
export function treasuryBand(amount: number): TreasuryBand {
  const [modest, prosperous, mighty] = RULES.rivals.treasuryBands
  if (amount < modest) return 'meager'
  if (amount < prosperous) return 'modest'
  if (amount < mighty) return 'prosperous'
  return 'mighty'
}

/** Weaker below 0.8×, Matched to 1.25×, Stronger to 2×, Overwhelming above (A-24). */
export function armyBand(rivalArmy: number, playerArmy: number): ArmyBand {
  return band(rivalArmy, playerArmy, RULES.rivals.armyBands)
}

/** A neighbor: its land touches the player's. */
function isNeighbor(state: CampaignState, rival: RivalId): boolean {
  return sharedBorder(state, rival) > 0
}

/**
 * The rival as the player may see it (Ch 12 "What the player sees"): status, disposition, Respect,
 * a treasury band, an army band and rumor text ids. The exact treasury shows only with the Spy
 * Network, or with the Spymaster for a neighbor (A-105); the exact AV only with the Spy Network.
 * The benchmark and the income never appear.
 */
export function rivalView(state: CampaignState, rival: RivalId, effects: Effects = realmEffects(state)): RivalView {
  const r = state.rivals[rival]
  const av = armyValue(state, rival)
  const shows = (what: 'treasury' | 'army'): boolean => {
    const whom = effects.reveals[what].whom
    return whom === 'all' || (whom === 'neighbors' && isNeighbor(state, rival))
  }
  const view: RivalView = {
    rival,
    status: r.status,
    disposition: r.disposition.player,
    respect: r.respect,
    treasuryBand: treasuryBand(holdings(r)),
    armyBand: armyBand(av, playerArmyValue(state, effects)),
    rumors: r.ai?.rumor ? [`herald.rumor.${r.ai.rumor}`] : []
  }
  if (shows('treasury')) view.treasury = holdings(r)
  if (shows('army')) view.army = av
  return view
}
