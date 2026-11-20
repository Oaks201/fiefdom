/**
 * Patch 10 stage 4 (L1, L2; D-80, D-93): the day and the week. The week ahead names up to three aims the player can
 * move, each with how it stands, from public figures alone; and a path rank reached raises a big-moment card with the
 * rank, what the path gives now and the ruler's word on it (approved by Rich, D-94).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDays, weekOf } from '../../src/renderer/src/lib/game/clock'
import { rankThresholds } from '../../src/renderer/src/lib/game/dominion'
import { RULES } from '../../src/renderer/src/lib/game/rules'
import { withStandingSiege } from '../../src/renderer/src/lib/game/sieges'
import { withWorld } from '../../src/renderer/src/lib/game/state'
import { t } from '../../src/renderer/src/lib/game/text'
import { RIVAL_IDS, type CampaignState, type GameEvent, type RivalId } from '../../src/renderer/src/lib/game/types'
import { rankLine, withDrafts } from '../../src/renderer/src/lib/game/view/audience'
import { requestBrief } from '../../src/renderer/src/lib/game/view/healer'
import { momentsFor } from '../../src/renderer/src/lib/game/view/endgame'
import { rankPerkLines } from '../../src/renderer/src/lib/game/view/rivalGuide'
import { WEEK_AIMS, weekAhead, weekBegins } from '../../src/renderer/src/lib/game/view/weekAhead'
import linesJson from '../../rivalLines.json'
import { realm, withPurse, withRenown } from './support/realm'
import { START, front } from './support/war'

const DEV = withDrafts()
const YESTERDAY = addDays(START, -1)

function commissioned(state: CampaignState, rival: RivalId, more: Record<string, unknown> = {}): CampaignState {
  return withWorld(state, { requests: [{ id: `q-${rival}`, rival, kind: 'commission', madeOn: YESTERDAY, until: addDays(START, 5), need: 3, ...more }] })
}

// ── L1: the week ahead ───────────────────────────────────────────────────────

test('L1: with nothing asked of the player, the week ahead holds the nearest path rank and the next step the purse can reach', () => {
  assert.deepEqual(weekAhead(withPurse(realm(), 5_000), undefined, START).map((a) => a.kind), ['rank'], 'a step that wants Dominion too is not in reach of the purse')
  const state = withPurse(withRenown(realm(), 'dwarf', 2_000), 5_000)
  const aims = weekAhead(state, undefined, START)
  assert.deepEqual(
    aims.map((a) => a.kind),
    ['rank', 'build']
  )
  const build = aims[1]
  assert.equal(build.progress, 'In the purse now')
  for (const a of aims) {
    assert.ok(a.share >= 0 && a.share <= 1, a.kind)
    assert.doesNotMatch(`${a.title} ${a.text} ${a.progress}`, /undefined|NaN|\{/, a.kind)
  }
})

test('L1: the nearest rank is the path with the least Dominion to go, worded with its figures', () => {
  const first = rankThresholds()[0]
  const state = withRenown(realm(), 'dwarf', first - 5)
  const rank = weekAhead(state, undefined, START).find((a) => a.kind === 'rank')
  assert.ok(rank)
  assert.equal(rank.rival, 'dwarf')
  assert.equal(rank.title, 'Rank I on Hrodgar’s path')
  assert.equal(rank.progress, '5 Dominion to go')
  assert.ok(rank.share > 0.9)
})

test('L1: a commission comes first with its count; offered, it says where to take it up; met and taken up, it is done', () => {
  const offered = weekAhead(commissioned(realm(), 'orc'), undefined, START)[0]
  assert.equal(offered.kind, 'commission')
  assert.equal(offered.title, 'Ugrak’s commission')
  assert.match(offered.text, /^3 days in his field, by \w{3}, \w{3} \d+$/)
  assert.equal(offered.progress, '0 of 3: take it up in his Audience')
  assert.equal(offered.page, 'diplomacy')
  const terms = weekAhead(commissioned(realm(), 'orc', { ultimatum: true }), undefined, START)[0]
  assert.equal(terms.title, 'Ugrak’s terms to stand down')
  assert.equal(terms.progress, '0 of 3')
  const demand = weekAhead(commissioned(realm(), 'dwarf', { demand: true, need: 2 }), undefined, START)[0]
  assert.equal(demand.title, 'Hrodgar’s demand')
  assert.match(demand.text, /^2 wall levels raised/)
})

test('L1: the week’s own aims come first, then the siege, the rank and the purse, at most three', () => {
  const f = front(withPurse(realm(), 5_000), 'orc', 3)
  const besieging = commissioned(withStandingSiege(f.state, f.outer, YESTERDAY), 'dwarf', { accepted: YESTERDAY, need: 2 })
  const aims = weekAhead(besieging, undefined, START)
  assert.equal(aims.length, WEEK_AIMS)
  assert.deepEqual(
    aims.map((a) => a.kind),
    ['commission', 'siege', 'rank']
  )
  const siege = aims[1]
  assert.match(siege.title, /^The siege of /)
  assert.match(siege.progress, /^\d+% worn$/)
  assert.match(siege.text, /assault days at a full day’s Valor|can fall today|holds against/)
})

test('L1: Remedy’s request in brief, a single day said as one', () => {
  assert.equal(requestBrief({ habit: 'withinLimit', target: 1 }), '1 day within the calorie limit')
  assert.equal(requestBrief({ habit: 'foodLogged', target: 6 }), 'food logged on 6 days')
  assert.equal(requestBrief({ habit: 'steps', target: 80 }), '80% of the step pool walked')
})

test('L1 (Convention 6): no hidden value moves the week ahead: rival treasuries, armies and the AI’s memory change nothing', () => {
  const state = commissioned(withPurse(realm(), 5_000), 'goblin')
  const rich: CampaignState = { ...state, rivals: Object.fromEntries(RIVAL_IDS.map((r) => [r, { ...state.rivals[r], treasury: 99_999 }])) as CampaignState['rivals'] }
  assert.deepEqual(weekAhead(rich, undefined, START), weekAhead(state, undefined, START))
})

test('L1: the Dawn tidings shows it on the week’s first day only; a fallen realm has none', () => {
  const state = realm()
  const first = weekOf(START, state.campaign.weekStartsOn)
  assert.equal(weekBegins(state, first), true)
  assert.equal(weekBegins(state, addDays(first, 1)), false)
  assert.deepEqual(weekAhead({ ...state, campaign: { ...state.campaign, status: 'fallen' } }, undefined, START), [])
})

// ── L2: a rank reached is a moment ───────────────────────────────────────────

function rankEvent(path: RivalId, rank: number): GameEvent {
  return { id: `rank-${path}-${rank}`, day: START, kind: 'pathRank', path, rank } as GameEvent
}

test('L2: a path rank raises a card: his portrait, the rank, what the path gives now, and where the next rank lies', () => {
  const state = realm()
  const [card] = momentsFor(state, [rankEvent('orc', 3)])
  assert.ok(card)
  assert.equal(card.slot, 'rival.orc.calm')
  assert.equal(card.titleId, 'herald.pathRank.title')
  assert.deepEqual(card.ruler, { rival: 'orc', rank: 3 })
  assert.equal(t(card.titleId, card.facts), 'Ugrak’s path: rank III')
  const rp = RULES.dominion.rankPerks.orc
  assert.deepEqual(card.lines, [
    `New at rank III: A Grand Battle’s Weary lasts ${rp.grandWearyDays} day less.`,
    `Its ranks together: Your rally floor +${Math.round(rp.rallyFloor * 3 * 100)}%, and Weary ${Math.round(rp.wearyEase * 3 * 100)}% lighter.`,
    `Rank IV at Dominion ${rankThresholds()[3].toLocaleString('en-US')} on his path.`
  ])
})

test('L2: every rank of every path words its perks, and the top rank says so', () => {
  for (const r of RIVAL_IDS) {
    for (let rank = 1; rank <= rankThresholds().length; rank++) {
      const lines = rankPerkLines(r, rank)
      assert.ok(lines.length >= 2, `${r} ${rank}`)
      for (const l of lines) assert.doesNotMatch(l, /undefined|NaN|(^|[\s(])-\d/, `${r} ${rank}: ${l}`)
    }
    assert.equal(rankPerkLines(r, rankThresholds().length).at(-1), 'The top rank of his path.')
  }
  assert.match(rankPerkLines('archmage', 1)[0], /^New at rank I: Tomorrow’s surge is foretold\.$/)
  assert.match(rankPerkLines('dwarf', 2).join(' '), /every defense gains 2 walls/)
})

test('L2 (F3, D-94): his word on each rank is a whole line, approved by Rich, so a release build speaks it', () => {
  for (const r of RIVAL_IDS) {
    for (let rank = 1; rank <= rankThresholds().length; rank++) {
      const line = rankLine(r, rank, linesJson)
      assert.ok(line && line.trim(), `${r} ${rank}: in Rich's file`)
      assert.doesNotMatch(line, /\{/, 'no placeholders')
      assert.equal(rankLine(r, rank, DEV), line, `${r} ${rank}: no draft stands over it`)
    }
  }
})
