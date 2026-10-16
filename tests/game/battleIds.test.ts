/**
 * Grand Battle ids (found in Patch 3 stage 5, docs/redesign/patch-3-spec.md S-27): battles leave the
 * list (a Siege called off, a resolved rival's battles), so an id taken from the list's length could
 * name a battle still on it, and the later battle was never found or fought. Ids now run past the
 * highest on the list; a save that already shares one is repaired at the next close.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDays } from '../../src/renderer/src/lib/game/clock'
import { settleViolations } from '../../src/renderer/src/lib/game/dev/invariants'
import { battleOf, challenge, grandBattlesDue, nextBattleId, pendingBattles, uniqueBattleIds } from '../../src/renderer/src/lib/game/grand'
import { neighbors, strongholds } from '../../src/renderer/src/lib/game/map'
import type { CampaignState, GrandBattle } from '../../src/renderer/src/lib/game/types'
import { emptyLedger } from './fixtures/ledgers'
import { collector } from './support/grand'
import { realm, withPurse } from './support/realm'
import { START, hex, withOwner } from './support/war'

/** A battle already fought, as the list keeps it. */
function fought(id: string, day = START): GrandBattle {
  return { id, trigger: 'warhost', hexId: '1,-3', announcedOn: day, battleDate: day, enemy: [], rival: 'orc', result: 'rout' }
}

/** The Orc's depth-4 stronghold, with the player holding the hexes just inside it. */
function atStronghold(state: CampaignState): { state: CampaignState; fort: string } {
  const fort = [...strongholds(state.hexes)].find(([, s]) => s.march === 'orc' && s.depth === 4)?.[0] as string
  const inside = neighbors(fort).filter((n) => hex(state, n).ring === hex(state, fort).ring - 1)
  return { state: withOwner(state, inside, 'player'), fort }
}

test('S-27: the next battle id runs past the highest on the list, so a battle that left it never makes the next one share an id', () => {
  const s0 = realm()
  assert.equal(nextBattleId(s0), 'gb-1')
  // gb-1 was called off and left the list; gb-2 was fought. The list's length + 1 would be gb-2 again.
  const gap: CampaignState = { ...s0, grandBattles: [fought('gb-2')] }
  assert.equal(nextBattleId(gap), 'gb-3')
  const { state, fort } = atStronghold(withPurse(gap, 500))
  const asked = challenge(state, fort, START)
  assert.ok(asked.ok)
  assert.equal(asked.battle?.id, 'gb-3')
  assert.equal(battleOf(asked.state, 'gb-3')?.trigger, 'stronghold')
  assert.deepEqual(pendingBattles(asked.state).map((b) => b.id), ['gb-3'])
})

test('S-27: a save whose battle shares an earlier one’s id has it renamed and fought at the next close; invariant 7 names both faults', () => {
  const { state: s0, fort } = atStronghold(withPurse({ ...realm(), grandBattles: [fought('gb-1'), fought('gb-2')] }, 500))
  const asked = challenge(s0, fort, START)
  const battle = asked.battle as GrandBattle
  // As an old save left it: the stronghold battle took gb-2, the id of a battle already fought.
  const stuck: CampaignState = { ...asked.state, grandBattles: asked.state.grandBattles.map((b) => (b.id === battle.id ? { ...b, id: 'gb-2' } : b)) }
  assert.deepEqual(pendingBattles(stuck).map((b) => b.id), ['gb-2'])
  assert.equal(battleOf(stuck, 'gb-2')?.trigger, 'warhost', 'the lookup finds the old battle, so the new one could never be fought')

  const late = addDays(battle.battleDate, 3)
  const settled = { ...stuck, settledThrough: { ...stuck.settledThrough, day: late } }
  const now = new Date()
  const faults = settleViolations({ before: settled, after: settled, ledger: emptyLedger(), now })
  assert.ok(faults.includes('two Grand Battles share the id gb-2'))
  assert.ok(faults.some((f) => f.startsWith(`Grand Battle gb-2 (stronghold) was due ${battle.battleDate}`)))

  const repaired = uniqueBattleIds(stuck)
  assert.deepEqual(repaired.grandBattles.map((b) => [b.id, b.trigger]), [['gb-1', 'warhost'], ['gb-2', 'warhost'], ['gb-3', 'stronghold']])
  assert.equal(uniqueBattleIds(repaired), repaired, 'unique ids are left alone')
  const after = grandBattlesDue(stuck, late, () => [1, 1, 1, 1, 1, 1, 1], collector().emit)
  assert.notEqual(battleOf(after, 'gb-3')?.result, undefined)
  assert.deepEqual(pendingBattles(after), [])
})
