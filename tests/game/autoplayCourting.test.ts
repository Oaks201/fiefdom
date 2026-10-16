/**
 * The automatic player courts first and assaults the rest (C-31): a village it is courting is never
 * its assault target, and a standing siege on one is moved or lifted, so the Marshal never presses
 * it and the bid is never voided by the player's own siege. Found in the re-founding's first weeks
 * under "both" (2026-10-15).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { autoplay, type AutoplayPlan } from '../../src/renderer/src/lib/game/autoplay'
import { addDays } from '../../src/renderer/src/lib/game/clock'
import { ordersFor } from '../../src/renderer/src/lib/game/combat'
import { placeBid } from '../../src/renderer/src/lib/game/land'
import { claimableBy, hexIndex, touches } from '../../src/renderer/src/lib/game/map'
import { standingSiegeOf, withStandingSiege } from '../../src/renderer/src/lib/game/sieges'
import { RIVAL_IDS } from '../../src/renderer/src/lib/game/types'
import { realm, withPurse } from './support/realm'
import { START } from './support/war'

/** Not a week's first day, so only the day's orders run. */
const DAY = addDays(START, 1)

test('C-31: under "both", a village the player courts is never the assault target; a standing siege on it moves to the day’s pick', () => {
  const s0 = withPurse(realm(), 2000)
  const byId = hexIndex(s0.hexes)
  const village = s0.hexes.find((h) => h.village && h.owner === 'neutral' && touches(byId, h.id, 'player') && claimableBy(s0.hexes, h.id, 'player', 'court') && claimableBy(s0.hexes, h.id, 'player', 'assault'))
  assert.ok(village, 'a village beside the founding land')
  const courted = placeBid(s0, village.id, 40, DAY)
  assert.ok(courted.ok)
  const besieged = withStandingSiege(courted.state, village.id, START)
  for (const land of ['both', 'deals'] as const) {
    const plan: AutoplayPlan = { paths: [...RIVAL_IDS], spend: 'build', land, offers: 'accept', contracts: 'none' }
    const after = autoplay(besieged, DAY, plan, { rough: false, nextId: () => 'c-1' })
    const target = ordersFor(after, DAY)?.assaultTarget
    assert.notEqual(target, village.id, `${land}: it doesn't assault the village it courts`)
    assert.notEqual(standingSiegeOf(after)?.hexId, village.id, `${land}: the siege on it doesn't stand`)
    assert.ok(after.courtships.some((c) => c.hexId === village.id), `${land}: the courtship stands`)
  }
})
