import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  balance,
  dailyIncome,
  displayBalance,
  foundingPurse,
  merchantHallBonus,
  post,
  postAll,
  roundPosting,
  spend,
  tithes,
  tribute,
  weeklyIncome,
  withBonus
} from '../../src/renderer/src/lib/game/economy'
import { CampaignError } from '../../src/renderer/src/lib/game/errors'
import { stepsPillar, weekPillars } from '../../src/renderer/src/lib/game/score'
import type { PurseLine, PurseState } from '../../src/renderer/src/lib/game/types'
import { MONDAY, TERMS, days } from './support/worked-example'

const DAY = '2026-10-06'
const total = (lines: PurseLine[]): number => lines.reduce((sum, l) => sum + l.amount, 0)
const amountOf = (lines: PurseLine[], source: string): number | undefined => lines.find((l) => l.source === source)?.amount
const purseOf = (amount: number): PurseState => ({ events: [{ id: 'seed', date: DAY, kind: 'earn', amount, source: 'test' }] })

// ── Daily ────────────────────────────────────────────────────────────────────

test('Daily: 3 of 4 duties earns 9 (Ch 5)', () => {
  const day = dailyIncome({ dutiesKept: 3, dutiesSworn: 4, foodLogged: true, priorStreak: 5 }, 0)
  assert.equal(total(day.lines), 9)
  assert.equal(day.perfect, false)
  assert.equal(day.streak, 0)
})

test('Daily: a perfect day after 3 perfect days in a row earns 12 + 5 + 3 = 20 (Ch 5)', () => {
  const day = dailyIncome({ dutiesKept: 4, dutiesSworn: 4, foodLogged: true, priorStreak: 3 }, 0)
  assert.deepEqual(
    day.lines.map((l) => [l.source, l.amount]),
    [
      ['duties', 12],
      ['perfectDay', 5],
      ['streak', 3]
    ]
  )
  assert.equal(day.streak, 4)
})

test('Daily: the streak bonus never exceeds +7 (Ch 5)', () => {
  for (const priorStreak of [7, 8, 30, 365]) {
    const day = dailyIncome({ dutiesKept: 2, dutiesSworn: 2, foodLogged: true, priorStreak }, 0)
    assert.equal(amountOf(day.lines, 'streak'), 7)
    assert.equal(total(day.lines), 24)
  }
})

test('Daily: no food logged means no perfect day, so no streak bonus (Ch 5)', () => {
  const day = dailyIncome({ dutiesKept: 3, dutiesSworn: 3, foodLogged: false, priorStreak: 4 }, 0)
  assert.equal(total(day.lines), 12)
  assert.equal(day.perfect, false)
})

// ── Weekly ───────────────────────────────────────────────────────────────────

test('Weekly: 55,000 walked against a 50,000 pool earns 70 (Ch 5)', () => {
  const steps = stepsPillar(days(7, MONDAY, () => ({ steps: 55_000 / 7 })), 50_000)
  const lines = weeklyIncome({ steps, table: 0, duties: 0, momentum: 0, days: 7 }, 0)
  assert.equal(amountOf(lines, 'steps'), 70)
})

test('Weekly: T_w = 6/7 earns 60.0 (Ch 5)', () => {
  const lines = weeklyIncome({ steps: 0, table: 6 / 7, duties: 0, momentum: 0, days: 7 }, 0)
  assert.equal(roundPosting(amountOf(lines, 'calories') as number), 60)
})

test('Weekly: the flawless +50 appears only when all three pillars are 1.0 (Ch 5)', () => {
  const full = weekPillars(
    days(7, MONDAY, () => ({ steps: 50_000 / 7, eaten: 1_900 })),
    TERMS
  )
  assert.deepEqual(full, { steps: 1, table: 1, duties: 1 })
  assert.equal(amountOf(weeklyIncome({ ...full, momentum: 1, days: 7 }, 0), 'flawless'), 50)
  for (const almost of [
    { ...full, steps: 0.999 },
    { ...full, table: 6 / 7 },
    { ...full, duties: 20 / 21 }
  ]) {
    assert.equal(amountOf(weeklyIncome({ ...almost, momentum: 1, days: 7 }, 0), 'flawless'), undefined)
  }
})

test('Weekly: Momentum pays 60 × M (Ch 5)', () => {
  assert.equal(amountOf(weeklyIncome({ steps: 0, table: 0, duties: 0, momentum: 0.6, days: 7 }, 0), 'momentum'), 36)
  assert.equal(amountOf(weeklyIncome({ steps: 0, table: 0, duties: 0, momentum: 0, days: 7 }, 0), 'momentum'), undefined)
})

test('Weekly: every amount prorates in a partial 4-day week 1 (A-04)', () => {
  const full = weeklyIncome({ steps: 1, table: 1, duties: 1, momentum: 1, days: 7 }, 0)
  const partial = weeklyIncome({ steps: 1, table: 1, duties: 1, momentum: 1, days: 4 }, 0)
  assert.equal(total(full), 70 + 70 + 50 + 60)
  for (const line of partial) assert.ok(Math.abs(line.amount - (amountOf(full, line.source) as number) * (4 / 7)) < 1e-9)
})

// ── Tithes and the Merchant Hall ─────────────────────────────────────────────

test('Tithes: 4 × ring per village; Settling pays half, scorched pays nothing (Ch 5, Ch 6, Ch 10)', () => {
  const lines = tithes(
    [
      { hexId: 'a', ring: 3 },
      { hexId: 'b', ring: 4, settling: true },
      { hexId: 'c', ring: 5, scorched: true }
    ],
    1,
    0,
    7
  )
  assert.deepEqual(
    lines.map((l) => [l.kind, l.source, l.amount]),
    [
      ['tithe', 'tithe:a', 12],
      ['tithe', 'tithe:b', 8]
    ]
  )
  assert.equal(roundPosting(total(tithes([{ hexId: 'a', ring: 3 }], 1.2, 0, 7))), 14.4)
  assert.ok(Math.abs(total(tithes([{ hexId: 'a', ring: 3 }], 1, 0, 4)) - (12 * 4) / 7) < 1e-9)
})

test('The Merchant Hall Tier I bonus turns a 70 gain into 71.4 (Ch 5)', () => {
  assert.equal(merchantHallBonus(1), 0.02)
  assert.equal(merchantHallBonus(5), 0.15)
  assert.equal(roundPosting(withBonus(70, merchantHallBonus(1))), 71.4)
  const lines = weeklyIncome({ steps: 1, table: 0, duties: 0, momentum: 0, days: 7 }, merchantHallBonus(1))
  assert.equal(roundPosting(amountOf(lines, 'steps') as number), 71.4)
  const day = dailyIncome({ dutiesKept: 1, dutiesSworn: 1, foodLogged: true, priorStreak: 0 }, merchantHallBonus(1))
  assert.equal(roundPosting(total(day.lines)), 17.3)
  assert.equal(roundPosting(total(tithes([{ hexId: 'a', ring: 5 }], 1, merchantHallBonus(1), 7))), 20.4)
})

// ── The purse ────────────────────────────────────────────────────────────────

test('The founding grant is 100 (Ch 5 rule 3)', () => {
  const purse = foundingPurse(DAY)
  assert.equal(balance(purse), 100)
  assert.deepEqual(purse.events[0], { id: 'pe-1', date: DAY, kind: 'earn', amount: 100, source: 'founding' })
})

test('Purse: a 50 tribute on a 30 balance takes 30 and leaves 0 (Ch 5 rule 2)', () => {
  const purse = tribute(purseOf(30), DAY, 50, 'defense:3-4')
  assert.equal(balance(purse), 0)
  assert.equal(purse.events.at(-1)?.amount, -30)
  assert.equal(purse.events.at(-1)?.kind, 'tribute')
  // On an empty purse a tribute posts nothing.
  assert.equal(tribute(purse, DAY, 10, 'defense:3-4'), purse)
})

test('Purse: a spend or pledge the purse cannot cover is refused (Ch 5 rule 2, A-11)', () => {
  const purse = purseOf(30)
  assert.throws(() => spend(purse, DAY, 30.1, 'building:barracks'), CampaignError)
  assert.throws(() => post(purse, { date: DAY, kind: 'pledge', amount: 31, source: 'contract:c1' }), CampaignError)
  assert.throws(() => post(purse, { date: DAY, kind: 'adjust', amount: -31, source: 'contract:c1' }), CampaignError)
  assert.equal(balance(spend(purse, DAY, 30, 'building:barracks')), 0)
})

test('Purse: each event is rounded to 0.1 when posted, and the display rounds down (A-11)', () => {
  let purse = post({ events: [] }, { date: DAY, kind: 'earn', amount: 80.6815, source: 'contract:c1' })
  assert.equal(purse.events[0].amount, 80.7)
  purse = post(purse, { date: DAY, kind: 'spend', amount: 0.04, source: 'rounding' })
  assert.equal(purse.events.length, 1, 'a posting that rounds to zero adds nothing')
  purse = spend(purse, DAY, 10.25, 'item')
  assert.equal(purse.events[1].amount, -10.3)
  assert.equal(balance(purse), 70.4)
  assert.equal(displayBalance(purse), 70)
})

test('Purse: the balance always equals the sum of events, and every event names its source (Ch 5 rule 1, Ch 15 invariant 4)', () => {
  let purse = foundingPurse(MONDAY)
  const kinds = ['earn', 'spend', 'tithe', 'tribute', 'spoils', 'pledge', 'return', 'adjust'] as const
  for (let i = 0; i < 200; i++) {
    const kind = kinds[i % kinds.length]
    const amount = ((i * 37) % 113) / 3
    try {
      purse = post(purse, { date: MONDAY, kind, amount, source: `${kind}:${i}` })
    } catch (e) {
      assert.ok(e instanceof CampaignError)
    }
    const sum = purse.events.reduce((s, e) => s + e.amount, 0)
    assert.ok(Math.abs(balance(purse) - sum) < 1e-9)
    assert.ok(balance(purse) >= 0)
  }
  assert.ok(purse.events.every((e) => e.source.length > 0))
  assert.equal(new Set(purse.events.map((e) => e.id)).size, purse.events.length)
  assert.throws(() => post(purse, { date: MONDAY, kind: 'earn', amount: 1, source: '' }), CampaignError)
})

test('Purse: gains post positive and costs post negative, whatever sign they are given', () => {
  const purse = postAll(purseOf(100), DAY, [
    { kind: 'spoils', amount: -12, source: 'defense:a' },
    { kind: 'spend', amount: -20, source: 'item' }
  ])
  assert.deepEqual(
    purse.events.slice(1).map((e) => e.amount),
    [12, -20]
  )
})
