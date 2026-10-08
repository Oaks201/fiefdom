/**
 * A small headless campaign driver for the T12 tests (Test 10's invariants): whole campaigns
 * through `foundCampaign` and `settle`, one day at a time, with a synthetic ledger and a simple
 * player who acts only through the game's own actions. T13's simulator (`sim/`) is the full
 * version; this one only has to put the endgame through its paces.
 *
 * - Habits: `steady` keeps every habit and loses 0.8 lb a week (Grace rises to III); `poor` keeps a
 *   day about a third of the time and holds its weight, so the rivals out-grow it.
 * - Policies: `passive` does nothing; `greedy` buys the cheapest tier, castle tier and Crossing it
 *   can, courts villages it can win, seals the longest contract, and assaults the weakest hex it
 *   can take (a Gate or capital when its army can face the host); `diplomat` is greedy and also
 *   seals Accords with the most respectful rival, buys a coalition member out, and bends the knee.
 */
import { buyCastleTier, buyCrossing, buyTier, castleOffer, crossingOffer, tierOffer } from '../../../src/renderer/src/lib/game/buildings'
import { foundCampaign } from '../../../src/renderer/src/lib/game/campaign'
import { addDays, campaignWeek, isWeekCloseDay } from '../../../src/renderer/src/lib/game/clock'
import { CODEX } from '../../../src/renderer/src/lib/game/codex'
import { armyValue, assaultValue, effectiveGarrison, setOrders } from '../../../src/renderer/src/lib/game/combat'
import { sealContract } from '../../../src/renderer/src/lib/game/contractActions'
import { availableLengths } from '../../../src/renderer/src/lib/game/contracts'
import { balance } from '../../../src/renderer/src/lib/game/economy'
import { realmEffects } from '../../../src/renderer/src/lib/game/effects'
import { makeDeal, placeBid, resistance, trust } from '../../../src/renderer/src/lib/game/land'
import { claimableBy, hexIndex, touches } from '../../../src/renderer/src/lib/game/map'
import { chance, int } from '../../../src/renderer/src/lib/game/rng'
import { roster } from '../../../src/renderer/src/lib/game/roster'
import { settle } from '../../../src/renderer/src/lib/game/settle'
import { inCoalition } from '../../../src/renderer/src/lib/game/state'
import { RIVAL_IDS, BUILDING_IDS, type CampaignState, type GameEvent, type HexState, type ISODate, type RivalId } from '../../../src/renderer/src/lib/game/types'
import { accordGate, bendTheKnee, sealAccord, ultimatumView } from '../../../src/renderer/src/lib/game/world'
import type { DayLog, Ledger } from '../../../src/renderer/src/lib/types'
import { FOUNDED_AT, START, TZ, charter, chicago, emptyLedger, goodDay } from '../fixtures/ledgers'

export type Habits = 'steady' | 'poor'
export type Policy = 'passive' | 'greedy' | 'diplomat'

export interface DriveOptions {
  seed: number
  weeks: number
  habits: Habits
  policy: Policy
}

export interface DriveResult {
  state: CampaignState
  /** The founding state, for replaying ownership from the log. */
  founded: CampaignState
}

/** The days before the founding the Healer reads, and a margin past the last campaign day. */
const LEAD_DAYS = 28
const POOR_KEEP = 0.35

/** A synthetic ledger for `days` days from 28 days before the start: habits by profile, weigh-ins on Mondays and Thursdays. */
export function habitLedger(seed: number, habits: Habits, days: number): Ledger {
  const ledger = emptyLedger()
  const from = addDays(START, -LEAD_DAYS)
  for (let i = 0; i < days + LEAD_DAYS; i++) {
    const date = addDays(from, i)
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
    const weighs = weekday === 1 || weekday === 4
    let day: DayLog
    if (habits === 'steady') {
      day = goodDay({ steps: 7_500 + ((i * 37) % 3_000) })
      if (weighs) day.weight = Math.round((217 - (0.8 * Math.max(0, i - LEAD_DAYS)) / 7) * 10) / 10
    } else {
      const kept = chance(seed, date, 'ledger:kept', POOR_KEEP)
      day = kept ? goodDay() : { steps: int(seed, date, 'ledger:steps', 1_500, 4_000), done: { 'h-read': true } }
      if (!kept && chance(seed, date, 'ledger:food', 0.5)) day.eaten = 2_300
      if (weighs) day.weight = 217
    }
    ledger.days[date] = day
  }
  return ledger
}

// ── The player's actions ─────────────────────────────────────────────────────

function buyWhatItCan(input: CampaignState, today: ISODate): CampaignState {
  let state = input
  for (let guard = 0; guard < 12; guard++) {
    const offers: { cost: number; buy: (s: CampaignState) => CampaignState }[] = []
    const castle = castleOffer(state)
    if (castle.ok) offers.push({ cost: castle.cost, buy: (s) => buyCastleTier(s, today).state })
    for (const b of BUILDING_IDS) {
      const o = tierOffer(state, b)
      if (o.ok) offers.push({ cost: o.cost, buy: (s) => buyTier(s, b, today).state })
    }
    for (const x of CODEX.crossings) {
      const o = crossingOffer(state, x.id)
      if (o.ok) offers.push({ cost: o.cost, buy: (s) => buyCrossing(s, x.id, today).state })
    }
    if (offers.length === 0) break
    offers.sort((a, b) => a.cost - b.cost)
    state = offers[0].buy(state)
  }
  return state
}

let contractSeq = 0

function sealLongest(state: CampaignState, today: ISODate): CampaignState {
  if (state.contracts.active || state.contracts.queued) return state
  const termDays = Math.max(...availableLengths({ buildings: state.buildings, castleTier: state.castleTier }))
  const sealed = sealContract(state, { id: `drive-${(contractSeq += 1)}`, termDays }, today)
  return sealed.ok ? sealed.state : state
}

function court(input: CampaignState, today: ISODate): CampaignState {
  let state = input
  const t = trust(0.9)
  for (const h of state.hexes) {
    if (!h.village || !claimableBy(state.hexes, h.id, 'player', 'court')) continue
    const bid = Math.ceil((resistance(h) * 1.1) / t)
    if (balance(state.purse) < bid * 2) continue
    const done = placeBid(state, h.id, bid, today)
    if (done.ok) state = done.state
  }
  return state
}

/** The day's assault: the weakest takeable hex the best companies can beat, or a Gate or capital when the army can face its host. */
function orders(state: CampaignState, today: ISODate, valor: number): CampaignState {
  const effects = realmEffects(state)
  const army = roster(state, { day: today }, effects).sort((a, b) => b.power - a.power)
  const banners = effects.banners.value + effects.poolBanners.assault.value
  const sent = army.slice(0, banners)
  const value = assaultValue({ strikes: sent.map((c) => c.power), armsBonus: effects.armsBonus.value, rallyFloor: effects.rallyFloor.value, valor })
  const byId = hexIndex(state.hexes)
  const takeable = state.hexes
    .filter((h) => h.owner !== 'player' && claimableBy(state.hexes, h.id, 'player', 'assault') && effectiveGarrison(h) <= value)
    .sort((a, b) => effectiveGarrison(a) - effectiveGarrison(b) || b.ring - a.ring)
  let target: HexState | undefined = takeable[0]
  if (!target) {
    const mine = army.reduce((s, c) => s + c.power, 0)
    target = state.hexes.find(
      (h) =>
        (h.kind === 'gate' || h.kind === 'capital') &&
        h.owner !== 'player' &&
        h.owner !== 'neutral' &&
        touches(byId, h.id, 'player') &&
        mine >= armyValue(state, h.owner as RivalId, today)
    )
  }
  if (!target) return state
  return setOrders(state, { date: today, assaultTarget: target.id, assault: sent.map((c) => c.id), defense: [] }).state
}

function diplomacy(input: CampaignState, today: ISODate): CampaignState {
  let state = input
  for (const u of ultimatumView(state, today)) if (u.canBend && balance(state.purse) >= u.bendPrice) state = bendTheKnee(state, u.rival, today).state
  for (const r of RIVAL_IDS) {
    if (state.rivals[r].status === 'active' && inCoalition(state, r, today)) {
      const done = makeDeal(state, r, { kind: 'buyout' }, today)
      if (done.ok) return done.state
    }
  }
  if (state.contracts.active || state.contracts.queued) return state
  const best = [...RIVAL_IDS].filter((r) => accordGate(state, r, today).ok).sort((a, b) => state.rivals[b].respect - state.rivals[a].respect)[0]
  if (!best) return state
  const sealed = sealAccord(state, best, { id: `accord-${(contractSeq += 1)}` }, today)
  return sealed.ok ? sealed.state : state
}

function act(input: CampaignState, today: ISODate, o: DriveOptions): CampaignState {
  if (o.policy === 'passive') return input
  let state = input
  const weekStart = isWeekCloseDay(addDays(today, -1), state.campaign.weekStartsOn)
  if (weekStart) {
    state = buyWhatItCan(state, today)
    if (o.policy === 'diplomat') state = diplomacy(state, today)
    state = sealLongest(state, today)
    state = court(state, today)
  }
  return orders(state, today, o.habits === 'steady' ? 0.9 : 0.4)
}

/** Runs a campaign for `weeks` weeks, one settled day at a time, or until it falls. */
export function driveCampaign(o: DriveOptions): DriveResult {
  const days = o.weeks * 7
  const ledger = habitLedger(o.seed, o.habits, days + 7)
  const founded = foundCampaign({ startWeight: 217, goalWeight: 168, charter: charter(), timeZone: TZ, seed: o.seed, ledger }, FOUNDED_AT)
  let state = settle(founded, ledger, chicago(START), { launch: true }).state
  for (let i = 0; i < days; i++) {
    const today = addDays(START, i)
    state = act(state, today, o)
    state = settle(state, ledger, chicago(addDays(today, 1))).state
    if (state.campaign.status === 'fallen') break
  }
  return { state, founded }
}

/** The campaign week `day` falls in. */
export function weekOf(state: CampaignState, day: ISODate): number {
  return campaignWeek(state.campaign.startDate, day, state.campaign.weekStartsOn)
}

export function eventsOf<K extends GameEvent['kind']>(state: CampaignState, kind: K): Extract<GameEvent, { kind: K }>[] {
  return state.log.filter((e) => e.kind === kind) as Extract<GameEvent, { kind: K }>[]
}

// ── Test 10's audit ──────────────────────────────────────────────────────────

/** What one driven campaign shows, small enough to pass back from a worker. */
export interface RunAudit {
  seed: number
  habits: Habits
  policy: Policy
  status: CampaignState['campaign']['status']
  lastWeek: number
  /** The week the realm fell, if it did. */
  fallenWeek?: number
  /** The week the campaign was won, if it was. */
  wonWeek?: number
  resolutions: { rival: RivalId; how: string; week: number }[]
  coalitions: { trigger: string; week: number }[]
  ultimatums: { week: number; grace: number }[]
  /** World events fired, by id. */
  events: Record<string, number>
  /** Every broken invariant, as a sentence with its day. */
  violations: string[]
}

/**
 * Checks a driven campaign against Test 10 (Ch 14, Ch 15 invariants, Ch 13): no Ultimatum before
 * week 36 (44 at Grace III), so no Fall before then; no hex in rings 0 to 2 ever passes to anyone
 * but the player; no Border Campaign targets a Gate, a capital or a player hex; never three rivals
 * allied at once; no coalition before week 12; Ch 14's pacing of resolutions and victory.
 * Ownership is replayed from the founding map through every `hexTransfer` in the log.
 */
export function auditRun(o: DriveOptions, run: DriveResult): RunAudit {
  const { state, founded } = run
  const violations: string[] = []
  const owner = new Map(founded.hexes.map((h) => [h.id, h.owner]))
  const hexAt = new Map(founded.hexes.map((h) => [h.id, h]))
  let grace = 0
  const ultimatums: RunAudit['ultimatums'] = []
  for (const e of state.log) {
    if (e.kind === 'grace') grace = e.to
    if (e.kind === 'hexTransfer') {
      const ring = hexAt.get(e.hexId)?.ring ?? -1
      if (ring <= 2 && e.to !== 'player') violations.push(`${e.day}: ring ${ring} hex ${e.hexId} passed to ${e.to}`)
      owner.set(e.hexId, e.to)
    }
    if (e.kind === 'borderCampaign') {
      const kind = hexAt.get(e.hexId)?.kind
      if (kind === 'gate' || kind === 'capital') violations.push(`${e.day}: a Border Campaign targeted the ${kind} ${e.hexId}`)
      if (owner.get(e.hexId) === 'player') violations.push(`${e.day}: a Border Campaign targeted the player's hex ${e.hexId}`)
    }
    if (e.kind === 'ascendancy' && e.stage === 'ultimatum') {
      const week = weekOf(state, e.day)
      ultimatums.push({ week, grace })
      const from = grace >= 3 ? 44 : 36
      if (week < from) violations.push(`${e.day}: an Ultimatum in week ${week} at Grace ${grace}`)
    }
  }
  for (const h of state.hexes) if (h.ring <= 2 && h.owner !== 'player' && h.owner !== 'neutral') violations.push(`end: ring ${h.ring} hex ${h.id} is held by ${h.owner}`)

  // Coalitions: each stands from the dawn after it formed through its last day.
  const spans = state.coalitions.map((c) => ({ members: c.members, from: addDays(c.formedOn ?? state.campaign.startDate, 1), to: c.until ?? state.settledThrough.day }))
  for (let i = 0; i < spans.length; i++) {
    for (let j = i + 1; j < spans.length; j++) {
      const a = spans[i]
      const b = spans[j]
      const overlap = a.from <= b.to && b.from <= a.to
      if (overlap && new Set([...a.members, ...b.members]).size > 2) violations.push(`${b.from}: three rivals allied at once (${[...a.members, ...b.members].join(', ')})`)
    }
  }
  const coalitions = eventsOf(state, 'coalition')
    .filter((e) => e.stage === 'formed')
    .map((e) => ({ trigger: e.trigger, week: weekOf(state, e.day) }))
  for (const c of coalitions) if (c.week < 12) violations.push(`a ${c.trigger} coalition formed in week ${c.week}`)

  const resolutions = eventsOf(state, 'rivalResolved').map((e) => ({ rival: e.rival, how: e.how, week: weekOf(state, e.day) }))
  resolutions.forEach((r, i) => {
    if (r.week < 12) violations.push(`${r.rival} resolved in week ${r.week}`)
    if (i > 0 && r.week - resolutions[i - 1].week < 8) violations.push(`${r.rival} resolved ${r.week - resolutions[i - 1].week} weeks after the last`)
  })
  const end = eventsOf(state, 'campaignEnd')[0]
  const endWeek = end ? weekOf(state, end.day) : undefined
  if (end?.outcome === 'won' && (endWeek ?? 0) < 36) violations.push(`won in week ${endWeek}`)
  if (end?.outcome === 'fallen' && (endWeek ?? 0) < 36) violations.push(`fell in week ${endWeek}`)

  const events: Record<string, number> = {}
  for (const ev of state.worldEvents) events[ev.id] = (events[ev.id] ?? 0) + 1
  return {
    seed: o.seed,
    habits: o.habits,
    policy: o.policy,
    status: state.campaign.status,
    lastWeek: state.settledThrough.week,
    ...(end?.outcome === 'fallen' ? { fallenWeek: endWeek } : {}),
    ...(end?.outcome === 'won' ? { wonWeek: endWeek } : {}),
    resolutions,
    coalitions,
    ultimatums,
    events,
    violations
  }
}
