/**
 * The automatic player (Patch 2, R-21): the re-founding's catch-up player and the simulator's
 * players are one module. It acts only through the game's own player actions (`buyTier`,
 * `placeBid`, `setOrders`, `makeDeal`, the contract, Armory and Grand Battle actions); every number
 * it needs comes from `RULES` or the engine. Pure and deterministic: the same state, day and plan
 * always give the same orders.
 *
 * A plan steers it (the re-founding's four questions, P2-08):
 * - **paths**: the rivals whose paths it follows. Each day it presses the chosen path with the least
 *   Dominion so far, so the days are shared evenly: the best hex there it can take today, or else one
 *   the week's repulses can wear down (Ch 6's repeated push); a path with neither gives way to the
 *   next, and only when no chosen path has a target does it take the best hex anywhere.
 *   `null` is the unsteered greedy player: the best Dominion per garrison point anywhere.
 * - **spend**: tiers, castle tiers and Crossings first (`build`), the Armory first (`arm`), or each
 *   first in alternate weeks (`balanced`).
 * - **land**: assaults only (`force`); courting every village in reach, buying rival hexes when
 *   trade allows and assaulting the rest (`deals`); or courting what the purse allows and assaulting
 *   the rest (`both`).
 * - **offers**: take the world's offers it can afford (`accept`: keeping a rising village, the
 *   Goblin buying a hex), or leave them (`decline`).
 * - **contracts**: seal the longest contract unlocked whenever the slot frees (`longest`), or never
 *   (`none`: the re-founding re-seals the player's real contracts instead, P2-10).
 * - **smarter** and **push** add the simulator's extra policies (T13).
 *
 * Grand Battles are fought on their day with the Marshal's choices but without his −0.1 Readiness:
 * the player is taken as present (C-13).
 */
import { armoryOf, buyItem, chooseWing, equipItem, itemOffer, promoteElite, recruitElite, slotsFor, swearSworn } from './armory'
import { buyCastleTier, buyCrossing, buyTier, castleOffer, crossingOffer, tierOffer } from './buildings'
import { addDays, campaignWeek, diffDays, isWeekCloseDay, weekOf } from './clock'
import { CODEX } from './codex'
import { effectiveGarrison, ordersEstimate, setOrders } from './combat'
import { sealContract, takeRespite } from './contractActions'
import { availableLengths } from './contracts'
import { hexWorth, pathShares, pathTotals } from './dominion'
import { balance } from './economy'
import { realmEffects } from './effects'
import { battleOf, begin, challenge, fieldOf, pendingBattles, playRound, setDoctrine } from './grand'
import { isOver, marshalPlay } from './grand/field'
import { bidCheck, fortify, makeDeal, offerDeal, placeBid, resistance } from './land'
import { claimableBy, hexIndex, touches } from './map'
import { preparationMult } from './marches'
import { RULES } from './rules'
import { rivalView } from './rivals'
import { roster } from './roster'
import { readinessValors, valorOn } from './settle'
import { marshalAllFights } from './skirmish'
import { inCoalition } from './state'
import { BUILDING_IDS, RIVAL_IDS, type CampaignState, type Effects, type HexState, type ISODate, type RivalId } from './types'
import { trustNow } from './view/realm'
import { accordGate, acceptGoblinOffer, bendTheKnee, sealAccord, ultimatumView } from './world'
import { keepVillage } from './world/events'

export interface AutoplayPlan {
  /** The rivals whose paths to follow, shared evenly; `null` for the unsteered greedy player. */
  paths: RivalId[] | null
  spend: 'build' | 'arm' | 'balanced'
  land: 'force' | 'deals' | 'both'
  offers: 'accept' | 'decline'
  contracts: 'longest' | 'none'
  /** The simulator's smarter player (T13): Truces, bending the knee, Accords, buy-outs, defections. */
  smarter?: boolean
  /** The simulator's push player (T13): with nothing in reach, wear down a hex the week's repulses can break. */
  push?: boolean
  /** D-12: also press "Start battle" each day and fight every fight with the Marshal's play. */
  skirmish?: boolean
}

/** The simulator's greedy player (T13): every number as the book's Ch 15 step 2 describes it. */
export const GREEDY: AutoplayPlan = { paths: null, spend: 'build', land: 'both', offers: 'decline', contracts: 'longest' }

export interface AutoplayDay {
  /** Today falls in a rough patch: spend Respite on it. */
  rough: boolean
  /** A counter for contract ids, kept by the caller. */
  nextId(): string
  /** The day's Valor once its inputs are in (the skirmish player fights at it). */
  valor?: number
}

const A = RULES.autoplay
const WEEK = RULES.clock.daysPerWeek

// ── Weekly ───────────────────────────────────────────────────────────────────

/** Buys the cheapest tier, castle tier or Crossing stage it can afford, again and again. */
function buyCheapest(input: CampaignState, today: ISODate): CampaignState {
  let state = input
  for (let guard = 0; guard < A.maxBuys; guard++) {
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

/** Hexes the player doesn't hold that touch its land: the only ones `claimableBy` can allow (a cheap first cut). */
function frontier(state: CampaignState): HexState[] {
  const byId = hexIndex(state.hexes)
  return state.hexes.filter((h) => h.owner !== 'player' && touches(byId, h.id, 'player'))
}

/** Whether a hex lies on one of the plan's paths (any share of it). */
function onPlan(plan: AutoplayPlan, h: HexState): boolean {
  if (!plan.paths) return true
  const shares = pathShares(h)
  return plan.paths.some((p) => (shares[p] ?? 0) > 0)
}

/** Courts every village whose Offer would meet its resistance at today's Trust, highest ring first. */
function courtVillages(input: CampaignState, today: ISODate, margin = 1, only?: (h: HexState) => boolean): CampaignState {
  let state = input
  const tr = trustNow(state)
  const villages = frontier(state)
    .filter((h) => h.village && claimableBy(state.hexes, h.id, 'player', 'court') && (!only || only(h)))
    .sort((a, b) => b.ring - a.ring || a.id.localeCompare(b.id))
  for (const h of villages) {
    const bid = Math.ceil((resistance(h) * margin) / tr)
    if (!bidCheck(state, h.id, bid).ok) continue
    const done = placeBid(state, h.id, bid, today)
    if (done.ok) state = done.state
  }
  return state
}

/** Buys each rival hex on the plan's paths that trade allows and the purse can pay for, best Dominion per price first. */
function buyHexes(input: CampaignState, today: ISODate, plan: AutoplayPlan): CampaignState {
  let state = input
  const candidates = frontier(state).filter((h) => h.owner !== 'neutral' && onPlan(plan, h) && claimableBy(state.hexes, h.id, 'player', 'buy'))
  const priced = candidates
    .map((h) => ({ h, offer: offerDeal(state, h.owner as RivalId, { kind: 'buyHex', hexId: h.id }, today) }))
    .filter((x) => x.offer.allowed && x.offer.price <= balance(state.purse))
    .sort((a, b) => b.h.ring / b.offer.price - a.h.ring / a.offer.price || a.h.id.localeCompare(b.h.id))
  for (const { h } of priced) {
    const done = makeDeal(state, h.owner as RivalId, { kind: 'buyHex', hexId: h.id }, today)
    if (done.ok) state = done.state
  }
  return state
}

/** Seals the longest contract the realm unlocks when the slot (or the queue behind it) is free. */
function sealLongest(state: CampaignState, today: ISODate, day: AutoplayDay): CampaignState {
  if (state.contracts.queued || (state.contracts.active && state.contracts.active.endDate > addDays(today, WEEK))) return state
  const termDays = Math.max(...availableLengths({ buildings: state.buildings, castleTier: state.castleTier }))
  const sealed = sealContract(state, { id: day.nextId(), termDays }, today)
  return sealed.ok ? sealed.state : state
}

/** Wings from the list, Elites and their rank II, the Sworn, and the dearest item each company can carry. */
function useArmory(input: CampaignState, today: ISODate): CampaignState {
  let state = input
  for (const id of A.wingPreference) {
    const done = chooseWing(state, id, today)
    if (done.ok) state = done.state
  }
  for (const e of CODEX.elites) {
    const recruited = recruitElite(state, e.id, today)
    if (recruited.ok) state = recruited.state
    const promoted = promoteElite(state, e.id, today)
    if (promoted.ok) state = promoted.state
  }
  const sworn = swearSworn(state, [...A.swornTags], today)
  if (sworn.ok) state = sworn.state
  const effects = realmEffects(state)
  const companies = roster(state, { day: today }, effects)
    .filter((c) => state.roster.some((s) => s.id === c.id))
    .sort((a, b) => b.power - a.power || a.id.localeCompare(b.id))
  for (const c of companies) {
    const carried = state.roster.find((s) => s.id === c.id)?.items.length ?? 0
    if (carried >= slotsFor(state, c.id, effects)) continue
    const stash = armoryOf(state).stash[0]
    const choice =
      stash ??
      CODEX.items
        .filter((i) => i.rank !== 'trophy' && itemOffer(state, i.id, effects).ok)
        .sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0) || a.id.localeCompare(b.id))[0]?.id
    if (!choice) continue
    if (!stash) {
      const bought = buyItem(state, choice, today)
      if (!bought.ok) continue
      state = bought.state
    }
    const equipped = equipItem(state, c.id, choice, today)
    if (equipped.ok) state = equipped.state
  }
  return state
}

/** Takes the world's offers the purse can pay for: keeping a rising village, the Goblin buying an abdicated hex. */
function takeOffers(input: CampaignState, today: ISODate): CampaignState {
  let state = input
  for (const o of state.world?.offers ?? []) {
    if (o.kind === 'uprising') {
      const done = keepVillage(state, o.hexId, today)
      if (done.ok) state = done.state
    } else if (o.kind === 'goblinBuys') {
      const done = acceptGoblinOffer(state, o.hexId, today)
      if (done.ok) state = done.state
    }
  }
  return state
}

// ── Daily ────────────────────────────────────────────────────────────────────

/** The Valor the player expects today: yesterday's, or the first guess before any day is settled. */
export function expectedValor(state: CampaignState): number {
  const day = state.settledThrough.day
  return day >= state.campaign.startDate ? valorOn(state, day, state.campaign.weekStartsOn) : A.firstValor
}

function isActiveRival(state: CampaignState, owner: HexState['owner']): boolean {
  return (RIVAL_IDS as readonly string[]).includes(owner) && state.rivals[owner as RivalId].status === 'active'
}

/** What kind of garrison a hex has, for grouping assault estimates. */
function garrisonKind(h: HexState): string {
  if (h.mythic) return 'mythic'
  if (h.owner === 'neutral') return h.village ? 'militia' : 'beasts'
  return h.owner
}

/** A hex the assault could take today, with the companies the estimate fields and its worth. */
export interface InReach {
  hex: HexState
  /** The Dominion the hex adds per garrison point. */
  score: number
  fielded: string[]
  /** It falls today (the Assault beats the garrison); otherwise only the week's repulses could break it. */
  today: boolean
}

/**
 * Every hex the whole army's Assault could take today at the expected Valor, and (with `pushes`)
 * those the week's repulses could wear down by the week's last day (Ch 6: "a second or third push
 * can break it"). Offered the whole army, the estimate fields the best-matched companies the
 * assault banners allow.
 */
export function hexesInReach(state: CampaignState, today: ISODate, pushes: boolean, effects: Effects = realmEffects(state)): InReach[] {
  const everyone = roster(state, { day: today }, effects).map((c) => c.id)
  const valor = expectedValor(state)
  const candidates = frontier(state).filter((h) => claimableBy(state.hexes, h.id, 'player', 'assault'))
  const pool = new Map<string, { value: number; fielded: string[] }>()
  const daysLeft = diffDays(today, addDays(weekOf(today, state.campaign.weekStartsOn), WEEK - 1)) + 1
  const out: InReach[] = []
  for (const h of candidates) {
    const kind = garrisonKind(h)
    if (!pool.has(kind)) {
      const est = ordersEstimate(state, { date: today, assaultTarget: h.id, assault: everyone, defense: [] }, today, valor, effects).assaults[0]
      pool.set(kind, { value: est?.value ?? 0, fielded: est?.fielded ?? [] })
    }
    const { value, fielded } = pool.get(kind) as { value: number; fielded: string[] }
    if (fielded.length === 0) continue
    const garrison = effectiveGarrison(h, effects.assaultIgnoresFortification.on, preparationMult(state, h, today))
    const score = hexWorth(h) / Math.max(1, garrison)
    if (value >= garrison) out.push({ hex: h, score, fielded, today: true })
    else if (pushes && value * (1 + RULES.land.repulseWear * (daysLeft - 1)) >= garrison) out.push({ hex: h, score, fielded, today: false })
  }
  return out
}

/** The plan's paths in the order to press them today: least Dominion first, ties in rival order. */
function pathOrder(state: CampaignState, paths: readonly RivalId[]): RivalId[] {
  const totals = pathTotals(state)
  return [...paths].sort((a, b) => totals[a] - totals[b] || RIVAL_IDS.indexOf(a) - RIVAL_IDS.indexOf(b))
}

/** The best of `reach` by score, the first in map order on a tie, or undefined. */
function best(reach: readonly InReach[]): InReach | undefined {
  let out: InReach | undefined
  for (const r of reach) if (!out || r.score > out.score) out = r
  return out
}

/**
 * The day's orders: the hex to assault (section above); with nothing in reach, a Gate or capital the
 * rival's army band says it can face, on the plan's paths.
 */
function orders(input: CampaignState, today: ISODate, plan: AutoplayPlan): CampaignState {
  let state = input
  const effects = realmEffects(state)
  // A steered player presses its own paths: it pushes there before it takes land anywhere else.
  let reach = hexesInReach(state, today, plan.push === true || plan.paths !== null, effects)
  // A deals player courts villages it can afford rather than storming them.
  if (plan.land === 'deals') reach = reach.filter((r) => !(r.hex.village && state.courtships.some((c) => c.hexId === r.hex.id)))
  const now = reach.filter((r) => r.today)
  const later = reach.filter((r) => !r.today)
  const onPath = (list: InReach[], p: RivalId): InReach[] => list.filter((r) => (pathShares(r.hex)[p] ?? 0) > 0)
  let pick: InReach | undefined
  if (plan.paths) {
    for (const p of pathOrder(state, plan.paths)) {
      pick = best(onPath(now, p)) ?? best(onPath(later, p))
      if (pick) break
    }
  }
  pick ??= best(now)
  if (!pick && plan.push) pick = best(later)
  if (pick) return setOrders(state, { date: today, assaultTarget: pick.hex.id, assault: pick.fielded, defense: [] }).state
  if (pendingBattles(state).length > 0) return state
  const byId = hexIndex(state.hexes)
  const bandRank = (h: HexState): number => A.grandBands.indexOf(rivalView(state, h.owner as RivalId, effects).armyBand)
  // The plan's own Gates and capitals first; the others only when none of its own can be faced.
  const offPlan = (h: HexState): number => (onPlan(plan, h) ? 0 : 1)
  const grand = state.hexes
    .filter((h) => (h.kind === 'gate' || h.kind === 'capital') && isActiveRival(state, h.owner) && touches(byId, h.id, 'player') && bandRank(h) >= 0)
    .sort((a, b) => offPlan(a) - offPlan(b) || bandRank(a) - bandRank(b) || a.id.localeCompare(b.id))
  for (const h of grand) {
    const done = challenge(state, h.id, today)
    if (done.ok) return done.state
  }
  return state
}

/** Fights each Grand Battle due today with the Marshal's choices, without his −0.1 (the player is present). */
function fightBattles(input: CampaignState, today: ISODate): CampaignState {
  let state = input
  for (const b of pendingBattles(state).filter((x) => x.battleDate === today && !x.setup)) {
    let s = state
    const doctrine = realmEffects(s).doctrines[0]?.id
    if (doctrine && !b.doctrine) {
      const set = setDoctrine(s, b.id, doctrine, today)
      if (set.ok) s = set.state
    }
    const begun = begin(s, b.id, { today, valors: readinessValors(s, today) })
    if (!begun.ok) continue
    s = begun.state
    for (let round = 0; round < RULES.grandBattles.rounds; round++) {
      const battle = battleOf(s, b.id)
      const field = battle ? fieldOf(battle) : null
      if (!field || isOver(field) || battle?.result !== undefined) break
      const played = playRound(s, b.id, marshalPlay(field), today)
      if (!played.ok) break
      s = played.state
    }
    state = s
  }
  return state
}

// ── The smarter player's extras (T13) ────────────────────────────────────────

function raidsWinning(state: CampaignState, rival: RivalId, today: ISODate): boolean {
  const from = addDays(today, -WEEK)
  return state.log.filter((e) => e.kind === 'defense' && e.rival === rival && e.threat === 'raid' && e.outcome === 'defeat' && e.day >= from).length >= A.raidsWinning
}

/** The rival an Accord would go to: Respect at its threshold, the castle and coalition allowing, the most respectful first. */
function accordRival(state: CampaignState, today: ISODate): RivalId | undefined {
  return [...RIVAL_IDS]
    .filter((r) => {
      const gate = accordGate(state, r, today)
      return gate.ok || (gate.reason === 'contractRunning' && gate.respect >= gate.threshold)
    })
    .sort((a, b) => state.rivals[b].respect - state.rivals[a].respect || RIVAL_IDS.indexOf(a) - RIVAL_IDS.indexOf(b))[0]
}

function smarterDaily(input: CampaignState, today: ISODate, day: AutoplayDay): CampaignState {
  let state = input
  // An Accord takes the contract slot (D-01): once one opens, the slot is left to empty and the Accord sealed.
  const ally = accordRival(state, today)
  if (ally && !state.contracts.active && !state.contracts.queued) {
    const sealed = sealAccord(state, ally, { id: day.nextId() }, today)
    if (sealed.ok) state = sealed.state
  }
  for (const h of state.hexes.filter((x) => x.owner === 'player' && x.status === 'contested')) {
    const done = fortify(state, h.id, today)
    if (done.ok) state = done.state
  }
  const besiegers = new Set(ultimatumView(state, today).flatMap((u) => u.members))
  for (const r of RIVAL_IDS) {
    if (state.rivals[r].status !== 'active') continue
    if (raidsWinning(state, r, today) || besiegers.has(r)) {
      const done = makeDeal(state, r, { kind: 'truce' }, today)
      if (done.ok) state = done.state
    }
  }
  for (const u of ultimatumView(state, today)) {
    if (!u.canBend || balance(state.purse) < u.bendPrice) continue
    const done = bendTheKnee(state, u.rival, today)
    if (done.ok) state = done.state
  }
  return state
}

function smarterWeekly(input: CampaignState, today: ISODate): CampaignState {
  let state = input
  for (const r of RIVAL_IDS) {
    if (state.rivals[r].status === 'active' && inCoalition(state, r, today)) {
      const done = makeDeal(state, r, { kind: 'buyout' }, today)
      if (done.ok) state = done.state
    }
  }
  const lastVillages = RIVAL_IDS.filter((r) => state.rivals[r].status === 'active' && state.hexes.filter((h) => h.owner === r && h.village).length <= 2)
  if (lastVillages.length > 0) state = courtVillages(state, today, A.defectionMargin, (h) => lastVillages.includes(h.owner as RivalId))
  return state
}

// ── A day ────────────────────────────────────────────────────────────────────

/** Everything the player does on the open day `today`, before it closes. */
export function autoplay(input: CampaignState, today: ISODate, plan: AutoplayPlan, day: AutoplayDay): CampaignState {
  let state = input
  const weekStart = isWeekCloseDay(addDays(today, -1), state.campaign.weekStartsOn) || today === state.campaign.startDate
  if (weekStart) {
    const armFirst = plan.spend === 'arm' || (plan.spend === 'balanced' && campaignWeek(state.campaign.startDate, today, state.campaign.weekStartsOn) % 2 === 0)
    if (armFirst) state = useArmory(state, today)
    state = buyCheapest(state, today)
    if (plan.smarter) state = smarterWeekly(state, today)
    if (plan.land !== 'force') state = courtVillages(state, today, 1, plan.land === 'deals' ? undefined : (h) => onPlan(plan, h))
    if (plan.land === 'deals') state = buyHexes(state, today, plan)
    if (plan.contracts === 'longest' && (!plan.smarter || !accordRival(state, today))) state = sealLongest(state, today, day)
    if (!armFirst) state = useArmory(state, today)
    if (plan.offers === 'accept') state = takeOffers(state, today)
  }
  if (plan.smarter) state = smarterDaily(state, today, day)
  state = fightBattles(state, today)
  state = orders(state, today, plan)
  if (plan.skirmish) state = marshalAllFights(state, today, day.valor ?? 0)
  if (day.rough) {
    const c = state.contracts.active
    if (c && c.startDate <= today && today <= c.endDate && state.contracts.respiteBank > 0) {
      const rested = takeRespite(state, today, today)
      if (rested.ok) state = rested.state
    }
  }
  return state
}
