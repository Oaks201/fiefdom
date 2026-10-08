/**
 * The simulated player (T13; Ch 15 "How to simulate" step 2). It acts only through the game's own
 * player actions (`buyTier`, `placeBid`, `setOrders`, `makeDeal`, `fortify`, the contract, Armory
 * and Grand Battle actions); every number it needs comes from `RULES` or the engine.
 *
 * - **Greedy**, each week: buy the cheapest tier, castle tier or Crossing stage it can, repeatedly;
 *   court every village whose Offer would meet its resistance; seal the longest contract unlocked;
 *   build Wings from a fixed list, recruit Elites, swear the Sworn, and buy and equip the dearest
 *   item each company can carry. Each day: assault the adjacent hex with the best Dominion per
 *   garrison point that the assault pool can beat at yesterday's Valor, sending the companies the
 *   engine's own fielding picks for that garrison; with none, challenge a Gate or capital of an
 *   active rival whose army band is short of Overwhelming; fight each Grand Battle on its day with
 *   the Marshal's choices but without his −0.1 Readiness, since the player is present; spend
 *   Respite on rough days.
 * - **Smarter**: greedy, plus a Truce when a rival's raids are winning and before an Ultimatum's
 *   Siege, bending the knee once, fortifying contested hexes, an Accord with the most respectful
 *   rival once one opens (it stops queueing contracts so the slot empties, D-01), the coalition
 *   buy-out when affordable, and courting a rival's last two villages to make it defect.
 * - **Push** (a third policy, not in the book): greedy, plus Ch 6's repeated push. With nothing it
 *   can take today, it assaults the best hex that the week's repulses (25% of each Assault off the
 *   garrison until the close) could wear down to its Assault by the week's last day.
 */
import { armoryOf, buyItem, chooseWing, equipItem, itemOffer, promoteElite, recruitElite, slotsFor, swearSworn } from '../src/renderer/src/lib/game/armory'
import { buyCastleTier, buyCrossing, buyTier, castleOffer, crossingOffer, tierOffer } from '../src/renderer/src/lib/game/buildings'
import { addDays, diffDays, isWeekCloseDay, weekOf } from '../src/renderer/src/lib/game/clock'
import { CODEX } from '../src/renderer/src/lib/game/codex'
import { effectiveGarrison, ordersEstimate, setOrders } from '../src/renderer/src/lib/game/combat'
import { sealContract, takeRespite } from '../src/renderer/src/lib/game/contractActions'
import { availableLengths } from '../src/renderer/src/lib/game/contracts'
import { balance } from '../src/renderer/src/lib/game/economy'
import { realmEffects } from '../src/renderer/src/lib/game/effects'
import { battleOf, begin, challenge, fieldOf, pendingBattles, playRound, setDoctrine } from '../src/renderer/src/lib/game/grand'
import { isOver, marshalPlay } from '../src/renderer/src/lib/game/grand/field'
import { bidCheck, fortify, makeDeal, placeBid, resistance } from '../src/renderer/src/lib/game/land'
import { claimableBy, dominionOf, hexIndex, touches } from '../src/renderer/src/lib/game/map'
import { RULES } from '../src/renderer/src/lib/game/rules'
import { rivalView } from '../src/renderer/src/lib/game/rivals'
import { roster } from '../src/renderer/src/lib/game/roster'
import { readinessValors, valorOn } from '../src/renderer/src/lib/game/settle'
import { inCoalition } from '../src/renderer/src/lib/game/state'
import { BUILDING_IDS, RIVAL_IDS, type CampaignState, type HexState, type ISODate, type RivalId, type Tag } from '../src/renderer/src/lib/game/types'
import { trustNow } from '../src/renderer/src/lib/game/view/realm'
import { accordGate, bendTheKnee, sealAccord, ultimatumView } from '../src/renderer/src/lib/game/world'

export type PolicyId = 'greedy' | 'smarter' | 'push'

export interface PolicyDay {
  policy: PolicyId
  /** Today falls in one of the profile's rough weeks: spend Respite on it. */
  rough: boolean
  /** A counter for contract ids, kept by the caller. */
  nextId(): string
}

/** Wings in order of preference, one per building per wave (a fixed list, Ch 15 step 2). */
const WING_PREFERENCE = ['drillYard', 'countingHouse', 'herbGarden', 'kilns', 'musterField', 'spymaster', 'wardCircle', 'engineWorks', 'shieldForge', 'goldenRoad', 'leylineAnchor', 'siegePark']
const SWORN_TAGS: Tag[] = ['steel', 'arcane']
/** A safety bound on purchase loops; each buy changes the state, so this is never reached in play. */
const MAX_BUYS = 24
/** Defense battles a rival's raids must win within a week before the smarter player asks for a Truce. */
const RAIDS_WINNING = 2
const WEEK = RULES.clock.daysPerWeek
/** The share over resistance the smarter player bids on a rival's last villages, against its unknown counter-bid. */
const DEFECTION_MARGIN = 1.3
/** The Valor the player expects before any day is settled. */
const FIRST_VALOR = 0.8

// ── Weekly ───────────────────────────────────────────────────────────────────

/** Buys the cheapest tier, castle tier or Crossing stage it can afford, again and again. */
function buyCheapest(input: CampaignState, today: ISODate): CampaignState {
  let state = input
  for (let guard = 0; guard < MAX_BUYS; guard++) {
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
function borderHexes(state: CampaignState): HexState[] {
  const byId = hexIndex(state.hexes)
  return state.hexes.filter((h) => h.owner !== 'player' && touches(byId, h.id, 'player'))
}

/** Courts every village whose Offer would meet its resistance at today's Trust, highest ring first. */
function courtVillages(input: CampaignState, today: ISODate, margin = 1, only?: (h: HexState) => boolean): CampaignState {
  let state = input
  const tr = trustNow(state)
  const villages = borderHexes(state)
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

/** Seals the longest contract the realm unlocks when the slot (or the queue behind it) is free. */
function sealLongest(state: CampaignState, today: ISODate, day: PolicyDay): CampaignState {
  if (state.contracts.queued || (state.contracts.active && state.contracts.active.endDate > addDays(today, WEEK))) return state
  const termDays = Math.max(...availableLengths({ buildings: state.buildings, castleTier: state.castleTier }))
  const sealed = sealContract(state, { id: day.nextId(), termDays }, today)
  return sealed.ok ? sealed.state : state
}

/** Wings from the list, Elites and their rank II, the Sworn, and the dearest item each company can carry. */
function useArmory(input: CampaignState, today: ISODate): CampaignState {
  let state = input
  for (const id of WING_PREFERENCE) {
    const done = chooseWing(state, id, today)
    if (done.ok) state = done.state
  }
  for (const e of CODEX.elites) {
    const recruited = recruitElite(state, e.id, today)
    if (recruited.ok) state = recruited.state
    const promoted = promoteElite(state, e.id, today)
    if (promoted.ok) state = promoted.state
  }
  const sworn = swearSworn(state, SWORN_TAGS, today)
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

// ── Daily ────────────────────────────────────────────────────────────────────

/** The Valor the player expects today: yesterday's, or 0.8 before any day is settled. */
function expectedValor(state: CampaignState): number {
  const day = state.settledThrough.day
  return day >= state.campaign.startDate ? valorOn(state, day, state.campaign.weekStartsOn) : FIRST_VALOR
}

/**
 * The army bands at which the player challenges a Gate or capital, weakest first. A host is 60% of
 * the rival's AV (Ch 11), so even a Stronger rival (1.25× to 2× the player's best) sends a host the
 * player's best can meet; only an Overwhelming one is left alone.
 */
const GRAND_BANDS = ['weaker', 'matched', 'stronger']

function isActiveRival(state: CampaignState, owner: HexState['owner']): boolean {
  return (RIVAL_IDS as readonly string[]).includes(owner) && state.rivals[owner as RivalId].status === 'active'
}

/** What kind of garrison a hex has, for grouping assault estimates. */
function garrisonKind(h: HexState): string {
  if (h.mythic) return 'mythic'
  if (h.owner === 'neutral') return h.village ? 'militia' : 'beasts'
  return h.owner
}

/**
 * The day's orders: the best Dominion per garrison point among the hexes the assault pool can take
 * at the expected Valor; with none, a Gate or capital the rival's army band says it can face.
 */
function orders(input: CampaignState, today: ISODate, pushes: boolean): CampaignState {
  let state = input
  const effects = realmEffects(state)
  const everyone = roster(state, { day: today }, effects).map((c) => c.id)
  const valor = expectedValor(state)
  const candidates = borderHexes(state).filter((h) => claimableBy(state.hexes, h.id, 'player', 'assault'))
  // Offered the whole army, the estimate fields the best-matched companies the assault banners allow.
  const pool = new Map<string, { value: number; fielded: string[] }>()
  let best: { hex: HexState; score: number; fielded: string[] } | null = null
  let push: { hex: HexState; score: number; fielded: string[] } | null = null
  const daysLeft = diffDays(today, addDays(weekOf(today, state.campaign.weekStartsOn), WEEK - 1)) + 1
  for (const h of candidates) {
    const kind = garrisonKind(h)
    if (!pool.has(kind)) {
      const est = ordersEstimate(state, { date: today, assaultTarget: h.id, assault: everyone, defense: [] }, today, valor, effects).assaults[0]
      pool.set(kind, { value: est?.value ?? 0, fielded: est?.fielded ?? [] })
    }
    const { value, fielded } = pool.get(kind) as { value: number; fielded: string[] }
    const garrison = effectiveGarrison(h, effects.assaultIgnoresFortification.on)
    if (fielded.length === 0) continue
    const dominion = Object.values(dominionOf(h)).reduce((s, v) => s + (v ?? 0), 0)
    const score = dominion / Math.max(1, garrison)
    if (value >= garrison) {
      if (!best || score > best.score) best = { hex: h, score, fielded }
    } else if (pushes && value * (1 + RULES.land.repulseWear * (daysLeft - 1)) >= garrison) {
      if (!push || score > push.score) push = { hex: h, score, fielded }
    }
  }
  // With nothing to take today, push a hex the week's repulses can wear down (Ch 6: "a second or third push can break it").
  if (!best && push) best = push
  if (best) return setOrders(state, { date: today, assaultTarget: best.hex.id, assault: best.fielded, defense: [] }).state
  if (pendingBattles(state).length > 0) return state
  const byId = hexIndex(state.hexes)
  const bandRank = (h: HexState): number => GRAND_BANDS.indexOf(rivalView(state, h.owner as RivalId, effects).armyBand)
  const grand = state.hexes
    .filter((h) => (h.kind === 'gate' || h.kind === 'capital') && isActiveRival(state, h.owner) && touches(byId, h.id, 'player') && bandRank(h) >= 0)
    .sort((a, b) => bandRank(a) - bandRank(b) || a.id.localeCompare(b.id))
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

// ── The smarter player's extras ──────────────────────────────────────────────

function raidsWinning(state: CampaignState, rival: RivalId, today: ISODate): boolean {
  const from = addDays(today, -WEEK)
  return state.log.filter((e) => e.kind === 'defense' && e.rival === rival && e.threat === 'raid' && e.outcome === 'defeat' && e.day >= from).length >= RAIDS_WINNING
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

function smarterDaily(input: CampaignState, today: ISODate, day: PolicyDay): CampaignState {
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
  if (lastVillages.length > 0) state = courtVillages(state, today, DEFECTION_MARGIN, (h) => lastVillages.includes(h.owner as RivalId))
  return state
}

// ── A day ────────────────────────────────────────────────────────────────────

/** Everything the player does on the open day `today`, before it closes. */
export function act(input: CampaignState, today: ISODate, day: PolicyDay): CampaignState {
  let state = input
  const weekStart = isWeekCloseDay(addDays(today, -1), state.campaign.weekStartsOn) || today === state.campaign.startDate
  if (weekStart) {
    state = buyCheapest(state, today)
    if (day.policy === 'smarter') state = smarterWeekly(state, today)
    state = courtVillages(state, today)
    if (day.policy !== 'smarter' || !accordRival(state, today)) state = sealLongest(state, today, day)
    state = useArmory(state, today)
  }
  if (day.policy === 'smarter') state = smarterDaily(state, today, day)
  state = fightBattles(state, today)
  state = orders(state, today, day.policy === 'push')
  if (day.rough) {
    const c = state.contracts.active
    if (c && c.startDate <= today && today <= c.endDate && state.contracts.respiteBank > 0) {
      const rested = takeRespite(state, today, today)
      if (rested.ok) state = rested.state
    }
  }
  return state
}
