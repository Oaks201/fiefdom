import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { chance, draw, int, pick, roll, shuffle, stream, weighted } from '../../src/renderer/src/lib/game/rng'

/** Runs draw(42, '2026-10-05', 'threat') in a fresh Node process. */
function drawInChildProcess(tz: string): number {
  const script = path.join('tests', 'game', 'support', 'draw-threat.ts')
  const out = execFileSync(process.execPath, ['--import', 'tsx', script], {
    env: { ...process.env, TZ: tz },
    encoding: 'utf8'
  })
  return Number(out.trim())
}

test('Ch 2 rule 7: draw(42, 2026-10-05, threat) is the same in three separate processes', () => {
  const here = draw(42, '2026-10-05', 'threat')
  const there = ['UTC', 'America/New_York', 'Asia/Tokyo'].map(drawInChildProcess)
  assert.deepEqual(there, [here, here, here])
  assert.ok(here >= 0 && here < 1)
})

test('Ch 2 rule 7: changing the seed, the day or the label changes the draw', () => {
  const base = draw(42, '2026-10-05', 'threat')
  assert.notEqual(draw(43, '2026-10-05', 'threat'), base)
  assert.notEqual(draw(42, '2026-10-06', 'threat'), base)
  assert.notEqual(draw(42, '2026-10-05', 'raider'), base)
  assert.notEqual(draw(42, '2026-10-05', 'threat:1'), base)
  assert.equal(draw(42, '2026-10-05', 'threat'), base)
})

test('draw: 10,000 draws stay in [0, 1) with a mean of 0.5 ± 0.01', () => {
  let sum = 0
  for (let i = 0; i < 10_000; i++) {
    const u = draw(42, '2026-10-05', `mean:${i}`)
    assert.ok(u >= 0 && u < 1, `draw ${i} = ${u}`)
    sum += u
  }
  assert.ok(Math.abs(sum / 10_000 - 0.5) <= 0.01, `mean ${sum / 10_000}`)
})

test('draw: the mean also holds across days and seeds', () => {
  let sum = 0
  let n = 0
  for (let seed = 1; seed <= 100; seed++) {
    for (let day = 1; day <= 28; day++) {
      sum += draw(seed, `2026-02-${String(day).padStart(2, '0')}`, 'threat')
      n++
    }
  }
  assert.ok(Math.abs(sum / n - 0.5) <= 0.015, `mean ${sum / n}`)
})

test('weighted([a, b, c], [1, 2, 7]) lands within ±1 point of 10 / 20 / 70% over 100,000 draws', () => {
  const counts = { a: 0, b: 0, c: 0 }
  const list = ['a', 'b', 'c'] as const
  for (let i = 0; i < 100_000; i++) counts[weighted(7, '2026-10-05', `mix:${i}`, list, [1, 2, 7])]++
  assert.ok(Math.abs(counts.a / 100_000 - 0.1) <= 0.01, `a ${counts.a}`)
  assert.ok(Math.abs(counts.b / 100_000 - 0.2) <= 0.01, `b ${counts.b}`)
  assert.ok(Math.abs(counts.c / 100_000 - 0.7) <= 0.01, `c ${counts.c}`)
})

test('weighted never picks a zero weight and refuses bad weights', () => {
  for (let i = 0; i < 2_000; i++) assert.equal(weighted(1, '2026-10-05', `z:${i}`, ['x', 'y'], [0, 3]), 'y')
  assert.throws(() => weighted(1, '2026-10-05', 'w', ['x', 'y'], [1]), RangeError)
  assert.throws(() => weighted(1, '2026-10-05', 'w', ['x'], [-1]), RangeError)
  assert.throws(() => weighted(1, '2026-10-05', 'w', ['x', 'y'], [0, 0]), RangeError)
  assert.throws(() => weighted(1, '2026-10-05', 'w', [], []), RangeError)
})

test('roll, int, chance and pick shape the same draw', () => {
  const u = draw(9, '2026-10-05', 'x')
  assert.equal(roll(9, '2026-10-05', 'x', 0.85, 1.15), 0.85 + (1.15 - 0.85) * u)
  assert.equal(int(9, '2026-10-05', 'x', -1, 1), -1 + Math.floor(u * 3))
  assert.equal(chance(9, '2026-10-05', 'x', u + 1e-9), true)
  assert.equal(chance(9, '2026-10-05', 'x', u), false)
  assert.equal(pick(9, '2026-10-05', 'x', ['a', 'b', 'c', 'd']), ['a', 'b', 'c', 'd'][Math.floor(u * 4)])
  assert.throws(() => pick(9, '2026-10-05', 'x', []), RangeError)
})

test('int covers both bounds and nothing outside them', () => {
  const seen = new Set<number>()
  for (let i = 0; i < 1_000; i++) {
    const n = int(3, '2026-10-05', `int:${i}`, -1, 1)
    assert.ok(Number.isInteger(n) && n >= -1 && n <= 1)
    seen.add(n)
  }
  assert.deepEqual([...seen].sort(), [-1, 0, 1])
  assert.throws(() => int(3, '2026-10-05', 'int', 2, 1), RangeError)
})

test('chance(0) is never true and chance(1) always is', () => {
  for (let i = 0; i < 500; i++) {
    assert.equal(chance(5, '2026-10-05', `c:${i}`, 0), false)
    assert.equal(chance(5, '2026-10-05', `c:${i}`, 1), true)
  }
})

test('stream: draw i equals draw(seed, day, label#i), and a stream replays exactly', () => {
  const s = stream(42, '2026-10-05', 'villages:3')
  const values = [s.next(), s.next(), s.next()]
  assert.deepEqual(values, [0, 1, 2].map((i) => draw(42, '2026-10-05', `villages:3#${i}`)))
  assert.equal(s.drawn, 3)
  const again = stream(42, '2026-10-05', 'villages:3')
  assert.deepEqual([again.next(), again.next(), again.next()], values)
})

test('shuffle is a seeded permutation that leaves its input alone', () => {
  const list = Array.from({ length: 20 }, (_, i) => i)
  const a = shuffle(42, '2026-10-05', 'order', list)
  const b = shuffle(42, '2026-10-05', 'order', list)
  assert.deepEqual(a, b)
  assert.deepEqual([...a].sort((x, y) => x - y), list)
  assert.notDeepEqual(a, list)
  assert.notDeepEqual(shuffle(43, '2026-10-05', 'order', list), a)
  assert.deepEqual(list, Array.from({ length: 20 }, (_, i) => i))
})
