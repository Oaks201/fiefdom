import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDays } from '../../src/renderer/src/lib/game/clock'
import { raiderWeights, threatStrength } from '../../src/renderer/src/lib/game/combat'
import { realmEffects } from '../../src/renderer/src/lib/game/effects'
import { borderCampaigns, drawFronts, frontWarChance, settleFronts, type RivalWeek } from '../../src/renderer/src/lib/game/rivals'
import type { CampaignState, Coalition, FrontId, GameEvent, RivalId } from '../../src/renderer/src/lib/game/types'
import { realm } from './support/realm'
import { eventsOf, simulateRivals } from './support/rival-sim'
import { near } from './support/assert'


function week(day: string, n: number, events: GameEvent[] = []): RivalWeek {
  return {
    day,
    week: n,
    weekStartsOn: 1,
    days: 7,
    valor: 1,
    habits: { days: [], pillars: { steps: 0, table: 0, duties: 0 } },
    emit: (kind, payload) => void events.push({ id: `t-${events.length + 1}`, day, kind, ...payload } as GameEvent)
  }
}

function withFront(state: CampaignState, front: FrontId, frontState: 'peace' | 'tension' | 'war', track: number): CampaignState {
  const f = state.fronts[front]
  const [a, b] = f.rivals
  return {
    ...state,
    fronts: { ...state.fronts, [front]: { ...f, state: frontState, track } },
    rivals: {
      ...state.rivals,
      [a]: { ...state.rivals[a], frontTracks: { ...state.rivals[a].frontTracks, [front]: track }, disposition: { ...state.rivals[a].disposition, [b]: frontState } },
      [b]: { ...state.rivals[b], frontTracks: { ...state.rivals[b].frontTracks, [front]: -track }, disposition: { ...state.rivals[b].disposition, [a]: frontState } }
    }
  }
}

function av(state: CampaignState, rival: RivalId): number {
  return state.rivals[rival].companies.reduce((s, c) => s + c.power, 0)
}

function withArmy(state: CampaignState, rival: RivalId, power: number): CampaignState {
  const r = state.rivals[rival]
  return { ...state, rivals: { ...state.rivals, [rival]: { ...r, companies: [{ ...r.companies[0], power }] } } }
}

const SUNDAY = '2026-11-15'

// ── Fronts (Ch 12, A-37) ─────────────────────────────────────────────────────

test('Ch 12 fronts: at War one skirmish a day moves the track a step toward the winner, within −3 to +3, and the week costs both sides 5% of AV', () => {
  let state = withFront(realm(), 'north', 'war', 0)
  state = withArmy(withArmy(state, 'orc', 400), 'goblin', 1)
  const events: GameEvent[] = []
  const next = settleFronts(state, week(SUNDAY, 6, events))
  // With 400 against 1 the Orc wins every skirmish: +7 steps, held at +3.
  assert.equal(next.fronts.north.track, 3)
  assert.equal(next.rivals.orc.frontTracks.north, 3)
  assert.equal(next.rivals.goblin.frontTracks.north, -3)
  near(av(next, 'orc'), 380)
  near(av(next, 'goblin'), 0.95)
  // The other fronts were at Peace: no loss there.
  assert.equal(av(next, 'dwarf'), av(state, 'dwarf'))
  assert.deepEqual(
    eventsOf(events, 'front').map((e) => [e.front, e.track]),
    [['north', 3]]
  )
  // Every track stays within −3 to +3 over a long war.
  let long = withFront(realm(), 'west', 'war', 0)
  for (let i = 0; i < 20; i++) {
    long = settleFronts(long, week(addDays(SUNDAY, 7 * i), 6 + i))
    assert.ok(Math.abs(long.fronts.west.track) <= 3)
  }
})

test('A-37: a week at Peace moves the track one step toward 0; Tension leaves it', () => {
  const peace = settleFronts(withFront(realm(), 'south', 'peace', -3), week(SUNDAY, 6))
  assert.equal(peace.fronts.south.track, -2)
  assert.equal(peace.rivals.archmage.frontTracks.south, -2)
  assert.equal(peace.rivals.dwarf.frontTracks.south, 2)
  const tension = settleFronts(withFront(realm(), 'south', 'tension', -3), week(SUNDAY, 6))
  assert.equal(tension.fronts.south.track, -3)
  assert.equal(av(tension, 'dwarf'), av(realm(), 'dwarf'))
})

test('Ch 12 fronts: Emboldened at +3 strengthens the rival’s raids by 15%; Humbled at −3 weakens them by 15%', () => {
  const raid = (state: CampaignState): number =>
    threatStrength(state, realmEffects(state), { kind: 'raid', rival: 'orc', date: '2026-11-16', ring: 4, roll: 0, week: 7, daily: false, wild: 115 })
  const plain = raid(realm())
  near(raid(withFront(realm(), 'north', 'tension', 3)), plain * 1.15)
  near(raid(withFront(realm(), 'north', 'tension', -3)), plain * 0.85)
  near(raid(withFront(realm(), 'north', 'tension', 2)), plain)
})

test('Ch 12 fronts: fronts touching the Orc go to War about 40% of weeks, the others about 25%; a call to arms holds War', () => {
  assert.equal(frontWarChance('north'), 0.4)
  assert.equal(frontWarChance('west'), 0.4)
  assert.equal(frontWarChance('south'), 0.25)
  assert.equal(frontWarChance('east'), 0.25)
  const counts: Record<FrontId, number> = { north: 0, south: 0, west: 0, east: 0 }
  const weeks = 1500
  let state = realm()
  for (let i = 0; i < weeks; i++) {
    state = drawFronts(state, week(addDays(SUNDAY, 7 * i), 6 + i))
    for (const f of Object.values(state.fronts)) if (f.state === 'war') counts[f.front]++
  }
  for (const f of ['north', 'west'] as const) near(counts[f] / weeks, 0.4, 0.04)
  for (const f of ['south', 'east'] as const) near(counts[f] / weeks, 0.25, 0.04)

  const called = { ...realm(), deals: [{ id: 'd', rival: 'dwarf' as const, kind: 'callToArms' as const, madeOn: '2026-11-10', until: '2026-11-23', target: 'goblin' as const, price: 200 }] }
  for (let i = 0; i < 2; i++) assert.equal(drawFronts(called, week(addDays(SUNDAY, 7 * i), 6 + i)).fronts.east.state, 'war')
})

test('A-26: a rival at war with another rival raids the player half as often', () => {
  const state = realm()
  const day = '2026-11-16'
  const calm = raiderWeights(state, day).find((r) => r.rival === 'goblin')?.weight ?? 0
  const war = raiderWeights(withFront(state, 'east', 'war', 0), day).find((r) => r.rival === 'goblin')?.weight ?? 0
  near(war, calm / 2)
})

test('Ch 13: while a coalition stands, its members’ shared front is at Peace', () => {
  const coalition: Coalition = { members: ['orc', 'goblin'], trigger: 'risingCrown', warChest: 0 }
  let state = { ...realm(), coalitions: [coalition] }
  for (let i = 0; i < 60; i++) {
    state = drawFronts(state, week(addDays(SUNDAY, 7 * i), 6 + i))
    assert.equal(state.fronts.north.state, 'peace')
  }
})

// ── Border Campaigns are gone (R-26) ─────────────────────────────────────────

test('R-26: Border Campaigns are gone: the phase only draws next week’s fronts, and no land changes hands between rivals, even on a front at War at +3', () => {
  let state = withFront(realm(), 'north', 'war', 3)
  state = withArmy(withArmy(state, 'orc', 1000), 'goblin', 100)
  const events: GameEvent[] = []
  const next = borderCampaigns(state, week(SUNDAY, 10, events))
  assert.equal(eventsOf(events, 'borderCampaign').length, 0)
  assert.equal(eventsOf(events, 'hexTransfer').length, 0)
  assert.deepEqual(next.hexes, state.hexes)
  near(av(next, 'orc'), 1000)
  assert.deepEqual(next, drawFronts(state, week(SUNDAY, 10, [])), 'nothing but the fronts')
})

test('Test 10 (part), R-26: across 300 seeded 70-week runs no hex changes hands between rivals but by the Goblin’s Market, and no rival holds rings 0 to 2', (t) => {
  const taken: number[] = []
  const bought: number[] = []
  let campaigns = 0
  for (let seed = 1; seed <= 300; seed++) {
    // Every third run has a standing coalition between two neighbors, to check they never fight.
    const pairs: [RivalId, RivalId][] = [
      ['orc', 'goblin'],
      ['archmage', 'dwarf'],
      ['orc', 'archmage'],
      ['goblin', 'dwarf']
    ]
    const coalitions: Coalition[] = seed % 3 === 0 ? [{ members: pairs[seed % 4], trigger: 'risingCrown', warChest: 0 }] : []
    const start = realm(seed)
    const kinds = new Map(start.hexes.map((h) => [h.id, h.kind]))
    const run = simulateRivals(start, 70, { playerHexes: 12, coalitions })
    for (const w of run.weeks) {
      for (const e of eventsOf(w.events, 'borderCampaign')) {
        campaigns++
        assert.notEqual(kinds.get(e.hexId), 'gate', `seed ${seed} week ${w.week}`)
        assert.notEqual(kinds.get(e.hexId), 'capital', `seed ${seed} week ${w.week}`)
        assert.equal(w.playerHexes.has(e.hexId), false, `seed ${seed} week ${w.week}: a player hex`)
        for (const c of coalitions) assert.ok(!(c.members.includes(e.attacker) && c.members.includes(e.defender)), `seed ${seed}: partners fought`)
      }
    }
    for (const h of run.state.hexes) if (h.ring <= 2) assert.ok(h.owner === 'player' || h.owner === 'neutral', `seed ${seed}: a rival in ring ${h.ring}`)
    const transfers = eventsOf(run.events, 'hexTransfer')
    const between = (e: { from: string; to: string }): boolean => e.from !== 'player' && e.from !== 'neutral' && e.to !== 'player' && e.to !== 'neutral'
    taken.push(transfers.filter((e) => e.how === 'borderCampaign').length)
    bought.push(transfers.filter((e) => e.how === 'trade' && between(e)).length)
  }
  const median = (xs: number[]): number => {
    const s = [...xs].sort((a, b) => a - b)
    return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
  }
  t.diagnostic(`Goblin Market purchases between rivals: median ${median(bought)} per campaign`)
  assert.equal(campaigns, 0, 'no Border Campaign is fought')
  assert.equal(Math.max(...taken), 0, 'no hex taken by a Border Campaign')
})
