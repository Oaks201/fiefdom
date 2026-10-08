/**
 * Land without a battle (Ch 6 "Influence: courting a village", "Trade and negotiation" and
 * "Losing land and taking it back", Ch 9 Grace I, Ch 12 "Respect", Ch 14 "Three ways to resolve a
 * rival"; A-16, A-22, A-23, A-31, A-32, A-39).
 *
 * - **Courtships.** `placeBid` holds a bid on an adjacent village from the purse. At week close
 *   the `courtships` phase calls `resolveCourtships`: Offer = Bid × Trust against the village's
 *   resistance, with rival suitors and the owner's counter-bid. Then `recoverLoyalty` (A-22).
 * - **Deals.** `availableDeals` lists what a rival will discuss, with prices and refusals;
 *   `makeDeal` strikes one. Truces and pacts are stored in `state.deals` with their last day.
 * - **Fortification** (`fortify`) and **reclaiming** (`reclaim`), both paid from the purse.
 * - **The defection tally** (`defectionTally`) for T13.
 *
 * Interfaces for later tasks:
 * - T10 bids for its rivals with `placeRivalBid` on a village the player courts: on a neutral
 *   village the rival is a second suitor; on the rival's own village it is the owner's counter-bid.
 *   T10 takes the money from the treasury when it bids; resolution refunds half to a rival that
 *   doesn't end up with the village (`outbidRefundShare`), and a counter-bid is never refunded.
 *   Rival bids that no player courtship took in resolve in `resolveRivalCourtships`, by the same rules.
 * - T08 and T10 read `blocksRaids`, `blocksConquest` (both include a running Accord) and
 *   `raidRateMult`; T10 reads `callToArmsOn` to hold a front at War, and fortifies rival hexes with
 *   `fortificationCost` and `fortificationCap`.
 *
 * Player actions taken outside settlement (bids, deals, fortifying, reclaiming) post their events
 * straight to `state.log`, dated the day they are taken. Refusals are codes with plain facts; deal
 * refusals also carry a text id (`herald.deal.refused.<code>`).
 *
 * Pure and deterministic: no randomness is needed here.
 */
import { addDays, diffDays } from './clock'
import { balance, post, roundPosting, spend } from './economy'
import { realmEffects } from './effects'
import { buildMap, claimableBy, isClaimableKind, touchesOwner } from './map'
import { RULES, base, byTier } from './rules'
import { EventBuffer, adjustRespect, coalitionPartners, hexOf, inCoalition, isPlayable, openDayOf, replaceHex, toPlayer, toRival } from './state'
import { RIVAL_IDS, type CampaignState, type Courtship, type Deal, type Effects, type Emit, type FrontId, type HexState, type ISODate, type Owner, type RivalId } from './types'

// ── Refusals and results ─────────────────────────────────────────────────────

export type LandRefusalCode =
  | 'campaignOver'
  | 'unknownHex'
  /** Not an adjacent village someone else holds (Ch 6, A-23). */
  | 'notCourtable'
  | 'alreadyCourting'
  /** Every courtship slot is taken (A-32). */
  | 'noSlot'
  | 'badBid'
  | 'reputation'
  | 'notPlayerHex'
  /** Not a hex that can change hands: the castle, a building, a Lair Mouth or the Rim. */
  | 'notClaimable'
  | 'maxed'
  /** Reclaiming needs the Crown's Grace at level I. */
  | 'grace'
  /** The player never lost this hex, or holds it now. */
  | 'notLost'
  | 'tooLate'
  | 'notTouching'

export interface LandRefusal {
  code: LandRefusalCode
  needed?: number
  have?: number
}

/** The result of a player action: the next state, or the same state and why not. */
export interface LandAction {
  ok: boolean
  reason?: LandRefusal
  state: CampaignState
  /** What the purse paid (or, for a sold hex, received). */
  cost: number
}

function refused(state: CampaignState, reason: LandRefusal, cost = 0): LandAction {
  return { ok: false, reason, state, cost }
}

// ── Small helpers ────────────────────────────────────────────────────────────

function isRival(owner: Owner): owner is RivalId {
  return owner !== 'player' && owner !== 'neutral'
}

/** Whether the purse covers `amount` as it would post (A-11). */
function affordable(state: CampaignState, amount: number): boolean {
  return roundPosting(amount) <= balance(state.purse)
}

function reputationShort(state: CampaignState, amount: number): LandRefusal | null {
  return affordable(state, amount) ? null : { code: 'reputation', needed: amount, have: balance(state.purse) }
}

/** A village's full loyalty to the player: 15 × ring (A-22). */
function fullLoyalty(ring: number): number {
  return RULES.influence.loyalty.neutralPerRing * ring
}

// ── Courtships (Ch 6 "Influence") ────────────────────────────────────────────

/** Courtship slots: 2, +1 at Merchant Hall III, +1 at Merchant Hall V, +1 with the Golden Road (A-32). */
export function courtshipSlots(state: CampaignState, effects: Effects = realmEffects(state)): number {
  return effects.courtshipSlots.value
}

/** Trust = clamp(0.6 + 0.6 × RC, 0.6, 1.2), then + Envoy's Rest's 0.05 (`bonus`). */
export function trust(realmConsistency: number, bonus = 0): number {
  const t = RULES.influence.trust
  return Math.min(t.max, Math.max(t.min, t.base + t.perRealmConsistency * realmConsistency)) + bonus
}

/**
 * What an Offer must reach for a village to defect: its current loyalty (15 × ring neutral, 30 ×
 * ring rival-held, lowered by failed bids), twice that for a Gate (A-16), plus the owner's
 * counter-bid on a rival-held village.
 */
export function resistance(hex: Pick<HexState, 'kind' | 'owner' | 'village'>, counterBid = 0): number {
  const loyalty = hex.village?.loyalty ?? 0
  const gate = hex.kind === 'gate' ? RULES.influence.loyalty.gateMult : 1
  return loyalty * gate + (isRival(hex.owner) ? counterBid : 0)
}

/** Whether the player may bid `bid` on `hexId` now, and why not. */
export function bidCheck(state: CampaignState, hexId: string, bid: number): { ok: boolean; reason?: LandRefusal; slots: number; open: number } {
  const slots = courtshipSlots(state)
  const open = state.courtships.length
  const no = (reason: LandRefusal): { ok: false; reason: LandRefusal; slots: number; open: number } => ({ ok: false, reason, slots, open })
  if (!isPlayable(state)) return no({ code: 'campaignOver' })
  if (!hexOf(state, hexId)) return no({ code: 'unknownHex' })
  if (!claimableBy(state.hexes, hexId, 'player', 'court')) return no({ code: 'notCourtable' })
  if (state.courtships.some((c) => c.hexId === hexId)) return no({ code: 'alreadyCourting' })
  if (open >= slots) return no({ code: 'noSlot', needed: open + 1, have: slots })
  if (!Number.isFinite(bid) || roundPosting(bid) <= 0) return no({ code: 'badBid' })
  const short = reputationShort(state, bid)
  if (short) return no(short)
  return { ok: true, slots, open }
}

/**
 * Places a sealed bid on an adjacent village, neutral or rival-held (Ch 6). The bid is held from
 * the purse now (a `spend`) and resolves at the week close.
 */
export function placeBid(state: CampaignState, hexId: string, bid: number, today: ISODate = openDayOf(state)): LandAction {
  const check = bidCheck(state, hexId, bid)
  if (!check.ok) return refused(state, check.reason as LandRefusal)
  const amount = roundPosting(bid)
  const courtship: Courtship = { hexId, bid: amount, placedOn: today, rivalBids: {} }
  return {
    ok: true,
    cost: amount,
    state: { ...state, purse: spend(state.purse, today, amount, `courtship:${hexId}`), courtships: [...state.courtships, courtship] }
  }
}

/**
 * T10's bid on a village the player is courting: a second suitor on a neutral village, or the
 * owner's counter-bid on its own village. Replaces that rival's earlier bid this week. T10 takes
 * the money from the treasury. A bid on a village nobody courts is T10's own business (A-25).
 */
export function placeRivalBid(state: CampaignState, rival: RivalId, hexId: string, bid: number): CampaignState {
  if (!state.courtships.some((c) => c.hexId === hexId)) return state
  return {
    ...state,
    courtships: state.courtships.map((c) => (c.hexId === hexId ? { ...c, rivalBids: { ...c.rivalBids, [rival]: bid } } : c))
  }
}

export interface CourtshipWeek {
  /** The week's last day; its close is the week close. */
  day: ISODate
  /** Realm Consistency at the close (A-39). */
  realmConsistency: number
  emit: Emit
}

/** The best rival suitor on a neutral village: the highest bid, ties to the earlier rival in the usual order. */
function bestSuitor(c: Courtship): { rival: RivalId; bid: number } | null {
  let best: { rival: RivalId; bid: number } | null = null
  for (const rival of RIVAL_IDS) {
    const bid = c.rivalBids[rival] ?? 0
    if (bid > 0 && (!best || bid > best.bid)) best = { rival, bid }
  }
  return best
}

/**
 * Resolves every courtship placed by `day` (Ch 6), in the order placed. Offer = Bid × Trust.
 * The highest Offer among the player and any rival suitor (rivals bid at Trust 1.0; a tie goes
 * to the player) takes the village if it reaches the resistance. Whoever ends up with the village
 * has spent the whole bid; every other bidder gets half back. A village that holds loses 10% of
 * the highest Offer from its loyalty, for good. A village taken from a rival costs 3 Respect.
 * A courtship whose village is no longer courtable (taken by other means, or no longer touching
 * the player's land) is void and refunded in full. Each courtship resolves once and is removed.
 */
export function resolveCourtships(state: CampaignState, week: CourtshipWeek): CampaignState {
  const due = state.courtships.filter((c) => c.placedOn <= week.day)
  if (due.length === 0) return state
  const { emit, day } = week
  const inf = RULES.influence
  const playerTrust = trust(week.realmConsistency, realmEffects(state).trust.value)
  let next: CampaignState = { ...state, courtships: state.courtships.filter((c) => c.placedOn > day) }
  let purse = next.purse
  const refund = (amount: number, source: string): void => {
    purse = post(purse, { date: day, kind: 'return', amount, source })
  }

  for (const c of due) {
    const hex = hexOf(next, c.hexId)
    if (!hex || !hex.village || hex.owner === 'player' || !touchesOwner(next.hexes, hex.id, 'player')) {
      refund(c.bid, `courtship:void:${c.hexId}`)
      emit('courtship', { hexId: c.hexId, outcome: 'void', bid: c.bid })
      continue
    }
    const owner = hex.owner
    const counter = isRival(owner) ? (c.rivalBids[owner] ?? 0) : 0
    const suitor = owner === 'neutral' ? bestSuitor(c) : null
    // Offers and resistance are reputation, compared at the purse's precision (A-11), so that
    // 50 × 0.9 meets 45 despite floating point.
    const offer = c.bid * playerTrust
    const rivalOffer = suitor ? suitor.bid * inf.rivalTrust : 0
    const top: { who: Owner; offer: number } =
      suitor && roundPosting(rivalOffer) > roundPosting(offer) ? { who: suitor.rival, offer: rivalOffer } : { who: 'player', offer }
    const defects = roundPosting(top.offer) >= roundPosting(resistance(hex, counter))
    const winner: Owner | undefined = defects ? top.who : undefined

    // Every suitor who doesn't end up with the village gets half its bid back.
    if (winner !== 'player') refund(c.bid * inf.failedBid.refundShare, `courtship:refund:${c.hexId}`)
    if (owner === 'neutral') {
      for (const rival of RIVAL_IDS) {
        const bid = c.rivalBids[rival] ?? 0
        if (bid <= 0 || rival === winner) continue
        const r = next.rivals[rival]
        next = { ...next, rivals: { ...next.rivals, [rival]: { ...r, treasury: r.treasury + bid * inf.outbidRefundShare } } }
      }
    }

    if (winner === 'player') {
      next = replaceHex(next, toPlayer(hex, day, false))
      emit('hexTransfer', { hexId: hex.id, from: owner, to: 'player', how: 'influence' })
      if (isRival(owner)) next = adjustRespect(next, owner, RULES.respect.change.villageCourted, 'villageCourted', emit)
      emit('courtship', { hexId: hex.id, outcome: 'defected', bid: c.bid, winner: 'player' })
    } else if (winner !== undefined && isRival(winner)) {
      next = replaceHex(next, toRival(hex, winner))
      emit('hexTransfer', { hexId: hex.id, from: owner, to: winner, how: 'influence' })
      emit('courtship', { hexId: hex.id, outcome: 'defected', bid: c.bid, winner })
    } else {
      const loyalty = hex.village.loyalty
      const after = Math.max(0, loyalty - inf.failedBid.loyaltyDropShareOfOffer * top.offer)
      next = replaceHex(next, { ...hex, village: { ...hex.village, loyalty: after } })
      emit('courtship', { hexId: hex.id, outcome: 'held', bid: c.bid, loyaltyDrop: loyalty - after })
    }
  }
  return { ...next, purse }
}

/**
 * Resolves the village bids rivals placed at their turns (T10, A-25) that no player courtship
 * took in as a second suitor: each neutral village goes to its highest bidder at Trust 1.0 (ties
 * in the usual order Orc, Goblin, Dwarf, Archmage) if that Offer reaches its loyalty. As with the
 * player's bids (A-141), the winner has spent its whole bid and every other bidder gets half back;
 * a village that holds loses 10% of the highest Offer; a village no longer neutral or no longer
 * touching the bidder's land is void and refunds in full. Each bid resolves once and is removed.
 */
export function resolveRivalCourtships(state: CampaignState, week: CourtshipWeek): CampaignState {
  const { day, emit } = week
  const inf = RULES.influence
  const due = new Map<string, { rival: RivalId; bid: number }[]>()
  let next: CampaignState = state
  for (const rival of RIVAL_IDS) {
    const courting = next.rivals[rival].ai?.courting ?? []
    if (courting.length === 0) continue
    for (const c of courting.filter((x) => x.placedOn <= day)) due.set(c.hexId, [...(due.get(c.hexId) ?? []), { rival, bid: c.bid }])
    const r = next.rivals[rival]
    next = { ...next, rivals: { ...next.rivals, [rival]: { ...r, ai: { ...r.ai, courting: courting.filter((x) => x.placedOn > day) } } } }
  }
  const credit = (rival: RivalId, amount: number): void => {
    const r = next.rivals[rival]
    next = { ...next, rivals: { ...next.rivals, [rival]: { ...r, treasury: r.treasury + amount } } }
  }

  for (const [hexId, bids] of [...due.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const hex = hexOf(next, hexId)
    const valid = bids.filter((b) => hex?.village && hex.owner === 'neutral' && touchesOwner(next.hexes, hexId, b.rival))
    for (const b of bids) if (!valid.includes(b)) credit(b.rival, b.bid)
    if (!hex || !hex.village || valid.length === 0) continue
    const top = valid.reduce((best, b) => (roundPosting(b.bid) > roundPosting(best.bid) ? b : best))
    const offer = top.bid * inf.rivalTrust
    const defects = roundPosting(offer) >= roundPosting(resistance(hex))
    for (const b of valid) if (!(defects && b === top)) credit(b.rival, b.bid * inf.outbidRefundShare)
    if (defects) {
      next = replaceHex(next, toRival(hex, top.rival))
      emit('hexTransfer', { hexId, from: 'neutral', to: top.rival, how: 'influence' })
    } else {
      const after = Math.max(0, hex.village.loyalty - inf.failedBid.loyaltyDropShareOfOffer * offer)
      next = replaceHex(next, { ...hex, village: { ...hex.village, loyalty: after } })
    }
  }
  return next
}

/** The player's villages recover 5% of 15 × ring loyalty a week, up to 15 × ring (A-22). */
export function recoverLoyalty(state: CampaignState): CampaignState {
  let changed = false
  const hexes = state.hexes.map((h) => {
    if (h.owner !== 'player' || !h.village) return h
    const full = fullLoyalty(h.ring)
    if (h.village.loyalty >= full) return h
    changed = true
    const loyalty = Math.min(full, h.village.loyalty + RULES.land.villageLoyalty.weeklyRecoveryShare * full)
    return { ...h, village: { ...h.village, loyalty } }
  })
  return changed ? { ...state, hexes } : state
}

// ── Deals with rivals (Ch 6 "Trade and negotiation") ─────────────────────────

export type DealKind = Deal['kind']

export type DealRefusalCode =
  | 'campaignOver'
  /** The rival is conquered, abdicated or allied: there is nothing to negotiate. */
  | 'rivalResolved'
  | 'respect'
  | 'atWar'
  | 'gate'
  /** No hex to trade with this rival. */
  | 'noHex'
  | 'notRivalHex'
  | 'notPlayerHex'
  /** Not adjacent, or a hex that never changes hands. */
  | 'notClaimable'
  /** Rings 1 and 2 are never sold. */
  | 'innerRing'
  /** One hex deal per rival every 4 weeks. */
  | 'cooldown'
  | 'grandBattleWarning'
  /** The same kind of agreement already runs with this rival. */
  | 'inForce'
  | 'noTarget'
  /** A call to arms needs a Rim front between the two rivals. */
  | 'noFront'
  /** The target is in a coalition with the rival. */
  | 'targetAllied'
  /** A buy-out needs the rival in a coalition standing against the player (T12). */
  | 'noCoalition'
  | 'reputation'

export interface DealRefusal {
  code: DealRefusalCode
  /** The text slot that explains it (`herald.deal.refused.<code>`). */
  textId: string
  needed?: number
  have?: number
}

export interface DealRequest {
  kind: DealKind
  /** The hex bought or sold. */
  hexId?: string
  /** The rival a call to arms is against. */
  target?: RivalId
}

export interface DealOffer extends DealRequest {
  rival: RivalId
  /** What the player pays, or for a sold hex what the player receives. Exact; it posts rounded to 0.1. */
  price: number
  allowed: boolean
  reason?: DealRefusal
}

function dealRefusal(code: DealRefusalCode, facts: { needed?: number; have?: number } = {}): DealRefusal {
  return { code, textId: `herald.deal.refused.${code}`, ...facts }
}

/** Whether an agreement of `kind` with `rival` holds on `day` (its `until` is its last day, A-123). */
function inForce(state: CampaignState, rival: RivalId, kind: DealKind, day: ISODate): boolean {
  return state.deals.some((d) => d.rival === rival && d.kind === kind && d.madeOn <= day && (d.until === undefined || day <= d.until))
}

/** An Accord with `rival` runs on `day`: the contract in the slot is one (Ch 14, D-01). */
function accordOn(state: CampaignState, rival: RivalId, day: ISODate): boolean {
  const c = state.contracts.active
  return c !== undefined && c.kind === 'accord' && c.rival === rival && c.startDate <= day && day <= c.endDate
}

/** A Truce (Ch 6) or an Accord (Ch 14) with `rival` holds on `day`: no raids from it. */
export function blocksRaids(state: CampaignState, rival: RivalId, day: ISODate): boolean {
  return inForce(state, rival, 'truce', day) || accordOn(state, rival, day)
}

/** A Truce, a non-aggression pact (Ch 6) or an Accord (Ch 14) with `rival` holds on `day`: no conquest attempts from it. */
export function blocksConquest(state: CampaignState, rival: RivalId, day: ISODate): boolean {
  return blocksRaids(state, rival, day) || inForce(state, rival, 'pact', day)
}

/** A non-aggression pact halves a rival's raid rate (Ch 6): the multiplier on its raider weight. */
export function raidRateMult(state: CampaignState, rival: RivalId, day: ISODate): number {
  return inForce(state, rival, 'pact', day) ? RULES.trade.pact.raidRateMult : 1
}

/** The calls to arms in force on `day`: the rival at war with the target until `until` (T10 holds the front at War). */
export function callToArmsOn(state: CampaignState, day: ISODate): { rival: RivalId; target: RivalId; until: ISODate }[] {
  return state.deals
    .filter((d) => d.kind === 'callToArms' && d.target !== undefined && d.until !== undefined && d.madeOn <= day && day <= d.until)
    .map((d) => ({ rival: d.rival, target: d.target as RivalId, until: d.until as ISODate }))
}

/** 50 × ring × greed (the holder's), ×1.5 for a village: a hex's trade price before any discount. */
export function tradeValue(rival: RivalId, hex: HexState): number {
  const t = RULES.trade
  return t.hexPricePerRing * hex.ring * t.greed[rival] * (hex.village ? t.villageMult : 1)
}

/** What buying `hex` from `rival` costs: the trade value, −20% with the Exchange Wing. */
export function buyPrice(state: CampaignState, rival: RivalId, hex: HexState, effects: Effects = realmEffects(state)): number {
  return tradeValue(rival, hex) * effects.costs.trade.value
}

/** What selling `hex` to `rival` pays the player: 0.7 × the (undiscounted) buy price. */
export function sellPrice(rival: RivalId, hex: HexState): number {
  return RULES.trade.sellShare * tradeValue(rival, hex)
}

/** 30 × the highest ring of the rival's land that touches the player's (or of all its land, when none does). */
export function trucePrice(state: CampaignState, rival: RivalId): number {
  const land = state.hexes.filter((h) => h.owner === rival && isClaimableKind(h))
  const bordering = land.filter((h) => touchesOwner(state.hexes, h.id, 'player'))
  const ring = Math.max(0, ...(bordering.length > 0 ? bordering : land).map((h) => h.ring))
  return RULES.trade.truce.costPerRing * ring
}

function lastHexDeal(state: CampaignState, rival: RivalId): Deal | undefined {
  return state.deals
    .filter((d) => d.rival === rival && (d.kind === 'buyHex' || d.kind === 'sellHex'))
    .reduce<Deal | undefined>((last, d) => (!last || d.madeOn > last.madeOn ? d : last), undefined)
}

function onCooldown(state: CampaignState, rival: RivalId, today: ISODate): boolean {
  const last = lastHexDeal(state, rival)
  return last !== undefined && diffDays(last.madeOn, today) < RULES.trade.hexDealEveryWeeks * RULES.clock.daysPerWeek
}

/** A Grand Battle has been announced and not yet fought (Ch 11). */
function grandBattleWarning(state: CampaignState, today: ISODate): boolean {
  return state.grandBattles.some((b) => b.result === undefined && b.announcedOn <= today && today <= b.battleDate)
}

function frontBetween(state: CampaignState, a: RivalId, b: RivalId): FrontId | undefined {
  return Object.values(state.fronts).find((f) => f.rivals.includes(a) && f.rivals.includes(b))?.front
}

/** The first failing check (requirements before the price), or an allowed offer. */
function judged(state: CampaignState, offer: Omit<DealOffer, 'allowed' | 'reason'>, checks: (DealRefusal | null)[]): DealOffer {
  const standing: DealRefusal[] = []
  if (!isPlayable(state)) standing.push(dealRefusal('campaignOver'))
  if (state.rivals[offer.rival].status !== 'active') standing.push(dealRefusal('rivalResolved'))
  const pays = offer.kind !== 'sellHex'
  const money = pays && !affordable(state, offer.price) ? dealRefusal('reputation', { needed: offer.price, have: balance(state.purse) }) : null
  const failed = [...standing, ...checks, money].find((r) => r !== null)
  return failed ? { ...offer, allowed: false, reason: failed } : { ...offer, allowed: true }
}

function respectBelow(state: CampaignState, rival: RivalId, needed: number): DealRefusal | null {
  const have = state.rivals[rival].respect
  return have < needed ? dealRefusal('respect', { needed, have }) : null
}

/**
 * One deal with `rival`, priced and checked (Ch 6 trade table, Ch 12 Respect thresholds):
 *
 * - Buy a hex: an adjacent rival hex, not its Gate (A-16); Respect 50 (the Goblin 25); not at war
 *   with the player; one hex deal per rival every 4 weeks.
 * - Sell a hex: a player hex touching the rival's land, ring 3 or beyond and not a Gate; Respect 25;
 *   the same 4-week limit.
 * - Truce: any time but during a Grand Battle warning; not while one already holds.
 * - Non-aggression pact: Respect 40; not while one already holds.
 * - Call to arms: Respect 60; the target shares a Rim front with the rival and is not in a
 *   coalition with it; not while the rival already answers one.
 * - Buy-out (T12, Ch 13): 300 to a coalition member at Respect 40 to walk away, breaking it.
 */
export function offerDeal(state: CampaignState, rival: RivalId, request: DealRequest, today: ISODate = openDayOf(state)): DealOffer {
  const r = state.rivals[rival]
  const th = RULES.respect.thresholds
  const t = RULES.trade
  const hex = request.hexId !== undefined ? hexOf(state, request.hexId) : undefined
  const offer = (price: number): Omit<DealOffer, 'allowed' | 'reason'> => ({ ...request, rival, price })

  switch (request.kind) {
    case 'buyHex': {
      if (!hex) return judged(state, offer(0), [dealRefusal('noHex')])
      return judged(state, offer(buyPrice(state, rival, hex)), [
        hex.kind === 'gate' ? dealRefusal('gate') : null,
        hex.owner !== rival ? dealRefusal('notRivalHex') : null,
        !claimableBy(state.hexes, hex.id, 'player', 'buy') ? dealRefusal('notClaimable') : null,
        r.disposition.player === 'war' ? dealRefusal('atWar') : null,
        respectBelow(state, rival, rival === 'goblin' ? th.goblinBuysHex : th.buyHex),
        onCooldown(state, rival, today) ? dealRefusal('cooldown') : null
      ])
    }
    case 'sellHex': {
      if (!hex) return judged(state, offer(0), [dealRefusal('noHex')])
      return judged(state, offer(sellPrice(rival, hex)), [
        hex.owner !== 'player' ? dealRefusal('notPlayerHex') : null,
        hex.ring < t.sellMinRing ? dealRefusal('innerRing') : null,
        hex.kind === 'gate' ? dealRefusal('gate') : null,
        !isClaimableKind(hex) || hex.kind === 'lairMouth' || !touchesOwner(state.hexes, hex.id, rival) ? dealRefusal('notClaimable') : null,
        respectBelow(state, rival, th.sellHex),
        onCooldown(state, rival, today) ? dealRefusal('cooldown') : null
      ])
    }
    case 'truce':
      return judged(state, offer(trucePrice(state, rival)), [
        grandBattleWarning(state, today) ? dealRefusal('grandBattleWarning') : null,
        inForce(state, rival, 'truce', today) ? dealRefusal('inForce') : null
      ])
    case 'pact':
      return judged(state, offer(t.pact.cost), [
        inForce(state, rival, 'pact', today) ? dealRefusal('inForce') : null,
        respectBelow(state, rival, th.pact)
      ])
    case 'callToArms': {
      const target = request.target
      const valid = target !== undefined && target !== rival && state.rivals[target]?.status === 'active'
      return judged(state, offer(t.callToArms.cost), [
        !valid ? dealRefusal('noTarget') : null,
        valid && !frontBetween(state, rival, target) ? dealRefusal('noFront') : null,
        valid && coalitionPartners(state, rival, target, today) ? dealRefusal('targetAllied') : null,
        inForce(state, rival, 'callToArms', today) ? dealRefusal('inForce') : null,
        respectBelow(state, rival, th.callToArms)
      ])
    }
    case 'buyout': {
      const buyout = RULES.world.coalitions.buyout
      return judged(state, offer(buyout.cost), [!inCoalition(state, rival, today) ? dealRefusal('noCoalition') : null, respectBelow(state, rival, buyout.minRespect)])
    }
  }
}

/**
 * The Diplomacy list for `rival` (Ch 6): every hex it could sell the player and every player hex
 * it could buy (one `noHex` line when there are none), a Truce, a pact and a call to arms against
 * each other rival, each priced, with whether it is allowed and the reason if not.
 */
export function availableDeals(state: CampaignState, rival: RivalId, today: ISODate = openDayOf(state)): DealOffer[] {
  const buyable = state.hexes.filter((h) => h.owner === rival && isClaimableKind(h) && h.kind !== 'lairMouth' && touchesOwner(state.hexes, h.id, 'player'))
  const sellable = state.hexes.filter((h) => h.owner === 'player' && isClaimableKind(h) && touchesOwner(state.hexes, h.id, rival))
  const hexDeals = (kind: 'buyHex' | 'sellHex', hexes: HexState[]): DealOffer[] =>
    hexes.length > 0 ? hexes.map((h) => offerDeal(state, rival, { kind, hexId: h.id }, today)) : [offerDeal(state, rival, { kind }, today)]
  return [
    ...hexDeals('buyHex', buyable),
    ...hexDeals('sellHex', sellable),
    offerDeal(state, rival, { kind: 'truce' }, today),
    offerDeal(state, rival, { kind: 'pact' }, today),
    ...RIVAL_IDS.filter((x) => x !== rival).map((target) => offerDeal(state, rival, { kind: 'callToArms', target }, today)),
    ...(inCoalition(state, rival, today) ? [offerDeal(state, rival, { kind: 'buyout' }, today)] : [])
  ]
}

/**
 * Strikes a deal (Ch 6), posting its price (or, for a sale, the proceeds), the hex transfer and
 * the Respect change (a trade or Truce +2, a sale +5) and the `deal` event. A bought or sold hex
 * changes hands now (A-140). A Truce, pact or call to arms runs from today through its last day.
 * A call to arms puts the two rivals' front at War now; T10 keeps it there until it ends.
 */
export function makeDeal(state: CampaignState, rival: RivalId, request: DealRequest, today: ISODate = openDayOf(state)): LandAction & { deal?: Deal; refusal?: DealRefusal } {
  const offer = offerDeal(state, rival, request, today)
  if (!offer.allowed) return { ok: false, state, cost: offer.price, ...(offer.reason ? { refusal: offer.reason } : {}) }
  const events = new EventBuffer()
  const emit = events.emitter(today)
  const t = RULES.trade
  const source = `deal:${request.kind}:${rival}${request.hexId ? `:${request.hexId}` : ''}${request.target ? `:${request.target}` : ''}`
  const dealNo = state.log.filter((e) => e.kind === 'deal').length + 1
  const deal: Deal = { id: `deal-${dealNo}`, rival, kind: request.kind, madeOn: today, price: roundPosting(offer.price) }
  if (request.hexId) deal.hexId = request.hexId
  if (request.target) deal.target = request.target

  let next: CampaignState =
    request.kind === 'sellHex'
      ? { ...state, purse: post(state.purse, { date: today, kind: 'earn', amount: offer.price, source }) }
      : { ...state, purse: spend(state.purse, today, offer.price, source) }
  const lasting = (days: number): ISODate => addDays(today, days - 1)

  switch (request.kind) {
    case 'buyHex': {
      const hex = hexOf(next, request.hexId as string) as HexState
      next = replaceHex(next, toPlayer(hex, today, false))
      emit('hexTransfer', { hexId: hex.id, from: rival, to: 'player', how: 'trade' })
      next = adjustRespect(next, rival, RULES.respect.change.tradeOrTruce, 'trade', emit)
      break
    }
    case 'sellHex': {
      const hex = hexOf(next, request.hexId as string) as HexState
      next = replaceHex(next, toRival(hex, rival))
      emit('hexTransfer', { hexId: hex.id, from: 'player', to: rival, how: 'trade' })
      next = adjustRespect(next, rival, RULES.respect.change.hexSold, 'hexSold', emit)
      break
    }
    case 'truce':
      deal.until = lasting(t.truce.days)
      next = adjustRespect(next, rival, RULES.respect.change.tradeOrTruce, 'truce', emit)
      break
    case 'pact':
      deal.until = lasting(t.pact.days)
      break
    case 'callToArms': {
      deal.until = lasting(t.callToArms.days)
      const target = request.target as RivalId
      const frontId = frontBetween(next, rival, target) as FrontId
      const front = next.fronts[frontId]
      const a = next.rivals[rival]
      const b = next.rivals[target]
      next = {
        ...next,
        fronts: { ...next.fronts, [frontId]: { ...front, state: 'war' } },
        rivals: {
          ...next.rivals,
          [rival]: { ...a, disposition: { ...a.disposition, [target]: 'war' } },
          [target]: { ...b, disposition: { ...b.disposition, [rival]: 'war' } }
        }
      }
      if (front.state !== 'war') emit('front', { front: frontId, state: 'war', track: front.track })
      break
    }
    case 'buyout': {
      // The member walks away: its coalition ends today (Ch 13).
      next = {
        ...next,
        coalitions: next.coalitions.map((c) => {
          if (!c.members.includes(rival) || (c.until !== undefined && c.until < today)) return c
          emit('coalition', { members: [...c.members], trigger: c.trigger, stage: 'broken' })
          return { ...c, until: today, broken: 'buyout' as const }
        })
      }
      break
    }
  }
  emit('deal', { rival, deal: request.kind, price: deal.price, ...(deal.hexId ? { hexId: deal.hexId } : {}), ...(deal.target ? { target: deal.target } : {}) })
  next = events.flush({ ...next, deals: [...next.deals, deal] })
  return { ok: true, state: next, cost: offer.price, deal }
}

// ── Fortification (Ch 5 sinks, Ch 6) ─────────────────────────────────────────

/** The highest fortification level `owner` can reach on its own hexes: 3, the Dwarf 4. */
export function fortificationCap(owner: Owner): number {
  return owner === 'dwarf' ? RULES.land.dwarfFortificationMax : RULES.land.fortificationMax
}

/** F, what a hex's fortification adds to its garrison or defense: level × 0.25 × base(ring) (Ch 6, Ch 10). */
export function fortificationValue(hex: Pick<HexState, 'fortification' | 'ring'>): number {
  return hex.fortification * RULES.land.garrison.fortificationPerLevel * base(hex.ring)
}

/** What raising a ring-`ring` hex to `level` (1 to 3) costs: 15 / 35 / 70 × ring, × `mult` (the Kilns 0.75). */
export function fortificationCost(level: number, ring: number, mult = 1): number {
  return byTier(RULES.land.fortificationCost, level) * ring * mult
}

/** The player's next fortification on `hexId`: its level, its exact price, and why not. */
export function fortifyOffer(state: CampaignState, hexId: string): { ok: boolean; reason?: LandRefusal; next: number; cost: number } {
  const hex = hexOf(state, hexId)
  const no = (reason: LandRefusal, next = 0, cost = 0): { ok: false; reason: LandRefusal; next: number; cost: number } => ({ ok: false, reason, next, cost })
  if (!isPlayable(state)) return no({ code: 'campaignOver' })
  if (!hex) return no({ code: 'unknownHex' })
  if (hex.owner !== 'player') return no({ code: 'notPlayerHex' })
  if (!isClaimableKind(hex)) return no({ code: 'notClaimable' })
  if (hex.fortification >= fortificationCap('player')) return no({ code: 'maxed' }, hex.fortification)
  const next = hex.fortification + 1
  const cost = fortificationCost(next, hex.ring, realmEffects(state).costs.fortification.value)
  const short = reputationShort(state, cost)
  if (short) return no(short, next, cost)
  return { ok: true, next, cost }
}

/** Raises one of the player's hexes one fortification level (to 3 at most), paying from the purse. */
export function fortify(state: CampaignState, hexId: string, today: ISODate = openDayOf(state)): LandAction {
  const offer = fortifyOffer(state, hexId)
  if (!offer.ok) return refused(state, offer.reason as LandRefusal, offer.cost)
  const hex = hexOf(state, hexId) as HexState
  const paid = { ...state, purse: spend(state.purse, today, offer.cost, `fortify:${hexId}:${offer.next}`) }
  return { ok: true, cost: offer.cost, state: replaceHex(paid, { ...hex, fortification: offer.next as HexState['fortification'] }) }
}

// ── Reclaiming (Ch 6 "Losing land", Ch 9 Grace I) ────────────────────────────

/** The day the player last lost `hexId`, from the log. */
export function lostOn(state: CampaignState, hexId: string): ISODate | undefined {
  let day: ISODate | undefined
  for (const e of state.log) if (e.kind === 'hexTransfer' && e.hexId === hexId && e.from === 'player') day = e.day
  return day
}

/** Reclaiming a hex: half its garrison strength (garrison and fortification) in reputation, and why not. */
export function reclaimOffer(state: CampaignState, hexId: string, today: ISODate = openDayOf(state)): { ok: boolean; reason?: LandRefusal; cost: number; lostOn?: ISODate } {
  const rules = RULES.grace.reclaim
  const hex = hexOf(state, hexId)
  const lost = lostOn(state, hexId)
  const at = lost ? { lostOn: lost } : {}
  const no = (reason: LandRefusal, cost = 0): { ok: false; reason: LandRefusal; cost: number; lostOn?: ISODate } => ({ ok: false, reason, cost, ...at })
  if (!isPlayable(state)) return no({ code: 'campaignOver' })
  if (!hex) return no({ code: 'unknownHex' })
  if (state.weight.grace < rules.level) return no({ code: 'grace', needed: rules.level, have: state.weight.grace })
  if (!lost || hex.owner === 'player') return no({ code: 'notLost' })
  const ago = diffDays(lost, today)
  if (ago > rules.windowDays) return no({ code: 'tooLate', needed: rules.windowDays, have: ago })
  if (!isClaimableKind(hex)) return no({ code: 'notClaimable' })
  if (!touchesOwner(state.hexes, hexId, 'player')) return no({ code: 'notTouching' })
  const cost = rules.garrisonShare * (hex.garrison + fortificationValue(hex))
  const short = reputationShort(state, cost)
  if (short) return no(short, cost)
  return { ok: true, cost, ...at }
}

/**
 * With the Crown's Grace at level I or higher, takes back a hex lost in the last 14 days, if it
 * still touches the player's land, for half its garrison strength in reputation: no battle.
 */
export function reclaim(state: CampaignState, hexId: string, today: ISODate = openDayOf(state)): LandAction {
  const offer = reclaimOffer(state, hexId, today)
  if (!offer.ok) return refused(state, offer.reason as LandRefusal, offer.cost)
  const hex = hexOf(state, hexId) as HexState
  const events = new EventBuffer()
  let next: CampaignState = { ...state, purse: spend(state.purse, today, offer.cost, `reclaim:${hexId}`) }
  next = replaceHex(next, toPlayer(hex, today, true))
  events.emitter(today)('hexTransfer', { hexId, from: hex.owner, to: 'player', how: 'reclaim' })
  return { ok: true, cost: offer.cost, state: events.flush(next) }
}

// ── The defection tally (Ch 14, for T13) ─────────────────────────────────────

export type WonBy = 'influence' | 'trade' | 'conquest'

export interface DefectionTally {
  rival: RivalId
  /** Its villages at the founding: its Gate and the two March hexes beside it. */
  original: string[]
  /** Its original villages the player holds now, by how the player won each. */
  won: Record<WonBy, number>
  /** Villages it holds now, its original ones or any other. */
  holds: number
}

const ORIGINAL_VILLAGES = new Map<number, Record<RivalId, string[]>>()

/** Each rival's villages at the founding, rebuilt from the seed (the map depends on it alone). */
export function originalVillages(seed: number): Record<RivalId, string[]> {
  const cached = ORIGINAL_VILLAGES.get(seed)
  if (cached) return cached
  const map = buildMap(seed)
  const out = Object.fromEntries(RIVAL_IDS.map((r) => [r, map.filter((h) => h.owner === r && h.village).map((h) => h.id)])) as Record<RivalId, string[]>
  ORIGINAL_VILLAGES.set(seed, out)
  return out
}

/**
 * How many of `rival`'s original villages the player holds, and how each was won: the way of the
 * last transfer to the player that was not a reclaim (a reclaimed hex counts the way it was first
 * won). Villages that reached the player another way (an event, an abdication) aren't counted.
 */
export function defectionTally(state: CampaignState, rival: RivalId): DefectionTally {
  const original = originalVillages(state.campaign.seed)[rival]
  const won: Record<WonBy, number> = { influence: 0, trade: 0, conquest: 0 }
  for (const id of original) {
    if (hexOf(state, id)?.owner !== 'player') continue
    let how: WonBy | undefined
    for (const e of state.log) {
      if (e.kind !== 'hexTransfer' || e.hexId !== id || e.to !== 'player') continue
      if (e.how === 'influence' || e.how === 'trade' || e.how === 'conquest') how = e.how
    }
    if (how) won[how]++
  }
  return { rival, original, won, holds: state.hexes.filter((h) => h.owner === rival && h.village).length }
}
