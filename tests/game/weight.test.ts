import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDays } from '../../src/renderer/src/lib/game/clock'
import { CampaignError } from '../../src/renderer/src/lib/game/errors'
import { roll } from '../../src/renderer/src/lib/game/rng'
import {
  avg7,
  bmi,
  breakMilestones,
  buildMilestones,
  changeGoal,
  checkGoal,
  closeWeightWeek,
  graceTextId,
  healerCheckIns,
  healerRange,
  healerText,
  initialWeightState,
  markReachedOn,
  mifflinStJeor,
  momentumReputation,
  momentumScore,
  nextGrace,
  smoothFloor,
  steadiness,
  targetPace,
  tdeeFromLogs,
  toLb,
  trend,
  weekMomentum,
  weighInsInLb
} from '../../src/renderer/src/lib/game/weight'
import type {
  Campaign,
  CampaignState,
  GraceLevel,
  HealerDay,
  MilestoneState,
  WeighIn,
  WeightWeek
} from '../../src/renderer/src/lib/game/types'

const START = '2026-10-05'
/** The campaign day `n` days after the start. */
const day = (n: number): string => addDays(START, n)
/** The last day of campaign week `k` (weeks are 7 days from the start here). */
const weekEnd = (k: number): string => day(7 * k - 1)

const close = (a: number, b: number, tol = 1e-6): void => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`)

/** One weigh-in a day from day `from` to day `to`, falling `perWeek` lb a week to `end` on day `to`. */
function series(from: number, to: number, end: number, perWeek: number): WeighIn[] {
  const list: WeighIn[] = []
  for (let n = from; n <= to; n++) list.push({ date: day(n), weight: end + ((to - n) * perWeek) / 7 })
  return list
}

function week(k: number, over: Partial<WeightWeek> = {}): WeightWeek {
  return { week: k, day: weekEnd(k), momentum: 0, realmConsistency: 0, tooFast: false, ...over }
}

function campaign(over: Partial<Campaign> = {}): Campaign {
  return {
    id: 'c1',
    seed: 1,
    ruleVersion: '2.0.0',
    startDate: START,
    timeZone: 'America/New_York',
    startWeight: 217,
    goalWeight: 168,
    unit: 'lb',
    targetPace: 0.8,
    status: 'active',
    ...over
  }
}

// ── The trend and the target pace ────────────────────────────────────────────

test('Ch 5 rule 1: the trend is the least-squares slope in lb a week, loss positive', () => {
  close(trend(series(0, 20, 200, 1.0), day(20)) as number, 1.0)
  close(trend(series(0, 20, 200, -0.5), day(20)) as number, -0.5)
  // Only the last 21 days count.
  const twoSlopes = [...series(0, 29, 210, 3), ...series(30, 50, 200, 0.5)]
  close(trend(twoSlopes, day(50)) as number, 0.5)
})

test('Ch 5 rule 1: the trend is unknown without two weigh-ins at least 6 days apart', () => {
  assert.equal(trend([{ date: day(0), weight: 200 }], day(0)), null)
  assert.equal(trend([{ date: day(0), weight: 200 }, { date: day(5), weight: 199 }], day(5)), null)
  assert.notEqual(trend([{ date: day(0), weight: 200 }, { date: day(6), weight: 199 }], day(6)), null)
})

test('avg7 averages the weigh-ins of the 7 days ending that day', () => {
  const list = [
    { date: day(0), weight: 210 },
    { date: day(3), weight: 200 },
    { date: day(9), weight: 198 }
  ]
  assert.equal(avg7(list, day(6)), 205)
  assert.equal(avg7(list, day(9)), 199)
  assert.equal(avg7(list, day(17)), null)
})

test('weigh-ins in kg are converted to lb (A-05)', () => {
  close(toLb(100, 'kg'), 220.46226218)
  const lb = weighInsInLb([{ date: day(1), weight: 90 }, { date: day(0), weight: 91 }], 'kg')
  assert.deepEqual(lb.map((w) => w.date), [day(0), day(1)])
  close(lb[1].weight, 90 * 2.2046226218)
})

test('Test 6: target pace 0.80 at 217 lb, 0.72 at 180, 0.68 at 170; 0.5 at 217 with the cap at 0.5', () => {
  close(targetPace(217), 0.8)
  close(targetPace(180), 0.72)
  close(targetPace(170), 0.68)
  close(targetPace(190), 0.76)
  close(targetPace(217, 0.5), 0.5)
  // The cap is settable only from 0.3 to 1.0.
  close(targetPace(300, 2), 1.0)
  close(targetPace(300, 0.1), 0.3)
})

// ── Momentum ─────────────────────────────────────────────────────────────────

test('Ch 5 Momentum table reproduces: 60, 60, 30, 36, 36', () => {
  const rows = [
    { r: 0.8, qw: 0.82, mw: 1, mf: 0.3 },
    { r: 1.6, qw: 0.82, mw: 1, mf: 0.3 },
    { r: 0.4, qw: 0.7, mw: 0.5, mf: 0 },
    { r: 0, qw: 0.9, mw: 0, mf: 0.6 },
    { r: -1, qw: 0.88, mw: 0, mf: 0.6 }
  ]
  const reps = rows.map((row) => {
    const score = momentumScore({ r: row.r, target: 0.8, qw: row.qw })
    close(score.mw, row.mw)
    close(score.mf, row.mf)
    return Math.round(momentumReputation(score.m))
  })
  assert.deepEqual(reps, [60, 60, 30, 36, 36])
})

test('Ch 5: a week on pace from the ledger earns full Momentum', () => {
  const m = weekMomentum({ weighIns: series(0, 20, 210, 0.8), day: day(20), qw: 0.82, goal: 168 })
  close(m.r as number, 0.8)
  close(m.target, 0.8)
  close(m.m, 1)
  assert.equal(m.tooFast, false)
})

test('Ch 5 rule 1: with the trend unknown, only the plateau floor applies', () => {
  const m = weekMomentum({ weighIns: [{ date: day(6), weight: 200 }], day: day(6), qw: 0.9, goal: 168 })
  assert.equal(m.r, null)
  assert.equal(m.mw, 0)
  assert.equal(m.m, 0.6)
})

test('Too fast: a 28-day trend of 2.5 lb a week at 217 lb holds Mw at 0.5, checks in, and pauses Milestones (A-43)', () => {
  const weighIns = series(0, 27, 217, 2.5)
  const m = weekMomentum({ weighIns, day: day(27), qw: 0.8, goal: 168 })
  assert.ok((m.trend28 as number) > 0.01 * 217)
  assert.equal(m.tooFast, true)
  assert.equal(m.mw, 0.5)
  assert.equal(m.m, 0.5)

  const notes = healerCheckIns({ momentum: m })
  assert.deepEqual(notes.map((n) => n.checkIn), ['tooFast'])
  assert.match(healerText(notes[0]), /faster than the safe pace/)

  // Milestone 1 of 230 → 180 (mark 225, earliest week 3) is reached; week 4 would break it.
  const milestones = buildMilestones(230, 180)
  const base = { milestones, weighIns, goal: 180, day: weekEnd(4), week: 4 }
  const paused = breakMilestones({ ...base, weeks: [week(1), week(2), week(3), week(4, { tooFast: true })] })
  assert.deepEqual(paused.broken, [])
  const slowed = breakMilestones({ ...base, weeks: [week(1), week(2), week(3), week(4)] })
  assert.deepEqual(slowed.broken.map((b) => b.index), [1]) // Milestone 2 (220) waits for week 6
})

test('Ch 5 rule 7: a maintenance goal earns Mw = 1 while the 7-day average stays within 2% of it', () => {
  const flat = series(0, 20, 170, 0)
  const near = weekMomentum({ weighIns: flat, day: day(20), qw: 0.5, goal: 168 })
  assert.equal(near.maintenance, true)
  assert.equal(near.m, 1)
  const far = weekMomentum({ weighIns: series(0, 20, 180, 0), day: day(20), qw: 0.5, goal: 168 })
  assert.equal(far.maintenance, false)
  assert.equal(far.m, 0)
})

/** A deterministic random weigh-in series for property tests. */
function randomSeries(seed: number): WeighIn[] {
  const list: WeighIn[] = []
  let w = roll(seed, START, 'start', 150, 320)
  const drift = roll(seed, START, 'drift', -3, 4)
  for (let n = 0; n <= 27; n++) {
    w += drift / 7 + roll(seed, day(n), 'noise', -2, 2)
    if (roll(seed, day(n), 'skip', 0, 1) < 0.4) list.push({ date: day(n), weight: w })
  }
  return list
}

test('Ch 15 invariant 5: any week with q_w ≥ 0.85 earns M ≥ 0.6, whatever the scale says', () => {
  for (let seed = 1; seed <= 500; seed++) {
    const qw = roll(seed, START, 'qw', 0.85, 1)
    const goal = roll(seed, START, 'goal', 120, 300)
    const m = weekMomentum({ weighIns: randomSeries(seed), day: day(27), qw, goal, cap: roll(seed, START, 'cap', 0.3, 1) })
    assert.ok(m.m >= 0.6, `seed ${seed}: M = ${m.m}`)
  }
})

test('Ch 15 invariant 1: M never increases when r rises above T', () => {
  for (let seed = 1; seed <= 500; seed++) {
    const target = roll(seed, START, 'T', 0.3, 1)
    const qw = roll(seed, START, 'qw', 0, 1)
    const flags = { tooFast: roll(seed, START, 'fast', 0, 1) < 0.3, maintenance: roll(seed, START, 'maint', 0, 1) < 0.3 }
    const r1 = target + roll(seed, START, 'r1', 0, 3)
    const r2 = r1 + roll(seed, START, 'r2', 0, 3)
    const m1 = momentumScore({ r: r1, target, qw, ...flags }).m
    const m2 = momentumScore({ r: r2, target, qw, ...flags }).m
    assert.ok(m2 <= m1, `seed ${seed}: M rose from ${m1} to ${m2}`)
  }
  // From the ledger: losing faster than the pace never earns more Momentum.
  for (let seed = 1; seed <= 200; seed++) {
    const end = roll(seed, START, 'end', 150, 300)
    const qw = roll(seed, START, 'qw', 0, 1)
    const pace = targetPace(end)
    const slow = pace + roll(seed, START, 'a', 0, 1)
    const fast = slow + roll(seed, START, 'b', 0, 3)
    const at = (perWeek: number): number => weekMomentum({ weighIns: series(0, 27, end, perWeek), day: day(27), qw, goal: 120 }).m
    assert.ok(at(fast) <= at(slow) + 1e-12, `seed ${seed}: faster loss earned more`)
  }
})

// ── Milestones ───────────────────────────────────────────────────────────────

test('Test 8 (E-04): 217 → 168 gives marks 212 … 168 and earliest weeks 4 … 31', () => {
  const plan = buildMilestones(217, 168)
  assert.deepEqual(plan.map((m) => m.mark), [212, 207, 202, 197, 193, 188, 183, 178, 173, 168])
  assert.deepEqual(plan.map((m) => m.earliestWeek), [4, 7, 10, 13, 16, 19, 22, 25, 28, 31])
  assert.deepEqual(plan.map((m) => m.index), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  assert.ok(plan.every((m) => !m.keeping && m.brokenOn === undefined))
})

test('Ch 9 rule 2: small goal 217 → 195 uses 3 lb steps, 214 to 196, then Keeping Milestones', () => {
  const plan = buildMilestones(217, 195)
  const regular = plan.filter((m) => !m.keeping)
  assert.deepEqual(regular.map((m) => m.mark), [214, 211, 208, 205, 202, 199, 196])
  const keeping = plan.filter((m) => m.keeping)
  assert.deepEqual(keeping.map((m) => m.index), [8, 9, 10])
  assert.ok(keeping.every((m) => m.mark === 195))
})

test('Ch 9 rule 3: large goal 300 → 150 uses 10 lb steps, 290 to 200', () => {
  const plan = buildMilestones(300, 150)
  assert.deepEqual(plan.map((m) => m.mark), [290, 280, 270, 260, 250, 240, 230, 220, 210, 200])
  assert.ok(plan.every((m) => !m.keeping))
})

test('Ch 9: a goal that lands on a whole number of steps is the last mark; an odd goal is kept exactly', () => {
  assert.equal(buildMilestones(200, 150).at(-1)?.mark, 150)
  assert.equal(buildMilestones(200, 150.4).at(-1)?.mark, 150.4)
  // 200 → 150: earliest weeks are exact multiples, with no floating-point creep (15 ÷ 1.5 = 10).
  assert.equal(buildMilestones(200, 150)[2].earliestWeek, 10)
})

test('Lock 1: two weigh-ins at least 6 days apart at or below the mark, or the 7-day average', () => {
  const twoApart = [
    { date: day(3), weight: 211.8 },
    { date: day(6), weight: 213 },
    { date: day(9), weight: 211.5 }
  ]
  assert.equal(markReachedOn(twoApart, 212, day(30)), day(9))
  assert.equal(markReachedOn(twoApart, 212, day(8)), null)
  // Five days apart is not enough, but the 7-day average gets there.
  const average = [
    { date: day(10), weight: 213.5 },
    { date: day(12), weight: 211 },
    { date: day(15), weight: 211 }
  ]
  assert.equal(markReachedOn(average, 212, day(30)), day(15))
  // A lone weigh-in is not an average (A-115).
  assert.equal(markReachedOn([{ date: day(3), weight: 200 }], 212, day(30)), null)
  // The average also falls when a heavy weigh-in leaves the window.
  const leaving = [
    { date: day(0), weight: 230 },
    { date: day(5), weight: 211 },
    { date: day(6), weight: 211.5 }
  ]
  assert.equal(markReachedOn(leaving, 212, day(6)), null)
  assert.equal(markReachedOn(leaving, 212, day(7)), day(7))
})

test('Locks: reaching 212 in week 2 waits until week 4; a broken Milestone stays broken after a 6 lb regain', () => {
  const weighIns: WeighIn[] = [
    { date: day(0), weight: 217 },
    { date: day(7), weight: 211.5 },
    { date: day(13), weight: 211 }
  ]
  let milestones: MilestoneState[] = buildMilestones(217, 168)
  const weeks: WeightWeek[] = []
  const brokenBy: Record<number, number[]> = {}
  for (let k = 1; k <= 4; k++) {
    weeks.push(week(k))
    const result = breakMilestones({ milestones, weighIns, weeks, goal: 168, day: weekEnd(k), week: k })
    milestones = result.milestones
    brokenBy[k] = result.broken.map((m) => m.index)
  }
  assert.deepEqual(brokenBy, { 1: [], 2: [], 3: [], 4: [1] })
  assert.equal(milestones[0].brokenOn, weekEnd(4))
  assert.equal(milestones[0].brokenWeek, 4)
  assert.equal(milestones[0].byDispensation, false)

  const regained = [...weighIns, { date: day(30), weight: 217 }, { date: day(36), weight: 217.5 }]
  for (let k = 5; k <= 6; k++) {
    weeks.push(week(k))
    milestones = breakMilestones({ milestones, weighIns: regained, weeks, goal: 168, day: weekEnd(k), week: k }).milestones
  }
  assert.equal(milestones[0].brokenOn, weekEnd(4))
  assert.equal(milestones.filter((m) => m.brokenOn).length, 1)
})

test('Ch 9 rule 2: a Keeping Milestone breaks after 4 straight weeks with the 7-day average within 2% of the goal', () => {
  const milestones = buildMilestones(217, 195).map((m) =>
    m.keeping ? m : { ...m, brokenOn: weekEnd(20), brokenWeek: 20, byDispensation: false }
  )
  const near = (k: number, average: number): WeightWeek => week(k, { average })
  const weeks = [near(20, 196), near(21, 194), near(22, 196), near(23, 199), near(24, 195)]
  const check = (upTo: number): number[] =>
    breakMilestones({
      milestones,
      weighIns: [],
      weeks: weeks.filter((w) => w.week <= upTo),
      goal: 195,
      day: weekEnd(upTo),
      week: upTo
    }).broken.map((m) => m.index)
  assert.deepEqual(check(23), []) // 199 is more than 2% above 195: the run is 21, 22 only
  assert.deepEqual(check(24), [])
  const longer = [...weeks, near(25, 195), near(26, 195), near(27, 195)]
  const after = breakMilestones({ milestones, weighIns: [], weeks: longer, goal: 195, day: weekEnd(27), week: 27 })
  assert.deepEqual(after.broken.map((m) => m.index), [8])
  assert.equal(after.milestones[7].keeping, true)
})

test("Dispensation: 8 weeks at RC 0.86 with the earliest week passed breaks the next Milestone, at most once per 8 weeks", () => {
  const flat: WeighIn[] = [{ date: day(0), weight: 217 }, { date: day(60), weight: 217 }, { date: day(120), weight: 217 }]
  let milestones = buildMilestones(217, 168)
  const weeks: WeightWeek[] = []
  const dispensed: number[] = []
  for (let k = 1; k <= 16; k++) {
    weeks.push(week(k, { realmConsistency: 0.86, momentum: 0.6 }))
    const result = breakMilestones({ milestones, weighIns: flat, weeks, goal: 168, day: weekEnd(k), week: k })
    milestones = result.milestones
    for (const b of result.broken) {
      assert.equal(b.byDispensation, true)
      dispensed.push(k)
    }
  }
  // Milestone 1 at week 8; Milestone 2 (earliest week 7) waits until week 16.
  assert.deepEqual(dispensed, [8, 16])
  assert.deepEqual(milestones.filter((m) => m.brokenOn).map((m) => m.index), [1, 2])

  const weeks8 = weeks.slice(0, 8)
  const base = { milestones: buildMilestones(217, 168), weighIns: flat, goal: 168, day: weekEnd(8), week: 8 }
  assert.deepEqual(breakMilestones({ ...base, weeks: weeks8, dispensation: false }).broken, [])
  const weak = weeks8.map((w, i) => (i === 3 ? { ...w, realmConsistency: 0.84 } : w))
  assert.deepEqual(breakMilestones({ ...base, weeks: weak }).broken, [])
})

// ── Goals ────────────────────────────────────────────────────────────────────

function stateWith(over: Partial<Campaign> = {}): CampaignState {
  const c = campaign(over)
  return { campaign: c, weight: initialWeightState(c.startWeight, c.goalWeight) } as CampaignState
}

test('A goal of 125 lb with a height of 180 cm (BMI 17.5) is refused', () => {
  close(bmi(125, 180), 17.5, 0.01)
  assert.throws(() => checkGoal(125, 'lb', 180), (e: unknown) => e instanceof CampaignError && /below BMI 18.5/.test(e.message))
  assert.doesNotThrow(() => checkGoal(135, 'lb', 180))
  assert.doesNotThrow(() => checkGoal(125, 'lb'))
  assert.throws(() => changeGoal(stateWith({ heightCm: 180 }), 125, day(40)), CampaignError)
})

test('A second goal change within 28 days is refused; broken Milestones stay and the rest are recalculated', () => {
  const state = stateWith({ heightCm: 180 })
  state.weight.milestones = state.weight.milestones.map((m) =>
    m.index <= 2 ? { ...m, brokenOn: weekEnd(m.earliestWeek), brokenWeek: m.earliestWeek, byDispensation: false } : m
  )
  const changed = changeGoal(state, 160, day(50))
  assert.equal(changed.campaign.goalWeight, 160)
  assert.equal(changed.weight.goalChangedOn, day(50))
  const plan = changed.weight.milestones
  assert.deepEqual(plan.slice(0, 2), state.weight.milestones.slice(0, 2))
  // From the broken mark 207 to 160 in 8 steps of 5.875 lb.
  assert.deepEqual(plan.map((m) => m.mark), [212, 207, 201, 195, 189, 184, 178, 172, 166, 160])
  assert.deepEqual(plan.map((m) => m.index), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  assert.ok(plan.slice(2).every((m) => m.brokenOn === undefined))

  assert.throws(() => changeGoal(changed, 165, day(77)), CampaignError)
  assert.equal(changeGoal(changed, 165, day(78)).campaign.goalWeight, 165)
})

test('Goals in kg are checked and planned in lb', () => {
  const state = stateWith({ unit: 'kg', startWeight: 100, goalWeight: 80, heightCm: 180 })
  assert.throws(() => changeGoal(state, 55, day(1)), CampaignError) // BMI 17.0
  const changed = changeGoal(state, 75, day(1))
  assert.equal(changed.weight.milestones.at(-1)?.mark, 75 * 2.2046226218)
})

// ── The Crown's Grace ────────────────────────────────────────────────────────

test('Grace: with Steadiness 0.9 it rises 0 → I → II → III over three week closes, once 4 weeks exist', () => {
  const weeks: WeightWeek[] = []
  let grace: GraceLevel = 0
  const levels: GraceLevel[] = []
  for (let k = 1; k <= 7; k++) {
    weeks.push(week(k, { momentum: 0.9 }))
    grace = nextGrace(grace, weeks)
    levels.push(grace)
  }
  assert.deepEqual(levels, [0, 0, 0, 1, 2, 3, 3])
})

test('Grace never drops more than one level a week, and stays 0 with under 4 weeks of history', () => {
  const weeks: WeightWeek[] = Array.from({ length: 8 }, (_, i) => week(i + 1, { momentum: 0.9 }))
  let grace: GraceLevel = 3
  const levels: GraceLevel[] = []
  for (let k = 9; k <= 20; k++) {
    weeks.push(week(k, { momentum: 0 }))
    grace = nextGrace(grace, weeks)
    levels.push(grace)
  }
  for (let i = 1; i < levels.length; i++) assert.ok(levels[i - 1] - levels[i] <= 1)
  assert.equal(levels.at(-1), 0)
  assert.equal(nextGrace(0, [week(1, { momentum: 1 }), week(2, { momentum: 1 }), week(3, { momentum: 1 })]), 0)
  assert.equal(steadiness([week(1), week(2), week(3)]), null)
})

test('Grace: Steadiness is the mean M of the last 8 weeks; the level comes with a plain text id', () => {
  const weeks = [...Array.from({ length: 4 }, (_, i) => week(i + 1, { momentum: 0 })), ...Array.from({ length: 8 }, (_, i) => week(i + 5, { momentum: 0.75 }))]
  assert.equal(steadiness(weeks), 0.75)
  assert.equal(graceTextId(2), 'herald.grace.2')
})

// ── The Healer's calorie range ───────────────────────────────────────────────

function logged(n: number, eaten: number | undefined, burned?: number): HealerDay[] {
  return Array.from({ length: n }, (_, i) => ({ date: day(20 - i), eaten, burned }))
}

test('Test 2: logged average 2,050 and trend 1.0 lb/week → TDEE 2,550, range 1,550 to 2,050, floor 1,550', () => {
  const days = logged(21, 2050)
  assert.equal(tdeeFromLogs(days, day(20), 1.0), 2550)
  const range = healerRange(days, day(20), 1.0)
  assert.deepEqual(range, { source: 'logs', tdee: 2550, low: 1550, high: 2050, floor: 1550 })
  // The same trend from weigh-ins.
  const r = trend(series(0, 20, 200, 1.0), day(20)) as number
  close(healerRange(days, day(20), r).floor, 1550)
})

test('Bootstrap: Fitbit burned, then Mifflin–St Jeor × 1.4, then 1,200', () => {
  const tenLogged = [...logged(10, 2000, 2600), ...Array.from({ length: 4 }, (_, i) => ({ date: day(10 - i), burned: 2600 }))]
  const burned = healerRange(tenLogged, day(20), 1.0)
  assert.equal(burned.source, 'burned')
  assert.equal(burned.floor, 1600)

  const profile = { sex: 'male' as const, birthYear: 1986, heightCm: 180, weightLb: 98.43 * 2.2046226218 }
  close(mifflinStJeor(profile, day(20)) as number, 1914.3)
  const mifflin = healerRange(logged(10, 2000), day(20), 1.0, profile)
  assert.equal(mifflin.source, 'mifflin')
  close(mifflin.tdee as number, 2680.02)
  assert.equal(mifflin.floor, 1700)

  const nothing = healerRange([], day(20), null)
  assert.deepEqual(nothing, { source: 'minimum', tdee: null, low: null, high: null, floor: 1200 })
  // 14 logged days but no known trend is still a bootstrap.
  assert.equal(healerRange(logged(14, 2000), day(20), null).source, 'minimum')
})

test('The floor is never below 1,200 and rounds to the nearest 50', () => {
  assert.equal(healerRange(logged(21, 1700), day(20), 0.5).floor, 1200) // TDEE 1,950
  assert.equal(healerRange(logged(21, 2030), day(20), 0).floor, 1200) // TDEE 2,030
  assert.equal(healerRange(logged(21, 2580), day(20), 0).floor, 1600) // 1,580 → 1,600
  assert.equal(healerRange(logged(21, 2560), day(20), 0).floor, 1550) // 1,560 → 1,550
})

test('Smoothing (A-44): a floor at 1,550 whose fresh computation says 1,800 moves to 1,650 after one week', () => {
  assert.equal(smoothFloor(undefined, 1800), 1800)
  assert.equal(smoothFloor(1550, 1800), 1650)
  assert.equal(smoothFloor(1650, 1800), 1750)
  assert.equal(smoothFloor(1550, 1500), 1500)
  assert.equal(smoothFloor(1550, 1200), 1450)
})

test('Crash dieting: a two-week logged average under the floor brings a gentle check-in', () => {
  const notes = healerCheckIns({ floor: 1550, loggedAverage: 1400 })
  assert.deepEqual(notes, [{ checkIn: 'crashDieting', facts: { floor: 1550 } }])
  assert.match(healerText(notes[0]), /below the calorie floor of 1550 kcal/)
  assert.deepEqual(healerCheckIns({ floor: 1550, loggedAverage: 1600 }), [])
})

// ── Healer check-ins ─────────────────────────────────────────────────────────

test('Ch 16: each guardrail has its check-in, in the chapter\'s order', () => {
  const notes = healerCheckIns({
    floor: 1550,
    loggedAverage: 1500,
    momentum: { r: 0.1, mw: 0.125, mf: 0.6, qw: 0.9, tooFast: false },
    refusedGoal: { goal: 125, unit: 'lb' },
    stepsOverPool: true,
    roughPatch: { days: 3, respite: 2 },
    fearOfLosing: { grace: 3 },
    awayDays: 20,
    loss: { what: 'Hex 3-4', date: day(5) },
    ordersSet: { closeTime: '04:00' },
    payingOrRushing: true,
    privacy: true
  })
  assert.deepEqual(
    notes.map((n) => n.checkIn),
    [
      'crashDieting',
      'plateau',
      'unsafeGoal',
      'overtraining',
      'illnessAndTravel',
      'fearOfLosing',
      'comingBack',
      'shame',
      'compulsiveChecking',
      'payingOrRushing',
      'privacy'
    ]
  )
  const facts = Object.fromEntries(notes.map((n) => [n.checkIn, n.facts]))
  assert.deepEqual(facts.plateau, { consistency: 90 })
  assert.deepEqual(facts.fearOfLosing, { week: 44 })
  for (const n of notes) assert.doesNotMatch(healerText(n), /\{\w+\}|\[missing/)
})

test('Ch 16: regain and quiet weeks', () => {
  const up = healerCheckIns({ momentum: { r: -1, mw: 0, mf: 0.6, qw: 0.88, tooFast: false } })
  assert.deepEqual(up.map((n) => n.checkIn), ['regain'])
  assert.deepEqual(healerCheckIns({ momentum: { r: 0.8, mw: 1, mf: 0.3, qw: 0.82, tooFast: false } }), [])
  assert.deepEqual(healerCheckIns({ roughPatch: { days: 2, respite: 4 }, awayDays: 13, fearOfLosing: { grace: 2 } }).map((n) => n.checkIn), ['fearOfLosing'])
})

// ── The week close ───────────────────────────────────────────────────────────

test('closeWeightWeek records the week, breaks Milestones, moves Grace and the floor, and settles once', () => {
  const c = campaign()
  const weighIns = [{ date: day(0), weight: 217 }, ...series(14, 27, 211, 0.8)]
  const days = logged(21, 2050).map((d) => ({ ...d, date: addDays(d.date, 7) }))
  let weight = initialWeightState(217, 168)
  weight = { ...weight, healerFloor: 1300, weeks: [week(1, { momentum: 1 }), week(2, { momentum: 1 }), week(3, { momentum: 1 })] }
  const input = { day: weekEnd(4), week: 4, weighIns, days, qw: 0.8, realmConsistency: 0.8 }
  const result = closeWeightWeek(c, weight, input)

  assert.equal(result.weight.weeks.length, 4)
  assert.equal(result.weight.weeks[3].week, 4)
  assert.equal(result.weight.weeks[3].momentum, result.momentum.m)
  assert.deepEqual(result.broken.map((m) => m.index), [1])
  assert.deepEqual(result.grace, { from: 0, to: 1 })
  assert.equal(result.weight.grace, 1)
  assert.equal(result.healer.source, 'logs')
  assert.equal(result.healer.floor, 1450) // TDEE 2,050 + 0.8 × 500 = 2,450
  assert.equal(result.weight.healerFloor, 1400) // moves at most 100 from 1,300
  assert.deepEqual(result.checkIns, [])

  const again = closeWeightWeek(c, result.weight, input)
  assert.equal(again.weight, result.weight)
  assert.deepEqual(again.broken, [])
  assert.deepEqual(again.checkIns, [])
})
