/**
 * T16: the Armory's view models (Ch 9 Milestones, Appendix C, Pillar 7): nothing a later Milestone
 * opens is named before it breaks, buying and equipping change the roster at once, a Wing is
 * chosen once, and the Milestone card lists only its own unlocks.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buyItem, chooseWing, equipItem, milestoneUnlocks } from '../../src/renderer/src/lib/game/armory'
import { CODEX } from '../../src/renderer/src/lib/game/codex'
import { RULES } from '../../src/renderer/src/lib/game/rules'
import { openDayOf } from '../../src/renderer/src/lib/game/state'
import { armoryView, milestoneCard, unlockLabel } from '../../src/renderer/src/lib/game/view/armory'
import { rosterView } from '../../src/renderer/src/lib/game/view/realm'
import { realm, withMilestones, withPurse } from './support/realm'

/** Every name a later Milestone opens: items of ranks still locked, Wings of waves still locked, Elites, the Sworn. */
function lockedNames(broken: number[]): string[] {
  const open = (m: number): boolean => broken.includes(m)
  const u = RULES.milestones.unlocks
  const rankOpens: Record<string, number> = { I: u.rankIItems, II: u.rankIIItems, III: u.rankIIIItems, legendary: u.legendaryItems }
  return [
    ...CODEX.items.filter((i) => i.rank !== 'trophy' && !open(rankOpens[i.rank])).map((i) => i.name),
    ...CODEX.wings.filter((w) => !open(u.wings[w.wave - 1])).map((w) => w.name),
    ...(open(u.elites) ? [] : CODEX.elites.map((e) => e.name)),
    ...(open(u.sworn) ? [] : [CODEX.sworn.name])
  ]
}

test('Pillar 7 / T16: no later Milestone’s unlocks are named anywhere in the Armory before it breaks', () => {
  for (const broken of [[], [1], [1, 2], [1, 2, 3, 4], [1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 6, 7, 8]]) {
    const state = withMilestones(realm(), ...broken)
    const view = armoryView(state)
    const text = JSON.stringify(view)
    for (const name of lockedNames(broken)) assert.ok(!text.includes(name), `with Milestones ${broken.join(',') || 'none'} the view names ${name}`)
    for (const r of view.ranks) {
      assert.equal(r.open, broken.includes(r.milestone))
      assert.equal(r.items === undefined, !r.open, `a locked rank shows only its Milestone (${r.name})`)
    }
    for (const w of view.wings) assert.equal(w.buildings === undefined, !broken.includes(w.milestone))
  }
  const closed = armoryView(realm())
  assert.equal(closed.open, false)
  assert.deepEqual(closed.ranks.map((r) => r.milestone), [1, 5, 8, 9])
})

test('T16: buying an item and equipping it changes the roster at once (Whetstones +2 power)', () => {
  const state = withPurse(withMilestones(realm(), 1), 500)
  const today = openDayOf(state)
  const card = armoryView(state).ranks[0].items!.find((i) => i.id === 'whetstones')!
  assert.deepEqual([card.offer.ok, card.offer.cost], [true, 60])
  assert.equal(card.textId, 'items.whetstones')
  const bought = buyItem(state, 'whetstones', today)
  assert.ok(bought.ok)
  assert.deepEqual(armoryView(bought.state).stash.map((s) => s.name), ['Whetstones'])
  const before = rosterView(bought.state).find((c) => c.id === 'barracks')!.power
  const equipped = equipItem(bought.state, 'barracks', 'whetstones', today)
  assert.ok(equipped.ok)
  const view = armoryView(equipped.state)
  assert.deepEqual(view.stash, [])
  assert.deepEqual(view.companies.find((c) => c.id === 'barracks')!.items.map((i) => i.name), ['Whetstones'])
  assert.equal(rosterView(equipped.state).find((c) => c.id === 'barracks')!.power, before + 2)
  // One slot from Milestone 1: a second item has nowhere to go.
  const again = buyItem(equipped.state, 'towerShields', today)
  assert.equal(equipItem(again.state, 'barracks', 'towerShields', today).ok, false)
})

test('Appendix C: a Wing is chosen once, for good; its pair then shows the other as taken', () => {
  const state = withMilestones(realm(), 1, 2)
  const today = openDayOf(state)
  const pair = armoryView(state).wings[0].buildings!.find((b) => b.building === 'barracks')!
  assert.deepEqual(pair.options.map((o) => [o.name, o.available]), [['Drill Yard', true], ['Watchtowers', true]])
  assert.match(pair.options[0].text, /power \+2/)
  const chosen = chooseWing(state, 'drillYard', today)
  assert.ok(chosen.ok)
  const after = armoryView(chosen.state).wings[0].buildings!.find((b) => b.building === 'barracks')!
  assert.deepEqual(after.options.map((o) => [o.chosen, o.available]), [[true, false], [false, false]])
  assert.equal(after.options[1].reason?.code, 'wingTaken')
  assert.equal(chooseWing(chosen.state, 'watchtowers', today).ok, false)
  assert.equal(chooseWing(chosen.state, 'drillYard', today).ok, false)
})

test('Ch 9 / Ch 17: each Milestone card lists only what that Milestone opens', () => {
  const all = Array.from({ length: 10 }, (_, i) => milestoneCard(i + 1, { mark: 212, unit: 'lb', date: '2026-11-01' }))
  for (const card of all) {
    assert.deepEqual(card.unlocks, milestoneUnlocks(card.index).map(unlockLabel))
    assert.ok(card.unlocks.length > 0)
    const others = all.filter((c) => c.index !== card.index).flatMap((c) => c.unlocks)
    for (const line of card.unlocks) assert.ok(!others.includes(line), `${line} belongs to Milestone ${card.index} alone`)
  }
  assert.deepEqual(all[0].unlocks, ['The Armory: every company can carry one item', 'Rank I items for sale'])
  assert.equal(all[0].bodyId, 'milestones.m1')
})

test('Appendix C: Elites open at Milestone 3 for 300; rank II waits for Milestone 7', () => {
  const closed = armoryView(withMilestones(realm(), 1, 2))
  assert.equal(closed.elites.open, false)
  assert.equal(closed.elites.cards, undefined)
  const open = armoryView(withPurse(withMilestones(realm(), 1, 2, 3), 400))
  const oath = open.elites.cards!.find((e) => e.id === 'oathsworn')!
  assert.deepEqual([oath.recruit?.ok, oath.recruit?.cost, oath.power], [true, 300, [16, 26]])
  assert.match(oath.ability, /Charges/)
  assert.equal(open.sworn.open, false)
})
