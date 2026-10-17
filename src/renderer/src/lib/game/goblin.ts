/**
 * Patch 4 (D-29; P4-02, P4-03, C-43, C-44, X-12): the Goblin, always a deal.
 *
 * - **Bribes.** Any hex of his march the player could assault has a price, paid on the open day: the
 *   garrison an assault must beat × his greed ÷ the player's Trust, lowered by Respect. Paid, the hex is
 *   the player's at once, with no battle (A-140). His Gate is never for sale (A-16).
 * - **His bids for the player's villages** (A-23 overturned for him only). At his turn from week 6 he
 *   bids for one village of the player's in his march; until the next week close the player may hold
 *   it, and at that close his offer meets the village's loyalty + the hold × Trust. Never against a
 *   player away 14 days or more (R-24).
 * - **Buy-back offers.** His own garrison beaten without a rout offers to buy back the hex it lost
 *   instead of striking back (C-44), at his sale price, while its window lasts.
 *
 * Prices come from public facts only (X-19): the garrison shown (A-181), Trust, Respect and a greed
 * band. His bids are banded against loyalty; neither reads his treasury.
 */
import { addDays } from './clock'
import { assaultGarrison } from './combat'
import { pathRank } from './dominion'
import { balance, post, roundPosting, spend } from './economy'
import { realmEffects } from './effects'
import { claimableBy } from './map'
import { greedMult, marchRule, pactHolds, personalitiesOf, rulesHarden, withPersonalities } from './personalities'
import { RULES } from './rules'
import { roll } from './rng'
import { trust } from './land'
import { EventBuffer, adjustRespect, awayOn, hexOf, isPlayable, openDayOf, patchRival, replaceHex, toPlayer, toRival, weekOn, withWorld, worldOf } from './state'
import type { CampaignState, Effects, Emit, GoblinBid, HexState, ISODate } from './types'

const G = RULES.personalities.goblin

// ── Bribes (P4-02) ───────────────────────────────────────────────────────────

export type BribeRefusal = 'campaignOver' | 'unknownHex' | 'notHisMarch' | 'notAssaultable' | 'gate' | 'battlePending' | 'pact' | 'reputation'

/** Why a hex can't be bribed today, or null: a hex of the Goblin's march (ruled by him today) the player could assault, not his Gate, no Grand Battle waiting on it, no pact holding. */
export function bribeProblem(state: CampaignState, hexId: string, day: ISODate): BribeRefusal | null {
  if (!isPlayable(state)) return 'campaignOver'
  const hex = hexOf(state, hexId)
  if (!hex) return 'unknownHex'
  if (hex.owner === 'player' || hex.mythic || marchRule(state, hex, day) !== 'goblin') return 'notHisMarch'
  if (hex.kind === 'gate') return 'gate'
  if (!claimableBy(state.hexes, hexId, 'player', 'assault')) return 'notAssaultable'
  if (state.grandBattles.some((b) => b.hexId === hexId && b.result === undefined)) return 'battlePending'
  if (pactHolds(state, day)) return 'pact'
  return null
}

/**
 * What bribing `hex` costs on `day` at Realm Consistency `rc` (P4-02): the garrison an assault must
 * beat (wear, preparation, a stronghold's multiple and fallen forces counted) × `perPoint` × his greed
 * ÷ the player's Trust × (1 − `respectOff` × his Respect), × the realm's trade cost. Exact; it posts
 * rounded to 0.1.
 */
export function bribePrice(state: CampaignState, hex: HexState, day: ISODate, rc: number, effects: Effects = realmEffects(state)): number {
  const garrison = assaultGarrison(state, hex, day, effects.assaultIgnoresFortification.on)
  const respect = 1 - G.bribe.respectOff * state.rivals.goblin.respect
  return (garrison * G.bribe.perPoint * greedMult(state) * respect * effects.costs.trade.value) / trust(rc, effects.trust.value)
}

export interface BribeOffer {
  ok: boolean
  reason?: BribeRefusal
  price: number
}

/** Whether the player may bribe `hexId` today, and its price. */
export function bribeOffer(state: CampaignState, hexId: string, rc: number, today: ISODate = openDayOf(state)): BribeOffer {
  const problem = bribeProblem(state, hexId, today)
  if (problem) return { ok: false, reason: problem, price: 0 }
  const price = bribePrice(state, hexOf(state, hexId) as HexState, today, rc)
  if (roundPosting(price) > balance(state.purse)) return { ok: false, reason: 'reputation', price }
  return { ok: true, price }
}

/**
 * Pays a hex's garrison in the Goblin's march to walk away (P4-02): the price leaves the purse, the hex
 * is the player's at once with its walls standing (a village at full loyalty, as one bought, A-22), and the `bribe` and
 * `hexTransfer` (how `bribe`) events are posted. No battle, no Respect change, no fallback.
 */
export function bribe(state: CampaignState, hexId: string, rc: number, today: ISODate = openDayOf(state)): { ok: boolean; reason?: BribeRefusal; state: CampaignState; cost: number } {
  const offer = bribeOffer(state, hexId, rc, today)
  if (!offer.ok) return { ok: false, ...(offer.reason ? { reason: offer.reason } : {}), state, cost: offer.price }
  const hex = hexOf(state, hexId) as HexState
  const garrison = assaultGarrison(state, hex, today)
  const events = new EventBuffer()
  const emit = events.emitter(today)
  let next: CampaignState = { ...state, purse: spend(state.purse, today, offer.price, `bribe:${hexId}`) }
  // No battle broke its walls: they stand, now the player's (and no deed counts them broken).
  next = replaceHex(next, { ...toPlayer(hex, today, false), fortification: hex.fortification })
  emit('bribe', { hexId, owner: hex.owner, price: roundPosting(offer.price), garrison: roundPosting(garrison) })
  emit('hexTransfer', { hexId, from: hex.owner, to: 'player', how: 'bribe', fortification: 0 })
  return { ok: true, state: events.flush(next), cost: offer.price }
}

/** Whether a bribe came in under the garrison it bought (the `bargain` deed, D-34): Trust and Respect beat his greed. */
export function isBargain(e: { price: number; garrison: number }): boolean {
  return e.price < e.garrison
}

// ── His bids for the player's villages (P4-03) ───────────────────────────────

export function goblinBidsOf(state: CampaignState): GoblinBid[] {
  return personalitiesOf(state).goblinBids ?? []
}

/** The player's villages the Goblin may bid for on `day`: in his march (ruled by him that day), beyond the heartland, none already bid for. */
function biddable(state: CampaignState, day: ISODate): HexState[] {
  const bid = new Set(goblinBidsOf(state).map((b) => b.hexId))
  return state.hexes.filter((h) => h.owner === 'player' && h.village && h.ring > RULES.land.protectedThroughRing && !bid.has(h.id) && marchRule(state, h, day) === 'goblin')
}

/** What a point of the player's hold counts for against his bid: Trust, × `holdMult` from the Goblin's path at rank III (C-36). */
export function holdWeight(state: CampaignState, rc: number, effects: Effects = realmEffects(state)): number {
  const perk = RULES.dominion.rankPerks.goblin
  return trust(rc, effects.trust.value) * (pathRank(state, 'goblin') >= perk.holdRank ? perk.holdMult : 1)
}

/** A bid's band against the village's loyalty and the player's hold so far (C-49): whether it sways the village now. Never the number. */
export function bidSways(state: CampaignState, bid: GoblinBid, rc: number, effects: Effects = realmEffects(state)): boolean {
  const hex = hexOf(state, bid.hexId)
  if (!hex?.village) return false
  return bid.offer > hex.village.loyalty + (bid.hold ?? 0) * holdWeight(state, rc, effects)
}

/**
 * At the Goblin's turn (D-29): from week `villageBid.fromWeek`, unless a Truce or buy-off pact holds,
 * he bids for one of the player's villages in his march, the one worth most to him (the highest band,
 * then the lowest loyalty, then map order), offering its loyalty × `offerMult` ± `roll`, if
 * `allowance` covers it. The offer leaves his treasury now. Returns what he spent.
 */
export function placeGoblinBid(input: CampaignState, day: ISODate, allowance: number, emit: Emit): { state: CampaignState; spent: number } {
  const state = input
  const tomorrow = addDays(day, 1)
  if (state.rivals.goblin.status !== 'active' || weekOn(state, tomorrow) < G.villageBid.fromWeek || !rulesHarden(state, tomorrow)) return { state, spent: 0 }
  if (pactHolds(state, tomorrow) || state.deals.some((d) => d.rival === 'goblin' && d.kind === 'truce' && d.madeOn <= tomorrow && (d.until === undefined || tomorrow <= d.until))) return { state, spent: 0 }
  const order = new Map(state.hexes.map((h, i) => [h.id, i]))
  const target = biddable(state, tomorrow).sort(
    (a, b) => b.ring - a.ring || (a.village?.loyalty ?? 0) - (b.village?.loyalty ?? 0) || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)
  )[0]
  if (!target?.village) return { state, spent: 0 }
  const offer = roundPosting(target.village.loyalty * G.villageBid.offerMult * (1 + roll(state.campaign.seed, day, `goblinBid:${target.id}`, -G.villageBid.roll, G.villageBid.roll)))
  if (offer <= 0 || offer > allowance || offer > state.rivals.goblin.treasury) return { state, spent: 0 }
  let next = patchRival(state, 'goblin', { treasury: state.rivals.goblin.treasury - offer })
  next = withPersonalities(next, { goblinBids: [...goblinBidsOf(next), { hexId: target.id, offer, placedOn: day }] })
  emit('goblinBid', { hexId: target.id, stage: 'placed', offer })
  return { state: next, spent: offer }
}

export type HoldRefusal = 'campaignOver' | 'noBid' | 'badAmount' | 'reputation'

/** The player holds a village the Goblin bids for (P4-03): `amount` leaves the purse now and counts × Trust at the close. Spent either way. */
export function holdVillage(state: CampaignState, hexId: string, amount: number, today: ISODate = openDayOf(state)): { ok: boolean; reason?: HoldRefusal; state: CampaignState; cost: number } {
  if (!isPlayable(state)) return { ok: false, reason: 'campaignOver', state, cost: 0 }
  const bids = goblinBidsOf(state)
  const bid = bids.find((b) => b.hexId === hexId)
  if (!bid || hexOf(state, hexId)?.owner !== 'player') return { ok: false, reason: 'noBid', state, cost: 0 }
  const paid = roundPosting(amount)
  if (!Number.isFinite(amount) || paid <= 0) return { ok: false, reason: 'badAmount', state, cost: 0 }
  if (paid > balance(state.purse)) return { ok: false, reason: 'reputation', state, cost: paid }
  const purse = spend(state.purse, today, paid, `hold:${hexId}`)
  return { ok: true, state: withPersonalities({ ...state, purse }, { goblinBids: bids.map((b) => (b === bid ? { ...b, hold: roundPosting((b.hold ?? 0) + paid) } : b)) }), cost: paid }
}

/**
 * At a week close (the `courtships` phase): every bid the Goblin placed before today resolves (P4-03).
 * A village no longer the player's, a Goblin no longer active, or a player away 14 days or more (R-24)
 * voids it, and his offer goes back to his treasury. Otherwise his offer meets its loyalty + the hold
 * × Trust: over it, the village is his, with no battle; at or under it, it holds and his offer is lost.
 */
export function resolveGoblinBids(input: CampaignState, day: ISODate, rc: number, emit: Emit): CampaignState {
  const due = goblinBidsOf(input).filter((b) => b.placedOn < day)
  if (due.length === 0) return input
  let state = withPersonalities(input, { goblinBids: goblinBidsOf(input).filter((b) => b.placedOn >= day) })
  const t = holdWeight(state, rc)
  for (const b of due) {
    const hex = hexOf(state, b.hexId)
    const hold = b.hold !== undefined ? { hold: b.hold } : {}
    if (!hex?.village || hex.owner !== 'player' || state.rivals.goblin.status !== 'active' || awayOn(state, day)) {
      if (state.rivals.goblin.status === 'active') state = patchRival(state, 'goblin', { treasury: state.rivals.goblin.treasury + b.offer })
      emit('goblinBid', { hexId: b.hexId, stage: 'void', offer: b.offer, ...hold })
      continue
    }
    if (b.offer > hex.village.loyalty + (b.hold ?? 0) * t) {
      state = replaceHex(state, toRival(hex, 'goblin'))
      emit('hexTransfer', { hexId: hex.id, from: 'player', to: 'goblin', how: 'influence' })
      emit('goblinBid', { hexId: b.hexId, stage: 'lost', offer: b.offer, ...hold })
    } else emit('goblinBid', { hexId: b.hexId, stage: 'held', offer: b.offer, ...hold })
  }
  return state
}

// ── Buy-back offers (C-44) ───────────────────────────────────────────────────

/** The player sells a hex back to the Goblin on his buy-back offer: his sale price paid in, +5 Respect (as a sale), the hex his. */
export function acceptBuyBack(state: CampaignState, hexId: string, today: ISODate = openDayOf(state)): { ok: boolean; reason?: string; state: CampaignState; cost: number } {
  const world = worldOf(state)
  const offer = world.offers.find((o) => o.kind === 'buyBack' && o.hexId === hexId && today <= o.until)
  const hex = hexOf(state, hexId)
  if (!isPlayable(state)) return { ok: false, reason: 'campaignOver', state, cost: 0 }
  if (!offer || offer.kind !== 'buyBack' || !hex || hex.owner !== 'player' || state.rivals.goblin.status !== 'active') return { ok: false, reason: 'noOffer', state, cost: 0 }
  const events = new EventBuffer()
  const emit = events.emitter(today)
  let next: CampaignState = { ...state, purse: post(state.purse, { date: today, kind: 'earn', amount: offer.price, source: `buyBack:${hexId}` }) }
  next = replaceHex(next, toRival(hex, 'goblin'))
  emit('hexTransfer', { hexId, from: 'player', to: 'goblin', how: 'trade' })
  next = adjustRespect(next, 'goblin', RULES.respect.change.hexSold, 'hexSold', emit)
  next = withWorld(next, { offers: world.offers.filter((o) => o !== offer) })
  return { ok: true, state: events.flush(next), cost: -offer.price }
}


