import '../game/support/tokyo-tz'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { foundCampaign, borderCampaignWeeks, type FoundingInput } from '../../src/renderer/src/lib/game/campaign'
import { addDays, campaignWeek, dayCloseInstant, daysInWeek1, isWeekCloseDay } from '../../src/renderer/src/lib/game/clock'
import { balance } from '../../src/renderer/src/lib/game/economy'
import { CampaignError } from '../../src/renderer/src/lib/game/errors'
import { RULES } from '../../src/renderer/src/lib/game/rules'
import { settle } from '../../src/renderer/src/lib/game/settle'
import { FOUNDED_AT, START, TZ, charter, chicago, emptyLedger, ledgerWith, openLegacyContract } from './fixtures/ledgers'

function input(over: Partial<FoundingInput> = {}): FoundingInput {
  return { startWeight: 217, goalWeight: 168, charter: charter(), timeZone: TZ, seed: 7, ledger: emptyLedger(), ...over }
}

test('Founding at 2026-10-07 15:00 Chicago: first day Oct 8, week 1 is Oct 8 to Oct 11 and closes 2026-10-12 04:00 (A-04)', () => {
  const state = foundCampaign(input(), FOUNDED_AT)
  const { campaign } = state
  assert.equal(campaign.startDate, START)
  assert.equal(campaign.timeZone, TZ)
  assert.equal(campaign.weekStartsOn, 1)
  assert.deepEqual(state.settledThrough, { day: '2026-10-07', week: 0 })

  // Week 1 runs Thursday to Sunday, four days, and its close is Monday 04:00 local (09:00 UTC in CDT).
  assert.equal(daysInWeek1(START, 1), 4)
  for (const day of ['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']) assert.equal(campaignWeek(START, day, 1), 1)
  assert.equal(campaignWeek(START, '2026-10-12', 1), 2)
  assert.equal(isWeekCloseDay('2026-10-11', 1), true)
  assert.equal(dayCloseInstant('2026-10-11', TZ).toISOString(), '2026-10-12T09:00:00.000Z')

  // And settlement agrees: one second before the close, three days; at it, four and a week close.
  const before = settle(state, emptyLedger(), new Date('2026-10-12T08:59:59Z'))
  assert.deepEqual(before.summary.days.map((d) => d.day), ['2026-10-08', '2026-10-09', '2026-10-10'])
  assert.deepEqual(before.summary.weeksClosed, [])
  const at = settle(state, emptyLedger(), new Date('2026-10-12T09:00:00Z'))
  assert.deepEqual(at.summary.weeksClosed, [1])
  assert.deepEqual(at.state.settledThrough, { day: '2026-10-11', week: 1 })
})

test('Founding: the purse holds the founding grant of 100 and ruleVersion is 2.0.0', () => {
  const state = foundCampaign(input(), FOUNDED_AT)
  assert.equal(balance(state.purse), 100)
  assert.equal(state.purse.events.length, 1)
  assert.equal(state.purse.events[0].kind, 'earn')
  assert.equal(state.purse.events[0].source, 'founding')
  assert.equal(state.campaign.ruleVersion, '2.0.0')
  assert.equal(state.campaign.ruleVersion, RULES.ruleVersion)
})

test('Founding: the hidden Border Campaign weeks fall within ±1 of 10, 18, 26, 34 and so on (Ch 12)', () => {
  for (let seed = 0; seed < 50; seed++) {
    const weeks = foundCampaign(input({ seed }), FOUNDED_AT).settlement.borderCampaignWeeks
    assert.ok(weeks.length >= 12, `seed ${seed}: ${weeks.length} weeks scheduled`)
    weeks.forEach((week, k) => assert.ok(Math.abs(week - (10 + 8 * k)) <= 1, `seed ${seed}: entry ${k} is week ${week}`))
  }
  // Over many seeds every shift (−1, 0, +1) occurs, so the draw is real.
  const shifts = new Set<number>()
  for (let seed = 0; seed < 50; seed++) shifts.add(foundCampaign(input({ seed }), FOUNDED_AT).settlement.borderCampaignWeeks[0] - 10)
  assert.deepEqual([...shifts].sort(), [-1, 0, 1])
  // Extending the schedule later gives the same weeks as fixing them all at once.
  const short = borderCampaignWeeks(7, START, 40)
  assert.deepEqual(borderCampaignWeeks(7, START, 200).slice(0, short.length), short)
})

test('A-07: founding is refused while a legacy contract is open, upcoming or awaiting its weigh-in', () => {
  const ledger = emptyLedger()
  ledger.contracts.push(openLegacyContract('2026-10-01'))
  assert.throws(() => foundCampaign(input({ ledger }), FOUNDED_AT), CampaignError)
  const upcoming = emptyLedger()
  upcoming.contracts.push(openLegacyContract('2026-10-12'))
  assert.throws(() => foundCampaign(input({ ledger: upcoming }), FOUNDED_AT), CampaignError)
  // Closed with its weigh-in, it no longer stands in the way.
  const closed = emptyLedger()
  closed.contracts.push({ ...openLegacyContract('2026-09-01'), finalWeight: 215, closedOn: '2026-09-08', closedAt: '2026-09-08T12:00:00.000Z' })
  assert.doesNotThrow(() => foundCampaign(input({ ledger: closed }), FOUNDED_AT))
})

test('Ch 4: founding is refused with a calorie limit below the Healer floor', () => {
  // Without data the floor is its minimum, 1,200.
  assert.throws(() => foundCampaign(input({ charter: charter({ calorieLimit: 1_150 }) }), FOUNDED_AT), /calorie limit/)
  // Fitbit's burned average of 2,600 gives TDEE 2,600 and a floor of 1,600.
  const burned = ledgerWith('2026-09-24', 14, () => ({ done: {}, burned: 2_600 }))
  assert.throws(() => foundCampaign(input({ ledger: burned, charter: charter({ calorieLimit: 1_550 }) }), FOUNDED_AT), CampaignError)
  const ok = foundCampaign(input({ ledger: burned, charter: charter({ calorieLimit: 1_600 }) }), FOUNDED_AT)
  assert.equal(ok.weight.healerFloor, 1_600)
  assert.equal(ok.charter.calorieFloor, 1_600)
  // Mifflin–St Jeor (male, 180 cm, born 1990, 217 lb): BMR 1,914.3 → TDEE 2,680 → floor 1,700.
  const profile = { sex: 'male' as const, heightCm: 180, birthYear: 1990 }
  assert.throws(() => foundCampaign(input({ ...profile, charter: charter({ calorieLimit: 1_650 }) }), FOUNDED_AT), CampaignError)
  assert.equal(foundCampaign(input({ ...profile, charter: charter({ calorieLimit: 1_700 }) }), FOUNDED_AT).weight.healerFloor, 1_700)
  // Confirmed medical supervision lets the limit sit below the floor.
  assert.doesNotThrow(() => foundCampaign(input({ ...profile, medicalSupervision: true, charter: charter({ calorieLimit: 1_400 }) }), FOUNDED_AT))
})

test('Founding refuses an unsafe goal, a bad Charter and an unknown time zone', () => {
  assert.throws(() => foundCampaign(input({ goalWeight: 125, heightCm: 180 }), FOUNDED_AT), CampaignError)
  assert.throws(() => foundCampaign(input({ charter: charter({ duties: [] }) }), FOUNDED_AT), CampaignError)
  assert.throws(() => foundCampaign(input({ charter: charter({ stepPool: 5_000 }) }), FOUNDED_AT), CampaignError)
  assert.throws(() => foundCampaign(input({ timeZone: 'Mars/Olympus' }), FOUNDED_AT), CampaignError)
})

test('Founding builds the map, Tier I buildings, Castle I, four Tier I companies, Milestones and Grace 0', () => {
  const state = foundCampaign(input(), FOUNDED_AT)
  assert.equal(state.hexes.length, 127)
  assert.deepEqual(state.buildings, { barracks: 1, merchantHall: 1, mageTower: 1, foundry: 1 })
  assert.equal(state.castleTier, 1)
  assert.deepEqual(state.crossings, {})
  assert.deepEqual(
    state.roster.map((c) => [c.name, c.power, c.tags.join(), c.reach]),
    [
      ['Militia', 5, 'steel', 'melee'],
      ['Watchmen', 5, 'coin', 'melee'],
      ['Hedge-wardens', 5, 'arcane', 'ranged'],
      ['Palisade Crew', 5, 'engine', 'melee']
    ]
  )
  assert.deepEqual(state.weight.milestones.map((m) => m.mark), [212, 207, 202, 197, 193, 188, 183, 178, 173, 168])
  assert.equal(state.weight.grace, 0)
  assert.deepEqual(state.contracts, { history: [], respiteBank: 0 })
  assert.deepEqual(state.log, [])
})

test('A-18: every rival starts with 150, an army of 40 power, Respect 20, Tension toward the player and quiet fronts', () => {
  const state = foundCampaign(input(), FOUNDED_AT)
  for (const rival of ['orc', 'goblin', 'dwarf', 'archmage'] as const) {
    const r = state.rivals[rival]
    assert.equal(r.treasury, 150)
    assert.equal(r.companies.reduce((sum, c) => sum + c.power, 0), 40, rival)
    assert.equal(r.respect, 20)
    assert.equal(r.disposition.player, 'tension')
    assert.equal(r.status, 'active')
    assert.equal(r.threat, 0)
    assert.equal(Object.keys(r.frontTracks).length, 2)
    assert.ok(Object.values(r.frontTracks).every((t) => t === 0))
  }
  // Strongest affordable first: the Orc buys two Brutes.
  assert.deepEqual(state.rivals.orc.companies.map((c) => c.name), ['Brutes', 'Brutes'])
  assert.deepEqual(state.rivals.orc.disposition, { player: 'tension', goblin: 'peace', archmage: 'peace' })
  for (const f of Object.values(state.fronts)) assert.deepEqual([f.state, f.track], ['peace', 0])
})

test('Ch 2 rule 7: founding is deterministic for a seed, and the seed is derived from the founding instant otherwise', () => {
  assert.deepEqual(foundCampaign(input(), FOUNDED_AT), foundCampaign(input(), FOUNDED_AT))
  const a = foundCampaign(input({ seed: undefined }), FOUNDED_AT)
  const b = foundCampaign(input({ seed: undefined }), new Date(FOUNDED_AT.getTime() + 1_000))
  assert.notEqual(a.campaign.seed, b.campaign.seed)
  assert.deepEqual(a, foundCampaign(input({ seed: undefined }), FOUNDED_AT))
})

test('Founding snapshots the 28 days before the start and records the launch (A-10)', () => {
  const ledger = ledgerWith('2026-09-01', 37, (i) => ({ done: {}, weight: 220 - i * 0.1 }))
  const state = foundCampaign(input({ ledger }), FOUNDED_AT)
  const dates = state.settlement.snapshots.map((s) => s.date)
  assert.equal(dates.length, RULES.settlement.preludeDays)
  assert.equal(dates[0], addDays(START, -28))
  assert.equal(dates[dates.length - 1], '2026-10-07')
  assert.equal(state.settlement.lastLaunch, '2026-10-07')
  // A kg ledger is snapshotted in lb.
  const kg = { ...ledgerWith('2026-10-01', 1, () => ({ done: {}, weight: 100 })), settings: { ...emptyLedger().settings, unit: 'kg' as const } }
  const kgState = foundCampaign(input({ ledger: kg, unit: 'kg', startWeight: 100, goalWeight: 80 }), FOUNDED_AT)
  assert.ok(Math.abs((kgState.settlement.snapshots.find((s) => s.date === '2026-10-01')?.weightLb ?? 0) - 220.46) < 0.01)
})

test('The campaign is JSON-serializable: a round trip gives a deep-equal state', () => {
  const state = settle(foundCampaign(input(), FOUNDED_AT), emptyLedger(), chicago('2026-10-20')).state
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state)
})
