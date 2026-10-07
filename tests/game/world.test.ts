/**
 * T12: the living world (Ch 13, Ch 14 "Three ways to resolve a rival", Appendix C "The world-event
 * deck", D-01): Accords, defection, coalitions, the event deck and where each event's effect lives,
 * and the Threat a rival's fall adds. The endgame (Ascendancy, the Siege, victory) is in
 * endgame.test.ts; Test 10's whole-campaign invariants are in invariants.test.ts.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { itemOffer } from '../../src/renderer/src/lib/game/armory'
import { addDays, diffDays } from '../../src/renderer/src/lib/game/clock'
import { CODEX } from '../../src/renderer/src/lib/game/codex'
import { COMBAT_HOOKS, canRaid, raiderWeights } from '../../src/renderer/src/lib/game/combat'
import { contractPayout, payoutCurve, settleContract } from '../../src/renderer/src/lib/game/contracts'
import { balance } from '../../src/renderer/src/lib/game/economy'
import { realmEffects } from '../../src/renderer/src/lib/game/effects'
import { GRAND_HOOKS, pendingBattles } from '../../src/renderer/src/lib/game/grand'
import { makeDeal, offerDeal, placeBid, resolveCourtships } from '../../src/renderer/src/lib/game/land'
import { isClaimableKind, neighbors } from '../../src/renderer/src/lib/game/map'
import { chance } from '../../src/renderer/src/lib/game/rng'
import { RIVAL_HOOKS, falloutThreat, rivalIncome, threatOf } from '../../src/renderer/src/lib/game/rivals'
import { roster } from '../../src/renderer/src/lib/game/roster'
import { settle } from '../../src/renderer/src/lib/game/settle'
import { inCoalition, withWorld, worldOf } from '../../src/renderer/src/lib/game/state'
import type { CampaignState, Coalition, GameEvent, GrandBattle, HexState, RivalId, WeightWeek, WorldEvent } from '../../src/renderer/src/lib/game/types'
import {
  accordGain,
  accordGate,
  accordPaid,
  auctionBid,
  coalitionView,
  defects,
  eventHint,
  keepVillage,
  lendToEnvoy,
  nextFullMoon,
  sealAccord,
  worldWeek
} from '../../src/renderer/src/lib/game/world'
import { FOUNDED_AT, TZ, charter, chicago, ledgerWith } from './fixtures/ledgers'
import { collector, withArmy } from './support/grand'
import { realm, withArmory, withCastle, withGrace, withMilestones, withPurse } from './support/realm'
import { foundCampaign } from '../../src/renderer/src/lib/game/campaign'

// ── Builders ─────────────────────────────────────────────────────────────────

/** The last day of campaign week `n` for `realm()` (week 1 is 2026-10-08 to 10-11; Monday weeks). */
function closeOf(n: number): string {
  return addDays('2026-10-11', 7 * (n - 1))
}

/** Runs the `world` week phase at the close of week `n`. */
function worldAt(state: CampaignState, n: number, realmConsistency = 0.9): { state: CampaignState; c: ReturnType<typeof collector> } {
  const c = collector()
  return { state: worldWeek(state, { day: closeOf(n), week: n, days: 7, realmConsistency, emit: c.emit }), c }
}

function withRespect(state: CampaignState, rival: RivalId, respect: number): CampaignState {
  return { ...state, rivals: { ...state.rivals, [rival]: { ...state.rivals[rival], respect } } }
}

function withStatus(state: CampaignState, rival: RivalId, status: CampaignState['rivals'][RivalId]['status'], day: string): CampaignState {
  const log = [...state.log, { id: `ev-${state.log.length + 1}`, day, kind: 'rivalResolved', rival, how: status } as GameEvent]
  return { ...state, log, rivals: { ...state.rivals, [rival]: { ...state.rivals[rival], status, ...(status === 'active' ? {} : { resolvedOn: day }) } } }
}

/** Posts a raw event to the log, as settlement would have. */
function logged(state: CampaignState, event: Record<string, unknown>): CampaignState {
  return { ...state, log: [...state.log, { id: `ev-${state.log.length + 1}`, ...event } as GameEvent] }
}

function setHex(state: CampaignState, id: string, patch: Partial<HexState>): CampaignState {
  return { ...state, hexes: state.hexes.map((h) => (h.id === id ? { ...h, ...patch } : h)) }
}

function hex(state: CampaignState, id: string): HexState {
  return state.hexes.find((h) => h.id === id) as HexState
}

/** Every Beast Surge that would have fired by the close of week `n`, recorded as long over, so the deck is free for the event under test. */
function surgesBefore(state: CampaignState, n: number): CampaignState {
  const fired: WorldEvent[] = []
  for (let w = 10; w <= n + 1; w += 13) fired.push({ id: 'beastSurge', firedOn: closeOf(w - 1), data: { from: closeOf(w - 1), until: closeOf(w - 1), restored: true } })
  return { ...state, worldEvents: [...state.worldEvents, ...fired] }
}

/** The dated events (the Hungry Winter, every Beast Surge) recorded as past by week `n`, so the deck is free for the event under test. */
function quiet(state: CampaignState, n: number): CampaignState {
  const winter: WorldEvent = { id: 'hungryWinter', firedOn: '2026-12-06', data: { from: '2026-12-07', until: '2027-01-03' } }
  return surgesBefore({ ...state, worldEvents: [...state.worldEvents, winter] }, n)
}

function fired(state: CampaignState): string[] {
  return state.worldEvents.map((e) => e.id)
}

function newEvents(before: CampaignState, after: CampaignState): WorldEvent[] {
  return after.worldEvents.slice(before.worldEvents.length)
}

// ── Accords (Ch 14, D-01) ────────────────────────────────────────────────────

test('D-01: a 30-day Accord at Q = 0.90 from Respect 60 adds 41.7 Respect (→ 101.7, signed) and pays 500.0 before the reputation bonus', () => {
  const today = closeOf(14)
  const start = withRespect(withPurse(withCastle(realm(), 3), 200), 'goblin', 60)
  const sealed = sealAccord(start, 'goblin', { id: 'accord-1' }, today)
  assert.ok(sealed.ok, sealed.reason)
  const accord = sealed.state.contracts.active
  assert.equal(accord?.kind, 'accord')
  assert.equal(accord?.respectAtStart, 60)
  assert.equal(accord?.termDays, 30)

  const paid = settleContract(sealed.state.contracts, sealed.state.purse, 0.9, { date: accord.endDate, minPledgeReturn: 0, bonus: 0 })
  assert.equal(paid.outcome.payout, 500)
  assert.equal(contractPayout(30, 0.9), 500)
  assert.ok(paid.accord)
  assert.ok(Math.abs(accordGain(sealed.state, 'goblin', paid.accord.curve, 60) - 41.67) < 0.01)

  const c = collector()
  const after = accordPaid({ ...sealed.state, contracts: paid.contracts, purse: paid.purse }, paid.accord, accord.endDate, c.emit)
  assert.equal(after.rivals.goblin.respect, 100, '101.7 is held at the cap of 100')
  assert.equal(after.rivals.goblin.status, 'allied', 'signed at 100')
  assert.deepEqual(c.of('rivalResolved'), [{ rival: 'goblin', how: 'allied' }])
})

test('D-01: at Q = 0.70 the Accord adds 25.0 (→ 85) and pays 300.0; the rival is not allied and a new Accord can be sealed', () => {
  const today = closeOf(14)
  const start = withRespect(withPurse(withCastle(realm(), 3), 200), 'goblin', 60)
  const sealed = sealAccord(start, 'goblin', { id: 'accord-1' }, today)
  const accord = sealed.state.contracts.active as NonNullable<CampaignState['contracts']['active']>
  const paid = settleContract(sealed.state.contracts, sealed.state.purse, 0.7, { date: accord.endDate, minPledgeReturn: 0, bonus: 0 })
  assert.equal(paid.outcome.payout, 300)
  assert.ok(paid.accord)
  assert.ok(Math.abs(accordGain(sealed.state, 'goblin', payoutCurve(0.7), 60) - 25) < 1e-9)
  const after = accordPaid({ ...sealed.state, contracts: paid.contracts, purse: paid.purse }, paid.accord, accord.endDate, collector().emit)
  assert.equal(after.rivals.goblin.respect, 85)
  assert.equal(after.rivals.goblin.status, 'active')
  assert.equal(accordGate(after, 'goblin', addDays(accord.endDate, 1)).ok, true, 'it can be sealed again')
})

test('D-01: from Respect 75 or more the Accord adds 60 × f(Q), judged by the Respect recorded at its seal', () => {
  const sealed = sealAccord(withRespect(withPurse(withCastle(realm(), 3), 200), 'dwarf', 75), 'dwarf', { id: 'a' }, closeOf(14))
  const accord = sealed.state.contracts.active as NonNullable<CampaignState['contracts']['active']>
  // Respect fell below 75 while it ran; the gain still uses 75 from the seal.
  const lowered = withRespect(sealed.state, 'dwarf', 70)
  const after = accordPaid(lowered, { contractId: accord.id, rival: 'dwarf', curve: 0.5 }, accord.endDate, collector().emit)
  assert.equal(after.rivals.dwarf.respect, 70 + 30)
})

test('Ch 14: an Accord needs Respect 60, Castle III, the rival active and in no coalition, and the contract slot free', () => {
  const ready = withRespect(withPurse(withCastle(realm(), 3), 200), 'orc', 60)
  const today = closeOf(14)
  assert.deepEqual(accordGate(ready, 'orc', today), { ok: true, threshold: 60, respect: 60 })
  assert.equal(accordGate(withRespect(ready, 'orc', 59), 'orc', today).reason, 'respect')
  assert.equal(accordGate(withCastle(ready, 2), 'orc', today).reason, 'castle')
  const coalition: Coalition = { members: ['orc', 'goblin'], trigger: 'risingCrown', warChest: 0, formedOn: closeOf(13), until: closeOf(19) }
  assert.equal(accordGate({ ...ready, coalitions: [coalition] }, 'orc', today).reason, 'coalition')
  assert.equal(accordGate(withStatus(ready, 'orc', 'conquered', today), 'orc', today).reason, 'rivalResolved')
  const fallen = { ...ready, campaign: { ...ready.campaign, status: 'fallen' as const } }
  assert.equal(accordGate(fallen, 'orc', today).reason, 'campaignOver')
  const sealed = sealAccord(ready, 'orc', { id: 'a' }, today)
  assert.ok(sealed.ok)
  assert.equal(accordGate(withRespect(sealed.state, 'dwarf', 90), 'dwarf', today).reason, 'contractRunning', 'the Accord holds the contract slot')
  assert.equal(sealAccord(withRespect(ready, 'orc', 59), 'orc', { id: 'b' }, today).ok, false)
})

test('Ch 14: while an Accord runs, that rival makes no raids', () => {
  const ready = withRespect(withPurse(withCastle(realm(), 3), 200), 'orc', 60)
  const today = closeOf(14)
  const sealed = sealAccord(ready, 'orc', { id: 'a' }, today).state
  const during = addDays(today, 5)
  assert.equal(canRaid(ready, 'orc', during), true)
  assert.equal(canRaid(sealed, 'orc', during), false)
  assert.ok(!raiderWeights(sealed, during).some((w) => w.rival === 'orc'))
})

test('D-01 / gap 2: the Accord’s Respect is added even when the settle call that pays it ends before the week closes', () => {
  const ledger = ledgerWith('2026-09-10', 220)
  let state = foundCampaign({ startWeight: 217, goalWeight: 168, charter: charter(), timeZone: TZ, seed: 7, ledger }, FOUNDED_AT)
  // Thirteen weeks pass; then the realm reaches Castle III with the Goblin at Respect 60.
  state = settle(state, ledger, chicago(addDays(closeOf(13), 1))).state
  state = withRespect(withCastle(state, 3), 'goblin', 60)
  const sealOn = addDays(closeOf(13), 1) // a Monday: the Accord runs Tuesday to the Wednesday 30 days on
  const sealed = sealAccord(state, 'goblin', { id: 'accord-1' }, sealOn)
  assert.ok(sealed.ok, sealed.reason)
  const end = (sealed.state.contracts.active as NonNullable<CampaignState['contracts']['active']>).endDate
  assert.equal(new Date(`${end}T12:00:00Z`).getUTCDay(), 3, 'it ends on a Wednesday')
  const before = settle(sealed.state, ledger, chicago(end)).state
  assert.equal(before.rivals.goblin.respect, 60 + 4 * 4, 'four prized weeks (A-38) while it ran')
  const last = settle(before, ledger, chicago(addDays(end, 1)))
  assert.equal(last.summary.weeksClosed.length, 0, 'the paying call closes no week')
  const contract = last.events.find((e) => e.kind === 'contract')
  assert.ok(contract && contract.kind === 'contract')
  assert.equal(contract.score, 1)
  assert.equal(last.state.rivals.goblin.respect, 100)
  assert.equal(last.state.rivals.goblin.status, 'allied')
  assert.ok(last.events.some((e) => e.kind === 'rivalResolved' && e.rival === 'goblin' && e.how === 'allied'))
})

// ── Defection (Ch 14) ────────────────────────────────────────────────────────

/** The Dwarf with its March villages won by `how` and only its Gate left; a plain ring-4 hex of its own as well. */
function dwarfDown(how: 'influence' | 'trade' | 'conquest'): { state: CampaignState; gate: string; spare: string } {
  let state = withPurse(realm(), 2_000)
  const day = closeOf(10)
  const marches = ['1,4', '-1,5']
  for (const id of marches) {
    state = setHex(state, id, { owner: 'player', garrison: 0, village: { loyalty: 60 } })
    state = logged(state, { day, kind: 'hexTransfer', hexId: id, from: 'dwarf', to: 'player', how })
  }
  const spare = state.hexes.find((h) => h.ring === 4 && h.owner === 'neutral' && !h.village && isClaimableKind(h) && neighbors(h.id).some((n) => hex(state, n)?.owner === 'dwarf')) as HexState
  state = setHex(state, spare.id, { owner: 'dwarf' })
  return { state, gate: '0,5', spare: spare.id }
}

test('Ch 14: courting the Dwarf’s last village, with half its villages won by influence or trade, makes it abdicate; its land passes to the player', () => {
  const { state: down, gate, spare } = dwarfDown('influence')
  assert.equal(defects(down, 'dwarf'), false, 'it still holds its Gate')
  const bid = placeBid(down, gate, 400, addDays(closeOf(14), -3))
  assert.ok(bid.ok, JSON.stringify(bid.reason))
  const c = collector()
  const courted = resolveCourtships(bid.state, { day: closeOf(14), realmConsistency: 1, emit: c.emit })
  assert.equal(hex(courted, gate).owner, 'player')
  assert.equal(defects(courted, 'dwarf'), true)
  const { state, c: w } = worldAt(courted, 14)
  assert.equal(state.rivals.dwarf.status, 'abdicated')
  assert.deepEqual(w.of('rivalResolved'), [{ rival: 'dwarf', how: 'abdicated' }])
  assert.equal(hex(state, spare).owner, 'player', 'its remaining hexes pass to the player')
  assert.ok(state.hexes.every((h) => h.owner !== 'dwarf' || !isClaimableKind(h)))
  assert.equal(hex(state, '0,6').owner, 'dwarf', 'the Rim stays put: its capital is never the player’s (A-175)')
  assert.equal(falloutThreat(state, 'orc', closeOf(14)), 10, 'Threat +10 from every rival')
  // The Goblin, active, offers to buy one of those hexes.
  const offer = worldOf(state).offers.find((o) => o.kind === 'goblinBuys')
  assert.ok(offer && offer.kind === 'goblinBuys')
  assert.equal(offer.hexId, spare)
  assert.ok(roster(state).some((co) => co.id === 'vassal:dwarf'), 'its company passes to the player')
})

test('Ch 14: a village won by trade counts toward defection like one won by influence', () => {
  const { state } = dwarfDown('trade')
  const courted = setHex(logged(state, { day: closeOf(14), kind: 'hexTransfer', hexId: '0,5', from: 'dwarf', to: 'player', how: 'influence' }), '0,5', { owner: 'player' })
  assert.equal(defects(courted, 'dwarf'), true)
})

test('Ch 14: with more than half of its villages conquered, a rival that holds none does not abdicate', () => {
  const { state: down, gate } = dwarfDown('conquest')
  const bid = placeBid(down, gate, 400, addDays(closeOf(14), -3))
  const courted = resolveCourtships(bid.state, { day: closeOf(14), realmConsistency: 1, emit: collector().emit })
  assert.equal(hex(courted, gate).owner, 'player')
  assert.equal(defects(courted, 'dwarf'), false)
  assert.equal(worldAt(courted, 14).state.rivals.dwarf.status, 'active')
})

test('Ch 14 pacing / A-168: a defection before week 12 waits for week 12’s close, checked again then', () => {
  const { state: down } = dwarfDown('influence')
  const courted = setHex(logged(down, { day: closeOf(8), kind: 'hexTransfer', hexId: '0,5', from: 'dwarf', to: 'player', how: 'influence' }), '0,5', { owner: 'player' })
  const early = worldAt(courted, 8).state
  assert.equal(early.rivals.dwarf.status, 'active')
  assert.deepEqual(worldOf(early).pending.map((p) => [p.rival, p.how]), [['dwarf', 'abdicated']])
  assert.equal(worldAt(early, 11).state.rivals.dwarf.status, 'active')
  assert.equal(worldAt(early, 12).state.rivals.dwarf.status, 'abdicated')
  // Had it won a village back meanwhile, the held defection would lapse.
  const regained = setHex(early, '1,4', { owner: 'dwarf' })
  const later = worldAt(regained, 12).state
  assert.equal(later.rivals.dwarf.status, 'active')
  assert.deepEqual(worldOf(later).pending, [])
})

// ── Coalitions (Ch 13) ───────────────────────────────────────────────────────

/** The Orc conquered at week 12; the player took Goblin and Dwarf land in the last 4 weeks, raising their Threat. */
function afterFirstFall(): CampaignState {
  let state = withStatus(realm(), 'orc', 'conquered', closeOf(12))
  state = logged(state, { day: closeOf(12), kind: 'hexTransfer', hexId: '4,-5', from: 'goblin', to: 'player', how: 'conquest' })
  state = logged(state, { day: closeOf(12), kind: 'hexTransfer', hexId: '1,4', from: 'dwarf', to: 'player', how: 'conquest' })
  return state
}

test('Ch 13: the First Fall joins the two remaining rivals with the highest Threat for 10 weeks; the third is the Watcher at Threat +10', () => {
  const state = afterFirstFall()
  const ranked = (['goblin', 'dwarf', 'archmage'] as RivalId[]).map((r) => [r, threatOf(state, r, closeOf(13))] as const)
  assert.ok(ranked[0][1] > ranked[2][1] && ranked[1][1] > ranked[2][1], 'land taken raises the Goblin’s and the Dwarf’s Threat')
  const { state: next, c } = worldAt(state, 13)
  assert.equal(next.coalitions.length, 1)
  const coalition = next.coalitions[0]
  assert.deepEqual([...coalition.members].sort(), ['dwarf', 'goblin'])
  assert.equal(coalition.trigger, 'firstFall')
  assert.equal(coalition.watcher, 'archmage')
  assert.equal(coalition.until, addDays(closeOf(13), 70))
  assert.deepEqual(c.of('coalition'), [{ members: coalition.members, trigger: 'firstFall', stage: 'formed' }])
  assert.equal(next.rivals.goblin.disposition.player, 'war')
  assert.equal(next.rivals.dwarf.disposition.player, 'war')
  assert.equal(falloutThreat(next, 'archmage', closeOf(14)), 15 + 10, 'the Watcher: +15 for the conquest, +10 as the Watcher')
  assert.equal(falloutThreat(next, 'goblin', closeOf(14)), 15)
  assert.deepEqual(coalitionView(next, addDays(closeOf(13), 1)), [{ members: coalition.members, trigger: 'firstFall', until: coalition.until, watcher: 'archmage' }])
  assert.ok(!('warChest' in coalitionView(next, addDays(closeOf(13), 1))[0]), 'the war chest stays hidden')
})

test('Ch 9 Grace III: every coalition ends 2 weeks sooner', () => {
  const next = worldAt(withGrace(afterFirstFall(), 3), 13).state
  assert.equal(next.coalitions[0].until, addDays(closeOf(13), 56))
})

test('Ch 13: the Last Alliance joins both remaining rivals until one is resolved, unless one holds Respect 60', () => {
  let state = withStatus(realm(), 'orc', 'conquered', closeOf(12))
  state = withStatus(state, 'goblin', 'allied', closeOf(20))
  state = withWorld(state, { resolvedSeen: 1 })
  const { state: next } = worldAt(state, 21)
  assert.equal(next.coalitions.length, 1)
  assert.deepEqual(next.coalitions[0].members, ['dwarf', 'archmage'])
  assert.equal(next.coalitions[0].trigger, 'lastAlliance')
  assert.equal(next.coalitions[0].until, undefined)
  assert.equal(worldAt(withRespect(state, 'archmage', 60), 21).state.coalitions.length, 0, 'the Archmage refuses')
})

/** A player whose Power far outweighs the rivals’, holding the most Dominion in the South. */
function risingCrown(seed = 7): CampaignState {
  let state = withPurse(realm(seed), 20_000)
  const south = state.hexes.filter((h) => h.land === 'south' && h.owner === 'neutral' && isClaimableKind(h) && h.ring <= 3).map((h) => h.id)
  for (const id of south) state = setHex(state, id, { owner: 'player', garrison: 0 })
  return state
}

test('Ch 13 / A-34: the Rising Crown forms after 3 week closes at 1.5× the rivals’ average Power, not before week 12, from the two rivals bounding the strongest direction', () => {
  let state = risingCrown()
  for (const n of [9, 10, 11]) state = worldAt(state, n).state
  assert.equal(worldOf(state).risingStreak, 3)
  assert.equal(state.coalitions.length, 0, 'no coalition before week 12')
  const { state: next, c } = worldAt(state, 12)
  assert.equal(next.coalitions.length, 1)
  assert.deepEqual(next.coalitions[0].members, ['archmage', 'dwarf'], 'the South is bounded by the Archmage and the Dwarf')
  assert.equal(next.coalitions[0].trigger, 'risingCrown')
  assert.equal(next.coalitions[0].until, addDays(closeOf(12), 42))
  assert.equal(c.of('coalition')[0].stage, 'formed')
})

test('Ch 13 / A-174: the Rising Crown’s 3 weeks count only while no coalition stands', () => {
  let state = risingCrown()
  for (const n of [10, 11, 12]) state = worldAt(state, n).state
  assert.equal(state.coalitions.length, 1)
  const formed = state.coalitions[0]
  assert.equal(formed.until, closeOf(18))
  for (let n = 13; n <= 19; n++) state = worldAt(state, n).state
  assert.equal(state.coalitions.length, 1, 'none forms while it stands, nor at the next close')
  assert.equal(worldOf(state).risingStreak, 2, 'the close it ended at and the one after')
  state = worldAt(state, 20).state
  assert.equal(state.coalitions.length, 2, 'the third close without one')
})

test('Ch 13: each member puts 10% of its income in the war chest, which funds a Coalition Offensive within 14 days of forming', () => {
  let state = risingCrown()
  for (const n of [10, 11, 12]) state = worldAt(state, n).state
  const formed = state.coalitions[0]
  const treasuries = { archmage: state.rivals.archmage.treasury, dwarf: state.rivals.dwarf.treasury }
  const { state: next, c } = worldAt(state, 13)
  for (const m of ['archmage', 'dwarf'] as const) {
    assert.ok(Math.abs(treasuries[m] - next.rivals[m].treasury - 0.1 * rivalIncome(state, m, 13, 7)) < 1e-9)
  }
  const offensive = next.grandBattles.find((b) => b.trigger === 'coalitionOffensive') as GrandBattle
  assert.ok(offensive, 'the Offensive is announced')
  assert.deepEqual(offensive.members, ['archmage', 'dwarf'])
  assert.ok(diffDays(formed.formedOn as string, offensive.announcedOn) <= 14)
  assert.equal(next.coalitions[0].offensive, offensive.id)
  assert.equal(next.coalitions[0].warChest, 0, 'spent on the Offensive')
  assert.equal(hex(next, offensive.hexId).owner, 'player')
  assert.ok(c.of('grandBattle').some((e) => e.stage === 'announced'))
})

test('Ch 13: paying a member 300 at Respect 40 breaks the coalition; below 40 the buy-out is refused', () => {
  let state = risingCrown()
  for (const n of [10, 11, 12]) state = worldAt(state, n).state
  const today = addDays(closeOf(12), 2)
  assert.equal(offerDeal(state, 'dwarf', { kind: 'buyout' }, today).reason?.code, 'respect')
  assert.equal(offerDeal(state, 'orc', { kind: 'buyout' }, today).reason?.code, 'noCoalition')
  const respected = withRespect(state, 'dwarf', 40)
  const offer = offerDeal(respected, 'dwarf', { kind: 'buyout' }, today)
  assert.equal(offer.allowed, true)
  assert.equal(offer.price, 300)
  const bought = makeDeal(respected, 'dwarf', { kind: 'buyout' }, today)
  assert.ok(bought.ok)
  assert.equal(balance(respected.purse) - balance(bought.state.purse), 300)
  assert.equal(bought.state.coalitions[0].broken, 'buyout')
  assert.equal(inCoalition(bought.state, 'dwarf', addDays(today, 1)), false)
  assert.ok(bought.state.log.some((e) => e.kind === 'coalition' && e.stage === 'broken'))
  const { state: after, c } = worldAt(bought.state, 13)
  assert.equal(c.of('coalition').length, 0, 'its end is posted once')
  assert.equal(after.coalitions[0].broken, 'buyout')
})

test('Ch 13: a member at Respect 50 betrays the coalition on its seeded 15% roll; below 50 it never does', () => {
  // The first seed whose Dwarf rolls a betrayal in the coalition's life (weeks 13 to 17).
  const weeks = [13, 14, 15, 16, 17]
  const seed = Array.from({ length: 50 }, (_, i) => i + 1).find((x) => weeks.some((n) => chance(x, closeOf(n), 'betrayal:dwarf', 0.15))) as number
  const week = weeks.find((n) => chance(seed, closeOf(n), 'betrayal:dwarf', 0.15)) as number
  let state = risingCrown(seed)
  for (const n of [10, 11, 12]) state = worldAt(state, n).state
  assert.equal(state.coalitions.length, 1)
  let loyal = state
  let betrayed = withRespect(withRespect(state, 'dwarf', 50), 'archmage', 0)
  for (let n = 13; n <= week; n++) {
    loyal = worldAt(loyal, n).state
    betrayed = worldAt(betrayed, n).state
  }
  assert.equal(betrayed.coalitions[0].broken, 'betrayal')
  assert.equal(betrayed.coalitions[0].until, closeOf(week))
  assert.equal(loyal.coalitions[0].broken, undefined, 'Respect 20 never betrays')
})

test('Ch 13: three rivals never ally at once; a new coalition ends the one standing', () => {
  let state = risingCrown()
  for (const n of [10, 11, 12]) state = worldAt(state, n).state
  state = withStatus(state, 'orc', 'conquered', closeOf(13))
  const next = worldAt(state, 14).state
  const standing = next.coalitions.filter((c) => c.until === undefined || c.until > closeOf(14))
  assert.equal(standing.length, 1)
  assert.equal(standing[0].trigger, 'firstFall')
  assert.equal(next.coalitions[0].broken, 'replaced')
})

// ── When a rival falls (Ch 13) ───────────────────────────────────────────────

test('Ch 13 / A-167: each fall adds Threat by how it fell: +15 conquered, +10 abdicated, +5 allied', () => {
  let state = realm()
  assert.equal(falloutThreat(state, 'archmage', closeOf(30)), 0)
  state = withStatus(state, 'orc', 'conquered', closeOf(12))
  state = withStatus(state, 'goblin', 'abdicated', closeOf(20))
  state = withStatus(state, 'dwarf', 'allied', closeOf(28))
  assert.equal(falloutThreat(state, 'archmage', closeOf(30)), 30)
  const base = threatOf({ ...state, rivals: { ...state.rivals, orc: { ...state.rivals.orc, status: 'active' } } }, 'archmage', closeOf(30))
  assert.ok(threatOf(state, 'archmage', closeOf(30)) !== base)
})

test('Ch 13: a conquered rival’s capital and realm become ruins; its other hexes turn neutral with village loyalty halved', () => {
  let state = withPurse(realm(), 100)
  state = setHex(state, '0,-5', { owner: 'player' }) // the Orc's Gate is the player's
  const marches = ['1,-5', '-1,-4'].map((id) => hex(state, id).village?.loyalty ?? 0)
  const c = collector()
  const capital = '0,-6'
  const battle: GrandBattle = { id: 'gb-1', trigger: 'capital', hexId: capital, announcedOn: closeOf(13), battleDate: closeOf(14), enemy: [], rival: 'orc' }
  const won = GRAND_HOOKS.capital({ ...state, grandBattles: [battle] }, battle, { day: closeOf(14), won: true, result: 'victory', spoilsMult: 1, emit: c.emit }).state
  assert.equal(won.rivals.orc.status, 'conquered')
  assert.equal(hex(won, capital).owner, 'neutral')
  assert.equal(hex(won, capital).ruins, true)
  assert.ok(won.hexes.filter((h) => h.kind === 'realm' && h.road === 'barracks').every((h) => h.ruins))
  ;['1,-5', '-1,-4'].forEach((id, i) => {
    assert.equal(hex(won, id).owner, 'neutral')
    assert.equal(hex(won, id).village?.loyalty, marches[i] / 2)
  })
  assert.ok(roster(won).some((co) => co.id === 'vassal:orc'), 'its company joins as a vassal levy')
})

// ── The event deck (Ch 13, Appendix C) ───────────────────────────────────────

test('Appendix C / A-170: the next full moon after 2026-10-08 is 2026-10-26 ± 1 day', () => {
  const moon = nextFullMoon('2026-10-08')
  assert.ok(Math.abs(diffDays('2026-10-26', moon)) <= 1, moon)
  assert.equal(nextFullMoon(moon), moon, 'a full-moon day is its own next full moon')
  assert.ok(diffDays(moon, nextFullMoon(addDays(moon, 1))) >= 28)
})

test('Appendix C / A-169: the Hungry Winter of 2026 fires in the week starting 2026-12-07; the Beast Surge due that week waits one', () => {
  const ledger = ledgerWith('2026-09-10', 120)
  const founded = foundCampaign({ startWeight: 217, goalWeight: 168, charter: charter(), timeZone: TZ, seed: 7, ledger }, FOUNDED_AT)
  const state = settle(founded, ledger, chicago('2026-12-15')).state
  const winter = state.worldEvents.find((e) => e.id === 'hungryWinter')
  assert.ok(winter)
  assert.equal(winter.firedOn, '2026-12-06')
  assert.deepEqual([(winter.data as { from: string }).from, (winter.data as { until: string }).until], ['2026-12-07', '2027-01-03'])
  const surge = state.worldEvents.find((e) => e.id === 'beastSurge')
  assert.equal((surge?.data as { from: string }).from, '2026-12-14')
  assert.equal(state.worldEvents.filter((e) => e.firedOn === '2026-12-06').length, 1, 'one new event a week')
  // Tithes are cut by 25% through an event source, and every village lost 20% of its loyalty.
  const effects = realmEffects(state)
  assert.equal(effects.titheCut.value, 0.75)
  assert.deepEqual(effects.titheCut.sources.map((s) => s.from), [{ kind: 'event', id: 'hungryWinter' }])
  const before = settle(founded, ledger, chicago('2026-12-06')).state
  const village = before.hexes.find((h) => h.village && h.owner === 'neutral') as HexState
  const after = hex(state, village.id)
  assert.ok(Math.abs((after.village?.loyalty ?? 0) - (village.village?.loyalty ?? 0) * 0.8) < 1e-9)
})

test('Appendix C: the Beast Surge fires for week 10, then every 13 weeks: neutral den garrisons +20% and beasts 60% of threats for 2 weeks', () => {
  const state = { ...realm(), worldEvents: [{ id: 'hungryWinter', firedOn: '2026-12-06', data: { from: '2026-12-07', until: '2027-01-03' } }] }
  assert.deepEqual(fired(worldAt(state, 8).state), ['hungryWinter'])
  const { state: surged, c } = worldAt(state, 9)
  assert.deepEqual(fired(surged), ['hungryWinter', 'beastSurge'])
  const posted = c.of('worldEvent')[0]
  assert.deepEqual([posted.eventId, posted.from, posted.until], ['beastSurge', addDays(closeOf(9), 1), closeOf(11)])
  const den = state.hexes.find((h) => h.owner === 'neutral' && !h.village && isClaimableKind(h) && h.kind !== 'lairMouth' && h.garrison > 0) as HexState
  assert.ok(den)
  assert.ok(Math.abs(hex(surged, den.id).garrison - den.garrison * 1.2) < 1e-9)
  const during = addDays(closeOf(9), 3)
  const mix = COMBAT_HOOKS.threatMix(surged, during, { beasts: 0.4, mythic: 0.2, raid: 0.4 })
  assert.equal(mix.beasts, 0.6)
  assert.ok(Math.abs(mix.mythic - 0.4 / 3) < 1e-9 && Math.abs(mix.raid - 0.8 / 3) < 1e-9)
  assert.deepEqual(COMBAT_HOOKS.threatMix(state, during, { beasts: 0.4, mythic: 0.2, raid: 0.4 }), { beasts: 0.4, mythic: 0.2, raid: 0.4 })
  // In force through week 11; at the next close its garrisons go back.
  let next = worldAt(surged, 10).state
  assert.deepEqual(fired(next), ['hungryWinter', 'beastSurge'])
  next = worldAt(next, 11).state
  assert.ok(Math.abs(hex(next, den.id).garrison - den.garrison) < 1e-9)
  assert.deepEqual(fired(worldAt(next, 21).state), ['hungryWinter', 'beastSurge'])
  assert.deepEqual(fired(worldAt(next, 22).state), ['hungryWinter', 'beastSurge', 'beastSurge'], 'week 23 is 13 weeks after week 10')
})

test('Appendix C: Ugrak’s Challenge needs 3 Incursions the Orc lost; it is a duel of two companies a side, announced 2 days ahead', () => {
  const incursion = (n: number): GrandBattle => ({ id: `gb-${n}`, trigger: 'incursion', hexId: '1,-4', announcedOn: closeOf(n), battleDate: closeOf(n), enemy: [], rival: 'orc', result: 'victory' })
  const two = { ...withArmy(realm(), 'orc', [40, 30, 20]), grandBattles: [incursion(1), incursion(2)] }
  assert.deepEqual(fired(worldAt(two, 5).state), [])
  const three = { ...two, grandBattles: [...two.grandBattles, incursion(3)] }
  const { state } = worldAt(three, 5)
  assert.deepEqual(fired(state), ['ugraksChallenge'])
  const duel = pendingBattles(state).find((b) => b.eventId === 'ugraksChallenge') as GrandBattle
  assert.equal(duel.limit, 2)
  assert.ok(duel.enemy.length <= 2)
  assert.ok(diffDays(duel.announcedOn, duel.battleDate) >= 2)
  // Won: Orc Respect +30.
  const won = GRAND_HOOKS.event(state, duel, { day: duel.battleDate, won: true, result: 'victory', spoilsMult: 1, emit: collector().emit }).state
  assert.equal(won.rivals.orc.respect, 50)
  const lost = GRAND_HOOKS.event(state, duel, { day: duel.battleDate, won: false, result: 'defeat', spoilsMult: 1, emit: collector().emit })
  assert.equal(lost.outcome.tribute, 200)
})

test('Appendix C: the Grand Auction needs a Goblin treasury of 2,000; two neutral villages go to sealed bids, the highest Offer wins', () => {
  const poor = { ...realm(), rivals: { ...realm().rivals, goblin: { ...realm().rivals.goblin, treasury: 1_999 } } }
  assert.deepEqual(fired(worldAt(poor, 5).state), [])
  const rich = withPurse({ ...poor, rivals: { ...poor.rivals, goblin: { ...poor.rivals.goblin, treasury: 2_000 } } }, 1_000)
  const { state } = worldAt(rich, 5)
  assert.deepEqual(fired(state), ['grandAuction'])
  const auction = worldOf(state).auction
  assert.ok(auction)
  assert.equal(auction.lots.length, 2)
  for (const lot of auction.lots) assert.equal(hex(state, lot.hexId).owner, 'neutral')
  const lot = auction.lots[0]
  const bid = auctionBid(state, lot.hexId, 900, addDays(closeOf(5), 2))
  assert.ok(bid.ok)
  const closed = worldAt(bid.state, 6).state
  assert.equal(hex(closed, lot.hexId).owner, 'player', 'the player’s Offer was the highest')
  assert.equal(worldOf(closed).auction, undefined)
})

test('Appendix C: the Deep Call needs 20 Dwarf fortification levels; for 4 weeks its conquest attempts reach two hexes away', () => {
  const fortified = (levels: number): CampaignState => {
    let state = realm()
    let left = levels
    for (const h of state.hexes.filter((x) => x.owner === 'dwarf')) {
      const put = Math.min(4, left)
      state = setHex(state, h.id, { fortification: put as HexState['fortification'] })
      left -= put
    }
    return state
  }
  assert.deepEqual(fired(worldAt(fortified(19), 5).state), [])
  const { state } = worldAt(fortified(20), 5)
  assert.deepEqual(fired(state), ['deepCall'])
  const during = addDays(closeOf(5), 10)
  assert.equal(COMBAT_HOOKS.conquestReach(state, 'dwarf', during), 2)
  assert.equal(COMBAT_HOOKS.conquestReach(state, 'orc', during), 1)
  assert.equal(COMBAT_HOOKS.conquestReach(state, 'dwarf', addDays(closeOf(9), 1)), 1, 'over after 4 weeks')
  // Non-recurring: never again, though its criteria still hold.
  let later = state
  for (let n = 6; n <= 8; n++) later = worldAt(later, n).state
  assert.deepEqual(fired(later), ['deepCall'])
})

test('Ch 13: at most one new event fires a week; the next waits for a later close', () => {
  let state = realm()
  state = { ...state, rivals: { ...state.rivals, goblin: { ...state.rivals.goblin, treasury: 2_500 } } }
  for (const h of state.hexes.filter((x) => x.owner === 'dwarf')) state = setHex(state, h.id, { fortification: 4 })
  const first = worldAt(state, 5).state
  assert.deepEqual(fired(first), ['grandAuction'])
  assert.deepEqual(fired(worldAt(first, 6).state), ['grandAuction', 'deepCall'])
})

test('Appendix C: the Dragon Wakes from week 30 while the Wyrmfells are unsealed, at the player’s hex nearest the west', () => {
  const state = quiet(realm(), 30)
  assert.ok(!fired(worldAt(state, 29).state).includes('dragonWakes'))
  const { state: woke } = worldAt(state, 30)
  assert.equal(newEvents(state, woke)[0].id, 'dragonWakes')
  const battle = pendingBattles(woke).find((b) => b.eventId === 'dragonWakes') as GrandBattle
  assert.equal(battle.quarry, 'dragon')
  assert.ok(hex(woke, battle.hexId).id.startsWith('-'), 'a western hex')
  assert.ok(diffDays(battle.announcedOn, battle.battleDate) >= 2)
  const sealed = setHex(state, '-5,0', { owner: 'player', mythic: false })
  assert.ok(!newEvents(sealed, worldAt(sealed, 30).state).some((e) => e.id === 'dragonWakes'), 'not once the lair is sealed')
})

test('Appendix C / A-170: the Wild Hunt from week 26 while the Thornwild is unsealed, fought on the next full moon at the player’s hex nearest the east', () => {
  const state = quiet(realm(), 26)
  assert.ok(!fired(worldAt(state, 25).state).includes('wildHunt'))
  const { state: hunted } = worldAt(state, 26)
  assert.equal(newEvents(state, hunted)[0].id, 'wildHunt')
  const battle = pendingBattles(hunted).find((b) => b.eventId === 'wildHunt') as GrandBattle
  assert.equal(battle.battleDate, nextFullMoon(addDays(battle.announcedOn, 2)))
  assert.ok(!hex(hunted, battle.hexId).id.startsWith('-'), 'an eastern hex')
})

test('Appendix C / A-169: the Pretender rises 3 weeks after a conquest and seizes the 2 neutral hexes nearest the fallen capital', () => {
  const conquered = quiet(withArmy(withStatus(realm(), 'orc', 'conquered', closeOf(14)), 'orc', [50, 50]), 17)
  assert.deepEqual(newEvents(conquered, worldAt(conquered, 16).state), [])
  const { state } = worldAt(conquered, 17)
  const ev = newEvents(conquered, state).find((e) => e.id === 'pretender')
  assert.ok(ev)
  const seized = (ev.data as { hexIds: string[] }).hexIds
  assert.equal(seized.length, 2)
  for (const id of seized) {
    const h = hex(state, id)
    assert.equal(h.owner, 'neutral')
    assert.equal(h.rebels, true)
    assert.ok(h.ring > 2)
    assert.ok(h.garrison >= (0.4 * 100) / 2)
  }
})

test('Appendix C: Fear of the Crown at 40% of claimable hexes; rivals spend 10% more on armies for 6 week closes', () => {
  const claimable = realm().hexes.filter((h) => isClaimableKind(h))
  const need = Math.ceil(0.4 * claimable.length)
  const holding = (n: number): CampaignState => {
    const ids = new Set(claimable.filter((h) => h.owner === 'neutral').slice(0, n).map((h) => h.id))
    return { ...realm(), hexes: realm().hexes.map((h) => (ids.has(h.id) ? { ...h, owner: 'player' as const } : h)) }
  }
  assert.deepEqual(fired(worldAt(holding(need - 1), 5).state), [])
  const { state } = worldAt(holding(need), 5)
  assert.deepEqual(fired(state), ['fearOfTheCrown'])
  const closes = [6, 7, 8, 9, 10, 11, 12].map((n) => RIVAL_HOOKS.armyShare(state, 'orc', closeOf(n), 0.5))
  assert.deepEqual(closes.map((x) => Math.round(x * 1000) / 1000), [0.55, 0.55, 0.55, 0.55, 0.55, 0.55, 0.5])
})

test('Appendix C / A-171: a conquered village under loyalty 20 for 4 weeks may rise: keep it for 50, or it turns neutral on a 30% roll', () => {
  let state = withPurse(realm(), 500)
  const village = state.hexes.find((h) => h.village && h.owner === 'neutral' && h.ring === 3) as HexState
  state = setHex(state, village.id, { owner: 'player', garrison: 0, village: { loyalty: 15 } })
  state = logged(state, { day: closeOf(2), kind: 'hexTransfer', hexId: village.id, from: 'neutral', to: 'player', how: 'conquest' })
  let three = state
  for (const n of [3, 4, 5]) three = worldAt(three, n).state
  assert.equal(worldOf(three).lowLoyalty[village.id], 3)
  assert.deepEqual(fired(three), [])
  const { state: risen } = worldAt(three, 6)
  assert.deepEqual(fired(risen), ['villageUprising'])
  const offer = worldOf(risen).offers.find((o) => o.kind === 'uprising')
  assert.ok(offer && offer.kind === 'uprising')
  assert.equal(offer.price, 50)
  const kept = keepVillage(risen, village.id, addDays(closeOf(6), 2))
  assert.ok(kept.ok)
  assert.equal(balance(risen.purse) - balance(kept.state.purse), 50)
  assert.equal(hex(worldAt(kept.state, 7).state, village.id).owner, 'player')
  // Unpaid, the 30% roll decides at the offer's end.
  const rolls = chance(risen.campaign.seed, closeOf(7), `uprising:${village.id}`, 0.3)
  assert.equal(hex(worldAt(risen, 7).state, village.id).owner, rolls ? 'neutral' : 'player')
})

test('Appendix C: the Wandering Order serves for 4 weeks after 6 weeks of Realm Consistency at 90%', () => {
  const weeks = (n: number): WeightWeek[] => Array.from({ length: n }, (_, i) => ({ week: i + 1, day: closeOf(i + 1), momentum: 1, realmConsistency: 0.92, tooFast: false }))
  const five = { ...realm(), weight: { ...realm().weight, weeks: weeks(5) } }
  assert.deepEqual(fired(worldAt(five, 6).state), [])
  const six = { ...five, weight: { ...five.weight, weeks: weeks(6) } }
  const { state } = worldAt(six, 6)
  assert.deepEqual(fired(state), ['wanderingOrder'])
  const order = (day: string): boolean => roster(state, { day }).some((c) => c.id === 'wanderingOrder' && c.power === 20 && c.tags.includes('steel') && c.tags.includes('arcane'))
  assert.equal(order(addDays(closeOf(6), 1)), true)
  assert.equal(order(closeOf(10)), true)
  assert.equal(order(addDays(closeOf(10), 1)), false, 'gone after 4 weeks')
  // Its stored record comes and goes with it; items it carried go back to the stash.
  const serving = { ...state, settledThrough: { day: closeOf(8), week: 8 } }
  const stored = worldAt(serving, 9).state
  assert.ok(stored.roster.some((c) => c.id === 'wanderingOrder'))
  const armed = { ...stored, roster: stored.roster.map((c) => (c.id === 'wanderingOrder' ? { ...c, items: ['whetstones'] } : c)), settledThrough: { day: closeOf(11), week: 11 } }
  const left = worldAt(quiet(armed, 12), 12).state
  assert.ok(!left.roster.some((c) => c.id === 'wanderingOrder'))
  assert.deepEqual(left.armory?.stash, ['whetstones'])
})

test('Appendix C: the Merchant Caravan offers one item at 40% off for 7 days, on its seeded roll, once the Armory sells items', () => {
  const armed = withMilestones(withPurse(realm(), 1_000), 1)
  const week = Array.from({ length: 20 }, (_, i) => i + 2).find((n) => chance(armed.campaign.seed, closeOf(n), 'event:merchantCaravan', 0.2)) as number
  assert.ok(week)
  assert.deepEqual(fired(worldAt(realm(), week).state), [], 'no items, no caravan')
  const { state } = worldAt(armed, week)
  const ev = newEvents(armed, state).find((e) => e.id === 'merchantCaravan')
  assert.ok(ev)
  const item = (ev.data as { item: string }).item
  const price = CODEX.items.find((i) => i.id === item)?.cost as number
  const shop = (day: string): number => itemOffer({ ...state, settledThrough: { day: addDays(day, -1), week } }, item).cost
  assert.equal(shop(addDays(closeOf(week), 1)), Math.round(price * 0.6 * 10) / 10)
  assert.equal(shop(addDays(closeOf(week), 8)), price, 'the caravan has moved on')
})

test('Appendix C: the Lost Heir: with one rival allied and another at Respect 80, that rival’s Accord opens at 50', () => {
  // The First Fall has already come and gone (resolvedSeen), so no coalition holds the Goblin.
  const allied = withWorld(quiet(withStatus(withCastle(realm(), 3), 'orc', 'allied', closeOf(12)), 13), { resolvedSeen: 1 })
  assert.deepEqual(newEvents(allied, worldAt(withRespect(allied, 'goblin', 79), 13).state), [])
  const { state } = worldAt(withRespect(allied, 'goblin', 80), 13)
  assert.deepEqual(newEvents(allied, state).map((e) => e.id), ['lostHeir'])
  const lowered = withRespect(state, 'goblin', 50)
  assert.equal(accordGate(lowered, 'goblin', addDays(closeOf(13), 1)).threshold, 50)
  assert.equal(accordGate(lowered, 'goblin', addDays(closeOf(13), 1)).ok, true)
  assert.equal(accordGate(withRespect(state, 'dwarf', 50), 'dwarf', addDays(closeOf(13), 1)).reason, 'respect')
})

test('Appendix C: Envoys: a rival at war with another asks for a company for a day: +10 Respect with it, −5 with its foe', () => {
  const atWar = { ...realm(), fronts: { ...realm().fronts, north: { ...realm().fronts.north, state: 'war' as const } } }
  const week = Array.from({ length: 10 }, (_, i) => i + 2).find((n) => chance(atWar.campaign.seed, closeOf(n), 'event:envoys', 0.5)) as number
  assert.deepEqual(fired(worldAt(realm(), week).state), [], 'no front at war, no envoys')
  const { state } = worldAt(atWar, week)
  assert.deepEqual(fired(state), ['envoys'])
  const offer = worldOf(state).offers.find((o) => o.kind === 'envoys')
  assert.ok(offer && offer.kind === 'envoys')
  assert.deepEqual([offer.rival, offer.foe].sort(), ['goblin', 'orc'])
  const today = addDays(closeOf(week), 1)
  const lent = lendToEnvoy(state, 'barracks', today)
  assert.ok(lent.ok)
  assert.equal(lent.state.rivals[offer.rival].respect, 30)
  assert.equal(lent.state.rivals[offer.foe].respect, 15)
  assert.ok(!roster(lent.state, { day: today }).some((c) => c.id === 'barracks'), 'away that day')
  assert.ok(roster(lent.state, { day: addDays(today, 1) }).some((c) => c.id === 'barracks'))
})

test('Gap 7: the Scrying Pool names the next dated event and its week, never its criteria; without the Pool, nothing', () => {
  const state = realm()
  assert.equal(eventHint(state), null)
  const pool = withArmory(state, { wings: ['scryingPool'] })
  assert.ok(realmEffects(pool).eventHints.value > 0)
  assert.deepEqual(eventHint(pool, '2026-10-08'), { eventId: 'beastSurge', week: 10 })
  // After the Hungry Winter's week 10 slot, the next is the Beast Surge in week 11 (it waited), then week 23.
  const winter = { ...pool, worldEvents: [{ id: 'hungryWinter', firedOn: closeOf(9), data: { from: '2026-12-07', until: '2027-01-03' } }] }
  assert.deepEqual(eventHint(winter, closeOf(9)), { eventId: 'beastSurge', week: 10 })
  const surged = { ...winter, worldEvents: [...winter.worldEvents, { id: 'beastSurge', firedOn: closeOf(10), data: { from: closeOf(10), until: closeOf(12) } }] }
  assert.deepEqual(eventHint(surged, addDays(closeOf(12), 1)), { eventId: 'beastSurge', week: 23 })
  // A campaign founded in the summer: the Hungry Winter comes before the first Beast Surge.
  const summer = { ...pool, campaign: { ...pool.campaign, startDate: '2026-09-28' } }
  assert.deepEqual(eventHint(summer, '2026-09-28'), { eventId: 'beastSurge', week: 10 })
  const autumn = { ...pool, campaign: { ...pool.campaign, startDate: '2026-11-02' } }
  assert.deepEqual(eventHint(autumn, '2026-11-02'), { eventId: 'hungryWinter', week: 6 })
})

test('Test 9 (T12): world events, coalitions and resolutions settle once: a catch-up equals week-by-week calls', () => {
  const ledger = ledgerWith('2026-09-10', 260)
  const founded = foundCampaign({ startWeight: 217, goalWeight: 168, charter: charter(), timeZone: TZ, seed: 11, ledger }, FOUNDED_AT)
  const rich = withPurse(founded, 20_000)
  const end = chicago(addDays(closeOf(30), 1))
  const once = settle(rich, ledger, end).state
  let weekly = rich
  for (let n = 1; n <= 30; n++) weekly = settle(weekly, ledger, chicago(addDays(closeOf(n), 1))).state
  assert.deepEqual(weekly, once)
  assert.ok(once.worldEvents.length > 0)
  assert.ok(once.coalitions.length > 0)
  const again = settle(once, ledger, end)
  assert.equal(again.state, once)
  assert.equal(again.events.length, 0)
})
