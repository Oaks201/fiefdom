/**
 * Patch 10 stage 1 (docs/redesign/patch-10-proposals.md section 3; D-80, rules 3.15.0): each ruler's
 * craft. A deed in his craft adds Renown to his path wherever it is done.
 * - K2, stone (the Dwarf): a wall level raised, once for each hex and level; a defense the walls turned.
 * - K3, the field (the Orc): a streak of days with a battle against him or in his march; a rest day or a
 *   day away holds it; every seventh day moves his Respect; an attack of his beaten weighs less with him.
 * - K5, the unseen (the Archmage): a mythic beaten in a defense, a Mythic Hunt won.
 * - The `wallsStanding` migration credits the walls a save already has, once.
 * K4 (the Goblin's deal in any march) and the retired deeds are in signatureDeeds.test.ts.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDays } from '../../src/renderer/src/lib/game/clock'
import { defenseFor } from '../../src/renderer/src/lib/game/combat'
import { chronicle, fieldDayRenown, fieldStreak, pathsOf, renown } from '../../src/renderer/src/lib/game/dominion'
import { fortificationValue, fortify } from '../../src/renderer/src/lib/game/land'
import { bandOf, depthOf, isClaimableKind, strongholds } from '../../src/renderer/src/lib/game/map'
import { archiveTag, migrateCampaign, migrationsOf } from '../../src/renderer/src/lib/game/migrate'
import { RULES } from '../../src/renderer/src/lib/game/rules'
import { DAY_PHASES, type PhaseContext } from '../../src/renderer/src/lib/game/settle'
import { openDayOf, toPlayer } from '../../src/renderer/src/lib/game/state'
import type { CampaignState, GameEvent, GameEventMap, HexState, RivalId } from '../../src/renderer/src/lib/game/types'
import { emptyLedger } from './fixtures/ledgers'
import { collector, type Posted } from './support/grand'
import { realm, withPurse } from './support/realm'
import { START, fight, hex, plainHex, withHex, withOwner, withTiding } from './support/war'

const K = RULES.dominion.crafts
const D = RULES.dominion.deeds

type Deed = GameEventMap['deed']

/** A plain march hex: not a stronghold, a village or a seam. */
function plainIn(hexes: readonly HexState[], march: RivalId, depth: number): HexState {
  const forts = strongholds(hexes)
  return hexes.find((h) => h.march === march && !h.seam && !h.village && !forts.has(h.id) && isClaimableKind(h) && depthOf(h) === depth) as HexState
}

/** A realm whose chronicle has read its founding log. */
function read(state: CampaignState = realm()): CampaignState {
  return chronicle(state, () => undefined)
}

function logged(state: CampaignState, events: readonly (Posted & { day?: string })[], day = START): CampaignState {
  return { ...state, log: [...state.log, ...events.map((e, i) => ({ day, ...e, id: `t:${state.log.length + i}` }) as GameEvent)] }
}

function posted(state: CampaignState, close?: { day: string; held: boolean }): { state: CampaignState; deeds: Deed[] } {
  const c = collector()
  return { state: chronicle(state, c.emit, close), deeds: c.of('deed') }
}

const crafts = (deeds: readonly Deed[], kind: Deed['deed']): Deed[] => deeds.filter((d) => d.deed === kind)

/** A battle in the Orc's field on `day`: an assault on a hex of his march, repulsed. */
function fieldBattle(state: CampaignState, day: string): CampaignState {
  return logged(state, [{ kind: 'assault', hexId: plainIn(state.hexes, 'orc', 3).id, owner: 'orc', outcome: 'repulsed', wear: 5 }], day)
}

// ── K2: stone ────────────────────────────────────────────────────────────────

test('D-80 (K2): raising a wall posts `fortified`, and the chronicle pays the Dwarf’s path level × band × the rate, in any march', () => {
  const s0 = read()
  const orc = plainIn(s0.hexes, 'orc', 6)
  let state = withPurse(withOwner(s0, [orc.id], 'player'), 5_000)
  for (let level = 1; level <= RULES.land.fortificationMax; level++) {
    const done = fortify(state, orc.id)
    assert.equal(done.ok, true)
    state = done.state
  }
  assert.deepEqual(state.log.flatMap((e) => (e.kind === 'fortified' ? [[e.hexId, e.level, e.day]] : [])), [1, 2, 3].map((level) => [orc.id, level, openDayOf(s0)]))
  const { deeds, state: after } = posted(state)
  const band = bandOf(orc)
  assert.deepEqual(deeds.map((d) => [d.deed, d.path, d.value, d.level, d.hexId]), [1, 2, 3].map((level) => ['wallRaised', 'dwarf', K.wallRaisedPerLevelBand * level * band, level, orc.id]))
  assert.equal(renown(after).dwarf - renown(s0).dwarf, K.wallRaisedPerLevelBand * 6 * band, 'a hex of the Orc’s march, walled, is a deed on the Dwarf’s path')
  assert.equal(renown(after).orc, renown(s0).orc)
})

test('D-80 (K2): a wall level pays once for each hex in a campaign: lost, retaken and walled again, it pays nothing more', () => {
  const s0 = read()
  const h = plainIn(s0.hexes, 'goblin', 3)
  let state = withPurse(withOwner(s0, [h.id], 'player'), 5_000)
  state = fortify(state, h.id).state
  const first = posted(state)
  assert.equal(crafts(first.deeds, 'wallRaised').length, 1)
  // The hex changes hands and comes back unwalled (`toPlayer`); its first level is raised again.
  state = { ...first.state, hexes: first.state.hexes.map((x) => (x.id === h.id ? toPlayer(x, START, false) : x)) }
  state = fortify(state, h.id).state
  state = fortify(state, h.id).state
  const again = posted(state)
  assert.deepEqual(crafts(again.deeds, 'wallRaised').map((d) => d.level), [2], 'level 1 was paid; level 2 is new')
})

test('D-80 (K2): a defense won that the formula loses without the hex’s walls records them, and pays the Dwarf’s path a wall level; won without needing them, nothing', () => {
  const state = realm()
  const den = plainHex(state, 3, (h) => h.owner === 'neutral')
  const owned = withHex(state, den.id, { owner: 'player', garrison: 0, fortification: 2 })
  const walls = fortificationValue(hex(owned, den.id))
  const { defense } = defenseFor(owned, { hexId: den.id, kind: 'beasts', valor: 1, day: START })
  assert.ok(walls > 2 && defense > walls + 1, 'the walls are worth something here, and the companies more')

  const turned = fight(withTiding(owned, { date: START, kind: 'beasts', hexId: den.id, strength: defense - walls / 2 }), START, 1)
  const report = turned.of('defense')[0]
  assert.notEqual(report.outcome, 'defeat')
  assert.equal(report.walls, 2, 'the wall levels, on a defense they turned')

  const easy = fight(withTiding(owned, { date: START, kind: 'beasts', hexId: den.id, strength: defense - walls - 1 }), START, 1)
  assert.equal(easy.of('defense')[0].walls, undefined, 'won without them')
  const lost = fight(withTiding(owned, { date: START, kind: 'beasts', hexId: den.id, strength: defense * 4 }), START, 1)
  assert.deepEqual([lost.of('defense')[0].outcome, lost.of('defense')[0].walls], ['defeat', undefined])

  const s0 = read(owned)
  const { deeds } = posted(logged(s0, [{ kind: 'defense', threat: 'beasts', hexId: den.id, outcome: 'victory', spoils: 3, walls: 2 }]))
  assert.deepEqual(crafts(deeds, 'wallsHeld').map((d) => [d.path, d.value, d.level]), [['dwarf', K.wallsHeld * 2, 2]])
  assert.ok(deeds.some((d) => d.deed === 'heldAgainstBeasts'), 'beside the battle’s own deed')
})

// ── K3: the field ────────────────────────────────────────────────────────────

test('D-80 (K3): day n of a streak in the Orc’s field pays the rate × n to his path, at most the cap, once a day however many battles', () => {
  let state = read()
  const paid: number[] = []
  for (let n = 1; n <= 8; n++) {
    const day = addDays(START, n - 1)
    state = fieldBattle(fieldBattle(state, day), day)
    const out = posted(state)
    state = out.state
    const field = crafts(out.deeds, 'fieldDay')
    assert.deepEqual(field.map((d) => [d.path, d.streak]), [['orc', n]], `day ${n}`)
    paid.push(field[0].value)
    assert.equal(fieldStreak(state, day), n)
    assert.equal(fieldStreak(state, addDays(day, 1)), n, 'alive the next day, until it closes without a battle')
  }
  assert.deepEqual(paid, [1, 2, 3, 4, 5, 6, 7, 8].map((n) => Math.min(K.fieldDayCap, K.fieldDay * n)))
  assert.equal(fieldDayRenown(6), K.fieldDayCap, 'the cap is reached on day 6')
  assert.equal(renown(state).orc, paid.reduce((s, v) => s + v, 0), 'a repulse has no deed of its own (X2): the Orc’s Renown here is the streak’s')
})

test('D-80 (K3): his raid, his counterattack and a Grand Battle against him are field battles; another ruler’s raid, or an assault elsewhere, is not', () => {
  const s0 = read()
  const mine = plainIn(s0.hexes, 'goblin', 3)
  const own = withOwner(s0, [mine.id], 'player')
  const battles: Posted[] = [
    { kind: 'defense', threat: 'raid', hexId: mine.id, rival: 'orc', outcome: 'defeat', tribute: 5 },
    { kind: 'defense', threat: 'counterattack', hexId: mine.id, rival: 'orc', outcome: 'victory', spoils: 5 },
    { kind: 'grandBattle', battleId: 'gb-1', trigger: 'warhost', hexId: mine.id, stage: 'fought', result: 'defeat', rival: 'orc' },
    { kind: 'assault', hexId: plainIn(s0.hexes, 'orc', 4).id, owner: 'neutral', outcome: 'taken', spoils: 5 }
  ]
  for (const b of battles) assert.equal(crafts(posted(logged(own, [b])).deeds, 'fieldDay').length, 1, JSON.stringify(b))
  const others: Posted[] = [
    { kind: 'defense', threat: 'raid', hexId: mine.id, rival: 'dwarf', outcome: 'defeat', tribute: 5 },
    { kind: 'defense', threat: 'beasts', hexId: mine.id, outcome: 'victory', spoils: 5 },
    { kind: 'assault', hexId: plainIn(s0.hexes, 'dwarf', 4).id, owner: 'dwarf', outcome: 'repulsed', wear: 5 },
    { kind: 'assault', hexId: plainIn(s0.hexes, 'orc', 4).id, owner: 'neutral', outcome: 'revealed' },
    { kind: 'grandBattle', battleId: 'gb-2', trigger: 'warhost', hexId: mine.id, stage: 'announced', rival: 'orc' }
  ]
  for (const b of others) assert.equal(crafts(posted(logged(own, [b])).deeds, 'fieldDay').length, 0, JSON.stringify(b))
})

test('D-80 (K3): a day without a battle ends the streak; a rest day or a day away holds it without counting', () => {
  const day = (n: number): string => addDays(START, n)
  let state = posted(fieldBattle(read(), day(0)), { day: day(0), held: false }).state
  state = posted(fieldBattle(state, day(1)), { day: day(1), held: false }).state
  assert.equal(fieldStreak(state, day(1)), 2)

  // Held: days 2 and 3 close with no battle, a rest day and a day away. Day 4's battle is the streak's third day.
  let held = posted(state, { day: day(2), held: true }).state
  held = posted(held, { day: day(3), held: true }).state
  assert.equal(fieldStreak(held, day(4)), 2, 'held, not counted')
  const resumed = posted(fieldBattle(held, day(4)), { day: day(4), held: false })
  assert.deepEqual(crafts(resumed.deeds, 'fieldDay').map((d) => [d.streak, d.value]), [[3, K.fieldDay * 3]])

  // Not held: day 2 closes with no battle, so day 3's battle starts a new streak.
  const idle = posted(state, { day: day(2), held: false }).state
  assert.equal(fieldStreak(idle, day(3)), 0)
  const fresh = posted(fieldBattle(idle, day(3)), { day: day(3), held: false })
  assert.deepEqual(crafts(fresh.deeds, 'fieldDay').map((d) => [d.streak, d.value]), [[1, K.fieldDay]])
  // A hold never revives a streak that has ended.
  const late = posted(idle, { day: day(3), held: true }).state
  assert.equal(fieldStreak(late, day(4)), 0)
})

function close(state: CampaignState, day: string): { state: CampaignState; respect: GameEventMap['respect'][] } {
  const c = collector()
  const ctx: PhaseContext = { day, week: 1, weekClose: false, weekStartsOn: 1, ledger: emptyLedger(), emit: c.emit, hooks: { accordsPaid: [], grandBattleRequests: [], warhosts: [] } }
  return { state: DAY_PHASES.chronicle(state, ctx), respect: c.of('respect') }
}

test('D-80 (K3): every seventh day of a streak raises the Orc’s Respect by his own weight, once, at that day’s close; never once he is resolved', () => {
  const week = K.fieldWeekDays
  const gain = RULES.respect.byRival.orc.fieldWeek
  let state = read()
  const given: number[] = []
  for (let n = 1; n <= week * 2; n++) {
    const day = addDays(START, n - 1)
    const out = close(fieldBattle(state, day), day)
    state = out.state
    if (out.respect.length > 0) given.push(n)
    assert.deepEqual(out.respect.map((e) => [e.rival, e.change, e.reason]), n % week === 0 ? [['orc', gain, 'fieldWeek']] : [], `day ${n}`)
    // The week close runs the chronicle again on the same day: nothing more.
    assert.deepEqual(close(state, day).respect, [])
  }
  assert.deepEqual(given, [week, week * 2])
  assert.equal(state.rivals.orc.respect, RULES.rivals.start.respect + gain * 2)

  let resolved: CampaignState = { ...read(), rivals: { ...read().rivals, orc: { ...read().rivals.orc, status: 'conquered' } } }
  for (let n = 1; n <= week; n++) {
    const day = addDays(START, n - 1)
    const out = close(fieldBattle(resolved, day), day)
    resolved = out.state
    assert.deepEqual(out.respect, [])
  }
  assert.equal(fieldStreak(resolved, addDays(START, week - 1)), week, 'the streak still counts for his path')
})

test('D-80 (K3): an attack of the Orc’s beaten raises his Respect by his own weight; another ruler’s by the common one', () => {
  const state = realm()
  const den = plainHex(state, 3, (h) => h.owner === 'neutral')
  const owned = withHex(state, den.id, { owner: 'player', garrison: 0 })
  const common = RULES.respect.change.raidDefeated
  const own = RULES.respect.byRival.orc.raidDefeated
  assert.ok(own < common)
  for (const [rival, change] of [['orc', own], ['dwarf', common]] as const) {
    const won = fight(withTiding(owned, { date: START, kind: 'raid', hexId: den.id, strength: 1, rival }), START, 1)
    assert.deepEqual(won.of('respect').filter((e) => e.reason === 'raidDefeated').map((e) => [e.rival, e.change]), [[rival, change]])
  }
})

// ── K5: the unseen ───────────────────────────────────────────────────────────

test('D-80 (K5): a mythic beaten in a defense, in the heartland too, and a Mythic Hunt won add to the Archmage’s path beside the battle’s own deed', () => {
  const s0 = read()
  const far = plainIn(s0.hexes, 'orc', 3)
  const home = plainHex(s0, 2)
  const own = withOwner(s0, [far.id, home.id], 'player')
  const { deeds } = posted(
    logged(own, [
      { kind: 'defense', threat: 'mythic', hexId: far.id, outcome: 'victory', spoils: 5 },
      { kind: 'defense', threat: 'mythic', hexId: home.id, outcome: 'rout', spoils: 5 },
      { kind: 'defense', threat: 'mythic', hexId: far.id, outcome: 'defeat', tribute: 5 },
      { kind: 'grandBattle', battleId: 'gb-1', trigger: 'mythicHunt', hexId: far.id, stage: 'fought', result: 'victory' },
      { kind: 'grandBattle', battleId: 'gb-2', trigger: 'mythicHunt', hexId: far.id, stage: 'fought', result: 'defeat' }
    ])
  )
  assert.deepEqual(crafts(deeds, 'mythicBeaten').map((d) => [d.path, d.value, d.hexId]), [['archmage', K.mythicBeaten, far.id], ['archmage', K.mythicBeaten, home.id]])
  assert.deepEqual(crafts(deeds, 'mythicHunted').map((d) => [d.path, d.value]), [['archmage', K.mythicHunted]])
  assert.equal(crafts(deeds, 'heldAgainstMythic').reduce((s, d) => s + d.value, 0), D.heldAgainstMythic, 'the march hex’s own deed is unchanged; the heartland hex has none')
})

// ── The walls already standing ───────────────────────────────────────────────

test('D-80 (K2): the `wallsStanding` migration posts each wall level standing on the player’s hexes once, and the chronicle pays them as walls raised', () => {
  const s0 = read()
  const a = plainIn(s0.hexes, 'orc', 5)
  const b = plainIn(s0.hexes, 'dwarf', 2)
  const theirs = plainIn(s0.hexes, 'dwarf', 6)
  // A save from before rules 3.15.0: walls standing, no `fortified` in its log, the migration not yet run.
  const older: CampaignState = {
    ...s0,
    campaign: { ...s0.campaign, migrations: migrationsOf(s0).filter((m) => m !== 'wallsStanding') },
    hexes: s0.hexes.map((h) => (h.id === a.id ? { ...h, owner: 'player', fortification: 2 } : h.id === b.id ? { ...h, owner: 'player', fortification: 1 } : h.id === theirs.id ? { ...h, fortification: 3 } : h))
  }
  const { state: migrated, applied } = migrateCampaign(older)
  assert.deepEqual(applied, ['wallsStanding'])
  const fresh = migrated.log.slice(older.log.length)
  const standing = fresh.flatMap((e) => (e.kind === 'fortified' ? [[e.hexId, e.level, e.standing, e.day]] : []))
  assert.equal(fresh.length, 3, 'nothing else is posted')
  assert.deepEqual(new Set(standing.map((x) => JSON.stringify(x))), new Set([[a.id, 1, true, openDayOf(older)], [a.id, 2, true, openDayOf(older)], [b.id, 1, true, openDayOf(older)]].map((x) => JSON.stringify(x))), 'the player’s walls only, never a rival’s')
  assert.deepEqual({ ...migrated, log: older.log, campaign: older.campaign }, older, 'nothing else changes')

  const { deeds, state: paid } = posted(migrated)
  const due = K.wallRaisedPerLevelBand * (3 * bandOf(a) + bandOf(b))
  assert.equal(deeds.reduce((s, d) => s + d.value, 0), due)
  assert.equal(renown(paid).dwarf - renown(s0).dwarf, due)

  assert.deepEqual(migrateCampaign(migrated).applied, [], 'once')
  // A level it credited is never paid again when the player raises it anew.
  const again = posted(logged(paid, [{ kind: 'fortified', hexId: b.id, level: 1 }]))
  assert.deepEqual(again.deeds, [])
})

test('D-80: a campaign founded on rules 3.15.0 is born with the migration done, and with no field streak', () => {
  const state = realm()
  assert.ok(migrationsOf(state).includes('wallsStanding'))
  assert.deepEqual(migrateCampaign(state).applied, [])
  assert.equal(pathsOf(state).field, undefined)
  assert.equal(fieldStreak(state, START), 0)
})

test('D-83 (C-53): the old file is kept under a name of its own for each update, so a save that kept its copy before the bend gets a fresh one before a later migration', () => {
  assert.equal(archiveTag('3.1.0', ['bentMarches']), '3.1.0-before-bend', 'Patch 5’s name, unchanged')
  assert.equal(archiveTag('3.1.0', ['bentMarches', 'wallsStanding']), '3.1.0-before-bend', 'a save older than the bend keeps one copy for both')
  assert.equal(archiveTag('3.1.0', ['wallsStanding']), '3.1.0-before-wallsStanding', 'a migrated save, as the live game’s is')
  // The archive's own rule (main/jsonFile.ts): word characters, dots and dashes only.
  assert.match(archiveTag('3.4.0', ['wallsStanding']), /^[\w.-]+$/)
})
