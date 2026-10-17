/**
 * Patch 4 stage 3 (docs/redesign/patch-4-spec.md section 3.3; D-29): the Goblin, always a deal. Bribes
 * on any hex of his march the player could assault (P4-02); his greed and its bands; his bids for the
 * player's villages and the player's holds (P4-03); the buy-back offers his beaten garrisons make
 * (C-44); and his deals list without the trade limits (C-43).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDays } from '../../src/renderer/src/lib/game/clock'
import { assaultGarrison, dawn } from '../../src/renderer/src/lib/game/combat'
import { balance } from '../../src/renderer/src/lib/game/economy'
import { realmEffects } from '../../src/renderer/src/lib/game/effects'
import { acceptBuyBack, bidSways, bribe, bribeOffer, bribePrice, bribeProblem, goblinBidsOf, holdVillage, placeGoblinBid, resolveGoblinBids } from '../../src/renderer/src/lib/game/goblin'
import { availableDeals, offerDeal, sellPrice, trust } from '../../src/renderer/src/lib/game/land'
import { depthOf, neighbors } from '../../src/renderer/src/lib/game/map'
import { goblinGreedOf, greedBand, greedMult, marchRule, marchRulesDay, withPersonalities } from '../../src/renderer/src/lib/game/personalities'
import { RULES } from '../../src/renderer/src/lib/game/rules'
import { chance } from '../../src/renderer/src/lib/game/rng'
import { strongholdMult } from '../../src/renderer/src/lib/game/sieges'
import { worldOf } from '../../src/renderer/src/lib/game/state'
import type { CampaignState, Emit, Fallback, GameEvent, GameEventKind, HexState } from '../../src/renderer/src/lib/game/types'
import { near } from './support/assert'
import { realm, withPurse } from './support/realm'
import { START, hex, withHex, withOwner } from './support/war'

const G = RULES.personalities.goblin
const WEEK3 = '2026-10-19'
/** Monday of campaign week 6. */
const WEEK6 = '2026-11-09'
const RC = 0.8

function collect(): { emit: Emit; events: ({ kind: GameEventKind } & Record<string, unknown>)[] } {
  const events: ({ kind: GameEventKind } & Record<string, unknown>)[] = []
  return { events, emit: (kind, payload) => void events.push({ kind, ...payload }) }
}

/** A neutral plain hex of the Goblin's march at depth 1 (no seam, no village), and the player holding the heartland hex beside it. */
function front(state: CampaignState = realm()): { state: CampaignState; target: HexState } {
  const target = state.hexes.find((h) => h.march === 'goblin' && !h.seam && depthOf(h) === 1 && !h.village && h.owner === 'neutral') as HexState
  const inner = neighbors(target.id).find((n) => hex(state, n).ring === 2 && hex(state, n).kind !== 'building') as string
  return { state: withOwner(state, [inner], 'player'), target }
}

test('D-29: his greed is 1 + 0.1 a step + 0.05 a level of his march’s preparation, shown only as fair, dear or gouging', () => {
  const s = realm()
  assert.equal(greedMult(s), 1)
  assert.equal(greedBand(s), 'fair')
  near(greedMult(withPersonalities(s, { goblinGreed: 2 })), 1 + 2 * G.greed.perStep)
  assert.equal(greedBand(withPersonalities(s, { goblinGreed: 2 })), 'dear')
  assert.equal(greedBand(withPersonalities(s, { goblinGreed: 4 })), 'gouging')
  const prepared = { ...s, marches: { preparation: { orc: 0, goblin: 4, dwarf: 0, archmage: 0 }, quietWeeks: { orc: 0, goblin: 4, dwarf: 0, archmage: 0 } } }
  near(greedMult(prepared), 1 + 4 * G.greed.perLevel)
})

test('D-29: each hex of his march taken by force raises his greed a step, at most two a week, from week 3; a week close with none eases it a step', () => {
  const { state, target } = front()
  const taken = (s: CampaignState, day: string, n: number): CampaignState => {
    const log = Array.from({ length: n }, (_, i) => ({ id: `t${i}`, day, kind: 'hexTransfer', hexId: target.id, from: 'neutral', to: 'player', how: 'conquest' }) as unknown as GameEvent)
    return marchRulesDay({ ...s, log: [...s.log, ...log] }, day, collect().emit)
  }
  assert.equal(goblinGreedOf(taken(state, START, 1)), 0, 'not before week 3')
  assert.equal(goblinGreedOf(taken(state, WEEK3, 1)), 1)
  assert.equal(goblinGreedOf(taken(state, WEEK3, 3)), G.greed.maxRisePerWeek)
  const twice = taken(taken(state, WEEK3, 2), addDays(WEEK3, 1), 1)
  assert.equal(goblinGreedOf(twice), G.greed.maxRisePerWeek, 'two a week at most')
  // Week 3 closes on Sunday 2026-10-25: with a rise that week it stays; a quiet week after eases it.
  const close = '2026-10-25'
  assert.equal(goblinGreedOf(marchRulesDay(twice, close, collect().emit)), 2)
  assert.equal(goblinGreedOf(marchRulesDay(twice, '2026-11-01', collect().emit)), 1)
})

test('P4-02: a hex of his march the player could assault can be bribed; not outside it, not his Gate, not out of reach', () => {
  const { state, target } = front()
  assert.equal(bribeProblem(state, target.id, START), null)
  const orc = state.hexes.find((h) => h.march === 'orc' && !h.seam && depthOf(h) === 1 && h.owner === 'neutral') as HexState
  assert.equal(bribeProblem(state, orc.id, START), 'notHisMarch')
  const far = state.hexes.find((h) => h.march === 'goblin' && !h.seam && depthOf(h) === 6 && h.owner === 'neutral') as HexState
  assert.equal(bribeProblem(state, far.id, START), 'notAssaultable')
  const gate = state.hexes.find((h) => h.kind === 'gate' && h.march === 'goblin') as HexState
  assert.equal(bribeProblem(state, gate.id, START), 'gate')
  assert.equal(marchRule(state, target, START), 'goblin')
})

test('P4-02: the price is the garrison an assault must beat × greed ÷ Trust, lowered 0.3% a point of Respect; paid, the hex is the player’s at once, with no battle', () => {
  const { state: s0, target } = front()
  const state = withPurse(s0, 5_000)
  const effects = realmEffects(state)
  const garrison = assaultGarrison(state, target, START)
  const expected = (garrison * greedMult(state) * (1 - G.bribe.respectOff * state.rivals.goblin.respect) * effects.costs.trade.value) / trust(RC, effects.trust.value)
  near(bribePrice(state, target, START, RC), expected)
  // A siege's wear lowers it; greed raises it.
  assert.ok(bribePrice(withHex(state, target.id, { garrisonDamage: garrison / 2 }), { ...target, garrisonDamage: garrison / 2 }, START, RC) < expected)
  assert.ok(bribePrice(withPersonalities(state, { goblinGreed: 3 }), target, START, RC) > expected)
  const done = bribe(state, target.id, RC, START)
  assert.ok(done.ok)
  assert.equal(hex(done.state, target.id).owner, 'player')
  near(balance(state.purse) - balance(done.state.purse), Math.round(expected * 10) / 10, 0.051)
  const posted = done.state.log.slice(state.log.length)
  assert.deepEqual(posted.map((e) => e.kind), ['bribe', 'hexTransfer'])
  assert.equal(posted[1].kind === 'hexTransfer' && posted[1].how, 'bribe')
  assert.equal(bribeOffer(withPurse(s0, 1), target.id, RC, START).reason, 'reputation')
})

test('P3-01 kept: a stronghold of his march may be bribed at its multiple', () => {
  const s0 = realm()
  const fort = s0.hexes.find((h) => h.march === 'goblin' && strongholdMult(s0.hexes, { ...h, owner: 'neutral' }) > 1 && depthOf(h) === 4) as HexState
  const beside = neighbors(fort.id).find((n) => depthOf(hex(s0, n)) === 3 && hex(s0, n).march === 'goblin' && !hex(s0, n).seam) as string
  const state = withOwner(s0, [beside], 'player')
  assert.equal(bribeProblem(state, fort.id, START), null)
  near(bribePrice(state, fort, START, RC) / bribePrice(state, { ...fort, id: fort.id }, START, RC), 1)
  assert.ok(assaultGarrison(state, fort, START) >= RULES.sieges.stronghold.garrisonMult * fort.garrison * 0.99)
})

test('C-43: his deals list has no hex to buy (his hexes are bribed); selling him one needs no Respect and has no wait', () => {
  const { state: s0, target } = front()
  const state = withOwner(s0, [target.id], 'player')
  assert.equal(availableDeals(state, 'goblin').some((d) => d.kind === 'buyHex'), false)
  assert.equal(offerDeal(state, 'goblin', { kind: 'buyHex', hexId: target.id }).reason?.code, 'useBribe')
  const goblinOwned = withOwner(state, neighbors(target.id).filter((n) => hex(state, n).owner === 'neutral' && hex(state, n).march === 'goblin').slice(0, 1), 'goblin')
  const sell = offerDeal({ ...goblinOwned, rivals: { ...goblinOwned.rivals, goblin: { ...goblinOwned.rivals.goblin, respect: 0 } } }, 'goblin', { kind: 'sellHex', hexId: target.id })
  assert.notEqual(sell.reason?.code, 'respect')
  assert.equal(offerDeal(state, 'goblin', { kind: 'buyOff' }).reason?.code, 'offeredOnly')
})

/** The player holds a village of the Goblin's march at depth 1. */
function village(): { state: CampaignState; v: HexState } {
  const s = realm()
  const v = s.hexes.find((h) => h.march === 'goblin' && !h.seam && h.village && depthOf(h) <= 4) as HexState
  const state = withHex(withOwner(s, [v.id], 'player'), v.id, { village: { loyalty: 45 } })
  return { state: withPurse(state, 1_000), v: hex(state, v.id) }
}

test('P4-03: from week 6 his turn bids for one of the player’s villages in his march, paid from his share; none before', () => {
  const { state, v } = village()
  const rich = { ...state, rivals: { ...state.rivals, goblin: { ...state.rivals.goblin, treasury: 1_000 } } }
  assert.equal(placeGoblinBid(rich, '2026-11-01', 500, collect().emit).spent, 0, 'week 5 closes before week 6')
  const c = collect()
  const placed = placeGoblinBid(rich, WEEK6, 500, c.emit)
  assert.ok(placed.spent > 0)
  const [bid] = goblinBidsOf(placed.state)
  assert.equal(bid.hexId, v.id)
  assert.ok(bid.offer >= 45 * G.villageBid.offerMult * (1 - G.villageBid.roll) - 0.1 && bid.offer <= 45 * G.villageBid.offerMult * (1 + G.villageBid.roll) + 0.1)
  near(placed.state.rivals.goblin.treasury, 1_000 - bid.offer)
  assert.deepEqual(c.events.map((e) => [e.kind, e.stage]), [['goblinBid', 'placed']])
  assert.equal(placeGoblinBid(rich, WEEK6, 1, collect().emit).spent, 0, 'not when his share can’t cover it')
})

test('P4-03: the player holds a village with reputation counted × Trust; at the next close his offer must beat loyalty + hold, or the village holds; void while away', () => {
  const { state, v } = village()
  const bid = { hexId: v.id, offer: 60, placedOn: WEEK6 }
  const close = addDays(WEEK6, 6)
  // The player launched the app at the close, so they are not away (A-10).
  const bidded = withPersonalities({ ...state, settlement: { ...state.settlement, lastLaunch: close } }, { goblinBids: [bid] })
  // Unheld: 60 > 45, the village is his.
  const c = collect()
  const lost = resolveGoblinBids(bidded, close, RC, c.emit)
  assert.equal(hex(lost, v.id).owner, 'goblin')
  assert.deepEqual(c.events.map((e) => [e.kind, e.how ?? e.stage]), [['hexTransfer', 'influence'], ['goblinBid', 'lost']])
  // Held: 45 + 20 × Trust ≥ 60.
  const held = holdVillage(bidded, v.id, 20, WEEK6)
  assert.ok(held.ok)
  near(balance(bidded.purse) - balance(held.state.purse), 20)
  assert.equal(bidSways(held.state, goblinBidsOf(held.state)[0], RC), false)
  const kept = resolveGoblinBids(held.state, close, RC, collect().emit)
  assert.equal(hex(kept, v.id).owner, 'player')
  assert.deepEqual(goblinBidsOf(kept), [])
  // Away 14 days or more: void, his offer back.
  const away = { ...bidded, settlement: { ...bidded.settlement, lastLaunch: addDays(close, -RULES.clock.absenceDays) } }
  assert.ok(away.settlement.lastLaunch)
  const voided = resolveGoblinBids(away, close, RC, collect().emit)
  assert.equal(hex(voided, v.id).owner, 'player')
  near(voided.rivals.goblin.treasury, away.rivals.goblin.treasury + 60)
  // A bid placed at this close waits for the next.
  const waiting = withPersonalities(bidded, { goblinBids: [{ ...bid, placedOn: close }] })
  assert.equal(resolveGoblinBids(waiting, close, RC, collect().emit), waiting)
})

test('C-44: his own beaten garrison makes a buy-back offer instead of striking back; taking it sells the hex at his sale price, +5 Respect', () => {
  const { state: s0, target } = front()
  const day = WEEK3
  const owned = withHex(withOwner(s0, [target.id], 'player'), target.id, { garrison: 0 })
  const present = { ...owned, settlement: { ...owned.settlement, lastLaunch: day } }
  let id = ''
  for (let i = 0; ; i++) if (chance(present.campaign.seed, day, `buyBack:fb:t:${i}`, G.buyBack.chancePerDay)) {
    id = `fb:t:${i}`
    break
  }
  const refuge = neighbors(target.id).find((n) => hex(present, n).owner === 'neutral' && hex(present, n).march === 'goblin') as string
  const force: Fallback = { id, from: target.id, to: refuge, holder: 'goblin', strength: 30, day: addDays(day, -1) }
  const withRefuge = withOwner({ ...present, fallbacks: [force] }, [refuge], 'goblin')
  const at = dawn(withRefuge, day)
  assert.equal(at.combat?.counterattacks?.length ?? 0, 0, 'no strike')
  const offer = worldOf(at).offers.find((o) => o.kind === 'buyBack')
  assert.ok(offer && offer.kind === 'buyBack')
  near(offer.price, sellPrice('goblin', hex(at, target.id)))
  const sold = acceptBuyBack(at, target.id, day)
  assert.ok(sold.ok)
  assert.equal(hex(sold.state, target.id).owner, 'goblin')
  near(balance(sold.state.purse) - balance(at.purse), Math.round(offer.price * 10) / 10)
  assert.equal(sold.state.rivals.goblin.respect, at.rivals.goblin.respect + RULES.respect.change.hexSold)
})
