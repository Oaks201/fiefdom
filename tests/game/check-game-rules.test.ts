import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(__filename)
const { scanSource } = require('../../scripts/check-game-rules.cjs') as {
  scanSource: (src: string, name: string) => string[]
}

test('check:game flags Math.random, Date.now and new Date( in lib/game', () => {
  assert.equal(scanSource('export const x = (): number => Math.random()\n', 'scratch.ts').length, 1)
  assert.equal(scanSource('export const x = (): number => Date.now()\n', 'scratch.ts').length, 1)
  assert.equal(scanSource('export const x = new Date(0)\n', 'scratch.ts').length, 1)
  assert.equal(scanSource('export const x = new Date(0)\n', 'clock.ts').length, 0)
  assert.equal(scanSource('export const x = Math.random()\n', 'clock.ts').length, 1)
  assert.equal(scanSource('export const x = Math.random()\n', 'rules.ts').length, 1)
})

test('check:game ignores comments and strings that mention them', () => {
  const src = [
    '// Never Math.random or Date.now here; new Date( only in clock.ts.',
    "export const note = 'Math.random() is banned'",
    '/* Date.now() */ export const y = 1'
  ].join('\n')
  assert.deepEqual(scanSource(src, 'scratch.ts'), [])
})

test('check:game allows 0, 1, −1, 2 and 100 and flags other numbers outside rules.ts', () => {
  assert.deepEqual(scanSource('export const a = [0, 1, -1, 2, 100, 0.0, 1_00]\n', 'x.ts'), [])
  const problems = scanSource('export const a = 3\nexport const b = 0.5 + -2\nexport const c = x - 7\n', 'x.ts')
  assert.equal(problems.length, 4)
  assert.match(problems[0], /^x\.ts:1: number 3 /)
  assert.match(problems[1], /^x\.ts:2: number 0\.5 /)
  assert.match(problems[2], /^x\.ts:2: number -2 /)
  assert.match(problems[3], /^x\.ts:3: number 7 /)
  assert.deepEqual(scanSource('export const a = 3\n', 'rules.ts'), [])
})

test('check:game accepts a number whose line says "// rules-ok: <reason>"', () => {
  assert.deepEqual(scanSource('const DAY_MS = 86_400_000 // rules-ok: milliseconds in a day\n', 'x.ts'), [])
  assert.equal(scanSource('const DAY_MS = 86_400_000 // rules-ok:\n', 'x.ts').length, 1)
})

test('check:game reads numbers in code, not in strings, comments, regexes or template text', () => {
  const quiet = [
    "const s = 'hex 3-4' // 25 in a comment",
    'const r = /\\d{4}-\\d{2}/g',
    'const t = `week 36 of ${name}`',
    'const h = h23 + mulberry32'
  ].join('\n')
  assert.deepEqual(scanSource(quiet, 'x.ts'), [])
  assert.equal(scanSource('const t = `week ${36}`\n', 'x.ts').length, 1)
  assert.equal(scanSource('const t = `a ${`b ${7}`}`\n', 'x.ts').length, 1)
  assert.equal(scanSource('const h = 0xff\n', 'x.ts').length, 1)
})
