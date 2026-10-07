import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDays } from '../../src/renderer/src/lib/game/clock'
import { CODEX } from '../../src/renderer/src/lib/game/codex'
import {
  armyValue,
  combatOf,
  dawn,
  dawnTiding,
  defenseFor,
  defenseValue,
  drawThreat,
  earlyGraceMult,
  planConquest,
  scheduleThreats,
  strengthBand,
  tagMatch,
  threatStrength,
  tidings
} from '../../src/renderer/src/lib/game/combat'
import { realmEffects } from '../../src/renderer/src/lib/game/effects'
import { settle } from '../../src/renderer/src/lib/game/settle'
import { RULES, base } from '../../src/renderer/src/lib/game/rules'
import type { CampaignState, Deal } from '../../src/renderer/src/lib/game/types'
import { chicago, steadyLedger, withDay } from './fixtures/ledgers'
import { allBuildings, realm, withBuildings, withCastle, withCrossings, withGrace } from './support/realm'
import { START, WEEK6, fight, front, hex, plainHex, withDisposition, withHex, withTiding } from './support/war'
import { near } from './support/assert'


/** A building hex: always the player's and never under a conquest attempt. Daily threats parked here stay out of the way. */
function quietHex(state: CampaignState): string {
  return (state.hexes.find((h) => h.kind === 'building') as CampaignState['hexes'][number]).id
}

// ── Test 3 and matching ──────────────────────────────────────────────────────

test('Test 3 (E-02): the Ch 10 worked battle gives Army 117.9, Defense 116.31 at V 0.97 and 81.29 at V 0.31', () => {
  // Battlemages 18 and Rune Golems 18 (Arcane ×1.5), Wardens 14 ×1.5, Pikemen 14 ×1; a 0.10; W 20; r 0.55.
  const strikes = [18 * 1.5, 18 * 1.5, 14 * 1.5, 14 * 1]
  const full = defenseValue({ strikes, armsBonus: 0.1, walls: 20, fortification: 0, rallyFloor: 0.55, valor: 0.97 })
  const poor = defenseValue({ strikes, armsBonus: 0.1, walls: 20, fortification: 0, rallyFloor: 0.55, valor: 0.31 })
  near(full.army, 117.9, 0.01)
  near(full.defense, 116.31, 0.01)
  near(poor.defense, 81.29, 0.01)
  assert.ok(full.defense >= 115, 'a narrow win against strength 115')
  assert.ok(poor.defense < 115, 'a loss against strength 115')
})

test('Test 3 (E-02): the same battle from a realm state: Castle III, Barracks, Mage Tower and Foundry III, two Brotherhoods, against a Dwarf raid', () => {
  let state = withCastle(withBuildings(realm(), { barracks: 3, mageTower: 3, foundry: 3 }), 3)
  state = withCrossings(state, { barracksMageTower: 2, foundryMageTower: 2 })
  const marches = plainHex(state, 4).id
  const full = defenseFor(state, { hexId: marches, kind: 'raid', rival: 'dwarf', valor: 0.97 })
  near(full.army, 117.9, 0.01)
  // The Battlemages' Brotherhood also brings Warded Steel (+5% rally), which the book's example leaves out:
  // r is 0.60 here, not 0.55. With Warded Steel left out the realm gives the book's numbers exactly.
  const effects = realmEffects(state)
  near(effects.rallyFloor.value, 0.6, 1e-9)
  near(full.defense, 117.9 * (0.6 + 0.4 * 0.97), 0.01)
  const book = { ...effects, rallyFloor: { ...effects.rallyFloor, value: 0.55 } }
  near(defenseFor(state, { hexId: marches, kind: 'raid', rival: 'dwarf', valor: 0.97 }, book).defense, 116.31, 0.01)
  near(defenseFor(state, { hexId: marches, kind: 'raid', rival: 'dwarf', valor: 0.31 }, book).defense, 81.29, 0.01)
})

test('Ch 10 matching: Steel and Arcane against Archmage conjurations (weak to Steel, resists Arcane) strikes at ×1.5', () => {
  const archmage = CODEX.matchups.archmage
  assert.equal(tagMatch(['steel', 'arcane'], archmage), 1.5)
  assert.equal(tagMatch(['arcane'], archmage), 0.6, 'only a resisted tag')
  assert.equal(tagMatch(['coin'], archmage), 1)
  assert.equal(tagMatch(['engine', 'arcane'], CODEX.matchups.dwarf), 1.5, 'Rune Golems against the Dwarf: weakness wins')
})

// ── Strength, the early grace and the siege day ──────────────────────────────

test('Ch 10 early grace: threats strike at 70% in weeks 1 and 2, 85% in weeks 3 and 4, then in full; a Saturday threat is ×1.4', () => {
  const state = realm()
  const effects = realmEffects(state)
  const beasts = (week: number, date: string, daily = true): number =>
    threatStrength(state, effects, { kind: 'beasts', date, ring: 3, roll: 0, week, daily })
  const thursday = '2026-10-08'
  const saturday = '2026-10-10'
  near(beasts(5, thursday), 0.9 * base(3), 1e-9)
  near(beasts(1, thursday), 0.9 * base(3) * 0.7, 1e-9)
  near(beasts(3, thursday), 0.9 * base(3) * 0.85, 1e-9)
  assert.deepEqual([1, 2, 3, 4, 5].map(earlyGraceMult), [0.7, 0.7, 0.85, 0.85, 1])
  near(beasts(5, saturday) / beasts(5, thursday), 1.4, 1e-9)
  near(beasts(1, saturday) / beasts(1, thursday), 1.4, 1e-9)
  near(beasts(5, saturday, false), beasts(5, thursday), 1e-9) // only the daily threat gets the siege day
})

test('Ch 10 strength: mythics 1.15 × base, raids max(0.8 × base, 0.25 × AV × temper) with Respect 25 and the Spy Network, conquests max(base, 0.5 × AV)', () => {
  let state = realm()
  const effects = realmEffects(state)
  const t = { date: '2026-11-12', ring: 4, roll: 0, week: 6, daily: true }
  near(threatStrength(state, effects, { ...t, kind: 'mythic' }), 1.15 * 115, 1e-9) // Mage Tower I takes nothing off
  const orcAv = armyValue(state, 'orc')
  near(threatStrength(state, effects, { ...t, kind: 'raid', rival: 'orc' }), Math.max(0.8 * 115, 0.25 * orcAv * 1.2), 1e-9)
  near(threatStrength(state, effects, { ...t, kind: 'conquest', rival: 'orc' }), Math.max(115, 0.5 * orcAv), 1e-9)
  // A big army takes over from the base; Respect 25 and the Spy Network each take 10% off.
  state = {
    ...state,
    rivals: { ...state.rivals, orc: { ...state.rivals.orc, respect: 25, companies: [{ ...state.rivals.orc.companies[0], power: 1_000 }] } }
  }
  state = withCrossings(withBuildings(state, { mageTower: 2, merchantHall: 2 }), { mageTowerMerchantHall: 2 })
  const raid = threatStrength(state, realmEffects(state), { ...t, kind: 'raid', rival: 'orc' })
  near(raid, 0.25 * 1_000 * 1.2 * 0.9 * 0.9, 1e-9)
  near(threatStrength(state, realmEffects(state), { ...t, kind: 'conquest', rival: 'orc' }), 500, 1e-9)
})

// ── The schedule and determinism ─────────────────────────────────────────────

test('Determinism (Ch 2 rule 7): the same seed and day give the same threat type, target and roll; other seeds differ', () => {
  const a = realm()
  const b = realm()
  const days = Array.from({ length: 21 }, (_, i) => addDays(START, i))
  for (const day of days) assert.deepEqual(dawnTiding(a, day), dawnTiding(b, day))
  const reseeded = { ...a, campaign: { ...a.campaign, seed: 8 } }
  const differs = days.some((day) => JSON.stringify(dawnTiding(reseeded, day)) !== JSON.stringify(dawnTiding(a, day)))
  assert.ok(differs, 'a different seed draws a different month')
})

test('A-26: over 10,000 days with all four rivals eligible the mix is 40 / 20 / 40 ± 2 points, and every raid names a raider', () => {
  const state = realm()
  for (const r of ['orc', 'goblin', 'dwarf', 'archmage'] as const) assert.equal(state.rivals[r].disposition.player, 'tension')
  const count = { beasts: 0, mythic: 0, raid: 0 }
  const raiders = new Set<string>()
  const n = 10_000
  for (let i = 0; i < n; i++) {
    const t = drawThreat(state, addDays(START, i))
    count[t.kind]++
    if (t.kind === 'raid') {
      assert.ok(t.rival)
      raiders.add(t.rival)
    }
  }
  near(count.beasts / n, 0.4, 0.02)
  near(count.mythic / n, 0.2, 0.02)
  near(count.raid / n, 0.4, 0.02)
  assert.equal(raiders.size, 4)
})

test('A-26: with no rival able to raid (Peace, or a Truce), a raid day brings beasts', () => {
  let state = realm()
  for (const r of ['orc', 'goblin', 'dwarf'] as const) state = withDisposition(state, r, 'peace')
  const truce: Deal = { id: 'd1', rival: 'archmage', kind: 'truce', madeOn: START, until: addDays(START, 400), price: 30 }
  state = { ...state, deals: [truce] }
  for (let i = 0; i < 200; i++) assert.notEqual(drawThreat(state, addDays(START, i)).kind, 'raid')
})

test('A-28: the schedule is drawn at the week close for the coming week; dawn fixes the target on the border as it stands', () => {
  const state = realm()
  const scheduled = scheduleThreats(state, '2026-10-12', '2026-10-18')
  assert.deepEqual(
    combatOf(scheduled).schedule.map((s) => s.date),
    Array.from({ length: 7 }, (_, i) => addDays('2026-10-12', i))
  )
  assert.equal(scheduleThreats(scheduled, '2026-10-12', '2026-10-18'), scheduled, 'drawing again changes nothing')
  const dawned = dawn(scheduled, '2026-10-12')
  const fixed = combatOf(dawned).tidings.find((t) => t.date === '2026-10-12')
  assert.ok(fixed)
  assert.equal(hex(dawned, fixed.hexId).owner, 'player')
  assert.equal(dawn(dawned, '2026-10-12'), dawned, 'a dawn runs once')
  assert.equal(fixed.kind, combatOf(scheduled).schedule[0].kind)
})

// ── Conquest attempts and contested hexes ────────────────────────────────────

test('Ch 10 rule 6: no conquest attempt is accepted before week 6; one is accepted in week 6 at max(base, 0.5 × AV) ±15%', () => {
  const { state, inner } = front(realm(), 'orc')
  const early = planConquest(state, { rival: 'orc', hexId: inner, announcedOn: addDays(WEEK6, -2) })
  assert.equal(early.ok, false)
  assert.equal(!early.ok && early.reason, 'tooEarly')
  const ok = planConquest(state, { rival: 'orc', hexId: inner, announcedOn: addDays(WEEK6, -1) })
  assert.ok(ok.ok)
  if (ok.ok) {
    assert.equal(ok.attempt.date, WEEK6)
    const expected = Math.max(base(3), 0.5 * armyValue(state, 'orc'))
    assert.ok(ok.attempt.strength >= expected * 0.85 && ok.attempt.strength <= expected * 1.15)
  }
})

test('Ch 10: conquest attempts need War, a border hex in ring 3 or beyond touching the rival, and no Truce; one per rival a day', () => {
  const { state, inner } = front(realm(), 'orc')
  const at = { rival: 'orc' as const, hexId: inner, announcedOn: addDays(WEEK6, -1) }
  const reason = (s: CampaignState, a = at): string | undefined => {
    const r = planConquest(s, a)
    return r.ok ? undefined : r.reason
  }
  assert.equal(reason(withDisposition(state, 'orc', 'tension')), 'notAtWar')
  assert.equal(reason({ ...state, deals: [{ id: 't', rival: 'orc', kind: 'truce', madeOn: WEEK6, until: WEEK6, price: 90 }] }), 'blocked')
  assert.equal(reason({ ...state, deals: [{ id: 'p', rival: 'orc', kind: 'pact', madeOn: WEEK6, until: addDays(WEEK6, 27), price: 250 }] }), 'blocked')
  assert.equal(reason(state, { ...at, rival: 'orc', hexId: plainHex(state, 3, (h) => h.owner === 'neutral').id }), 'notPlayerHex')
  const ring2 = front(realm(), 'orc', 2)
  assert.equal(reason(ring2.state, { ...at, hexId: ring2.inner }), 'innerRing')
  const once = planConquest(state, at)
  assert.ok(once.ok)
  assert.equal(reason(once.state), 'onePerDay')
})

test('Contested flow: lose a conquest attempt and the hex is contested 1 day; win the next day and the attempt is broken', () => {
  const { state: base0, inner } = front(realm(), 'orc')
  const planned = planConquest(base0, { rival: 'orc', hexId: inner, announcedOn: addDays(WEEK6, -1) })
  assert.ok(planned.ok)
  let state = withTiding(planned.state, { date: WEEK6, kind: 'beasts', hexId: quietHex(base0), strength: 1 })
  const lost = fight(state, WEEK6, 0)
  const report = lost.of('defense').find((e) => e.hexId === inner)
  assert.equal(report?.outcome, 'defeat')
  assert.equal(report?.contested, true)
  assert.equal(report?.contestedUntil, addDays(WEEK6, 1))
  assert.equal(hex(lost.state, inner).status, 'contested')
  assert.equal(hex(lost.state, inner).owner, 'player')
  assert.equal(combatOf(lost.state).contested.length, 1)

  // A stronger realm holds the next day: the same force strikes again at the same strength, and breaks.
  state = withTiding(withCastle(allBuildings(lost.state, 5), 5), { date: addDays(WEEK6, 1), kind: 'beasts', hexId: quietHex(base0), strength: 1 })
  const held = fight(state, addDays(WEEK6, 1), 1)
  const again = held.of('defense').find((e) => e.hexId === inner)
  assert.equal(again?.restrike, true)
  assert.notEqual(again?.outcome, 'defeat')
  assert.equal(again?.broken, true)
  assert.equal(hex(held.state, inner).status, 'held')
  assert.equal(hex(held.state, inner).owner, 'player')
  assert.deepEqual(combatOf(held.state).contested, [])
})

test('Contested flow: lose again the next day and the hex passes to the rival at dawn', () => {
  const { state: base0, inner } = front(realm(), 'orc')
  const planned = planConquest(base0, { rival: 'orc', hexId: inner, announcedOn: addDays(WEEK6, -1) })
  assert.ok(planned.ok)
  const quiet = (s: CampaignState, d: string): CampaignState => withTiding(s, { date: d, kind: 'beasts', hexId: quietHex(base0), strength: 1 })
  const day1 = fight(quiet(planned.state, WEEK6), WEEK6, 0)
  const day2 = fight(quiet(day1.state, addDays(WEEK6, 1)), addDays(WEEK6, 1), 0)
  assert.deepEqual(day2.of('hexTransfer'), [{ hexId: inner, from: 'player', to: 'orc', how: 'conquest' }])
  const lost = hex(day2.state, inner)
  assert.equal(lost.owner, 'orc')
  assert.equal(lost.status, 'held')
  assert.equal(lost.garrison, base(3) * RULES.land.rivalGarrisonMult.orc)
  assert.deepEqual(combatOf(day2.state).contested, [])
})

test('Contested flow at Grace II: the hex holds 2 days, and passes only on the second lost restrike', () => {
  const { state: base0, inner } = front(withGrace(realm(), 2), 'orc')
  const planned = planConquest(base0, { rival: 'orc', hexId: inner, announcedOn: addDays(WEEK6, -1) })
  assert.ok(planned.ok)
  const quiet = (s: CampaignState, d: string): CampaignState => withTiding(s, { date: d, kind: 'beasts', hexId: quietHex(base0), strength: 1 })
  const day1 = fight(quiet(planned.state, WEEK6), WEEK6, 0)
  assert.equal(day1.of('defense').find((e) => e.hexId === inner)?.contestedUntil, addDays(WEEK6, 2))
  const day2 = fight(quiet(day1.state, addDays(WEEK6, 1)), addDays(WEEK6, 1), 0)
  assert.equal(hex(day2.state, inner).owner, 'player')
  assert.equal(hex(day2.state, inner).status, 'contested')
  assert.deepEqual(day2.of('hexTransfer'), [])
  const day3 = fight(quiet(day2.state, addDays(WEEK6, 2)), addDays(WEEK6, 2), 0)
  assert.equal(hex(day3.state, inner).owner, 'orc')
})

test('Test 10 (part): a ring-2 hex that loses a conquest-strength battle never changes owner; it is only scorched', () => {
  const { state: base0, inner } = front(realm(), 'orc', 2)
  const attempt = { rival: 'orc' as const, hexId: inner, announcedOn: addDays(WEEK6, -1), date: WEEK6, strength: 10_000 }
  let state: CampaignState = { ...base0, combat: { schedule: [], tidings: [], conquests: [attempt], contested: [] } }
  state = withTiding(state, { date: WEEK6, kind: 'beasts', hexId: quietHex(base0), strength: 1 })
  const day1 = fight(state, WEEK6, 0)
  assert.equal(day1.of('defense').find((e) => e.hexId === inner)?.outcome, 'defeat')
  assert.equal(hex(day1.state, inner).owner, 'player')
  assert.equal(hex(day1.state, inner).status, 'scorched')
  assert.deepEqual(combatOf(day1.state).contested, [])
  assert.deepEqual(day1.of('hexTransfer'), [])
})

test('Ch 10: a Truce called after the announcement calls the attempt off', () => {
  const { state: base0, inner } = front(realm(), 'orc')
  const planned = planConquest(base0, { rival: 'orc', hexId: inner, announcedOn: addDays(WEEK6, -1) })
  assert.ok(planned.ok)
  let state = withTiding(planned.state, { date: WEEK6, kind: 'beasts', hexId: quietHex(base0), strength: 1 })
  state = { ...state, deals: [{ id: 't', rival: 'orc', kind: 'truce', madeOn: WEEK6, until: addDays(WEEK6, 6), price: 90 }] }
  const day = fight(state, WEEK6, 0)
  assert.deepEqual(day.of('calledOff'), [{ threat: 'conquest', hexId: inner, rival: 'orc' }])
  assert.equal(hex(day.state, inner).status, 'held')
})

// ── Outcomes of the daily threat ─────────────────────────────────────────────

test('Ch 10 outcomes: a rout pays 6 × ring, a victory 4 × ring (with the Merchant Hall bonus); Bounties double spoils against beasts', () => {
  const state = realm()
  const target = quietHex(state)
  const day = '2026-10-08'
  const bonus = 1 + realmEffects(state).reputationBonus.value
  const rout = fight(withTiding(state, { date: day, kind: 'beasts', hexId: target, strength: 1 }), day, 1)
  assert.deepEqual(rout.of('defense').map((e) => [e.outcome, e.spoils]), [['rout', Math.round(6 * 1 * bonus * 10) / 10]])
  // Defense here is (7.5 + 7.5 + 4) × 1 = 19: a victory against 15, a rout below 12.67.
  const win = fight(withTiding(state, { date: day, kind: 'beasts', hexId: target, strength: 15 }), day, 1)
  assert.deepEqual(win.of('defense').map((e) => [e.outcome, e.spoils]), [['victory', Math.round(4 * bonus * 10) / 10]])
  const bounties = withCrossings(withBuildings(state, { barracks: 3, merchantHall: 3 }), { barracksMerchantHall: 2 })
  const bonus2 = 1 + realmEffects(bounties).reputationBonus.value
  const doubled = fight(withTiding(bounties, { date: day, kind: 'beasts', hexId: target, strength: 1 }), day, 1)
  assert.deepEqual(doubled.of('defense').map((e) => e.spoils), [Math.round(6 * 2 * bonus2 * 10) / 10])
})

test('Ch 10 outcomes: a lost daily threat costs 3 × ring tribute and scorches the hex for 3 days; land is never lost', () => {
  const state = realm()
  const ring2 = plainHex(state, 2).id
  const owned = withHex(state, ring2, { owner: 'player' })
  const day = '2026-10-08'
  const lost = fight(withTiding(owned, { date: day, kind: 'beasts', hexId: ring2, strength: 1_000 }), day, 0)
  const report = lost.of('defense')[0]
  assert.equal(report.outcome, 'defeat')
  assert.equal(report.tribute, 6)
  assert.equal(report.scorchedUntil, addDays(day, 3))
  assert.equal(hex(lost.state, ring2).owner, 'player')
  assert.equal(hex(lost.state, ring2).status, 'scorched')
  assert.equal(lost.state.purse.events.at(-1)?.amount, -6)
})

test('A-130: Grace II halves tribute and Oathguard halves it again; Grand Illusion waives one lost battle’s tribute a week', () => {
  const day = '2026-10-08'
  const lose = (s: CampaignState, d = day): ReturnType<typeof fight> => {
    const ring2 = plainHex(s, 2).id
    return fight(withTiding(withHex(s, ring2, { owner: 'player' }), { date: d, kind: 'beasts', hexId: ring2, strength: 1_000 }), d, 0)
  }
  assert.equal(lose(withGrace(realm(), 2)).of('defense')[0].tribute, 3)
  const oath = withCrossings(withBuildings(withGrace(realm(), 2), { barracks: 4, mageTower: 4 }), { barracksMageTower: 3 })
  assert.equal(lose(oath).of('defense')[0].tribute, 1.5)
  const illusion = withCrossings(withBuildings(realm(), { mageTower: 4, merchantHall: 4 }), { mageTowerMerchantHall: 3 })
  const first = lose(illusion)
  assert.equal(first.of('defense')[0].grandIllusion, true)
  assert.equal(first.of('defense')[0].tribute, undefined)
  const firstLogged = { ...first.state, log: [{ id: 'ev-1', day, kind: 'defense' as const, ...first.of('defense')[0] }] }
  const second = lose(firstLogged, addDays(day, 1))
  assert.equal(second.of('defense')[0].grandIllusion, undefined, 'once a week')
  assert.ok((second.of('defense')[0].tribute ?? 0) > 0)
})

test('Respect: a defeated raid gives +3 with its raider, a lost one −2', () => {
  const state = realm()
  const target = quietHex(state)
  const day = '2026-10-08'
  const won = fight(withTiding(state, { date: day, kind: 'raid', rival: 'orc', hexId: target, strength: 1 }), day, 1)
  assert.equal(won.state.rivals.orc.respect, state.rivals.orc.respect + 3)
  assert.deepEqual(won.of('respect'), [{ rival: 'orc', change: 3, reason: 'raidDefeated' }])
  const lost = fight(withTiding(state, { date: day, kind: 'raid', rival: 'orc', hexId: target, strength: 1_000 }), day, 0)
  assert.equal(lost.state.rivals.orc.respect, state.rivals.orc.respect - 2)
})

test('A-131: a mythic victory posts a trophy for the Armory to grant', () => {
  const state = realm()
  const day = '2026-10-08'
  const won = fight(withTiding(state, { date: day, kind: 'mythic', hexId: quietHex(state), strength: 1 }), day, 1)
  assert.equal(won.of('trophy').length, 1)
  assert.equal(won.of('trophy')[0].source, 'mythic')
})

// ── What the Herald shows ────────────────────────────────────────────────────

test('Hidden stays hidden: tidings band a threat’s strength, and show the number only with Mage Tower IV or the Spy Network', () => {
  const state = dawn(realm(), START)
  const plain = tidings(state, START)
  assert.equal(plain.threats.length, 1)
  assert.equal(plain.threats[0].strength, undefined)
  assert.ok(['weaker', 'matched', 'stronger', 'overwhelming'].includes(plain.threats[0].band ?? ''))
  assert.equal(JSON.stringify(plain).includes(String(combatOf(state).tidings[0].strength)), false)
  const tower = withBuildings(state, { mageTower: 4 })
  near(tidings(tower, START).threats[0].strength ?? 0, combatOf(state).tidings[0].strength, 1e-9)
  const spies = withCrossings(withBuildings(state, { mageTower: 3, merchantHall: 3 }), { mageTowerMerchantHall: 2 })
  assert.ok(tidings(spies, START).threats[0].strength !== undefined)
})

test('Tidings: a later day shows only what the realm foretells; Mage Tower IV shows tomorrow’s threat', () => {
  // A dawn on a Monday has the whole week scheduled, so tomorrow can be foretold.
  const monday = '2026-10-12'
  const plain = dawn(scheduleThreats(realm(), monday, '2026-10-18'), monday)
  assert.deepEqual(tidings({ ...plain, settledThrough: { day: '2026-10-11', week: 1 } }, addDays(monday, 1)).threats, [])
  const tower = dawn(scheduleThreats(withBuildings(realm(), { mageTower: 4 }), monday, '2026-10-18'), monday)
  const ahead = tidings({ ...tower, settledThrough: { day: '2026-10-11', week: 1 } }, addDays(monday, 1))
  assert.equal(ahead.threats.length, 1)
  assert.equal(combatOf(tower).tidings.some((t) => t.date === addDays(monday, 1)), true, 'a foretold tiding is fixed when it is told')
})

test('strengthBand: Weaker below 0.8 × Army, Matched to 1.25 ×, Stronger to 2 ×, then Overwhelming (A-133)', () => {
  assert.deepEqual([79, 80, 125, 126, 200, 201].map((s) => strengthBand(s, 100)), ['weaker', 'matched', 'matched', 'stronger', 'stronger', 'overwhelming'])
})

// ── Settlement ───────────────────────────────────────────────────────────────

test('Test 9 (part): a battle settles once; a correction to yesterday inside the grace window never reruns it', () => {
  const ledger = steadyLedger('2026-09-10', 70)
  const founded = realm(7, ledger)
  const first = settle(founded, ledger, chicago('2026-10-10'))
  const battles = first.state.log.filter((e) => e.kind === 'defense' || e.kind === 'assault' || e.kind === 'hexTransfer')
  assert.equal(battles.filter((e) => e.kind === 'defense').length, 2, 'one daily threat on each of the two days')
  // Yesterday (2026-10-09) loses its duties and food: its Valor falls from about 1 to about 0.3.
  const corrected = withDay(ledger, '2026-10-09', (d) => ({ ...d, done: {}, eaten: undefined }))
  const second = settle(first.state, corrected, chicago('2026-10-10', 600))
  const snapshot = second.state.settlement.snapshots.find((x) => x.date === '2026-10-09')
  assert.equal(snapshot?.dutiesKept, 0, 'the correction was taken in')
  assert.deepEqual(
    second.state.log.filter((e) => e.kind === 'defense' || e.kind === 'assault' || e.kind === 'hexTransfer'),
    battles
  )
  assert.deepEqual(second.state.hexes, first.state.hexes)
  assert.deepEqual(
    second.state.purse.events.filter((e) => e.kind === 'spoils' || e.kind === 'tribute'),
    first.state.purse.events.filter((e) => e.kind === 'spoils' || e.kind === 'tribute')
  )
  assert.equal(second.events.some((e) => e.kind === 'defense'), false)
})

test('Settlement: every settled day fights its daily threat, and the open day’s tidings are fixed at its dawn', () => {
  const ledger = steadyLedger('2026-09-10', 70)
  const founded = realm(7, ledger)
  const { state, events } = settle(founded, ledger, chicago('2026-10-15'))
  const days = events.filter((e) => e.kind === 'defense' || e.kind === 'calledOff').map((e) => e.day)
  assert.deepEqual([...new Set(days)], ['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14'])
  assert.deepEqual(combatOf(state).tidings.map((t) => t.date), ['2026-10-15'])
  assert.ok(combatOf(state).schedule.every((s) => s.date > '2026-10-14'))
  assert.equal(combatOf(state).schedule.at(-1)?.date, '2026-10-18')
})
