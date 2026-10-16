/**
 * The player's portrait by Dominion tier and path (playerPortraits.json): tiers from overall
 * Dominion, pure and hybrid paths from each rival's road, the 41 file names, the fallback chain,
 * which stand-in a set of existing files gives, when the standing card is raised, and a broken data
 * file falling back to the base file without a throw.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pathTotals } from '../../src/renderer/src/lib/game/dominion'
import { RIVAL_IDS, type RivalId } from '../../src/renderer/src/lib/game/types'
import {
  PORTRAIT_SETUP,
  pathOf,
  pathWords,
  portraitChoice,
  portraitFiles,
  readSetup,
  resolvePortrait,
  standingFrom,
  standingGrew,
  standingOf,
  tierOf
} from '../../src/renderer/src/lib/game/view/playerPortrait'
import setupJson from '../../playerPortraits.json'
import { driveCampaign } from './support/campaign-driver'

const per = (orc: number, goblin: number, dwarf: number, archmage: number): Record<RivalId, number> => ({ orc, goblin, dwarf, archmage })
const ORDER: RivalId[] = ['orc', 'goblin', 'dwarf', 'archmage']

test('the data file reads cleanly, with the approved thresholds (rescaled to D-18’s Dominion, ×7.4) and a 15% margin', () => {
  assert.deepEqual(PORTRAIT_SETUP.problems, [])
  assert.deepEqual(PORTRAIT_SETUP.config?.tiers, [0, 300, 1100, 2350, 3850])
  assert.equal(PORTRAIT_SETUP.config?.closeMargin, 0.15)
  assert.deepEqual(PORTRAIT_SETUP.config?.paths, [
    ['orc', 'orc'],
    ['goblin', 'goblin'],
    ['dwarf', 'dwarf'],
    ['archmage', 'mage']
  ])
})

test('the tier comes from overall Dominion: 0–299, 300–1,099, 1,100–2,349, 2,350–3,849, 3,850 and up', () => {
  const tiers = PORTRAIT_SETUP.config?.tiers ?? []
  const cases: [number, number][] = [
    [0, 1],
    [150, 1],
    [299, 1],
    [300, 2],
    [1_099, 2],
    [1_100, 3],
    [2_349, 3],
    [2_350, 4],
    [3_849, 4],
    [3_850, 5],
    [4_800, 5]
  ]
  for (const [overall, tier] of cases) assert.equal(tierOf(overall, tiers), tier, `Dominion ${overall}`)
  assert.equal(standingFrom(per(800, 400, 0, 0)).tier, 3, 'the sum of the four paths')
})

test('a path leads by more than 15% of its own Dominion: pure; within it: the hybrid of the top two', () => {
  assert.deepEqual(pathOf(per(100, 84, 0, 0), 0.15, ORDER), { kind: 'pure', lead: 'orc', numbers: { top: 100, second: 84, gap: 16, limit: 15 } })
  const close = pathOf(per(100, 85, 0, 0), 0.15, ORDER)
  assert.equal(close.kind, 'hybrid', 'a gap of exactly 15% is close')
  assert.ok(close.kind === 'hybrid' && close.lead === 'orc' && close.second === 'goblin')
  const three = pathOf(per(90, 100, 95, 0), 0.15, ORDER)
  assert.ok(three.kind === 'hybrid' && three.lead === 'goblin' && three.second === 'dwarf', 'three close: the top two')
  const all = pathOf(per(158, 158, 158, 158), 0.15, ORDER)
  assert.ok(all.kind === 'hybrid' && all.lead === 'orc' && all.second === 'goblin', 'exact ties keep the data file order')
  assert.deepEqual(pathOf(per(0, 0, 0, 0), 0.15, ORDER), { kind: 'base' })
  assert.equal(pathOf(per(0, 0, 0, 7), 0.15, ORDER).kind, 'pure', 'one path alone')
})

test('the 41 files: the base, then per tier the four pure paths and the six alphabetical hybrids', () => {
  const files = portraitFiles()
  assert.equal(files.length, 41)
  assert.equal(new Set(files).size, 41)
  assert.equal(files[0], 'player_t1.png')
  for (let tier = 2; tier <= 5; tier++) {
    for (const path of ['orc', 'goblin', 'dwarf', 'mage']) assert.ok(files.includes(`player_t${tier}_${path}.png`))
    for (const pair of ['dwarf-goblin', 'dwarf-mage', 'dwarf-orc', 'goblin-mage', 'goblin-orc', 'mage-orc']) assert.ok(files.includes(`player_t${tier}_${pair}.png`), `t${tier} ${pair}`)
  }
})

test('the file and its fallback chain: a hybrid, then the leading path at the same and lower tiers, then the base', () => {
  const hybrid = portraitChoice(standingFrom(per(100, 90, 0, 0), 4))
  assert.equal(hybrid.wanted, 'player_t4_goblin-orc.png')
  assert.equal(hybrid.key, 't4:goblin-orc')
  assert.deepEqual(hybrid.chain, ['player_t4_goblin-orc.png', 'player_t4_orc.png', 'player_t3_orc.png', 'player_t2_orc.png', 'player_t1.png'])
  const emrys = portraitChoice(standingFrom(per(0, 0, 10, 200), 3))
  assert.equal(emrys.wanted, 'player_t3_mage.png', 'Emrys is the mage path')
  assert.deepEqual(emrys.chain, ['player_t3_mage.png', 'player_t2_mage.png', 'player_t1.png'])
  assert.deepEqual(portraitChoice(standingFrom(per(30, 0, 0, 0))).chain, ['player_t1.png'], 'tier 1 is always the base')
  assert.equal(portraitChoice(standingFrom(per(0, 0, 0, 0), 5)).key, 't1', 'every path at zero is the base')
  assert.equal(portraitChoice(null).wanted, 'player_t1.png', 'no campaign')
  assert.equal(portraitChoice(standingFrom(per(900, 0, 0, 0), 9)).tier, 5, 'a tier past the last is the last')
})

test('which file stands in, given the files that exist', () => {
  const choice = portraitChoice(standingFrom(per(100, 90, 0, 0), 4))
  const only = (...files: string[]) => (file: string) => files.includes(file)
  assert.deepEqual(resolvePortrait(choice, only('player_t1.png', 'player_t4_goblin-orc.png')), { file: 'player_t4_goblin-orc.png', fallback: 'none', pending: false })
  assert.equal(resolvePortrait(choice, only('player_t1.png', 'player_t4_orc.png')).fallback, 'leadSameTier')
  assert.deepEqual(resolvePortrait(choice, only('player_t1.png', 'player_t2_orc.png')), { file: 'player_t2_orc.png', fallback: 'lowerTier', pending: false })
  assert.deepEqual(resolvePortrait(choice, only('player_t1.png')), { file: 'player_t1.png', fallback: 'base', pending: false })
  assert.deepEqual(resolvePortrait(choice, only()), { file: null, fallback: 'placeholder', pending: false })
  const pure = portraitChoice(standingFrom(per(200, 0, 0, 0), 3))
  assert.equal(resolvePortrait(pure, only('player_t1.png', 'player_t2_orc.png')).fallback, 'lowerTier')
  // A file not checked yet: the best one known stands in, marked pending.
  assert.deepEqual(resolvePortrait(choice, (f) => (f === 'player_t1.png' ? true : undefined)), { file: 'player_t1.png', fallback: 'base', pending: true })
})

test('the standing card: on a tier rise or a new path, never on a first look or a drop', () => {
  assert.equal(standingGrew(null, { tier: 3, key: 't3:orc' }), false, 'a first look only records')
  assert.equal(standingGrew({ tier: 1, key: 't1' }, { tier: 2, key: 't2:orc' }), true)
  assert.equal(standingGrew({ tier: 2, key: 't2:orc' }, { tier: 2, key: 't2:goblin-orc' }), true, 'a new path, same tier')
  assert.equal(standingGrew({ tier: 3, key: 't3:orc' }, { tier: 2, key: 't2:goblin' }), false, 'a drop')
  assert.equal(standingGrew({ tier: 2, key: 't2:orc' }, { tier: 2, key: 't2:orc' }), false, 'unchanged')
  assert.equal(pathWords(portraitChoice(standingFrom(per(100, 90, 0, 0), 2)).path), 'Ugrak and Skivvet')
  assert.equal(pathWords(portraitChoice(standingFrom(per(0, 0, 200, 0), 2)).path), 'Hrodgar')
})

test('a played campaign: each path is its rival’s path Dominion (D-18), and the overall their sum', () => {
  const state = driveCampaign({ seed: 7, weeks: 14, habits: 'steady', policy: 'greedy' }).state
  const totals = pathTotals(state)
  const standing = standingOf(state)
  for (const rival of RIVAL_IDS) assert.equal(standing.perPath[rival], totals[rival], rival)
  assert.equal(standing.overall, Object.values(totals).reduce((s, v) => s + v, 0))
  assert.equal(standing.tier, tierOf(standing.overall, PORTRAIT_SETUP.config?.tiers ?? []))
})

test('a broken data file stays on the base file (or the placeholder) and never throws', () => {
  const noTiers = readSetup({ ...setupJson, tiers: 'many' })
  assert.ok(noTiers.problems.length > 0 && noTiers.config === null)
  assert.deepEqual(portraitChoice(standingFrom(per(400, 0, 0, 0), 4), noTiers).chain, ['player_t1.png'])
  for (const broken of [null, 'text', [], {}, { ...setupJson, paths: { orc: 'orc' } }, { ...setupJson, closeMargin: -1 }, { ...setupJson, files: { base: '' } }]) {
    const setup = readSetup(broken)
    assert.ok(setup.problems.length > 0, JSON.stringify(broken))
    const choice = portraitChoice(standingFrom(per(400, 0, 0, 0), 4), setup)
    assert.ok(choice.chain.length <= 1)
    assert.equal(resolvePortrait(choice, () => false, setup).fallback, 'placeholder')
    assert.ok(Array.isArray(portraitFiles(setup)))
  }
})
