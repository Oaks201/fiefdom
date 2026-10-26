/**
 * Patch 6 (docs/redesign/patch-6-spec.md section 6; D-50): the rivals' moves that land day by day. The
 * wars between rivals settle a skirmish a day (C-89), the stances are read each day (C-90), a land grab is
 * chosen at the week close and taken on its day (C-91), and the walls away from the player rise over the
 * week (C-92). A rival who goes to War plans his conquest attempts that day (C-93, on from D-51).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { addDays } from '../../src/renderer/src/lib/game/clock'
import { combatOf } from '../../src/renderer/src/lib/game/combat'
import { borderHexesOf, hexIndex, neighbors, touches } from '../../src/renderer/src/lib/game/map'
import { migrateCampaign } from '../../src/renderer/src/lib/game/migrate'
import { dailyStandings, orcLosesToWilds, rivalMovesDay, rivalTurn, settleFronts, skirmishFronts, type RivalWeek, type WeekHabits } from '../../src/renderer/src/lib/game/rivals'
import { RULES } from '../../src/renderer/src/lib/game/rules'
import { bandOfScore, dailyStances, stanceOf, stanceScore } from '../../src/renderer/src/lib/game/terms'
import { RIVAL_IDS, type CampaignState, type FrontId, type GameEvent, type RivalId } from '../../src/renderer/src/lib/game/types'
import { resultLine } from '../../src/renderer/src/lib/game/view/shell'
import { realm } from './support/realm'
import { hex, withOwner } from './support/war'

/** Founded Thursday 2026-10-08 with Monday weeks: week 2 runs Monday 10-12 to Sunday 10-18. */
const MONDAY = '2026-10-12'
const SUNDAY = '2026-10-18'
const NOTHING: WeekHabits = { days: [], pillars: { steps: 0, table: 0, duties: 0 } }

function week(day: string, n: number, events: GameEvent[] = []): RivalWeek {
  return { day, week: n, weekStartsOn: 1, days: 7, valor: 1, habits: NOTHING, emit: (kind, payload) => void events.push({ id: `t-${events.length + 1}`, day, kind, ...payload } as GameEvent) }
}

function emitter(events: GameEvent[], day: string): RivalWeek['emit'] {
  return (kind, payload) => void events.push({ id: `t-${events.length + 1}`, day, kind, ...payload } as GameEvent)
}

function atWar(state: CampaignState, id: FrontId, track = 0): CampaignState {
  return { ...state, fronts: { ...state.fronts, [id]: { ...state.fronts[id], state: 'war', track } } }
}

function withRival(state: CampaignState, rival: RivalId, patch: Partial<CampaignState['rivals'][RivalId]>): CampaignState {
  return { ...state, rivals: { ...state.rivals, [rival]: { ...state.rivals[rival], ...patch } } }
}

// ── The fronts (C-89) ────────────────────────────────────────────────────────

test('C-89: a week of skirmishes settled day by day ends where the week close alone would have taken it', () => {
  const base = atWar(realm(), 'north')
  const weekly = settleFronts(base, week(SUNDAY, 2))
  let daily = base
  for (let d = MONDAY; d <= SUNDAY; d = addDays(d, 1)) daily = skirmishFronts(daily, d, 1, () => undefined)
  assert.equal(daily.fronts.north.skirmishedThrough, SUNDAY)
  const closed = settleFronts(daily, week(SUNDAY, 2))
  assert.equal(closed.fronts.north.track, weekly.fronts.north.track, 'the same seven draws on the same days')
  assert.deepEqual(closed.rivals.orc.companies, weekly.rivals.orc.companies, 'the war’s 5% cost once, at the close')
  assert.deepEqual(closed.rivals.goblin.frontTracks, weekly.rivals.goblin.frontTracks)
})

test('C-89: a day is settled once; a save from before Patch 6 catches up its week’s earlier days at its first close', () => {
  const base = atWar(realm(), 'north')
  const thursday = addDays(MONDAY, 3)
  const caught = skirmishFronts(base, thursday, 1, () => undefined)
  let stepped = base
  for (let d = MONDAY; d <= thursday; d = addDays(d, 1)) stepped = skirmishFronts(stepped, d, 1, () => undefined)
  assert.equal(caught.fronts.north.track, stepped.fronts.north.track, 'Monday to Thursday, in one call or four')
  assert.equal(skirmishFronts(caught, thursday, 1, () => undefined), caught, 'settling the same day again changes nothing')
  const peace = skirmishFronts(realm(), thursday, 1, () => undefined)
  assert.equal(peace.fronts.north.skirmishedThrough, undefined, 'a front not at War draws nothing')
})

test('C-89, C-88: the day a track reaches its end posts the turn, and the Herald tells it', () => {
  let state = atWar(realm(), 'north', RULES.rivals.fronts.track.max - 1)
  const turns: GameEvent[] = []
  for (let d = MONDAY; d <= SUNDAY; d = addDays(d, 1)) {
    const before = state.fronts.north.track
    const events: GameEvent[] = []
    state = skirmishFronts(state, d, 1, emitter(events, d))
    const after = state.fronts.north.track
    const turned = after !== before && Math.abs(after) === RULES.rivals.fronts.track.max
    assert.equal(events.length, turned ? 1 : 0, `${d}: ${before} → ${after}`)
    turns.push(...events)
  }
  for (const e of turns) {
    assert.ok(e.kind === 'front' && e.turned)
    assert.equal(resultLine(e)?.textId, 'herald.front.emboldened')
  }
})

// ── The stances (C-90) ───────────────────────────────────────────────────────

test('C-90: every stance is read at each day’s close from week 16, and posts only when it changes', () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'campaign-3.3.0.json'), 'utf8')) as { state: CampaignState }
  const state = migrateCampaign(fixture.state).state
  const day = addDays(state.settledThrough.day, 1)
  const events: GameEvent[] = []
  const read = dailyStances(state, day, 31, emitter(events, day))
  for (const r of RIVAL_IDS) {
    if (state.rivals[r].status !== 'active') continue
    const band = bandOfScore(stanceScore(state, r, addDays(day, 1)))
    assert.equal(stanceOf(read, r), band)
    assert.equal(events.some((e) => e.kind === 'stance' && e.rival === r), band !== stanceOf(state, r))
  }
  assert.equal(dailyStances(read, day, 31, () => undefined), read, 'read again, nothing changes')
  const early = dailyStances(realm(), MONDAY, 2, () => undefined)
  for (const r of RIVAL_IDS) assert.equal(stanceOf(early, r), 'defiant', 'Defiant before week 16')
})

// ── Land grabs (C-91) ────────────────────────────────────────────────────────

/** The Orc with a strong army, so a den beside his land is within reach at the close (garrisons there about 310 to 370). */
function strongOrc(): CampaignState {
  const state = realm()
  // An empty purse: no village bid to spend his one target on, so it goes to a den.
  return withRival(state, 'orc', { companies: [{ ...state.rivals.orc.companies[0], power: 800 }], treasury: 0 })
}

/** The first day of campaign week 3, when the rivals' own rules (and their sieges of the wilds) begin. */
const WEEK3 = addDays(SUNDAY, 1)

test('Patch 7 W1: the week close chooses no den; from week 3 a rival besieges the weakest wild hex of his own march touching his land, and takes it when the wear reaches its garrison (told by the Herald)', () => {
  const turned = rivalTurn(strongOrc(), week(SUNDAY, 2)).state
  assert.equal(turned.rivals.orc.ai?.grabs, undefined, 'no den is chosen at the close')
  assert.equal(rivalMovesDay(turned, SUNDAY, () => undefined).rivals.orc.ai?.siege, undefined, 'none before week 3')
  let state = rivalMovesDay(turned, WEEK3, () => undefined)
  const siege = state.rivals.orc.ai?.siege
  assert.ok(siege)
  const target = hex(state, siege.hexId)
  const byId = hexIndex(state.hexes)
  const candidates = state.hexes.filter((h) => h.owner === 'neutral' && !h.village && !h.mythic && (h.march === 'orc' || h.seam === 'orc') && h.ring > 2 && touches(byId, h.id, 'orc'))
  assert.equal(target.garrison, Math.min(...candidates.map((h) => h.garrison)), 'the weakest garrison')
  assert.ok(siege.wear > 0 && siege.wear < target.garrison)
  const events: GameEvent[] = []
  let day = WEEK3
  while (hex(state, siege.hexId).owner === 'neutral') {
    day = addDays(day, 1)
    state = rivalMovesDay(state, day, emitter(events, day))
    assert.ok(day < addDays(WEEK3, 14), 'falls within two weeks')
  }
  assert.equal(hex(state, siege.hexId).owner, 'orc')
  const transfer = events.find((e) => e.kind === 'hexTransfer')
  assert.ok(transfer && transfer.kind === 'hexTransfer' && transfer.from === 'neutral' && transfer.to === 'orc' && transfer.how === 'conquest')
  assert.equal(resultLine(transfer)?.textId, 'herald.rival.grab')
  assert.notEqual(state.rivals.orc.ai?.siege?.hexId, siege.hexId, 'done with it')
})

test('Patch 7 W1: a siege whose hex the player takes moves on to the next; a den chosen before 3.7.0 is still taken or called off on its day', () => {
  const pressed = rivalMovesDay(strongOrc(), WEEK3, () => undefined)
  const first = pressed.rivals.orc.ai?.siege?.hexId as string
  const next = rivalMovesDay(withOwner(pressed, [first], 'player'), addDays(WEEK3, 1), () => undefined)
  assert.notEqual(next.rivals.orc.ai?.siege?.hexId, first)
  assert.equal(hex(next, first).owner, 'player')
  // A 3.6 save's pending grab: taken on its day if his army beats it (C-91), else called off.
  const den = first
  const legacy = withRival(strongOrc(), 'orc', { ai: { grabs: [{ hexId: den, day: WEEK3, i: 0 }] } })
  const events: GameEvent[] = []
  const after = rivalMovesDay(legacy, WEEK3, emitter(events, WEEK3))
  assert.equal(hex(after, den).owner, 'orc')
  assert.equal(after.rivals.orc.ai?.grabs, undefined)
})

test('Patch 7 W1: the Dwarf walls each hex he takes from the wilds; the beasts take back some of what the Orc won, at the week close', () => {
  const dwarf = withRival(realm(), 'dwarf', { companies: [{ ...realm().rivals.dwarf.companies[0], power: 800 }], treasury: 0 })
  let state = rivalMovesDay(dwarf, WEEK3, () => undefined)
  const target = state.rivals.dwarf.ai?.siege?.hexId as string
  for (let day = WEEK3; hex(state, target).owner === 'neutral'; ) {
    day = addDays(day, 1)
    state = rivalMovesDay(state, day, () => undefined)
  }
  assert.equal(hex(state, target).fortification, RULES.rivals.wildSieges.dwarfWalls)
  // The Orc's won hexes: shallower than his founding land, touching the wilds.
  const byId = hexIndex(realm().hexes)
  const won = realm().hexes.filter((h) => h.owner === 'neutral' && h.march === 'orc' && !h.village && touches(byId, h.id, 'orc')).map((h) => h.id)
  const orc = withOwner(realm(), won, 'orc')
  const lost: GameEvent[] = []
  let s = orc
  for (let k = 0; k < 12; k++) s = orcLosesToWilds(s, week(addDays(SUNDAY, 7 * (k + 1)), 3 + k, lost))
  const back = lost.filter((e) => e.kind === 'hexTransfer' && e.from === 'orc' && e.to === 'neutral' && e.how === 'wilds')
  assert.ok(back.length > 0 && back.length < won.length * 12, `${back.length} of ${won.length}`)
  assert.equal(resultLine(back[0])?.textId, 'herald.rival.lostToWilds')
})

test('Patch 7 W2: a front at its end moves borders: the Emboldened rival takes a touching hex of the Humbled one, or else the Humbled one’s frontier hex falls to the wilds and the Emboldened one’s siege falls at once', () => {
  const front = Object.values(realm().fronts).find((f) => f.rivals.includes('orc') && f.rivals.includes('goblin')) as CampaignState['fronts'][FrontId]
  const [a, b] = front.rivals
  // Ugrak Emboldened: the track at his end, his siege of the wilds under way.
  const atEnd = (state: CampaignState): CampaignState => atWar(state, front.front, a === 'orc' ? RULES.rivals.fronts.track.max : -RULES.rivals.fronts.track.max)
  const pressed = rivalMovesDay(strongOrc(), WEEK3, () => undefined)
  const siege = pressed.rivals.orc.ai?.siege?.hexId as string
  const fired = (state: CampaignState): { state: CampaignState; events: GameEvent[] } => {
    for (let k = 0; k < 20; k++) {
      const events: GameEvent[] = []
      const day = addDays(SUNDAY, 7 * (k + 1))
      const next = settleFronts(atEnd(state), week(day, 3 + k, events))
      if (events.some((e) => e.kind === 'hexTransfer')) return { state: next, events }
    }
    throw new Error('the border never moved')
  }
  const apart = fired(pressed)
  const toWilds = apart.events.find((e) => e.kind === 'hexTransfer' && e.from === 'goblin' && e.to === 'neutral')
  assert.ok(toWilds && toWilds.kind === 'hexTransfer' && toWilds.how === 'wilds', 'the Goblin’s frontier hex falls to the wilds')
  assert.equal(hex(apart.state, siege).owner, 'orc', 'Ugrak’s siege falls at once')
  assert.ok(apart.state.fronts[front.front].rivals.includes(b))
  // Their lands touch: Ugrak takes the Goblin's hex outright.
  const byId = hexIndex(pressed.hexes)
  const goblinHex = pressed.hexes.find((h) => h.owner === 'goblin' && h.kind !== 'gate' && h.kind !== 'capital' && neighbors(h.id).some((n) => byId.get(n)?.owner === 'neutral')) as CampaignState['hexes'][number]
  const beside = neighbors(goblinHex.id).find((n) => byId.get(n)?.owner === 'neutral') as string
  const touching = fired(withOwner(pressed, [beside], 'orc'))
  const taken = touching.events.find((e) => e.kind === 'hexTransfer' && e.from === 'goblin' && e.to === 'orc')
  assert.ok(taken && taken.kind === 'hexTransfer' && taken.how === 'conquest')
  assert.equal(resultLine(taken)?.textId, 'herald.rival.takesFrom')
})

// ── Walls (C-92) ─────────────────────────────────────────────────────────────

/** The Archmage rich, with one of his border hexes facing a hex of the player's. */
function wallsCase(): { state: CampaignState; facing: string } {
  let state = realm()
  const byId = hexIndex(state.hexes)
  const border = borderHexesOf(state.hexes, 'archmage')
  const facing = border.find((h) => neighbors(h.id).some((n) => byId.get(n)?.owner === 'neutral')) as (typeof border)[number]
  const outside = neighbors(facing.id).find((n) => byId.get(n)?.owner === 'neutral') as string
  state = withOwner(state, [outside], 'player')
  state = withRival(state, 'archmage', { treasury: 20_000 })
  return { state, facing: facing.id }
}

test('C-92: the walls facing the player go up at the close; the rest wait, the same number a day, over the next 6 days', () => {
  const { state, facing } = wallsCase()
  const turned = rivalTurn(state, week(SUNDAY, 2)).state
  assert.ok(hex(turned, facing).fortification > hex(state, facing).fortification, 'the facing hex is walled at once')
  const walls = turned.rivals.archmage.ai?.walls ?? []
  assert.ok(walls.length > 0, 'levels away from the player wait')
  const perDay = Math.ceil(walls.length / RULES.rivalAi.wallDays)
  const byDay = new Map<string, number>()
  for (const w of walls) byDay.set(w.day, (byDay.get(w.day) ?? 0) + 1)
  for (const [day, n] of byDay) {
    assert.ok(day >= addDays(SUNDAY, 1) && day <= addDays(SUNDAY, RULES.rivalAi.wallDays), day)
    assert.ok(n <= perDay)
  }
  for (const w of walls) assert.equal(hex(turned, w.hexId).fortification, hex(state, w.hexId).fortification, `${w.hexId} not walled yet`)
  assert.equal(turned.rivals.archmage.treasury < state.rivals.archmage.treasury, true, 'every level is paid at the close')

  let later = turned
  for (let d = addDays(SUNDAY, 1); d <= addDays(SUNDAY, RULES.rivalAi.wallDays); d = addDays(d, 1)) later = rivalMovesDay(later, d, () => undefined)
  for (const w of walls) assert.ok(hex(later, w.hexId).fortification >= w.level, `${w.hexId} at level ${w.level}`)
  assert.equal(later.rivals.archmage.ai?.walls, undefined, 'all raised before the next close')
})

test('C-92: a waiting wall level on a hex the rival no longer holds is dropped', () => {
  const { state } = wallsCase()
  const turned = rivalTurn(state, week(SUNDAY, 2)).state
  const [first] = turned.rivals.archmage.ai?.walls ?? []
  const lost = withOwner(turned, [first.hexId], 'player')
  const after = rivalMovesDay(lost, first.day, () => undefined)
  assert.equal(hex(after, first.hexId).fortification, hex(lost, first.hexId).fortification)
  assert.ok(!(after.rivals.archmage.ai?.walls ?? []).some((w) => w.hexId === first.hexId && w.day === first.day))
})

// ── Daily conquest planning (C-93, T-09) ─────────────────────────────────────

/** The Orc strong and beside a hex of the player's in week 6, about to go to War by his Respect. */
function warCase(): { state: CampaignState; day: string } {
  let state = realm()
  const target = state.hexes.find((h) => h.owner === 'neutral' && !h.village && h.kind === 'between' && neighbors(h.id).some((n) => hex(state, n).owner === 'orc'))
  assert.ok(target)
  state = withOwner(state, [target.id], 'player')
  state = withRival(state, 'orc', { companies: [{ ...state.rivals.orc.companies[0], power: 400 }], respect: RULES.respect.marks.orc.war - 20 })
  const day = '2026-11-11' // a Wednesday in week 6
  return { state: { ...state, settledThrough: { day: addDays(day, -1), week: 6 } }, day }
}

test('C-93, D-51: on (as the rules have it), a rival going to War mid-week plans at once; switched off, nothing before the close', () => {
  assert.equal(RULES.rivalAi.planConquestOnWar, true)
  const { state, day } = warCase()
  const on = dailyStandings(state, day, () => undefined, () => week(day, 6))
  assert.equal(on.rivals.orc.disposition.player, 'war')
  assert.equal(combatOf(on).conquests.filter((c) => c.rival === 'orc').length, RULES.rivalAi.conquestPlansPerWeek)
  const off = dailyStandings(state, day, () => undefined, () => week(day, 6), false)
  assert.equal(off.rivals.orc.disposition.player, 'war')
  assert.equal(combatOf(off).conquests.filter((c) => c.rival === 'orc').length, 0)
})

test('C-93: on, he plans his attempt at once, striking 2 to 7 days later, and never a second while one is coming', () => {
  const { state, day } = warCase()
  const next = dailyStandings(state, day, () => undefined, () => week(day, 6), true)
  const planned = combatOf(next).conquests.filter((c) => c.rival === 'orc')
  assert.equal(planned.length, RULES.rivalAi.conquestPlansPerWeek)
  for (const c of planned) assert.ok(c.date >= addDays(day, RULES.rivalAi.conquestDays.min) && c.date <= addDays(day, RULES.rivalAi.conquestDays.max), c.date)
  const tension = withRival(next, 'orc', { disposition: { ...next.rivals.orc.disposition, player: 'tension' } })
  const again = dailyStandings(tension, addDays(day, 1), () => undefined, () => week(addDays(day, 1), 6), true)
  assert.equal(combatOf(again).conquests.filter((c) => c.rival === 'orc').length, planned.length, 'one already coming: no second')
})
