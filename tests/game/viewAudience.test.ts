/**
 * The Audience's lines (Diplomacy): the Respect tier each rival speaks from, read from
 * rivalLines.json at the project root, its accept line, and a short fallback, never a throw, when
 * the hand-edited file lacks a line.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RIVAL_IDS, type RivalId } from '../../src/renderer/src/lib/game/types'
import { acceptLine, audienceLine, FALLBACK_LINE, LINE_KEYS, lineTiers, respectTier } from '../../src/renderer/src/lib/game/view/audience'
import linesJson from '../../rivalLines.json'

const lines = linesJson as unknown as { tiers: number[]; rivals: Record<string, Record<string, string>> }

test('each rival id maps to its key in rivalLines.json', () => {
  assert.deepEqual(LINE_KEYS, { orc: 'ugrak', goblin: 'skivvet', dwarf: 'hrodgar', archmage: 'emrys' })
  for (const rival of RIVAL_IDS) assert.ok(lines.rivals[LINE_KEYS[rival]], `${rival} has an entry`)
})

test('the file lists the nine tiers, three below 0 (C-64), and every rival has a line for each and an accept line', () => {
  assert.deepEqual(lineTiers(), [-75, -50, -25, 0, 25, 40, 50, 60, 75])
  for (const rival of RIVAL_IDS) {
    for (const tier of lineTiers()) assert.equal(audienceLine(rival, tier).missing, false, `${rival} at ${tier}`)
    assert.equal(acceptLine(rival).missing, false, `${rival} accept`)
  }
})

test('Respect picks its tier: −51 and down, −50 to −26, −25 to −1, 0–24, 25–39, 40–49, 50–59, 60–74, 75 and up', () => {
  const cases: [number, number][] = [
    [-100, -75],
    [-75, -75],
    [-51, -75],
    [-50, -50],
    [-26, -50],
    [-25, -25],
    [-5, -25],
    [-0.5, -25],
    [0, 0],
    [24, 0],
    [24.9, 0],
    [25, 25],
    [39, 25],
    [40, 40],
    [49, 40],
    [50, 50],
    [59, 50],
    [60, 60],
    [74, 60],
    [75, 75],
    [100, 75]
  ]
  for (const [respect, tier] of cases) {
    assert.equal(respectTier(lineTiers(), respect), tier, `Respect ${respect}`)
    for (const rival of RIVAL_IDS) {
      const line = audienceLine(rival, respect)
      assert.equal(line.tier, tier)
      assert.equal(line.text, lines.rivals[LINE_KEYS[rival]][String(tier)], `${rival} at ${respect}`)
    }
  }
})

test('the tier floors may come in any order', () => {
  assert.equal(respectTier([75, 0, 40, 25, 60, 50], 45), 40)
  assert.equal(respectTier([], 45), null)
})

test('the accept line comes from the rival’s own entry', () => {
  for (const rival of RIVAL_IDS) assert.equal(acceptLine(rival).text, lines.rivals[LINE_KEYS[rival]].accept)
})

test('a missing or broken line gives the fallback instead of throwing', () => {
  const orcOnly = { tiers: [0, 25], rivals: { ugrak: { '0': 'Line at zero.', '25': '  ' } } }
  assert.deepEqual(audienceLine('orc', 10, orcOnly), { tier: 0, text: 'Line at zero.', missing: false })
  assert.deepEqual(audienceLine('orc', 30, orcOnly), { tier: 25, text: FALLBACK_LINE, missing: true }, 'a blank line')
  assert.deepEqual(acceptLine('orc', orcOnly), { text: FALLBACK_LINE, missing: true }, 'no accept line')
  const missingRival: RivalId = 'goblin'
  assert.equal(audienceLine(missingRival, 10, orcOnly).text, FALLBACK_LINE, 'no entry for the rival')
  for (const broken of [null, 'text', [], {},{ tiers: 'no', rivals: {} }, { tiers: [0], rivals: { ugrak: 'not an object' } }, { tiers: [0], rivals: { ugrak: { '0': 7 } } }]) {
    assert.equal(audienceLine('orc', 10, broken).text, FALLBACK_LINE, JSON.stringify(broken))
    assert.equal(acceptLine('orc', broken).text, FALLBACK_LINE, JSON.stringify(broken))
  }
})
