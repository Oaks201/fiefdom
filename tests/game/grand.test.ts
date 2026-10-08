import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { CODEX } from '../../src/renderer/src/lib/game/codex'
import { addDays } from '../../src/renderer/src/lib/game/clock'
import { baseArmyValue } from '../../src/renderer/src/lib/game/combat'
import { balance } from '../../src/renderer/src/lib/game/economy'
import { realmEffects } from '../../src/renderer/src/lib/game/effects'
import {
  announceGrandBattle,
  autoResolve,
  battleOf,
  begin,
  companyLimit,
  formationProblem,
  offeredOrders,
  playRound,
  readiness,
  replay,
  result,
  setDoctrine,
  setFormation
} from '../../src/renderer/src/lib/game/grand'
import {
  interpret,
  marshalPlay,
  orderMods,
  playRoundOn,
  replayField,
  startField,
  startMods,
  unitMods,
  validTargets,
  type Holder
} from '../../src/renderer/src/lib/game/grand/field'
import { neighbors } from '../../src/renderer/src/lib/game/map'
import { RULES } from '../../src/renderer/src/lib/game/rules'
import type { CampaignState, Effect, GrandBattle } from '../../src/renderer/src/lib/game/types'
import { near } from './support/assert'
import { SEVEN_FULL, announced, collector, fieldOf, mine, theirs, withArmy } from './support/grand'
import { allBuildings, realm, withArmory, withCastle, withCrossings, withMilestones, withPurse } from './support/realm'
import { START, hex } from './support/war'

// ── Test 4 and the round ─────────────────────────────────────────────────────

test('Test 4 (E-03, D-03): Knights and Crossbowmen against a charging Brute with Shieldwall: hit 10.8, Brute 40.25, Knights 69', () => {
  const knights = mine('knights', 21, 'center:front')
  const crossbowmen = mine('crossbowmen', 9, 'center:rear', { tags: ['engine'], reach: 'ranged' })
  const brute = theirs('orc', 'brutes', 20, 'center:front')
  assert.equal(knights.health, 84)
  assert.equal(brute.health, 80)
  const field = fieldOf([knights, crossbowmen, brute], { deck: ['shieldwall'] })
  const { field: after, log } = playRoundOn(field, { order: 'shieldwall' })
  assert.equal(log.unitIntents?.[brute.id], 'charge', 'the Orc pattern opens with a Charge')
  const bolt = log.lines.find((l) => l.from === 'crossbowmen') as { dealt: number; amount: number }
  near(bolt.dealt, 10.8)
  near(bolt.amount, 13.5) // the charging Brute takes ×1.25
  near(after.units.find((u) => u.id === brute.id)!.hp, 40.25)
  near(after.units.find((u) => u.id === 'knights')!.hp, 69)
})

test('Ch 11: melee companies in the rear do nothing; ranged rears deal 0.8 × p × m × R; a front deals p × m × R', () => {
  const field = fieldOf([mine('a', 10, 'left:front'), mine('b', 10, 'left:rear'), mine('c', 10, 'right:rear', { reach: 'ranged' }), theirs('goblin', 'hiredOgres', 24, 'left:front'), theirs('goblin', 'sneaks', 6, 'right:front')], {
    readiness: 0.8
  })
  // Goblins resist Steel (×0.6); round 1 is a Shift, which strikes normally.
  const { log } = playRoundOn(field, {})
  assert.ok(!log.lines.some((l) => l.from === 'b'))
  near(log.lines.find((l) => l.from === 'a')!.amount, 10 * 0.6 * 0.8)
  near(log.lines.find((l) => l.from === 'c')!.amount, 0.8 * 10 * 0.6 * 0.8)
})

test('Ch 11: Brace deals and takes ×0.5; Siege Engines and the Sappers ignore it', () => {
  const dwarf = theirs('dwarf', 'hammerers', 24, 'center:front')
  const field = fieldOf([mine('a', 20, 'center:front', { tags: ['coin'] }), dwarf], { deck: ['siegeEngines'] })
  const braced = playRoundOn(field, {}).log
  assert.equal(braced.unitIntents?.[dwarf.id], 'brace')
  near(braced.lines.find((l) => l.from === 'a')!.amount, 20 * 0.5)
  near(braced.lines.find((l) => l.from === dwarf.id)!.amount, 24 * 0.5)
  near(playRoundOn(field, { order: 'siegeEngines' }).log.lines.find((l) => l.from === 'a')!.amount, 20)
  const sappers = fieldOf([mine('sappers', 16, 'center:front', { tags: ['engine'], mods: unitMods('sappers', [], 'melee').mods }), dwarf])
  // Dwarves resist Engine (×0.6), but the Sappers ignore the Brace.
  near(playRoundOn(sappers, {}).log.lines.find((l) => l.from === 'sappers')!.amount, 16 * 0.6)
})

test('Ch 11: Volley hits the rear; Spell hits both companies in the lane for 0.5 × power', () => {
  const field = fieldOf([mine('front', 10, 'center:front'), mine('rear', 10, 'center:rear', { reach: 'ranged' }), theirs('mythic', 'wyvern', 18, 'center:front')])
  const wyvern = playRoundOn(field, {}).log.lines.find((l) => l.from === 'mythic:wyvern:1')!
  assert.equal(wyvern.to, 'rear')
  const shamans = fieldOf([mine('front', 10, 'left:front'), mine('rear', 10, 'left:rear', { reach: 'ranged' }), theirs('orc', 'shamans', 12, 'left:rear', { reach: 'ranged' })])
  const spells = playRoundOn(shamans, {}).log.lines.filter((l) => l.note === 'spell')
  assert.deepEqual(spells.map((l) => l.to).sort(), ['front', 'rear'])
  for (const l of spells) near(l.amount, 6)
})

test('Ch 11: Shift moves at the round end (to the neighbor with the weaker player front, A-160); routed fronts are replaced by their rear', () => {
  const sneak = theirs('goblin', 'sneaks', 6, 'center:front')
  const field = fieldOf([mine('left', 30, 'left:front'), mine('right', 5, 'right:front'), mine('guard', 2, 'center:front', { health: 1 }), mine('back', 9, 'center:rear', { reach: 'ranged' }), sneak])
  const { field: after } = playRoundOn(field, {})
  assert.equal(after.units.find((u) => u.id === sneak.id)!.at, 'right:front')
  assert.equal(after.units.find((u) => u.id === 'guard')!.routed, true)
  assert.equal(after.units.find((u) => u.id === 'back')!.at, 'center:front')
})

test('Ch 11: Hold Fast keeps companies on the field at 0; the Sworn cannot rout in round 1', () => {
  const field = fieldOf([mine('a', 2, 'center:front', { health: 1 }), theirs('orc', 'brutes', 20, 'center:front')], { deck: ['holdFast'] })
  assert.equal(playRoundOn(field, {}).field.units[0].routed, true)
  const held = playRoundOn(field, { order: 'holdFast' }).field.units[0]
  assert.equal(held.routed, false)
  assert.equal(held.hp, 0)
  const sworn = fieldOf([mine('sworn', 24, 'center:front', { health: 1, mods: unitMods('sworn', [], 'melee').mods }), theirs('orc', 'brutes', 20, 'center:front')])
  const r1 = playRoundOn(sworn, {})
  assert.equal(r1.field.units[0].routed, false)
  assert.equal(playRoundOn(r1.field, {}).field.units[0].routed, true)
})

test('Ch 11: after round 4 the higher health share wins; a wipe or twice the share is a Rout', () => {
  const field = fieldOf([mine('a', 50, 'center:front'), theirs('orc', 'grunts', 8, 'center:front')])
  let f = field
  for (let i = 0; i < RULES.grandBattles.rounds && f.units.some((u) => u.side === 'enemy' && !u.routed); i++) f = playRoundOn(f, {}).field
  assert.ok(f.units.filter((u) => u.side === 'enemy').every((u) => u.routed))
})

// ── Items and abilities on the field ─────────────────────────────────────────

test('Appendix C: Tower Shields give +20% health, the Healer’s Satchel heals 15% a round', () => {
  assert.equal(unitMods('x', ['towerShields'], 'melee').healthMult, 1.2)
  const satchel = unitMods('x', ['healersSatchel'], 'melee').mods
  assert.equal(satchel.heal, 0.15)
  const field = fieldOf([mine('x', 20, 'center:front', { mods: satchel }), theirs('orc', 'brutes', 20, 'center:front')])
  const after = playRoundOn(field, {}).field.units[0]
  // The Brute charges for 30; the Satchel heals 15% of 80 after the exchange.
  near(after.hp, 80 - 30 + 0.15 * 80)
})

test('Appendix C: Cold Iron Edges let a Coin-only company strike the Archmage’s conjurations at ×1.5', () => {
  const coin = fieldOf([mine('watch', 10, 'center:front', { tags: ['coin'] }), theirs('archmage', 'stoneSentinels', 20, 'center:front')])
  const edged = fieldOf([mine('watch', 10, 'center:front', { tags: ['coin', 'steel'] }), theirs('archmage', 'stoneSentinels', 20, 'center:front')])
  // Round 1 is a Spell for the Archmage, so the Sentinels take no extra.
  near(playRoundOn(coin, {}).log.lines.find((l) => l.from === 'watch')!.amount, 10)
  near(playRoundOn(edged, {}).log.lines.find((l) => l.from === 'watch')!.amount, 15)
})

test('Appendix C: the Oathsworn take 25% less from Charges; Warding Charms −30% from mythics; Stormglass Bolts +25% ranged', () => {
  const oath = fieldOf([mine('oathsworn', 16, 'center:front', { mods: unitMods('oathsworn', [], 'melee').mods }), theirs('orc', 'brutes', 20, 'center:front')])
  near(playRoundOn(oath, {}).log.lines.find((l) => l.to === 'oathsworn')!.amount, 30 * 0.75)
  const warded = fieldOf([mine('w', 16, 'center:front', { mods: unitMods('w', ['wardingCharms'], 'melee').mods }), theirs('mythic', 'basilisk', 60, 'center:front', { health: 360 })])
  near(playRoundOn(warded, {}).log.lines.find((l) => l.to === 'w')!.amount, 30 * 0.7)
  assert.equal(unitMods('b', ['stormglassBolts'], 'ranged').mods.damage, 1.25)
  assert.equal(unitMods('b', ['stormglassBolts'], 'melee').mods.damage, undefined)
})

test('Appendix C: the Starwardens also hit the enemy rear at half; Banner of the Realm +10% power to its lane', () => {
  const star = fieldOf([mine('starwardens', 16, 'center:rear', { tags: ['arcane'], reach: 'ranged', mods: unitMods('starwardens', [], 'ranged').mods }), theirs('orc', 'grunts', 8, 'center:front'), theirs('orc', 'shamans', 12, 'center:rear', { id: 'orc:shamans:2', reach: 'ranged' })])
  const lines = playRoundOn(star, {}).log.lines.filter((l) => l.from === 'starwardens')
  assert.equal(lines.length, 2)
  near(lines.find((l) => l.note === 'splash')!.dealt ?? lines.find((l) => l.note === 'splash')!.amount, 0.8 * 16 * 0.5)
  const bannered = fieldOf([mine('a', 10, 'left:front', { mods: unitMods('a', ['bannerOfTheRealm'], 'melee').mods }), mine('b', 10, 'left:rear', { reach: 'ranged' }), theirs('dwarf', 'thunderers', 14, 'left:front', { reach: 'ranged' })])
  // Dwarves Brace in round 1: ×0.5 taken.
  near(playRoundOn(bannered, {}).log.lines.find((l) => l.from === 'b')!.amount, 0.8 * 10 * 1.1 * 0.5)
})

test('Appendix C: a trophy shrugs off its creature’s special (the Basilisk Eye against Petrify)', () => {
  const plain = fieldOf([mine('a', 20, 'center:front'), theirs('mythic', 'basilisk', 60, 'center:front', { health: 360 })])
  const r1 = playRoundOn(plain, {})
  assert.equal(r1.field.petrified.a, 2)
  assert.ok(!playRoundOn(r1.field, {}).log.lines.some((l) => l.from === 'a'), 'a petrified company deals nothing next round')
  const eye = fieldOf([mine('a', 20, 'center:front', { mods: unitMods('a', ['basiliskEye'], 'melee').mods }), theirs('mythic', 'basilisk', 60, 'center:front', { health: 360 })])
  assert.equal(playRoundOn(eye, {}).field.petrified.a, undefined)
})

test('Appendix C: the Manticore’s Volley lingers, 5 damage a round', () => {
  const field = fieldOf([mine('a', 20, 'center:front'), theirs('mythic', 'manticore', 45, 'center:front', { health: 225 })])
  const r1 = playRoundOn(field, {})
  assert.deepEqual(r1.field.poisoned.a, { perRound: 5, since: 1 })
  assert.ok(playRoundOn(r1.field, {}).log.lines.some((l) => l.note === 'poison' && l.amount === 5))
})

// ── Orders ───────────────────────────────────────────────────────────────────

test('Appendix C: Orders as data: Charge ×1.75 and ×1.25 on one lane, Bribe skips a non-mythic, Firestorm 0.4 × Arcane power, Earthshatter 6 × stage, Confusion braces a lane', () => {
  const units = [mine('a', 20, 'center:front'), mine('mage', 10, 'center:rear', { tags: ['arcane'], reach: 'ranged' }), theirs('orc', 'brutes', 20, 'center:front')]
  const base = fieldOf(units, { deck: ['charge', 'bribe', 'firestorm'], orderStages: {} })
  const charged = playRoundOn(base, { order: 'charge', target: { lane: 'center' } }).log
  near(charged.lines.find((l) => l.from === 'a')!.amount, 20 * 1.75 * 1.25)
  near(charged.lines.find((l) => l.to === 'a')!.amount, 30 * 1.25)
  const bribed = playRoundOn(base, { order: 'bribe', target: { unit: 'orc:brutes:1' } }).log
  assert.ok(!bribed.lines.some((l) => l.from === 'orc:brutes:1'))
  const fire = playRoundOn(base, { order: 'firestorm' }).log.lines.find((l) => l.note === 'firestorm')!
  near(fire.dealt!, 0.4 * 10)
  const quake = fieldOf(units, { deck: ['earthshatter'], orderStages: { earthshatter: 2 } })
  near(playRoundOn(quake, { order: 'earthshatter' }).log.lines.find((l) => l.note === 'earthshatter')!.dealt!, 12)
  const confused = playRoundOn(fieldOf(units, { deck: ['confusion'] }), { order: 'confusion', target: { lane: 'center' } }).log
  assert.equal(confused.unitIntents?.['orc:brutes:1'], 'brace')
  assert.equal(orderMods('bribe', { unit: 'x' }, 0).skip[0], 'x')
})

test('Ch 11 / Appendix C: 3 Orders a round, never repeated within a battle; the Leyline Anchor offers 4', () => {
  let state = withMilestones(withCrossings(allBuildings(withCastle(realm(), 3), 4), { foundryMageTower: 1, barracksMageTower: 1 }), 8)
  state = withArmy(state, 'orc', [60, 60, 60])
  const gate = state.hexes.find((h) => h.kind === 'gate' && h.owner === 'orc')!
  let { state: s, battle } = announced(state, { trigger: 'gate', hexId: gate.id, announcedOn: START, rival: 'orc' })
  s = begin(s, battle.id, { today: battle.battleDate, valors: [0, 0, 0, 0, 0, 0, 0] }).state
  const seen: string[] = []
  for (let round = 1; round <= 4; round++) {
    const offered = offeredOrders(s, battle.id)
    assert.equal(offered.length, 3)
    for (const o of offered) assert.ok(!seen.includes(o), `${o} offered twice`)
    seen.push(...offered)
    const done = playRound(s, battle.id, {}, battle.battleDate)
    if (!done.ok) break
    s = done.state
  }
  assert.ok(seen.length > 3)
  const anchored = withArmory(state, { wings: ['leylineAnchor'] })
  const b2 = announced(anchored, { trigger: 'gate', hexId: gate.id, announcedOn: START, rival: 'orc' })
  const begun = begin(b2.state, b2.battle.id, { today: b2.battle.battleDate, valors: SEVEN_FULL })
  assert.equal(offeredOrders(begun.state, b2.battle.id).length, 4)
})

// ── Readiness, limits and the API ────────────────────────────────────────────

test('Ch 11: Readiness is 1.1 after 7 days of Valor 1, 0.6 after 7 days of 0, 0.7 with the Sanctum; the Marshal fights at R − 0.1', () => {
  const effects = realmEffects(realm())
  near(readiness(SEVEN_FULL, effects), 1.1)
  near(readiness([0, 0, 0, 0, 0, 0, 0], effects), 0.6)
  near(readiness(SEVEN_FULL, effects, true), 1.0)
  const sanctum = realmEffects(withArmory(realm(), { wings: ['sanctum'] }))
  near(readiness([0, 0, 0, 0, 0, 0, 0], sanctum), 0.7)
  near(readiness([0, 0, 0, 0, 0, 0, 0], sanctum, true), 0.7)
})

test('Ch 11: at most banners + 2 companies, never more than 6', () => {
  const state = withCrossings(allBuildings(realm(), 2), { barracksFoundry: 1, barracksMageTower: 1 })
  assert.equal(companyLimit(realmEffects(state)), 4) // Castle I: 2 banners
  assert.equal(companyLimit(realmEffects(withMilestones(withCastle(state, 5), 8))), 6) // 7 banners, still 6
  const gate = state.hexes.find((h) => h.kind === 'gate' && h.owner === 'orc')!
  const { state: s, battle } = announced(withArmy(state, 'orc', [40]), { trigger: 'gate', hexId: gate.id, announcedOn: START, rival: 'orc' })
  const five = { 'left:front': 'barracks', 'center:front': 'merchantHall', 'right:front': 'foundry', 'left:rear': 'mageTower', 'center:rear': 'barracksFoundry' }
  assert.equal(formationProblem(s, battle, five), 'tooMany')
  const refused = setFormation(s, battle.id, five, START)
  assert.equal(refused.ok, false)
  assert.equal(refused.reason, 'formation:tooMany')
  const four = { 'left:front': 'barracks', 'center:front': 'merchantHall', 'right:front': 'foundry', 'left:rear': 'mageTower' }
  assert.equal(setFormation(s, battle.id, four, START).ok, true)
  assert.equal(formationProblem(s, battle, { 'left:front': 'barracks', 'center:front': 'barracks' }), 'duplicate')
})

function fightable(): { state: CampaignState; battle: GrandBattle } {
  let state = withCrossings(withCastle(allBuildings(realm(), 3), 3), { barracksFoundry: 2 })
  state = withArmy(state, 'orc', [100])
  const gate = state.hexes.find((h) => h.kind === 'gate' && h.owner === 'orc')!
  return announced(state, { trigger: 'gate', hexId: gate.id, announcedOn: START, rival: 'orc' })
}

test('Ch 11 rule 4: the same seed, formation and Orders give the same log in three runs, and replay rebuilds every round exactly', () => {
  const hashes: string[] = []
  let last: GrandBattle | undefined
  for (let run = 0; run < 3; run++) {
    const { state, battle } = fightable()
    let s = setDoctrine(state, battle.id, 'holdTheLine', START).state
    s = begin(s, battle.id, { today: battle.battleDate, valors: [1, 0.8, 0.9, 1, 0.7, 1, 1] }).state
    for (let round = 1; round <= 4; round++) {
      const offered = offeredOrders(s, battle.id)
      const b = battleOf(s, battle.id)!
      if (b.result) break
      const play = marshalPlay(replayField(b.setup!, b.log!).field)
      const done = playRound(s, battle.id, { ...play, ...(round === 2 ? { swap: ['left:front', 'right:front'] as const } : {}) } as never, battle.battleDate)
      assert.ok(done.ok, String(done.reason))
      assert.ok(play.order === undefined || offered.includes(play.order))
      s = done.state
    }
    last = battleOf(s, battle.id)!
    assert.ok(last.result, 'the battle is settled after its last round')
    hashes.push(createHash('sha256').update(JSON.stringify(last.log)).digest('hex'))
  }
  assert.equal(new Set(hashes).size, 1)
  const rebuilt = replay(last!)!
  assert.equal(rebuilt.rounds.length, last!.log!.length)
  rebuilt.rounds.forEach((r, i) => assert.deepEqual(r.health, last!.log![i].health))
})

test('Ch 11: preparation happens during the warning; the battle is fought only on its day; one attempt', () => {
  const { state, battle } = fightable()
  assert.equal(begin(state, battle.id, { today: START, valors: SEVEN_FULL }).reason, 'notBattleDay')
  assert.equal(setDoctrine(state, battle.id, 'lastStand', START).reason, 'doctrine', 'Last Stand needs the Hall of Heroes')
  const begun = begin(state, battle.id, { today: battle.battleDate, valors: SEVEN_FULL })
  assert.equal(begun.ok, true)
  assert.equal(begin(begun.state, battle.id, { today: battle.battleDate, valors: SEVEN_FULL }).reason, 'begun')
  assert.equal(setFormation(begun.state, battle.id, { 'center:front': 'barracks' }, battle.battleDate).reason, 'begun')
  assert.equal(playRound(begun.state, battle.id, {}, addDays(battle.battleDate, 1)).reason, 'notBattleDay')
})

test('Ch 11 rule 1: the Marshal fights an unfought battle at R − 0.1 with the Order of highest immediate damage, once', () => {
  const { state, battle } = fightable()
  const c = collector()
  const fought = autoResolve(state, battle.id, battle.battleDate, SEVEN_FULL, c.emit)
  const b = battleOf(fought, battle.id)!
  assert.ok(b.result)
  assert.equal(b.setup?.marshal, true)
  near(b.setup!.readiness, 1.0)
  assert.equal(c.of('grandBattle').filter((e) => e.stage === 'fought').length, 1)
  assert.equal(c.of('grandBattle')[0].marshal, true)
  assert.deepEqual(autoResolve(fought, battle.id, battle.battleDate, SEVEN_FULL, collector().emit), fought)
  // Each round's Order did at least as much immediate damage as any other Order and target on offer.
  let field = startField(b.setup!)
  for (const r of b.log!) {
    const dealt = (order?: string, target?: object): number =>
      playRoundOn(field, order ? { order, target } : {}).log.lines.filter((l) => l.to.startsWith('orc:')).reduce((s, l) => s + l.amount, 0)
    const chosen = dealt(r.order, r.target)
    for (const other of r.offered ?? []) for (const t of validTargets(field, other)) assert.ok(chosen >= dealt(other, t) - 1e-9, `${r.order} vs ${other}`)
    field = playRoundOn(field, { ...(r.order ? { order: r.order } : {}), ...(r.target ? { target: r.target } : {}) }).field
  }
})

test('Ch 11 rule 2: routed companies are Weary for 3 days and the roster keeps its size', () => {
  let state = withArmy(realm(), 'orc', [400])
  const gate = state.hexes.find((h) => h.kind === 'gate' && h.owner === 'orc')!
  const a = announced(state, { trigger: 'gate', hexId: gate.id, announcedOn: START, rival: 'orc' })
  const size = a.state.roster.length
  const fought = autoResolve(a.state, a.battle.id, a.battle.battleDate, [0, 0, 0, 0, 0, 0, 0], collector().emit)
  const b = battleOf(fought, a.battle.id)!
  assert.equal(b.result, 'defeat')
  assert.ok((b.outcome?.weary ?? []).length > 0)
  assert.equal(fought.roster.length, size)
  for (const id of b.outcome!.weary!) assert.equal(fought.roster.find((c) => c.id === id)?.wearyUntil, addDays(a.battle.battleDate, 3))
})

// ── Outcomes (Ch 11 table) ───────────────────────────────────────────────────

/** The orc's Gate, and a hex beside it the player has just taken. */
function incursionSetup(playerTiers: number, orcPowers: number[]): { state: CampaignState; hexId: string } {
  let state = withArmy(withCastle(allBuildings(realm(), playerTiers), 3), 'orc', orcPowers)
  const gate = state.hexes.find((h) => h.kind === 'gate' && h.owner === 'orc')!
  const beside = neighbors(gate.id).map((id) => hex(state, id)).find((h) => h.owner === 'neutral')!
  state = { ...state, hexes: state.hexes.map((h) => (h.id === beside.id ? { ...h, owner: 'player' as const } : h)) }
  return { state, hexId: beside.id }
}

test('Ch 11 outcomes: an Incursion won cuts the rival’s AV by 40% of the host sent, adds 5 Respect and pays 30 × ring', () => {
  const { state, hexId } = incursionSetup(4, [20, 20])
  const a = announced(state, { trigger: 'incursion', hexId, announcedOn: START, rival: 'orc' })
  const sent = a.battle.sent!.orc!
  assert.equal(sent, 20) // 60% of 40 = 24: one company of 20 fits
  const purse = balance(a.state.purse)
  const respect = a.state.rivals.orc.respect
  const fought = autoResolve(a.state, a.battle.id, a.battle.battleDate, SEVEN_FULL, collector().emit)
  const b = battleOf(fought, a.battle.id)!
  assert.notEqual(b.result, 'defeat')
  near(baseArmyValue(fought, 'orc'), 40 - 0.4 * sent)
  assert.equal(fought.rivals.orc.respect, respect + 5)
  const ring = hex(state, hexId).ring
  near(balance(fought.purse) - purse, Math.round(30 * ring * (1 + realmEffects(state).reputationBonus.value) * 10) / 10, 0.05)
})

test('Ch 11 outcomes: an Incursion lost returns the hex to that rival', () => {
  const { state, hexId } = incursionSetup(1, [300, 300])
  const a = announced(state, { trigger: 'incursion', hexId, announcedOn: START, rival: 'orc' })
  const c = collector()
  const fought = autoResolve(a.state, a.battle.id, a.battle.battleDate, [0, 0, 0, 0, 0, 0, 0], c.emit)
  assert.equal(battleOf(fought, a.battle.id)!.result, 'defeat')
  assert.equal(hex(fought, hexId).owner, 'orc')
  assert.deepEqual(c.of('hexTransfer')[0], { hexId, from: 'player', to: 'orc', how: 'conquest' })
})

test('Ch 11 outcomes: a lost Gate costs 5 × ring tribute and blocks a retry for 14 days; a won Gate is the player’s', () => {
  let state = withPurse(withArmy(realm(), 'orc', [400]), 500)
  const gate = state.hexes.find((h) => h.kind === 'gate' && h.owner === 'orc')!
  state = { ...state, hexes: state.hexes.map((h) => (neighbors(gate.id).includes(h.id) && h.owner === 'neutral' ? { ...h, owner: 'player' as const } : h)) }
  const a = announced(state, { trigger: 'gate', hexId: gate.id, announcedOn: START, rival: 'orc' })
  const fought = autoResolve(a.state, a.battle.id, a.battle.battleDate, [0, 0, 0, 0, 0, 0, 0], collector().emit)
  const b = battleOf(fought, a.battle.id)!
  assert.equal(b.result, 'defeat')
  assert.equal(b.outcome?.tribute, 5 * gate.ring)
  assert.equal(b.outcome?.retryFrom, addDays(a.battle.battleDate, 14))
  const c = collector()
  assert.equal(announceGrandBattle(fought, { trigger: 'gate', hexId: gate.id, announcedOn: addDays(a.battle.battleDate, 13), rival: 'orc' }, c.emit).reason, 'retryTooSoon')
  assert.equal(announceGrandBattle(fought, { trigger: 'gate', hexId: gate.id, announcedOn: addDays(a.battle.battleDate, 14), rival: 'orc' }, c.emit).ok, true)

  const strong = withArmy(withCastle(allBuildings(state, 4), 4), 'orc', [20])
  const w = announced(strong, { trigger: 'gate', hexId: gate.id, announcedOn: START, rival: 'orc' })
  const won = autoResolve(w.state, w.battle.id, w.battle.battleDate, SEVEN_FULL, collector().emit)
  assert.notEqual(battleOf(won, w.battle.id)!.result, 'defeat')
  assert.equal(hex(won, gate.id).owner, 'player')
})

test('Ch 11 outcomes: a Mythic Hunt won pays 150 and its trophy; a Lair Mouth won seals the lair (A-156)', () => {
  const state = withCastle(withCrossings(allBuildings(realm(), 4), { foundryMageTower: 2 }), 4)
  const mouth = state.hexes.find((h) => h.kind === 'lairMouth' && h.land === 'west')!
  const a = announced(state, { trigger: 'mythicHunt', hexId: mouth.id, announcedOn: START, quarry: 'wyvernBrood' })
  const fought = autoResolve(a.state, a.battle.id, a.battle.battleDate, SEVEN_FULL, collector().emit)
  const b = battleOf(fought, a.battle.id)!
  assert.notEqual(b.result, 'defeat')
  assert.equal(b.outcome?.trophy, 'wyvernScaleCloak')
  assert.ok(fought.armory?.stash.includes('wyvernScaleCloak'))
  near(b.outcome!.reputation!, Math.round(150 * (1 + realmEffects(state).reputationBonus.value) * 10) / 10)
  assert.equal(hex(fought, mouth.id).owner, 'player')
  assert.ok(realmEffects(fought).mythicStrengthBySide.west!.value < realmEffects(state).mythicStrengthBySide.west!.value)
})

// ── The interpreter walks the codex ──────────────────────────────────────────

test('T11: one interpreter handles every Order, Doctrine, Elite ability, the Sworn, item, Wing, host and mythic special', () => {
  const holders = (): Holder[] => [
    { kind: 'unit', reach: 'ranged', mods: {}, health: { mult: 1 } },
    { kind: 'start', mods: startMods() },
    { kind: 'round', target: { lane: 'center', unit: 'u', slot: 'left:rear' }, stage: 1, mods: orderMods('', {}, 0) },
    { kind: 'enemy', unit: 'wyvern', round: 1, mods: { specials: [] } }
  ]
  const lists: [string, readonly unknown[]][] = [
    ...CODEX.orders.map((o) => [`order ${o.id}`, o.effects] as [string, readonly unknown[]]),
    ...CODEX.doctrines.map((d) => [`doctrine ${d.id}`, d.effects] as [string, readonly unknown[]]),
    ...CODEX.elites.map((e) => [`elite ${e.id}`, e.ability] as [string, readonly unknown[]]),
    ['the Sworn', CODEX.sworn.ability],
    ...CODEX.items.map((i) => [`item ${i.id}`, i.effects] as [string, readonly unknown[]]),
    ...CODEX.wings.map((w) => [`wing ${w.id}`, w.effects] as [string, readonly unknown[]]),
    ...CODEX.hosts.map((h) => [`host ${h.rival}`, h.specials] as [string, readonly unknown[]]),
    ...CODEX.quarries.map((q) => [`quarry ${q.id}`, q.specialEffects] as [string, readonly unknown[]])
  ]
  for (const [where, effects] of lists) {
    for (const e of effects as Effect[]) {
      for (const h of holders()) assert.ok(['field', 'roster', 'realm'].includes(interpret(e, h)), where)
    }
  }
  // Everything Orders, Doctrines, Elites, mythics and battle items do is played on the field.
  for (const o of CODEX.orders) for (const e of o.effects) assert.equal(interpret(e, holders()[2]), 'field', `order ${o.id}`)
  for (const q of CODEX.quarries) for (const e of q.specialEffects) assert.equal(interpret(e, holders()[3]), 'field', `quarry ${q.id}`)
  assert.throws(() => interpret({ kind: 'nonsense' } as unknown as Effect, holders()[0]))
})

test('T11: Mercenary Contract fields one hired company free; Reserves hires one into an empty slot for 20', () => {
  let state = withPurse(withCastle(allBuildings(realm(), 3), 3), 300)
  state = withArmy(state, 'orc', [60])
  const gate = state.hexes.find((h) => h.kind === 'gate' && h.owner === 'orc')!
  const a = announced(state, { trigger: 'gate', hexId: gate.id, announcedOn: START, rival: 'orc' })
  let s = setDoctrine(a.state, a.battle.id, 'mercenaryContract', START).state
  s = setFormation(s, a.battle.id, { 'center:front': 'barracks', 'left:rear': 'hired:free' }, START).state
  const begun = begin(s, a.battle.id, { today: a.battle.battleDate, valors: SEVEN_FULL })
  assert.ok(begun.ok)
  assert.ok(battleOf(begun.state, a.battle.id)!.setup!.units.some((u) => u.id === 'hired:free' && u.hired))
  const field = fieldOf([mine('a', 10, 'center:front'), theirs('orc', 'grunts', 8, 'center:front')], { deck: ['reserves'] })
  const hired = playRoundOn(field, { order: 'reserves', target: { slot: 'left:front' } })
  assert.equal(hired.field.hired, 1)
  assert.ok(hired.field.units.some((u) => u.hired && u.at === 'left:front' && u.power === 9))
})

test('Ch 11 / A-164: the Siege counts the castle walls in full, as health on the center front', () => {
  let state = withCastle(allBuildings(realm(), 2), 2)
  state = withArmy(state, 'orc', [100])
  const castle = state.hexes.find((h) => h.kind === 'castle')!
  const a = announced(state, { trigger: 'siege', hexId: castle.id, announcedOn: START, rival: 'orc' })
  const s = setFormation(a.state, a.battle.id, { 'center:front': 'barracks' }, START).state
  const begun = begin(s, a.battle.id, { today: a.battle.battleDate, valors: SEVEN_FULL })
  const unit = battleOf(begun.state, a.battle.id)!.setup!.units.find((u) => u.id === 'barracks')!
  near(unit.health, 4 * unit.power + realmEffects(state).walls.value)
})

test('Ch 11 / A-157: the Herald’s Horn sounds once a month: +0.1 Readiness for the whole battle', () => {
  let state = withMilestones(withCastle(allBuildings(realm(), 3), 3), 1, 4, 5, 8)
  state = withArmy(state, 'orc', [60])
  state = { ...state, roster: state.roster.map((c) => (c.id === 'barracks' ? { ...c, items: ['heraldsHorn'] } : c)) }
  const gate = state.hexes.find((h) => h.kind === 'gate' && h.owner === 'orc')!
  const a = announced(state, { trigger: 'gate', hexId: gate.id, announcedOn: START, rival: 'orc' })
  const first = begin(setFormation(a.state, a.battle.id, { 'center:front': 'barracks' }, START).state, a.battle.id, { today: a.battle.battleDate, valors: SEVEN_FULL })
  const setup = battleOf(first.state, a.battle.id)!.setup!
  assert.equal(setup.horn, true)
  near(setup.readiness, 1.2)
  const castle = state.hexes.find((h) => h.kind === 'castle')!
  const b = announced(first.state, { trigger: 'siege', hexId: castle.id, announcedOn: START, rival: 'orc' })
  const second = begin(setFormation(b.state, b.battle.id, { 'center:front': 'barracks' }, START).state, b.battle.id, { today: b.battle.battleDate, valors: SEVEN_FULL })
  assert.equal(battleOf(second.state, b.battle.id)!.setup!.horn, undefined, 'the same month: no second sounding')
})

test('result() gives the card for a fought battle and null before', () => {
  const { state, battle } = fightable()
  assert.equal(result(battle), null)
  const fought = autoResolve(state, battle.id, battle.battleDate, SEVEN_FULL, collector().emit)
  const card = result(battleOf(fought, battle.id)!)!
  assert.ok(['rout', 'victory', 'defeat'].includes(card.result))
  assert.equal(card.marshal, true)
  assert.ok(card.rounds >= 1 && card.rounds <= 4)
})

