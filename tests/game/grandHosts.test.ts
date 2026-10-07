import { test } from 'node:test'
import assert from 'node:assert/strict'
import { foundCampaign } from '../../src/renderer/src/lib/game/campaign'
import { addDays } from '../../src/renderer/src/lib/game/clock'
import { isRevealDen } from '../../src/renderer/src/lib/game/combat'
import { realmEffects } from '../../src/renderer/src/lib/game/effects'
import {
  announceGrandBattle,
  announceRequests,
  battleOf,
  challenge,
  hostView,
  incursionRival,
  pendingBattles,
  raiseIncursions,
  warningDays
} from '../../src/renderer/src/lib/game/grand'
import { mythicHost, placeHost, rivalHost } from '../../src/renderer/src/lib/game/grand/hosts'
import { neighbors } from '../../src/renderer/src/lib/game/map'
import { chance } from '../../src/renderer/src/lib/game/rng'
import { settle } from '../../src/renderer/src/lib/game/settle'
import type { CampaignState } from '../../src/renderer/src/lib/game/types'
import { near } from './support/assert'
import { announced, collector, withArmy } from './support/grand'
import { allBuildings, realm, withArmory, withBuildings, withCastle } from './support/realm'
import { START, fight, hex } from './support/war'
import { FOUNDED_AT, TZ, charter, chicago, steadyLedger } from './fixtures/ledgers'

// ── Hosts (A-35, A-47) ───────────────────────────────────────────────────────

test('A-35: an Orc at AV 100 sends a 60 budget, the Warboss (35) plus Brutes (20); at AV 40, Brutes only', () => {
  const at100 = rivalHost(withArmy(realm(), 'orc', [50, 50]), 'orc', 0.6, START)
  assert.deepEqual(at100.map((c) => [c.name, c.power]), [
    ["Ugrak's Warboss", 35],
    ['Brutes', 20]
  ])
  const at40 = rivalHost(withArmy(realm(), 'orc', [40]), 'orc', 0.6, START)
  assert.deepEqual(at40.map((c) => c.name), ['Brutes'])
})

test('A-35: passes add one company of each type that fits, strongest first, up to 6', () => {
  const host = rivalHost(withArmy(realm(), 'orc', [1000]), 'orc', 0.6, START)
  assert.equal(host.length, 6)
  assert.deepEqual(host.slice(0, 5).map((c) => c.name), ["Ugrak's Warboss", 'Brutes', 'Wolf Riders', 'Shamans', 'Grunts'])
})

test('Ch 11 / A-47: Mythic rosters scale by 1 + week ÷ 52; a week-26 Basilisk has power 90 and health 540', () => {
  const [basilisk] = mythicHost('basilisk', 26)
  near(basilisk.power, 90)
  const [placed] = placeHost([basilisk])
  near(placed.health, 540)
  assert.equal(placed.slot, 'center:front')
  assert.equal(mythicHost('wyvernBrood', 0).length, 4)
})

test('A-159: a host stands melee in the fronts, ranged in the rears, strongest in the center', () => {
  const host = rivalHost(withArmy(realm(), 'orc', [1000]), 'orc', 0.6, START)
  const placed = placeHost(host)
  assert.equal(placed.find((u) => u.slot === 'center:front')?.name, "Ugrak's Warboss")
  assert.equal(placed.find((u) => u.name === 'Shamans')?.slot, 'center:rear')
})

test('Ch 11: the Herald shows the host as bands; Mage Tower IV or the Observatory reveal the roster', () => {
  const state = withArmy(realm(), 'orc', [100])
  const gate = state.hexes.find((h) => h.kind === 'gate' && h.owner === 'orc')!
  const { state: s, battle } = announced(state, { trigger: 'gate', hexId: gate.id, announcedOn: START, rival: 'orc' })
  const hidden = hostView(s, battle)
  assert.equal(hidden.revealed, false)
  assert.equal(hidden.roster, undefined)
  assert.ok(!JSON.stringify(hidden).includes('35'), 'no power reaches the view')
  assert.equal(hidden.commander, true)
  const shown = hostView(withArmory(s, { wings: ['observatory'] }), battle)
  assert.equal(shown.revealed, true)
  assert.deepEqual(shown.roster?.map((r) => r.power), [35, 20])
  assert.equal(hostView(withBuildings(s, { mageTower: 4 }), battle).revealed, true)
})

// ── Warnings and the queue ───────────────────────────────────────────────────

test('Ch 11: no two Grand Battles within 5 days: triggers on day 10 and 12 put the second on day 15 or later', () => {
  let state = withArmy(realm(), 'orc', [100])
  const day10 = addDays(START, 10)
  const day12 = addDays(START, 12)
  const gate = state.hexes.find((h) => h.kind === 'gate' && h.owner === 'orc')!
  const mouth = state.hexes.find((h) => h.kind === 'lairMouth')!
  const first = announced(state, { trigger: 'gate', hexId: gate.id, announcedOn: day10, rival: 'orc' })
  assert.equal(first.battle.battleDate, addDays(day10, 2))
  const second = announced(first.state, { trigger: 'mythicHunt', hexId: mouth.id, announcedOn: day12 })
  assert.ok(second.battle.battleDate >= addDays(START, 15))
  assert.equal(second.battle.battleDate, addDays(first.battle.battleDate, 5))
  assert.deepEqual(second.events.map((e) => e.stage), ['announced', 'queued'])
  state = second.state
  assert.deepEqual(pendingBattles(state).map((b) => b.id), [first.battle.id, second.battle.id])
})

test('Ch 11: warnings are 2, 2, 3 and 2 days (Incursion, Gate, Capital, Mythic Hunt); Mage Tower IV adds a day to every one', () => {
  const plain = realmEffects(realm())
  const tower = realmEffects(withBuildings(realm(), { mageTower: 4 }))
  assert.deepEqual(['incursion', 'gate', 'capital', 'mythicHunt', 'coalitionOffensive', 'siege'].map((t) => warningDays(t as never, plain)), [2, 2, 3, 2, 3, 14])
  assert.deepEqual(['incursion', 'gate', 'capital', 'mythicHunt', 'coalitionOffensive', 'siege'].map((t) => warningDays(t as never, tower)), [3, 3, 4, 3, 4, 15])
})

test('Ch 11: the Capital only while holding its Gate; one battle per hex at a time', () => {
  const state = withArmy(realm(), 'orc', [100])
  const capital = state.hexes.find((h) => h.kind === 'capital' && h.owner === 'orc')!
  const gate = state.hexes.find((h) => h.kind === 'gate' && h.owner === 'orc')!
  const c = collector()
  assert.equal(announceGrandBattle(state, { trigger: 'capital', hexId: capital.id, announcedOn: START, rival: 'orc' }, c.emit).reason, 'gateNotHeld')
  assert.equal(c.of('grandBattle')[0].stage, 'refused')
  const held = { ...state, hexes: state.hexes.map((h) => (h.id === gate.id ? { ...h, owner: 'player' as const } : h)) }
  const a = announced(held, { trigger: 'capital', hexId: capital.id, announcedOn: START, rival: 'orc' })
  assert.equal(addDays(START, 3), a.battle.battleDate)
  assert.equal(announceGrandBattle(a.state, { trigger: 'capital', hexId: capital.id, announcedOn: START, rival: 'orc' }, c.emit).reason, 'alreadyAnnounced')
})

test('Ch 11: a challenge on a Gate the player borders is announced today', () => {
  let state = withArmy(realm(), 'goblin', [100])
  const gate = state.hexes.find((h) => h.kind === 'gate' && h.owner === 'goblin')!
  assert.equal(challenge(state, gate.id, START).reason, 'notTouching')
  const beside = neighbors(gate.id).find((id) => hex(state, id).owner === 'neutral')!
  state = { ...state, hexes: state.hexes.map((h) => (h.id === beside ? { ...h, owner: 'player' as const } : h)) }
  const done = challenge(state, gate.id, START)
  assert.ok(done.ok)
  assert.equal(done.battle?.announcedOn, START)
  assert.ok(done.state.log.some((e) => e.kind === 'grandBattle' && e.stage === 'announced'))
})

// ── Triggers (A-33, gap 5) ───────────────────────────────────────────────────

test('A-33: taking a hex beside a rival’s Gate raises an Incursion from that rival; at most one per rival every 14 days', () => {
  const state = withArmy(realm(), 'dwarf', [100])
  const gate = state.hexes.find((h) => h.kind === 'gate' && h.owner === 'dwarf')!
  const [a, b] = neighbors(gate.id).filter((id) => hex(state, id).owner === 'neutral')
  const take = (s: CampaignState, id: string): CampaignState => ({ ...s, hexes: s.hexes.map((h) => (h.id === id ? { ...h, owner: 'player' as const } : h)) })
  assert.equal(incursionRival(take(state, a), a, 'neutral'), 'dwarf')
  const c = collector()
  const once = raiseIncursions(state, take(state, a), START, c.emit)
  assert.equal(pendingBattles(once).length, 1)
  assert.equal(pendingBattles(once)[0].trigger, 'incursion')
  assert.equal(pendingBattles(once)[0].rival, 'dwarf')
  const twice = raiseIncursions(once, take(once, b), addDays(START, 13), c.emit)
  assert.equal(pendingBattles(twice).length, 1, 'the cooldown refuses quietly')
})

test('A-33: taking one of its hexes while holding 4 it once held raises an Incursion', () => {
  let state = withArmy(realm(), 'orc', [100])
  const orcLand = state.hexes.filter((h) => h.owner === 'orc' && h.kind !== 'gate' && h.kind !== 'capital').slice(0, 5)
  const far = state.hexes.find((h) => h.owner === 'neutral' && h.ring === 2)!
  assert.equal(incursionRival(state, far.id, 'neutral'), null)
  // The founding villages count as once held; give the player four, then take a fifth from the Orc.
  const once = state.hexes.filter((h) => h.owner === 'orc').map((h) => h.id)
  const log = once.map((id, i) => ({ id: `t-${i}`, day: START, kind: 'hexTransfer' as const, hexId: id, from: 'neutral' as const, to: 'orc' as const, how: 'event' as const }))
  state = { ...state, log: [...state.log, ...log] }
  const given = once.slice(0, 4)
  state = { ...state, hexes: state.hexes.map((h) => (given.includes(h.id) ? { ...h, owner: 'player' as const } : h)) }
  const fifth = once[4] ?? orcLand[0].id
  const took = { ...state, hexes: state.hexes.map((h) => (h.id === fifth ? { ...h, owner: 'player' as const } : h)) }
  assert.equal(incursionRival(took, fifth, 'orc'), 'orc')
})

test('Ch 11 / gap 5: 8% of assaults on ring 4–5 West and East beast dens reveal a rare creature: a Mythic Hunt there', () => {
  const state = allBuildings(withCastle(realm(), 3), 5)
  const dens = state.hexes.filter((h) => isRevealDen(h))
  assert.ok(dens.length > 0)
  assert.ok(dens.every((h) => h.ring >= 4 && (h.land === 'west' || h.land === 'east') && h.owner === 'neutral' && !h.village))
  // Find a day and den where the seeded draw reveals, then assault it from a held neighbor.
  let found: { day: string; den: string } | null = null
  for (let i = 0; i < 400 && !found; i++) {
    const day = addDays(START, i)
    const den = dens.find((d) => chance(state.campaign.seed, day, `reveal:${d.id}`, 0.08))
    if (den) found = { day, den: den.id }
  }
  assert.ok(found)
  const { day, den } = found!
  const base = neighbors(den).find((id) => hex(state, id).ring < hex(state, den).ring)!
  let s: CampaignState = { ...state, hexes: state.hexes.map((h) => (h.id === base ? { ...h, owner: 'player' as const } : h)) }
  s = { ...s, orders: [{ date: day, assaultTarget: den, assault: ['barracks', 'foundry'], defense: [] }] }
  const fought = fight(s, day, 1)
  assert.deepEqual(fought.of('assault')[0], { hexId: den, owner: 'neutral', outcome: 'revealed' })
  assert.equal(fought.grandBattles[0].reveal, true)
  assert.equal(hex(fought.state, den).owner, 'neutral')
  const c = collector()
  const next = announceRequests(fought.state, fought.grandBattles, addDays(day, 1), c.emit)
  const hunt = pendingBattles(next)[0]
  assert.equal(hunt.trigger, 'mythicHunt')
  assert.equal(hunt.revealed, true)
  const lair = hex(state, den).land === 'west' ? 'wyrmfells' : 'thornwild'
  assert.ok(['wyvernBrood', 'basilisk', 'griffinFlight', 'manticore'].includes(hunt.quarry!))
  assert.equal(lair === 'wyrmfells', ['wyvernBrood', 'basilisk'].includes(hunt.quarry!))
})

// ── Settlement (Test 9 part, gap 1, gap 3) ───────────────────────────────────

function founded(): CampaignState {
  return foundCampaign({ startWeight: 217, goalWeight: 168, charter: charter(), timeZone: TZ, seed: 7, ledger: steadyLedger('2026-09-10', 90) }, FOUNDED_AT)
}

test('Test 9 (part): an unfought battle auto-resolves at its day’s close, exactly once', () => {
  const ledger = steadyLedger('2026-09-10', 90)
  let state = withArmy(founded(), 'orc', [100])
  const gate = state.hexes.find((h) => h.kind === 'gate' && h.owner === 'orc')!
  state = announced(state, { trigger: 'gate', hexId: gate.id, announcedOn: START, rival: 'orc' }).state
  const battle = state.grandBattles[0]
  const before = settle(state, ledger, chicago(battle.battleDate)).state
  assert.equal(battleOf(before, battle.id)!.result, undefined, 'not before its day closes')
  const after = settle(before, ledger, chicago(addDays(battle.battleDate, 1)))
  const fought = after.events.filter((e) => e.kind === 'grandBattle' && e.stage === 'fought')
  assert.equal(fought.length, 1)
  assert.equal(fought[0].day, battle.battleDate)
  assert.ok(battleOf(after.state, battle.id)!.result)
  const again = settle(after.state, ledger, chicago(addDays(battle.battleDate, 1)))
  assert.deepEqual(again.state, after.state)
  assert.equal(again.events.length, 0)
  const later = settle(after.state, ledger, chicago(addDays(battle.battleDate, 4)))
  assert.equal(later.events.filter((e) => e.kind === 'grandBattle' && e.stage === 'fought').length, 0)
})

test('Test 9 (part), gap 1: a Warhost raised at a week close is announced, and fought even when the next settle comes days later', () => {
  const ledger = steadyLedger('2026-09-10', 90)
  let state = founded()
  // The Warhost aims at a claimable border hex in rings 1 to 5 (A-151): give the player one.
  const held = state.hexes.find((h) => h.owner === 'neutral' && h.ring === 2 && !h.village)!
  state = { ...state, hexes: state.hexes.map((h) => (h.id === held.id ? { ...h, owner: 'player' as const } : h)) }
  state = { ...state, rivals: { ...state.rivals, orc: { ...state.rivals.orc, specialFund: 600 } } }
  // The first week closes on Sunday 2026-10-11 (Monday weeks).
  const first = settle(state, ledger, chicago('2026-10-12'))
  const warhost = first.state.grandBattles.find((b) => b.trigger === 'warhost')
  assert.ok(warhost, 'announced at the close that raised it')
  assert.equal(warhost.announcedOn, '2026-10-12')
  assert.equal(warhost.rival, 'orc')
  assert.ok(first.events.some((e) => e.kind === 'grandBattle' && e.stage === 'announced' && e.trigger === 'warhost'))
  const later = settle(first.state, ledger, chicago(addDays(warhost.battleDate, 3)))
  const fought = battleOf(later.state, warhost.id)!
  assert.ok(fought.result)
  assert.equal(fought.foughtOn, warhost.battleDate)
  assert.equal(fought.setup?.marshal, true)
})

test('Gap 3: the Bank posts 2% of the purse at a week close, at most 40', () => {
  const ledger = steadyLedger('2026-09-10', 90)
  /** The interest posted at the first week close, and the purse just before it. */
  const bank = (purse: number): { interest: number; before: number } => {
    let state = withArmory(founded(), { wings: ['theBank'] })
    state = { ...state, purse: { events: [{ id: 'pe-1', date: '2026-10-07', kind: 'earn', amount: purse, source: 'test' }] } }
    const events = settle(state, ledger, chicago('2026-10-12')).state.purse.events
    const at = events.findIndex((e) => e.source === 'interest')
    return { interest: at < 0 ? 0 : events[at].amount, before: events.slice(0, Math.max(0, at)).reduce((s, e) => s + e.amount, 0) }
  }
  const small = bank(1000)
  near(small.interest, Math.round(0.02 * small.before * 10) / 10)
  assert.ok(small.interest > 20 && small.interest < 40, 'the week’s daily income was in the purse at the close')
  assert.equal(bank(5000).interest, 40)
  const none = settle(founded(), ledger, chicago('2026-10-12')).state
  assert.ok(!none.purse.events.some((e) => e.source === 'interest'))
})


