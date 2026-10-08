import './support/tokyo-tz'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDays } from '../../src/renderer/src/lib/game/clock'
import { canConquer, canRaid, raiderWeights } from '../../src/renderer/src/lib/game/combat'
import { balance } from '../../src/renderer/src/lib/game/economy'
import {
  availableDeals,
  bidCheck,
  blocksConquest,
  blocksRaids,
  callToArmsOn,
  courtshipSlots,
  defectionTally,
  fortify,
  fortifyOffer,
  makeDeal,
  offerDeal,
  originalVillages,
  placeBid,
  placeRivalBid,
  raidRateMult,
  reclaim,
  reclaimOffer,
  recoverLoyalty,
  resistance,
  resolveCourtships,
  trust
} from '../../src/renderer/src/lib/game/land'
import { isClaimableKind, neighbors, touchesOwner } from '../../src/renderer/src/lib/game/map'
import { settle } from '../../src/renderer/src/lib/game/settle'
import type { CampaignState, GameEvent, GameEventKind, GameEventMap, HexState, RivalId } from '../../src/renderer/src/lib/game/types'
import { chicago, steadyLedger } from './fixtures/ledgers'
import { TODAY, realm, withArmory, withBuildings, withGrace, withPurse } from './support/realm'
import { front, hex, plainHex, withDisposition, withHex, withOwner, type Posted } from './support/war'
import { near } from './support/assert'


function withRespect(state: CampaignState, rival: RivalId, respect: number): CampaignState {
  return { ...state, rivals: { ...state.rivals, [rival]: { ...state.rivals[rival], respect } } }
}

/** Hands the player an inner neighbor of `id` (a hex that can change hands), so `id` touches the player's land. */
function reach(state: CampaignState, id: string): CampaignState {
  if (touchesOwner(state.hexes, id, 'player')) return state
  const h = hex(state, id)
  const inner = neighbors(id).find((n) => hex(state, n).ring === h.ring - 1 && isClaimableKind(hex(state, n)) && hex(state, n).owner === 'neutral')
  if (!inner) throw new Error(`No inner neighbor for ${id}`)
  return withOwner(state, [inner], 'player')
}

function village(state: CampaignState, ring: number, skip: string[] = []): HexState {
  const found = state.hexes.find((h) => h.ring === ring && h.village && h.owner === 'neutral' && !skip.includes(h.id))
  if (!found) throw new Error(`No neutral village in ring ${ring}`)
  return found
}

/** A ring-`ring` village the rival holds (at 30 × ring loyalty), touching the player's land. */
function rivalVillage(state: CampaignState, rival: RivalId, ring: number): { state: CampaignState; id: string } {
  const v = village(state, ring)
  return { state: reach(withHex(state, v.id, { owner: rival, village: { loyalty: 30 * ring } }), v.id), id: v.id }
}

/** Resolves the courtships at `day`'s close and posts the events to the log, as settlement would. */
function resolve(state: CampaignState, realmConsistency: number, day = TODAY) {
  const events: Posted[] = []
  const next = resolveCourtships(state, { day, realmConsistency, emit: (kind, payload) => void events.push({ kind, ...payload }) })
  const log = [...next.log, ...events.map((e, i) => ({ id: `ev-${next.log.length + i + 1}`, day, ...e }) as unknown as GameEvent)]
  return {
    state: { ...next, log },
    of: <K extends GameEventKind>(kind: K) => events.filter((e) => e.kind === kind).map(({ kind: _k, ...p }) => p) as unknown as GameEventMap[K][]
  }
}

function lostOnDay(state: CampaignState, hexId: string, day: string, to: RivalId): CampaignState {
  const event = { id: `ev-${state.log.length + 1}`, day, kind: 'hexTransfer', hexId, from: 'player', to, how: 'conquest' } as GameEvent
  return { ...withOwner(state, [hexId], to), log: [...state.log, event] }
}

// ── Courtships ───────────────────────────────────────────────────────────────

test('Ch 6 Trust: 0.90 at RC 0.5, 1.08 at 0.8, 1.20 at 1.0; clamps to 0.6 at RC 0 and to 1.2 above; Envoy’s Rest adds 0.05', () => {
  near(trust(0.5), 0.9)
  near(trust(0.8), 1.08)
  near(trust(1), 1.2)
  near(trust(0), 0.6)
  near(trust(1.5), 1.2)
  near(trust(1, 0.05), 1.25)
})

test('Ch 6: a neutral ring-3 village (resistance 45): bid 50 at RC 0.8 offers 54 and defects, spending all 50', () => {
  const v = village(realm(), 3)
  let state = reach(withPurse(realm(), 500), v.id)
  assert.equal(resistance(hex(state, v.id)), 45)
  const placed = placeBid(state, v.id, 50, TODAY)
  assert.ok(placed.ok)
  assert.equal(balance(placed.state.purse), 450)
  const out = resolve(placed.state, 0.8)
  state = out.state
  assert.equal(hex(state, v.id).owner, 'player')
  assert.deepEqual(hex(state, v.id).village, { loyalty: 45 }) // A-22: 15 × ring after a defection, not Settling
  assert.equal(balance(state.purse), 450)
  assert.deepEqual(out.of('courtship'), [{ hexId: v.id, outcome: 'defected', bid: 50, winner: 'player' }])
  assert.deepEqual(out.of('hexTransfer'), [{ hexId: v.id, from: 'neutral', to: 'player', how: 'influence' }])
  assert.deepEqual(state.courtships, [])
})

test('Ch 6: the same village, bid 40 at RC 0.8 offers 43.2 and holds: 20 refunded, loyalty 45 − 4.32 = 40.68 for good', () => {
  const v = village(realm(), 3)
  const placed = placeBid(reach(withPurse(realm(), 500), v.id), v.id, 40, TODAY)
  assert.equal(balance(placed.state.purse), 460)
  const out = resolve(placed.state, 0.8)
  assert.equal(hex(out.state, v.id).owner, 'neutral')
  near(hex(out.state, v.id).village?.loyalty as number, 40.68)
  assert.equal(balance(out.state.purse), 480)
  const [report] = out.of('courtship')
  assert.equal(report.outcome, 'held')
  near(report.loyaltyDrop as number, 4.32)
  // The next bid faces the lower resistance.
  near(resistance(hex(out.state, v.id)), 40.68)
})

test('Ch 6 / A-16: a rival-held ring-4 village resists 120 + the counter-bid; a ring-5 Gate 2 × 150 = 300 + the counter-bid', () => {
  const { state, id } = rivalVillage(realm(), 'dwarf', 4)
  assert.equal(resistance(hex(state, id)), 120)
  assert.equal(resistance(hex(state, id), 25), 145)
  const gate = state.hexes.find((h) => h.kind === 'gate' && h.owner === 'dwarf') as HexState
  assert.equal(gate.village?.loyalty, 150)
  assert.equal(resistance(gate), 300)
  assert.equal(resistance(gate, 40), 340)
  // A counter-bid never adds to a neutral village's resistance.
  assert.equal(resistance(village(state, 3), 40), 45)
})

test('Ch 6: the owner’s counter-bid (T10 through placeRivalBid) can hold a village; without it the village defects and costs 3 Respect', () => {
  const { state: s0, id } = rivalVillage(withPurse(realm(), 500), 'dwarf', 4)
  const placed = placeBid(s0, id, 120, TODAY).state // Offer 144 at RC 1.0
  const held = resolve(placeRivalBid(placed, 'dwarf', id, 30), 1)
  assert.equal(hex(held.state, id).owner, 'dwarf')
  assert.equal(held.of('courtship')[0].outcome, 'held')
  assert.equal(held.state.rivals.dwarf.respect, 20)

  const won = resolve(placed, 1)
  assert.equal(hex(won.state, id).owner, 'player')
  assert.deepEqual(hex(won.state, id).village, { loyalty: 60 })
  assert.equal(hex(won.state, id).garrison, 0)
  assert.equal(won.state.rivals.dwarf.respect, 17)
  assert.deepEqual(won.of('respect'), [{ rival: 'dwarf', change: -3, reason: 'villageCourted' }])
  assert.deepEqual(won.of('hexTransfer'), [{ hexId: id, from: 'dwarf', to: 'player', how: 'influence' }])
})

test('Ch 6 two suitors: when the Goblin’s offer beats the player’s, the player gets half the bid back and the village goes to the Goblin', () => {
  const v = village(realm(), 3)
  const placed = placeBid(reach(withPurse(realm(), 500), v.id), v.id, 50, TODAY).state // Offer 45 at RC 0.5
  const out = resolve(placeRivalBid(placed, 'goblin', v.id, 60), 0.5) // Goblin offers 60 at Trust 1.0
  assert.equal(hex(out.state, v.id).owner, 'goblin')
  assert.equal(hex(out.state, v.id).village?.loyalty, 90)
  assert.equal(balance(out.state.purse), 475)
  assert.equal(out.state.rivals.goblin.treasury, 150, 'the winner spends its whole bid')
  assert.deepEqual(out.of('courtship'), [{ hexId: v.id, outcome: 'defected', bid: 50, winner: 'goblin' }])
  assert.deepEqual(out.of('hexTransfer'), [{ hexId: v.id, from: 'neutral', to: 'goblin', how: 'influence' }])

  // The player's higher offer wins instead, and the Goblin gets half of its bid back.
  const beaten = resolve(placeRivalBid(placed, 'goblin', v.id, 40), 0.5)
  assert.equal(hex(beaten.state, v.id).owner, 'player')
  assert.equal(beaten.state.rivals.goblin.treasury, 170)
  assert.equal(balance(beaten.state.purse), 450)
})

test('A-32: courtship slots are 2 at the start, 3 at Merchant Hall III, 4 at Merchant Hall V; a third open bid at the start is refused', () => {
  assert.equal(courtshipSlots(realm()), 2)
  assert.equal(courtshipSlots(withBuildings(realm(), { merchantHall: 3 })), 3)
  assert.equal(courtshipSlots(withBuildings(realm(), { merchantHall: 5 })), 4)

  let state = withPurse(realm(), 500)
  const targets = state.hexes.filter((h) => h.ring === 2 && h.village).map((h) => h.id)
  for (const id of targets) state = reach(state, id)
  state = placeBid(state, targets[0], 20, TODAY).state
  state = placeBid(state, targets[1], 20, TODAY).state
  const third = placeBid(state, targets[2], 20, TODAY)
  assert.equal(third.ok, false)
  assert.deepEqual(third.reason, { code: 'noSlot', needed: 3, have: 2 })
  assert.equal(third.state, state)
  assert.ok(placeBid(withBuildings(state, { merchantHall: 3 }), targets[2], 20, TODAY).ok)
})

test('Ch 6: bids need an adjacent village, one bid per village, and the reputation to cover them', () => {
  const v = village(realm(), 3)
  const state = withPurse(realm(), 30)
  assert.equal(bidCheck(state, v.id, 20).reason?.code, 'notCourtable', 'not adjacent yet')
  const reached = reach(state, v.id)
  assert.equal(bidCheck(reached, plainHex(reached, 2).id, 20).reason?.code, 'notCourtable', 'not a village')
  assert.deepEqual(bidCheck(reached, v.id, 40).reason, { code: 'reputation', needed: 40, have: 30 })
  assert.equal(bidCheck(reached, v.id, 0).reason?.code, 'badBid')
  const placed = placeBid(reached, v.id, 20, TODAY).state
  assert.equal(bidCheck(placed, v.id, 5).reason?.code, 'alreadyCourting')
})

test('Ch 6: a courtship whose village was taken another way before the week closed is void and refunded in full', () => {
  const v = village(realm(), 3)
  const placed = placeBid(reach(withPurse(realm(), 500), v.id), v.id, 50, TODAY).state
  const out = resolve(withOwner(placed, [v.id], 'player'), 0.8)
  assert.equal(balance(out.state.purse), 500)
  assert.deepEqual(out.of('courtship'), [{ hexId: v.id, outcome: 'void', bid: 50 }])
})

test('A-22: the player’s villages recover 5% of 15 × ring loyalty a week, up to 15 × ring', () => {
  const v = village(realm(), 4)
  const low = recoverLoyalty(withHex(withOwner(realm(), [v.id], 'player'), v.id, { village: { loyalty: 30 } }))
  assert.equal(hex(low, v.id).village?.loyalty, 33)
  const capped = recoverLoyalty(withHex(withOwner(realm(), [v.id], 'player'), v.id, { village: { loyalty: 59 } }))
  assert.equal(hex(capped, v.id).village?.loyalty, 60)
  const neutral = realm()
  assert.equal(recoverLoyalty(neutral), neutral, 'nothing to recover returns the same state')
})

test('Test 9 (part): settlement resolves a courtship once, at the week close; settling again never re-resolves it', () => {
  const ledger = steadyLedger('2026-09-10', 70)
  let state = realm(7, ledger)
  const v = village(state, 2)
  state = reach(state, v.id)
  const placed = placeBid(state, v.id, 60, '2026-10-08')
  assert.ok(placed.ok)

  const midweek = settle(placed.state, ledger, chicago('2026-10-10'))
  assert.equal(midweek.events.filter((e) => e.kind === 'courtship').length, 0, 'bids wait for the week close')

  const first = settle(placed.state, ledger, chicago('2026-10-12'))
  const courtships = first.events.filter((e) => e.kind === 'courtship')
  assert.equal(courtships.length, 1)
  assert.equal(courtships[0].day, '2026-10-11')
  assert.equal(hex(first.state, v.id).owner, 'player')
  assert.deepEqual(first.state.courtships, [])

  const again = settle(first.state, ledger, chicago('2026-10-12'))
  assert.equal(again.events.length, 0)
  assert.deepEqual(again.state, first.state)

  const later = settle(first.state, ledger, chicago('2026-10-19'))
  assert.equal(later.events.filter((e) => e.kind === 'courtship').length, 0)
})

// ── Deals ────────────────────────────────────────────────────────────────────

test('Ch 6 buy a hex: a ring-4 village from the Dwarf costs 50 × 4 × 2.0 × 1.5 = 600; refused at Respect 49, allowed from the Goblin at 25', () => {
  const { state: s0, id } = rivalVillage(withPurse(realm(), 2_000), 'dwarf', 4)
  const low = offerDeal(withRespect(s0, 'dwarf', 49), 'dwarf', { kind: 'buyHex', hexId: id }, TODAY)
  assert.equal(low.price, 600)
  assert.equal(low.allowed, false)
  assert.deepEqual(low.reason, { code: 'respect', textId: 'herald.deal.refused.respect', needed: 50, have: 49 })

  const state = withRespect(s0, 'dwarf', 50)
  const deal = makeDeal(state, 'dwarf', { kind: 'buyHex', hexId: id }, TODAY)
  assert.ok(deal.ok)
  assert.equal(deal.cost, 600)
  assert.equal(balance(deal.state.purse), 1_400)
  assert.equal(hex(deal.state, id).owner, 'player')
  assert.deepEqual(hex(deal.state, id).village, { loyalty: 60 }) // A-22: 15 × ring after a purchase
  assert.equal(deal.state.rivals.dwarf.respect, 52)
  assert.deepEqual(deal.deal, { id: 'deal-1', rival: 'dwarf', kind: 'buyHex', madeOn: TODAY, price: 600, hexId: id })
  const logged = deal.state.log.slice(state.log.length).map((e) => e.kind)
  assert.deepEqual(logged, ['hexTransfer', 'respect', 'deal'])
  assert.ok(deal.state.log.some((e) => e.kind === 'hexTransfer' && e.how === 'trade' && e.hexId === id))

  const { state: g0, id: gid } = rivalVillage(withPurse(realm(), 2_000), 'goblin', 4)
  const goblin = offerDeal(withRespect(g0, 'goblin', 25), 'goblin', { kind: 'buyHex', hexId: gid }, TODAY)
  assert.equal(goblin.allowed, true)
  assert.equal(goblin.price, 360) // 50 × 4 × 1.2 × 1.5
  assert.equal(offerDeal(withRespect(g0, 'goblin', 24), 'goblin', { kind: 'buyHex', hexId: gid }, TODAY).reason?.code, 'respect')
})

test('Ch 6 buy a hex: refused for any Gate, while at war, and for a second hex deal with the same rival within 4 weeks', () => {
  let state = withRespect(withPurse(realm(), 5_000), 'dwarf', 100)
  const gate = state.hexes.find((h) => h.kind === 'gate' && h.owner === 'dwarf') as HexState
  state = reach(state, gate.id)
  assert.equal(offerDeal(state, 'dwarf', { kind: 'buyHex', hexId: gate.id }, TODAY).reason?.code, 'gate')

  const first = rivalVillage(state, 'dwarf', 4)
  assert.equal(offerDeal(withDisposition(first.state, 'dwarf', 'war'), 'dwarf', { kind: 'buyHex', hexId: first.id }, TODAY).reason?.code, 'atWar')
  const bought = makeDeal(first.state, 'dwarf', { kind: 'buyHex', hexId: first.id }, TODAY).state
  const second = plainHex(bought, 4, (h) => h.owner === 'neutral')
  const withSecond = reach(withOwner(bought, [second.id], 'dwarf'), second.id)
  const again = offerDeal(withSecond, 'dwarf', { kind: 'buyHex', hexId: second.id }, addDays(TODAY, 27))
  assert.equal(again.reason?.code, 'cooldown')
  assert.equal(again.reason?.textId, 'herald.deal.refused.cooldown')
  assert.equal(offerDeal(withSecond, 'dwarf', { kind: 'buyHex', hexId: second.id }, addDays(TODAY, 28)).allowed, true)
})

test('Ch 6 / Exchange Wing: hexes cost 20% less to buy', () => {
  const { state, id } = rivalVillage(withRespect(withPurse(realm(), 2_000), 'dwarf', 50), 'dwarf', 4)
  assert.equal(offerDeal(withArmory(state, { wings: ['exchange'] }), 'dwarf', { kind: 'buyHex', hexId: id }, TODAY).price, 480)
})

test('Ch 6 sell a hex: a ring-2 hex is refused; a non-village ring-4 hex sold to the Orc pays 0.7 × 50 × 4 × 1.5 = 210 and +5 Respect', () => {
  const inner2 = front(withRespect(realm(), 'orc', 25), 'orc', 2)
  assert.equal(offerDeal(inner2.state, 'orc', { kind: 'sellHex', hexId: inner2.inner }, TODAY).reason?.code, 'innerRing')

  const f = front(withRespect(withPurse(realm(), 100), 'orc', 25), 'orc', 4)
  const offer = offerDeal(f.state, 'orc', { kind: 'sellHex', hexId: f.inner }, TODAY)
  assert.equal(offer.allowed, true)
  near(offer.price, 210)
  const sold = makeDeal(f.state, 'orc', { kind: 'sellHex', hexId: f.inner }, TODAY)
  assert.ok(sold.ok)
  assert.equal(balance(sold.state.purse), 310)
  assert.equal(hex(sold.state, f.inner).owner, 'orc')
  assert.equal(hex(sold.state, f.inner).garrison, 115)
  assert.equal(sold.state.rivals.orc.respect, 30)
  assert.equal(offerDeal(withRespect(f.state, 'orc', 24), 'orc', { kind: 'sellHex', hexId: f.inner }, TODAY).reason?.code, 'respect')
})

test('Ch 6 Truce: bordering ring 5 it costs 150; for 7 days blocksRaids and blocksConquest hold; refused during a Grand Battle warning', () => {
  let state = withPurse(realm(), 1_000)
  const dwarfHex = state.hexes.find((h) => h.owner === 'dwarf' && h.ring === 5 && h.kind !== 'gate') as HexState
  state = reach(state, dwarfHex.id)
  const offer = offerDeal(state, 'dwarf', { kind: 'truce' }, TODAY)
  assert.equal(offer.price, 150)
  assert.equal(offer.allowed, true)

  const truce = makeDeal(state, 'dwarf', { kind: 'truce' }, TODAY)
  assert.ok(truce.ok)
  assert.equal(truce.deal?.until, addDays(TODAY, 6))
  assert.equal(truce.state.rivals.dwarf.respect, 22)
  for (let i = 0; i < 7; i++) {
    assert.equal(blocksRaids(truce.state, 'dwarf', addDays(TODAY, i)), true, `day ${i + 1}`)
    assert.equal(blocksConquest(truce.state, 'dwarf', addDays(TODAY, i)), true, `day ${i + 1}`)
  }
  assert.equal(blocksRaids(truce.state, 'dwarf', addDays(TODAY, 7)), false)
  assert.equal(blocksConquest(truce.state, 'dwarf', addDays(TODAY, 7)), false)
  assert.equal(blocksRaids(truce.state, 'orc', TODAY), false)
  // Daily combat reads the same answer (T08).
  assert.equal(canRaid(truce.state, 'dwarf', TODAY), false)
  assert.equal(canConquer(withDisposition(truce.state, 'dwarf', 'war'), 'dwarf', TODAY), false)
  assert.equal(offerDeal(truce.state, 'dwarf', { kind: 'truce' }, TODAY).reason?.code, 'inForce')

  const warned: CampaignState = {
    ...state,
    grandBattles: [{ id: 'gb-1', trigger: 'gate', hexId: dwarfHex.id, announcedOn: TODAY, battleDate: addDays(TODAY, 2), enemy: [] }]
  }
  assert.equal(offerDeal(warned, 'dwarf', { kind: 'truce' }, addDays(TODAY, 1)).reason?.code, 'grandBattleWarning')
  assert.equal(offerDeal(warned, 'dwarf', { kind: 'truce' }, addDays(TODAY, 3)).allowed, true, 'the battle date has passed')
})

test('Ch 6 non-aggression pact: Respect 40 and 250; no conquest attempts for 28 days and raids at half rate', () => {
  const state = withPurse(realm(), 1_000)
  assert.equal(offerDeal(withRespect(state, 'orc', 39), 'orc', { kind: 'pact' }, TODAY).reason?.code, 'respect')
  const pact = makeDeal(withRespect(state, 'orc', 40), 'orc', { kind: 'pact' }, TODAY)
  assert.ok(pact.ok)
  assert.equal(pact.cost, 250)
  assert.equal(pact.deal?.until, addDays(TODAY, 27))
  assert.equal(blocksConquest(pact.state, 'orc', addDays(TODAY, 27)), true)
  assert.equal(blocksConquest(pact.state, 'orc', addDays(TODAY, 28)), false)
  assert.equal(blocksRaids(pact.state, 'orc', TODAY), false)
  assert.equal(raidRateMult(pact.state, 'orc', TODAY), 0.5)
  const before = raiderWeights(state, TODAY).find((r) => r.rival === 'orc')?.weight as number
  const after = raiderWeights(pact.state, TODAY).find((r) => r.rival === 'orc')?.weight as number
  near(after, before / 2)
})

test('Ch 6 call to arms: Respect 60 and 200; the rival goes to war with a rival on its front for 14 days', () => {
  const state = withRespect(withPurse(realm(), 1_000), 'orc', 60)
  const call = makeDeal(state, 'orc', { kind: 'callToArms', target: 'goblin' }, TODAY)
  assert.ok(call.ok)
  assert.equal(call.cost, 200)
  assert.equal(call.state.fronts.north.state, 'war')
  assert.equal(call.state.rivals.orc.disposition.goblin, 'war')
  assert.equal(call.state.rivals.goblin.disposition.orc, 'war')
  assert.deepEqual(callToArmsOn(call.state, addDays(TODAY, 13)), [{ rival: 'orc', target: 'goblin', until: addDays(TODAY, 13) }])
  assert.deepEqual(callToArmsOn(call.state, addDays(TODAY, 14)), [])
  assert.ok(call.state.log.some((e) => e.kind === 'front' && e.front === 'north' && e.state === 'war'))

  assert.equal(offerDeal(state, 'orc', { kind: 'callToArms', target: 'dwarf' }, TODAY).reason?.code, 'noFront')
  assert.equal(offerDeal(withRespect(state, 'orc', 59), 'orc', { kind: 'callToArms', target: 'goblin' }, TODAY).reason?.code, 'respect')
  const coalition: CampaignState = { ...state, coalitions: [{ members: ['orc', 'goblin'], trigger: 'risingCrown', warChest: 0 }] }
  assert.equal(offerDeal(coalition, 'orc', { kind: 'callToArms', target: 'goblin' }, TODAY).reason?.code, 'targetAllied')
})

test('Ch 6: availableDeals lists every deal a rival will discuss, each priced, with a text id for each refusal', () => {
  const { state, id } = rivalVillage(withPurse(realm(), 100), 'dwarf', 4)
  const deals = availableDeals(state, 'dwarf', TODAY)
  assert.deepEqual([...new Set(deals.map((d) => d.kind))], ['buyHex', 'sellHex', 'truce', 'pact', 'callToArms'])
  const buy = deals.find((d) => d.kind === 'buyHex' && d.hexId === id) as (typeof deals)[number]
  assert.equal(buy.price, 600)
  assert.equal(buy.allowed, false)
  assert.equal(buy.reason?.code, 'respect')
  assert.deepEqual(
    deals.filter((d) => d.kind === 'callToArms').map((d) => d.target),
    ['orc', 'goblin', 'archmage']
  )
  for (const d of deals) if (!d.allowed) assert.equal(d.reason?.textId, `herald.deal.refused.${d.reason?.code}`)
  assert.ok(deals.some((d) => d.kind === 'truce'))
  assert.ok(deals.some((d) => d.kind === 'pact'))
  // A rival with nothing to trade still gets one line saying so.
  const none = availableDeals(realm(), 'orc', TODAY)
  assert.deepEqual(none.find((d) => d.kind === 'buyHex')?.reason?.code, 'noHex')
})

// ── Fortification and reclaiming ─────────────────────────────────────────────

test('Ch 5 / Ch 6: fortifying a ring-3 hex costs 45, then 105, then 210; a fourth level is refused', () => {
  const h = plainHex(realm(), 3)
  let state = withOwner(withPurse(realm(), 1_000), [h.id], 'player')
  for (const [level, cost] of [
    [1, 45],
    [2, 105],
    [3, 210]
  ]) {
    assert.equal(fortifyOffer(state, h.id).cost, cost)
    const done = fortify(state, h.id, TODAY)
    assert.ok(done.ok)
    state = done.state
    assert.equal(hex(state, h.id).fortification, level)
  }
  assert.equal(balance(state.purse), 640)
  assert.deepEqual(fortify(state, h.id, TODAY).reason, { code: 'maxed' })
  assert.equal(fortifyOffer(realm(), h.id).reason?.code, 'notPlayerHex')
})

test('Kilns Wing: fortifying a ring-3 hex costs 33.75, then 78.75, then 157.5', () => {
  const h = plainHex(realm(), 3)
  let state = withArmory(withOwner(withPurse(realm(), 1_000), [h.id], 'player'), { wings: ['kilns'] })
  for (const cost of [33.75, 78.75, 157.5]) {
    near(fortifyOffer(state, h.id).cost, cost)
    state = fortify(state, h.id, TODAY).state
  }
  assert.equal(hex(state, h.id).fortification, 3)
  near(balance(state.purse), 1_000 - 33.8 - 78.8 - 157.5) // each spend posts rounded to 0.1 (A-11)
})

test('Ch 9 Grace I: a hex lost 10 days ago is reclaimed for half its garrison, no battle; refused at 15 days and at Grace 0', () => {
  const f = front(withGrace(withPurse(realm(), 500), 1), 'orc', 3)
  const garrison = hex(f.state, f.outer).garrison // 0.9 × 115 = 103.5
  const lost = lostOnDay(f.state, f.outer, addDays(TODAY, -10), 'orc')
  const offer = reclaimOffer(lost, f.outer, TODAY)
  assert.equal(offer.ok, true)
  near(offer.cost, garrison / 2)
  const back = reclaim(lost, f.outer, TODAY)
  assert.ok(back.ok)
  assert.equal(hex(back.state, f.outer).owner, 'player')
  near(balance(back.state.purse), 500 - Math.round((garrison / 2) * 10) / 10)
  assert.ok(back.state.log.some((e) => e.kind === 'hexTransfer' && e.hexId === f.outer && e.how === 'reclaim' && e.day === TODAY))

  const old = lostOnDay(f.state, f.outer, addDays(TODAY, -15), 'orc')
  assert.deepEqual(reclaimOffer(old, f.outer, TODAY).reason, { code: 'tooLate', needed: 14, have: 15 })
  assert.equal(reclaimOffer(withGrace(lost, 0), f.outer, TODAY).reason?.code, 'grace')
  assert.equal(reclaimOffer(f.state, f.outer, TODAY).reason?.code, 'notLost', 'never the player’s')
})

// ── The defection tally ──────────────────────────────────────────────────────

test('Ch 14 defection tally: per rival, its original villages the player won by influence, trade or conquest, and whether it still holds any', () => {
  const original = originalVillages(7).dwarf
  assert.equal(original.length, 3)
  let state = withRespect(withPurse(realm(), 2_000), 'dwarf', 60)
  const [march1, march2] = original.filter((id) => hex(state, id).kind !== 'gate')
  assert.deepEqual(defectionTally(state, 'dwarf'), { rival: 'dwarf', original, won: { influence: 0, trade: 0, conquest: 0 }, holds: 3 })

  state = reach(state, march1)
  state = resolve(placeBid(state, march1, 400, TODAY).state, 1).state // Offer 480 against 150
  assert.equal(hex(state, march1).owner, 'player')
  state = reach(withRespect(state, 'dwarf', 60), march2)
  const bought = makeDeal(state, 'dwarf', { kind: 'buyHex', hexId: march2 }, TODAY)
  assert.ok(bought.ok, JSON.stringify(bought.refusal))
  assert.deepEqual(defectionTally(bought.state, 'dwarf'), { rival: 'dwarf', original, won: { influence: 1, trade: 1, conquest: 0 }, holds: 1 })
})
