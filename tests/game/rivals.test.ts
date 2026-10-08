import './support/tokyo-tz'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDays } from '../../src/renderer/src/lib/game/clock'
import { COMBAT_HOOKS, armyValue, combatOf, dawn, tidings } from '../../src/renderer/src/lib/game/combat'
import { resolveCourtships, resolveRivalCourtships } from '../../src/renderer/src/lib/game/land'
import { isClaimableKind, neighbors } from '../../src/renderer/src/lib/game/map'
import {
  armyBand,
  armyPointCost,
  benchmarkConsistency,
  benchmarkContractMultiplier,
  benchmarkIncome,
  dispositionFor,
  hostileAct,
  initRivals,
  prizedWeek,
  respectEffects,
  rivalBidsAtClose,
  rivalIncome,
  rivalTurn,
  rivalView,
  startingArmy,
  threatScore,
  treasuryBand,
  type RivalWeek,
  type WeekHabits
} from '../../src/renderer/src/lib/game/rivals'
import { RULES } from '../../src/renderer/src/lib/game/rules'
import { adjustRespect } from '../../src/renderer/src/lib/game/state'
import { settle } from '../../src/renderer/src/lib/game/settle'
import type { CampaignState, DayRecord, GameEvent, GraceLevel, RivalId } from '../../src/renderer/src/lib/game/types'
import { chicago, steadyLedger } from './fixtures/ledgers'
import { realm, withArmory, withCrossings, withBuildings, withPurse } from './support/realm'
import { eventsOf, simulateRivals } from './support/rival-sim'
import { hex, withOwner } from './support/war'
import { near } from './support/assert'


/** The first week close of `realm()`: founded Wednesday 2026-10-07, weeks start Monday, so week 1 is Thursday to Sunday. */
const WEEK1_CLOSE = '2026-10-11'

function perfectDays(from: string, n: number): DayRecord[] {
  return Array.from({ length: n }, (_, i) => ({ date: addDays(from, i), steps: 10_000, eaten: 1_900, dutiesKept: 3, dutiesSworn: 3 }))
}

const PERFECT: WeekHabits = { days: perfectDays('2026-10-05', 7), pillars: { steps: 1, table: 1, duties: 1 } }
const NOTHING: WeekHabits = {
  days: perfectDays('2026-10-05', 7).map((d) => ({ ...d, eaten: undefined, dutiesKept: 0 })),
  pillars: { steps: 0.5, table: 0, duties: 0 }
}

function week(day: string, n: number, events: GameEvent[] = [], habits: WeekHabits = NOTHING, days = 7): RivalWeek {
  return {
    day,
    week: n,
    weekStartsOn: 1,
    days,
    valor: 1,
    habits,
    emit: (kind, payload) => void events.push({ id: `t-${events.length + 1}`, day, kind, ...payload } as GameEvent)
  }
}

function withRival(state: CampaignState, rival: RivalId, patch: Partial<CampaignState['rivals'][RivalId]>): CampaignState {
  return { ...state, rivals: { ...state.rivals, [rival]: { ...state.rivals[rival], ...patch } } }
}

function withGrace(state: CampaignState, grace: GraceLevel): CampaignState {
  return { ...state, weight: { ...state.weight, grace } }
}

// ── The founding (A-18) ──────────────────────────────────────────────────────

test('A-18: initRivals gives each rival treasury 150, about 40 power from its own host list, Respect 20, Tension, and Peace on its fronts', () => {
  const state = realm()
  const rivals = initRivals(state.campaign.seed, state.hexes)
  assert.deepEqual(rivals, state.rivals, 'the founding uses initRivals')
  for (const rival of ['orc', 'goblin', 'dwarf', 'archmage'] as const) {
    const r = rivals[rival]
    assert.equal(r.treasury, 150)
    assert.equal(r.respect, 20)
    assert.equal(r.disposition.player, 'tension')
    assert.equal(r.threat, 0)
    assert.equal(r.status, 'active')
    const av = r.companies.reduce((s, c) => s + c.power, 0)
    assert.ok(av <= 40 && av >= 36, `${rival} starts with ${av} power`)
    assert.equal(Object.keys(r.frontTracks).length, 2)
    for (const t of Object.values(r.frontTracks)) assert.equal(t, 0)
  }
  assert.deepEqual(
    startingArmy('orc').map((c) => c.power),
    [20, 20]
  )
  for (const f of Object.values(state.fronts)) assert.deepEqual([f.state, f.track], ['peace', 0])
})

// ── The hidden benchmark ─────────────────────────────────────────────────────

test('Test 5: BI(0.80, 1.7) = 344.53', () => {
  near(benchmarkIncome(0.8, 1.7), 344.53, 0.01)
})

test('Ch 12: b and L by week — 1 → 0.72 / 1.0; 3 → 0.72 / 1.4; 9 → 0.78 / 1.4; 10 → 0.78 / 1.7; 21 → 0.82 / 2.0; 37 → 0.86 / 2.0', () => {
  const cases: [number, number, number][] = [
    [1, 0.72, 1.0],
    [2, 0.72, 1.0],
    [3, 0.72, 1.4],
    [8, 0.72, 1.4],
    [9, 0.78, 1.4],
    [10, 0.78, 1.7],
    [20, 0.78, 1.7],
    [21, 0.82, 2.0],
    [36, 0.82, 2.0],
    [37, 0.86, 2.0]
  ]
  for (const [w, b, L] of cases) {
    near(benchmarkConsistency(w), b)
    near(benchmarkContractMultiplier(w), L)
  }
})

test('Ch 12: Grace II lowers b 3 points and Grace III 6 (week 40 at Grace III → 0.80); a forced Grace III in week 1 stops at the 0.70 floor', () => {
  near(benchmarkConsistency(40, 3), 0.8)
  near(benchmarkConsistency(40, 2), 0.83)
  near(benchmarkConsistency(40, 1), 0.86)
  near(benchmarkConsistency(1, 3), 0.7)
  near(benchmarkConsistency(1, 2), 0.7)
})

test('Ch 12: rival income is BI × its multiplier + 4 × ring per village it holds, prorated in a partial week 1 (A-04)', () => {
  const state = realm()
  const bi = benchmarkIncome(0.72, 1.0)
  // Every rival starts with its Gate and two March villages, all in ring 5: 3 × 4 × 5 = 60.
  near(rivalIncome(state, 'goblin', 1), bi * 1.1 + 60)
  near(rivalIncome(state, 'orc', 1), bi * 0.95 + 60)
  near(rivalIncome(state, 'orc', 1, 4), ((bi * 0.95 + 60) * 4) / 7)
  near(rivalIncome(withGrace(state, 3), 'dwarf', 40), benchmarkIncome(0.8, 2.0) + 60)
})

test('Ch 12: each point of army power costs 10 at AV 0 and 20 at AV 150', () => {
  near(armyPointCost(0), 10)
  near(armyPointCost(150), 20)
  near(armyPointCost(75), 15)
})

// ── Threat, Power and disposition ────────────────────────────────────────────

test('Ch 12 Threat: player Power 1,500 against an average of 1,000, none resolved, bordering on 3 hexes → 40 × 1.5 + 10 = 70 → War', () => {
  const threat = threatScore({ playerPower: 1500, averageRivalPower: 1000, resolved: 0, borderHexes: 3, tookLand: false })
  near(threat, 70)
  assert.equal(dispositionFor({ threat, tookLand: false, inCoalition: false, respect: 80, quiet: true }), 'war')
  near(threatScore({ playerPower: 1500, averageRivalPower: 1000, resolved: 0, borderHexes: 2, tookLand: false }), 60)
  near(threatScore({ playerPower: 5000, averageRivalPower: 1000, resolved: 2, borderHexes: 5, tookLand: true }), 100, 0)
  near(threatScore({ playerPower: 3000, averageRivalPower: 1000, resolved: 0, borderHexes: 0, tookLand: false }), 80)
})

test('Ch 12 disposition: War on land taken in 2 weeks or a coalition; Peace needs Respect 50 and 4 quiet weeks; otherwise Tension', () => {
  const calm = { threat: 20, tookLand: false, inCoalition: false, respect: 50, quiet: true }
  assert.equal(dispositionFor(calm), 'peace')
  assert.equal(dispositionFor({ ...calm, respect: 49 }), 'tension')
  assert.equal(dispositionFor({ ...calm, quiet: false }), 'tension')
  assert.equal(dispositionFor({ ...calm, tookLand: true }), 'war')
  assert.equal(dispositionFor({ ...calm, inCoalition: true }), 'war')
  assert.equal(dispositionFor({ ...calm, threat: 60 }), 'war')
})

test('Ch 12: Peace needs Respect ≥ 50 and 4 quiet weeks; one raid the player defeats in that span keeps the rival at Tension', () => {
  const day = '2026-11-15' // week 6's close
  const base = withRival(realm(), 'dwarf', { respect: 60 })
  const quiet = rivalTurn(base, week(day, 6)).state
  assert.equal(quiet.rivals.dwarf.disposition.player, 'peace')
  assert.ok(quiet.rivals.dwarf.threat < 60)

  const raid: GameEvent = { id: 'ev-raid', day: '2026-10-25', kind: 'defense', threat: 'raid', hexId: '0,-1', rival: 'dwarf', outcome: 'victory', spoils: 4 }
  const raided = { ...base, log: [raid] }
  assert.equal(hostileAct(raided, 'dwarf', day, 28), true)
  assert.equal(rivalTurn(raided, week(day, 6)).state.rivals.dwarf.disposition.player, 'tension')
  // The same raid 28 days before the close is outside the 4 weeks.
  const old = { ...base, log: [{ ...raid, day: addDays(day, -28) }] }
  assert.equal(hostileAct(old, 'dwarf', day, 28), false)
  assert.equal(rivalTurn(old, week(day, 6)).state.rivals.dwarf.disposition.player, 'peace')
  // A raid by another rival doesn't count against the Dwarf.
  const other = { ...base, log: [{ ...raid, rival: 'orc' as const }] }
  assert.equal(rivalTurn(other, week(day, 6)).state.rivals.dwarf.disposition.player, 'peace')
})

test('Ch 12: a disposition change is posted; taking a rival’s land puts it at War for 2 weeks', () => {
  const day = '2026-11-15'
  const taken: GameEvent = { id: 'ev-take', day: '2026-11-10', kind: 'hexTransfer', hexId: '0,-5', from: 'orc', to: 'player', how: 'conquest' }
  const events: GameEvent[] = []
  const next = rivalTurn({ ...realm(), log: [taken] }, week(day, 6, events)).state
  assert.equal(next.rivals.orc.disposition.player, 'war')
  assert.deepEqual(
    eventsOf(events, 'disposition').filter((e) => e.rival === 'orc').map((e) => [e.from, e.to]),
    [['tension', 'war']]
  )
  const later = rivalTurn({ ...realm(), log: [taken] }, week('2026-11-29', 8)).state
  assert.equal(later.rivals.orc.disposition.player, 'tension')
})

// ── Respect ──────────────────────────────────────────────────────────────────

test('Ch 12 Respect: changes clamp to 0–100 and are posted; the thresholds open what Ch 12 lists', () => {
  const events: GameEvent[] = []
  const emit: RivalWeek['emit'] = (kind, payload) => void events.push({ id: 'x', day: 'd', kind, ...payload } as GameEvent)
  let state = adjustRespect(realm(), 'orc', RULES.respect.change.hexConquered, 'hexConquered', emit)
  assert.equal(state.rivals.orc.respect, 15)
  state = adjustRespect(state, 'orc', -40, 'test', emit)
  assert.equal(state.rivals.orc.respect, 0)
  assert.equal(adjustRespect(state, 'orc', -2, 'raidLost', emit), state, 'no change at the floor, nothing posted')
  assert.deepEqual(
    eventsOf(events, 'respect').map((e) => e.change),
    [-5, -15]
  )
  assert.equal(respectEffects('orc', 24).raidsWeaker, false)
  assert.equal(respectEffects('orc', 25).raidsWeaker, true)
  assert.equal(respectEffects('goblin', 25).sellsHex, true)
  assert.equal(respectEffects('orc', 49).sellsHex, false)
  assert.deepEqual(respectEffects('dwarf', 75), {
    raidsWeaker: true,
    sellsHex: true,
    buysHex: true,
    pact: true,
    envoy: true,
    accordTalks: true,
    callToArms: true,
    accordEasier: true
  })
})

test('A-38: the prized-habit Respect (+4) is paid only in weeks that meet each rival’s habit', () => {
  const state = realm()
  const day = '2026-10-11'
  // Orc: no lost battle of any kind.
  assert.equal(prizedWeek(state, 'orc', NOTHING, day, 1), true)
  const lost: GameEvent = { id: 'l', day: '2026-10-09', kind: 'defense', threat: 'beasts', hexId: '0,-1', outcome: 'defeat', tribute: 3 }
  assert.equal(prizedWeek({ ...state, log: [lost] }, 'orc', NOTHING, day, 1), false)
  const repulsed: GameEvent = { id: 'r', day: '2026-10-10', kind: 'assault', hexId: '0,-2', owner: 'neutral', outcome: 'repulsed', wear: 3 }
  assert.equal(prizedWeek({ ...state, log: [repulsed] }, 'orc', NOTHING, day, 1), false)
  const lastWeek: GameEvent = { ...lost, day: '2026-10-04' }
  assert.equal(prizedWeek({ ...state, log: [lastWeek] }, 'orc', NOTHING, day, 1), true)
  // Goblin: the budget score at 100% with food logged on 5 days or more.
  assert.equal(prizedWeek(state, 'goblin', PERFECT, day, 1), true)
  const fourDays: WeekHabits = { ...PERFECT, days: PERFECT.days.map((d, i) => (i < 3 ? { ...d, eaten: undefined } : d)) }
  assert.equal(prizedWeek(state, 'goblin', fourDays, day, 1), false)
  assert.equal(prizedWeek(state, 'goblin', { ...PERFECT, pillars: { ...PERFECT.pillars, table: 0.99 } }, day, 1), false)
  // Archmage: every sworn duty kept every day.
  assert.equal(prizedWeek(state, 'archmage', PERFECT, day, 1), true)
  const oneMissed: WeekHabits = { ...PERFECT, days: PERFECT.days.map((d, i) => (i === 6 ? { ...d, dutiesKept: 2 } : d)) }
  assert.equal(prizedWeek(state, 'archmage', oneMissed, day, 1), false)
  // Dwarf: the step pool met.
  assert.equal(prizedWeek(state, 'dwarf', PERFECT, day, 1), true)
  assert.equal(prizedWeek(state, 'dwarf', { ...PERFECT, pillars: { ...PERFECT.pillars, steps: 0.98 } }, day, 1), false)

  // Through the turn: a week of steps only pays the Dwarf (and the Orc, who saw no lost battle).
  const stepsOnly: WeekHabits = { days: NOTHING.days, pillars: { steps: 1, table: 0, duties: 0 } }
  const events: GameEvent[] = []
  rivalTurn(state, week(WEEK1_CLOSE, 1, events, stepsOnly, 4))
  assert.deepEqual(
    eventsOf(events, 'respect')
      .filter((e) => e.reason === 'prizedWeek')
      .map((e) => [e.rival, e.change])
      .sort(),
    [
      ['dwarf', 4],
      ['orc', 4]
    ]
  )
})

// ── The weekly turn ──────────────────────────────────────────────────────────

test('Ch 12 turn: each rival earns, keeps a 100 reserve, buys whole companies, and never ends below zero', () => {
  const state = realm()
  const events: GameEvent[] = []
  const next = rivalTurn(state, week(WEEK1_CLOSE, 1, events, NOTHING, 4)).state
  for (const rival of ['orc', 'goblin', 'dwarf', 'archmage'] as const) {
    const before = state.rivals[rival]
    const after = next.rivals[rival]
    const income = rivalIncome(state, rival, 1, 4)
    const budget = before.treasury + income - RULES.rivals.reserve
    // The treasury, the fund and the bids it placed account for every coin; nothing goes below the reserve.
    const bids = (after.ai?.courting ?? []).reduce((s, c) => s + c.bid, 0)
    assert.ok(after.treasury >= RULES.rivals.reserve - 1e-9, `${rival} keeps its reserve`)
    assert.ok(after.treasury + after.specialFund + bids <= before.treasury + income + 1e-9)
    const avBefore = before.companies.reduce((s, c) => s + c.power, 0)
    const avAfter = after.companies.reduce((s, c) => s + c.power, 0)
    const armyBudget = budget * RULES.rivals.budget[rival].army
    assert.ok(avAfter >= avBefore)
    if (armyBudget >= 6 * armyPointCost(avBefore) * 1.2) assert.ok(avAfter > avBefore, `${rival} buys at least one company`)
    for (const c of after.companies) assert.equal(c.source, 'host')
    assert.equal(new Set(after.companies.map((c) => c.id)).size, after.companies.length, 'company ids stay unique')
  }
  assert.equal(next.rivals.orc.specialFund > 0, true, 'the Orc saves for its Warhost')
  assert.equal(next.rivals.dwarf.specialFund, 0, 'the Dwarf spends its special share on the Deep Halls')
})

test('A-25: a rival courts the best affordable village with 1.1 × loyalty (the Goblin 1.3 ×); the bid resolves at the next close', () => {
  // Give the Orc a ring-4 village to reach: hand it a ring-5 hex beside one.
  let state = realm()
  const village = state.hexes.find((h) => h.ring === 4 && h.village && h.owner === 'neutral') as CampaignState['hexes'][number]
  const step = neighbors(village.id).find((n) => hex(state, n).ring === 5 && hex(state, n).owner === 'neutral' && !hex(state, n).village && isClaimableKind(hex(state, n))) as string
  state = withOwner(state, [step], 'orc')
  state = withRival(state, 'orc', { treasury: 1000 })
  const day = '2026-10-18'
  const next = rivalTurn(state, week(day, 2)).state
  const bid = (next.rivals.orc.ai?.courting ?? []).find((c) => c.hexId === village.id)
  assert.ok(bid, 'the Orc courts the village')
  near(bid.bid, 1.1 * 15 * 4)
  assert.equal(bid.placedOn, day)

  // At the next close, with no other suitor, 66 at Trust 1.0 beats loyalty 60.
  const events: GameEvent[] = []
  const emit: RivalWeek['emit'] = (kind, payload) => void events.push({ id: 'x', day: '2026-10-25', kind, ...payload } as GameEvent)
  const resolved = resolveRivalCourtships(next, { day: '2026-10-25', realmConsistency: 1, emit })
  assert.equal(hex(resolved, village.id).owner, 'orc')
  assert.equal(hex(resolved, village.id).village?.loyalty, 30 * 4)
  assert.deepEqual(resolved.rivals.orc.ai?.courting, [])
  assert.deepEqual(
    eventsOf(events, 'hexTransfer').map((e) => [e.hexId, e.from, e.to, e.how]),
    [[village.id, 'neutral', 'orc', 'influence']]
  )
})

test('Ch 6 two suitors (T10): a rival’s pending bid joins the player’s courtship on the same village; the higher Offer wins', () => {
  let state = withPurse(realm(), 500)
  const village = state.hexes.find((h) => h.ring === 3 && h.village && h.owner === 'neutral') as CampaignState['hexes'][number]
  const inner = neighbors(village.id).find((n) => hex(state, n).ring === 2 && hex(state, n).owner === 'neutral') as string
  state = withOwner(state, [inner], 'player')
  state = { ...state, courtships: [{ hexId: village.id, bid: 40, placedOn: '2026-10-20', rivalBids: {} }] }
  state = withRival(state, 'goblin', { ai: { courting: [{ hexId: village.id, bid: 58.5, placedOn: '2026-10-18' }] } })
  const day = '2026-10-25'
  const joined = rivalBidsAtClose(state, day)
  assert.equal(joined.courtships[0].rivalBids.goblin, 58.5)
  assert.deepEqual(joined.rivals.goblin.ai?.courting, [])

  const events: GameEvent[] = []
  const emit: RivalWeek['emit'] = (kind, payload) => void events.push({ id: 'x', day, kind, ...payload } as GameEvent)
  const week2 = { day, realmConsistency: 1, emit }
  const done = resolveRivalCourtships(resolveCourtships(joined, week2), week2)
  // The player offers 40 × 1.2 = 48; the Goblin 58.5 wins and beats loyalty 45.
  assert.equal(hex(done, village.id).owner, 'goblin')
  assert.equal(done.rivals.goblin.treasury, joined.rivals.goblin.treasury, 'the winner has spent its whole bid')
})

test('Ch 12 step 8: a rival counter-bids 60% of its reserve (the Goblin 100%) on its own villages the player courts; never refunded', () => {
  let state = withPurse(realm(), 500)
  const orcVillage = state.hexes.find((h) => h.owner === 'orc' && h.village && h.kind !== 'gate') as CampaignState['hexes'][number]
  const goblinVillage = state.hexes.find((h) => h.owner === 'goblin' && h.village && h.kind !== 'gate') as CampaignState['hexes'][number]
  state = {
    ...state,
    courtships: [
      { hexId: orcVillage.id, bid: 100, placedOn: '2026-10-20', rivalBids: {} },
      { hexId: goblinVillage.id, bid: 100, placedOn: '2026-10-20', rivalBids: {} }
    ]
  }
  state = withRival(state, 'goblin', { treasury: 80 })
  const bid = rivalBidsAtClose(state, '2026-10-25')
  near(bid.courtships[0].rivalBids.orc ?? 0, 60)
  near(bid.rivals.orc.treasury, 90)
  near(bid.courtships[1].rivalBids.goblin ?? 0, 80)
  near(bid.rivals.goblin.treasury, 0)
  // A courtship placed after the close waits for the next one.
  const later = rivalBidsAtClose({ ...state, courtships: state.courtships.map((c) => ({ ...c, placedOn: '2026-10-26' })) }, '2026-10-25')
  assert.equal(later.rivals.orc.treasury, 150)
})

test('Ch 12 step 7: at War from week 6 a rival announces a conquest attempt for next week when 0.5 × AV ≥ 0.8 × the expected defense', () => {
  let state = realm()
  const target = state.hexes.find((h) => h.ring === 4 && !h.village && h.kind === 'between' && neighbors(h.id).some((n) => hex(state, n).owner === 'orc'))
  assert.ok(target, 'a ring-4 hex beside the Orc')
  state = withOwner(state, [target.id], 'player')
  const strong = { ...state.rivals.orc.companies[0], power: 400 }
  state = withRival(state, 'orc', { companies: [strong] })
  const taken: GameEvent = { id: 'ev-take', day: '2026-11-14', kind: 'hexTransfer', hexId: target.id, from: 'orc', to: 'player', how: 'conquest' }
  state = { ...state, log: [taken], settledThrough: { day: '2026-11-14', week: 6 } }

  const planned = rivalTurn(state, week('2026-11-15', 6)).state
  const attempts = combatOf(planned).conquests.filter((c) => c.rival === 'orc')
  assert.equal(attempts.length, 1)
  assert.equal(attempts[0].hexId, target.id)
  assert.ok(attempts[0].date >= '2026-11-17' && attempts[0].date <= '2026-11-22')
  assert.equal(attempts[0].announcedOn, addDays(attempts[0].date, -1))

  // Week 4's close: next week is week 5, still too early.
  const early = rivalTurn({ ...state, settledThrough: { day: '2026-10-31', week: 4 } }, week('2026-11-01', 4)).state
  assert.equal(combatOf(early).conquests.length, 0)
  // A weak army doesn't try: 0.5 × 4 falls short of 0.8 × the player's defense there.
  const weak = withRival(state, 'orc', { companies: [{ ...strong, power: 4 }] })
  assert.equal(combatOf(rivalTurn(weak, week('2026-11-15', 6)).state).conquests.length, 0)
})

// ── Specials ─────────────────────────────────────────────────────────────────

test('Ch 12 specials: the Orc’s Warhost goes out at 600 saved and resets; it waits while the Orc is at Peace', () => {
  let state = realm()
  const border = state.hexes.find((h) => h.ring === 3 && h.kind === 'between') as CampaignState['hexes'][number]
  state = withOwner(state, [border.id], 'player')
  state = withRival(state, 'orc', { specialFund: 650 })
  const events: GameEvent[] = []
  const result = rivalTurn(state, week('2026-10-18', 2, events))
  assert.equal(result.warhosts.length, 1)
  assert.equal(result.warhosts[0].rival, 'orc')
  assert.equal(result.warhosts[0].hexId, border.id)
  assert.equal(result.state.rivals.orc.specialFund, 0)
  assert.deepEqual(
    eventsOf(events, 'rivalNews').map((e) => e.news),
    ['warhost']
  )

  const peace = withRival(state, 'orc', { specialFund: 650, respect: 80, disposition: { ...state.rivals.orc.disposition, player: 'peace' } })
  const calm = rivalTurn(peace, week('2026-10-18', 2))
  assert.equal(calm.warhosts.length, 0)
  assert.ok(calm.state.rivals.orc.specialFund > 650)
})

test('Ch 12 specials: the Archmage casts its Rituals in order at 400 saved, one per 6 weeks; the Long Night and Veil of Fog reach daily combat', () => {
  let state = realm()
  state = withRival(state, 'archmage', { specialFund: 2000 })
  const events: GameEvent[] = []
  const day = '2026-11-15' // week 6
  state = rivalTurn(state, week(day, 6, events)).state
  assert.deepEqual(
    eventsOf(events, 'ritual').map((e) => [e.ritualId, e.until]),
    [['longNight', addDays(day, 7)]]
  )
  assert.equal(state.rivals.archmage.ai?.ritualsCast, 1)
  // Five weeks later: not yet.
  const soon: GameEvent[] = []
  rivalTurn(state, week('2026-12-20', 11, soon))
  assert.equal(eventsOf(soon, 'ritual').length, 0)
  const next: GameEvent[] = []
  const veiled = rivalTurn(state, week('2026-12-27', 12, next)).state
  assert.deepEqual(
    eventsOf(next, 'ritual').map((e) => e.ritualId),
    ['veilOfFog']
  )

  // The Long Night doubles the mythic share of the threat mix for its 7 days.
  const mix = { beasts: 0.4, mythic: 0.2, raid: 0.4 }
  assert.equal(COMBAT_HOOKS.threatMix(state, addDays(day, 1), mix).mythic, 0.4)
  assert.equal(COMBAT_HOOKS.threatMix(state, addDays(day, 7), mix).mythic, 0.4)
  assert.equal(COMBAT_HOOKS.threatMix(state, addDays(day, 8), mix).mythic, 0.2)
  assert.equal(COMBAT_HOOKS.threatMix(state, day, mix).mythic, 0.2)

  // The Veil of Fog: tidings name the threat but show no band and no strength.
  const veilDay = '2026-12-28'
  const shown = dawn({ ...veiled, settledThrough: { day: addDays(veilDay, -1), week: 13 } }, veilDay)
  const view = tidings(shown, veilDay)
  assert.equal(view.hidden, false)
  assert.equal(view.threats.length, 1)
  assert.equal(view.threats[0].band, undefined)
  assert.equal(view.threats[0].strength, undefined)
})

test('Ch 12 specials: the Summoning puts a mythic garrison beside the player’s border; the Curse makes the strongest company Weary for 5 days', () => {
  let state = withRival(realm(), 'archmage', { specialFund: 2000, ai: { ritualsCast: 2, lastRitualWeek: 1 } })
  const events: GameEvent[] = []
  const day = '2026-11-15'
  state = rivalTurn(state, week(day, 7, events)).state
  const summoned = eventsOf(events, 'ritual')[0]
  assert.equal(summoned.ritualId, 'summoning')
  const h = hex(state, summoned.hexId as string)
  assert.equal(h.mythic, true)
  assert.equal(h.owner, 'neutral')
  near(h.garrison, 1.15 * RULES.land.baseGarrison[h.ring - 1])
  assert.ok(neighbors(h.id).some((n) => hex(state, n).owner === 'player'))

  const cursed: GameEvent[] = []
  state = rivalTurn(withRival(state, 'archmage', { specialFund: 2000 }), week('2026-12-27', 13, cursed)).state
  const curse = eventsOf(cursed, 'ritual')[0]
  assert.equal(curse.ritualId, 'curseOfWeariness')
  assert.equal(curse.until, addDays('2026-12-27', 5))
  assert.equal(state.roster.find((c) => c.id === curse.companyId)?.wearyUntil, addDays('2026-12-27', 5))
})

test('Ch 12 specials: the Goblin hires mercenaries (+15% AV for 2 weeks) for a rival at War with the player', () => {
  let state = withRival(realm(), 'goblin', { specialFund: 1000 })
  // A coalition against the player keeps the Dwarf at War whatever the turn order.
  state = { ...state, coalitions: [{ members: ['dwarf', 'archmage'], trigger: 'risingCrown', warChest: 0 }] }
  state = withRival(state, 'dwarf', { disposition: { ...state.rivals.dwarf.disposition, player: 'war' } })
  const events: GameEvent[] = []
  const day = '2026-10-18'
  const next = rivalTurn(state, week(day, 2, events)).state
  const hired = eventsOf(events, 'rivalNews').filter((e) => e.news === 'mercenaries')
  assert.ok(hired.some((e) => e.other === 'dwarf'))
  assert.equal(next.rivals.dwarf.ai?.mercenariesUntil, addDays(day, 14))
  const base = next.rivals.dwarf.companies.reduce((s, c) => s + c.power, 0)
  near(armyValue(next, 'dwarf', addDays(day, 14)), base * 1.15)
  near(armyValue(next, 'dwarf', addDays(day, 15)), base)
})

// ── What the player sees ─────────────────────────────────────────────────────

/** Every numeric field of a value, by path. */
function numbersIn(value: unknown, path = ''): string[] {
  if (typeof value === 'number') return [path]
  if (Array.isArray(value)) return value.flatMap((v, i) => numbersIn(v, `${path}[${i}]`))
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => numbersIn(v, path ? `${path}.${k}` : k))
  return []
}

test('Ch 12 hidden stays hidden: rivalView shows no number but Respect unless the Spy Network or the Spymaster reveals it', () => {
  const state = simulateRivals(realm(7), 8, { playerHexes: 12 }).state
  for (const rival of ['orc', 'goblin', 'dwarf', 'archmage'] as const) {
    const view = rivalView(state, rival)
    assert.deepEqual(numbersIn(view), ['respect'], `${rival}: ${JSON.stringify(view)}`)
    const text = JSON.stringify(view)
    const r = state.rivals[rival]
    for (const hidden of [r.treasury, r.specialFund, armyValue(state, rival), rivalIncome(state, rival, 8), benchmarkConsistency(8)]) {
      assert.equal(text.includes(String(hidden)), false)
    }
    for (const id of view.rumors) assert.match(id, /^herald\.rumor\.(army|expand|fortify|special)$/)
  }
  // The Spy Network shows treasuries and armies; never the benchmark or the income.
  const spies = withCrossings(withBuildings(state, { mageTower: 3, merchantHall: 3 }), { mageTowerMerchantHall: 2 })
  for (const rival of ['orc', 'goblin', 'dwarf', 'archmage'] as const) {
    const view = rivalView(spies, rival)
    assert.deepEqual(numbersIn(view).sort(), ['army', 'respect', 'treasury'])
    near(view.treasury ?? 0, spies.rivals[rival].treasury + spies.rivals[rival].specialFund)
  }
  // The Spymaster shows a neighbor’s treasury only (A-105).
  const master = withArmory(state, { wings: ['spymaster'] })
  const neighborsOf = (['orc', 'goblin', 'dwarf', 'archmage'] as const).filter((r) =>
    state.hexes.some((h) => h.owner === 'player' && neighbors(h.id).some((n) => hex(state, n).owner === r))
  )
  for (const rival of ['orc', 'goblin', 'dwarf', 'archmage'] as const) {
    const expected = neighborsOf.includes(rival) ? ['respect', 'treasury'] : ['respect']
    assert.deepEqual(numbersIn(rivalView(master, rival)).sort(), expected, rival)
  }
})

test('Ch 12 bands: treasuries Meager < 300 ≤ Modest < 800 ≤ Prosperous < 2,000 ≤ Mighty; armies against the player’s best (A-24)', () => {
  assert.deepEqual([0, 299, 300, 799, 800, 1999, 2000].map(treasuryBand), ['meager', 'meager', 'modest', 'modest', 'prosperous', 'prosperous', 'mighty'])
  assert.deepEqual(
    [79, 80, 125, 126, 200, 201].map((x) => armyBand(x, 100)),
    ['weaker', 'matched', 'matched', 'stronger', 'stronger', 'overwhelming']
  )
})

// ── Settlement ───────────────────────────────────────────────────────────────

test('Test 9 (part): the rival turn is settled once — settling again for a week already closed changes nothing', () => {
  const ledger = steadyLedger('2026-09-10', 120)
  const state = realm(11, ledger)
  const first = settle(state, ledger, chicago('2026-11-03'))
  assert.ok(first.events.some((e) => e.kind === 'respect' && e.reason === 'prizedWeek'), 'the rival turn ran')
  const again = settle(first.state, ledger, chicago('2026-11-03'))
  assert.equal(again.state, first.state)
  assert.equal(again.events.length, 0)
  // A later call settles only the new days; the closed weeks' rival turns stay as they were.
  const later = settle(first.state, ledger, chicago('2026-11-10'))
  assert.deepEqual(later.state.log.slice(0, first.state.log.length), first.state.log)
  // One catch-up call over the same span gives the same state as two calls.
  const once = settle(state, ledger, chicago('2026-11-10'))
  assert.deepEqual(once.state.rivals, later.state.rivals)
  assert.deepEqual(once.state.fronts, later.state.fronts)
  assert.deepEqual(once.state.hexes, later.state.hexes)
})

test('Ch 12 determinism and safety: a 52-week run with a passive player keeping every habit keeps every treasury ≥ 0, every rival out of rings 0 to 2 and every AV > 0', () => {
  const ledger = steadyLedger('2026-09-10', 400)
  let state = realm(3, ledger)
  for (let w = 1; w <= 52; w++) {
    state = settle(state, ledger, chicago(addDays('2026-10-11', w * 7 - 6))).state
    for (const r of Object.values(state.rivals)) {
      assert.ok(r.treasury >= 0 && r.specialFund >= 0, `${r.rival} in week ${w}`)
      assert.ok(armyValue(state, r.rival) > 0)
    }
    for (const h of state.hexes) if (h.ring <= 2 && h.owner !== 'player') assert.equal(h.owner, 'neutral', `${h.id} in week ${w}`)
  }
  assert.ok(state.settledThrough.week >= 52)
})

test('Ch 12 determinism: the same seed and state give identical rival states after 10 turns', () => {
  const a = simulateRivals(realm(21), 10, { playerHexes: 10 })
  const b = simulateRivals(realm(21), 10, { playerHexes: 10 })
  assert.deepEqual(a.state.rivals, b.state.rivals)
  assert.deepEqual(a.state.fronts, b.state.fronts)
  assert.deepEqual(a.state.hexes, b.state.hexes)
  assert.deepEqual(a.events, b.events)
  const c = simulateRivals(realm(22), 10, { playerHexes: 10 })
  assert.notDeepEqual(c.state.rivals, a.state.rivals)
})
