/**
 * Patch 3 stage 1 (docs/redesign/patch-3-spec.md section 2, C-27): the measures the siege patch is
 * judged on. The siege horizon (`siegeReach`), the Breach label, the recorder's assault counts, and
 * the targets report's G-01, G-03 and G-09 rows.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { expectedValor, hexesInReach, siegeReach } from '../../src/renderer/src/lib/game/autoplay'
import { addDays } from '../../src/renderer/src/lib/game/clock'
import { assaultGarrison, ordersEstimate } from '../../src/renderer/src/lib/game/combat'
import { realmEffects } from '../../src/renderer/src/lib/game/effects'
import { roster } from '../../src/renderer/src/lib/game/roster'
import { RULES } from '../../src/renderer/src/lib/game/rules'
import type { CampaignState, GameEvent, HexState } from '../../src/renderer/src/lib/game/types'
import { runCampaign } from '../../sim/campaign'
import { LABEL, SIEGE_DAYS_CAP, isBreach } from '../../sim/measure'
import { BASE } from '../../sim/overrides'
import { deedLines, targetRows } from '../../sim/targets'
import { realm } from './support/realm'
import { START, withHex } from './support/war'

const ids = (list: readonly { hex: HexState }[]): string[] => list.map((r) => r.hex.id).sort()

/** A neutral beast hex beside the founding land, and the whole army's Assault on it at dawn. */
function beastTarget(state: CampaignState): { hex: HexState; value: number } {
  const hex = siegeReach(state, START, Number.MAX_SAFE_INTEGER).map((r) => r.hex).find((h) => h.owner === 'neutral' && !h.village && !h.mythic) as HexState
  const effects = realmEffects(state)
  const everyone = roster(state, { day: START }, effects).map((c) => c.id)
  const value = ordersEstimate(state, { date: START, assaultTarget: hex.id, assault: everyone, defense: [] }, START, expectedValor(state), effects).assaults[0]?.value ?? 0
  return { hex, value }
}

test('C-27: siegeReach with a one-day horizon is exactly the hexes that fall today', () => {
  const state = realm()
  assert.deepEqual(ids(siegeReach(state, START, 1)), ids(hexesInReach(state, START, false)))
  assert.ok(siegeReach(state, START, 1).every((r) => r.today))
})

test('C-27: a hex is a siege target when the Assault brings it down within the horizon, each repulse wearing 25% of it', () => {
  const s0 = realm()
  const { hex, value } = beastTarget(s0)
  assert.ok(value > 0)
  // 1.4 × the Assault: three assault days (1 + 2 × 0.25 = 1.5) bring it down, two (1.25) don't.
  const state = withHex(s0, hex.id, { garrison: 1.4 * value, garrisonDamage: 0, fortification: 0 })
  assert.ok(!ids(siegeReach(state, START, 2)).includes(hex.id))
  const within = siegeReach(state, START, RULES.autoplay.siegeHorizon).find((r) => r.hex.id === hex.id)
  assert.ok(within)
  assert.equal(within.today, false)
  // Wear already on it counts: worn below the Assault, it falls today.
  const worn = withHex(state, hex.id, { garrisonDamage: 0.5 * value })
  assert.equal(siegeReach(worn, START, 1).find((r) => r.hex.id === hex.id)?.today, true)
})

test('C-27: a Breach is a repulse that left its target within the Assault that wore it, as the next dawn finds it', () => {
  const state = realm()
  const { hex } = beastTarget(state)
  const next = addDays(START, 1)
  const garrison = assaultGarrison(state, hex, next)
  const repulse = (value: number | undefined): GameEvent => ({ id: 'e1', day: START, kind: 'assault', hexId: hex.id, owner: hex.owner, outcome: 'repulsed', wear: 1, ...(value === undefined ? {} : { value }) })
  assert.equal(isBreach(state, repulse(garrison), next), true)
  assert.equal(isBreach(state, repulse(garrison - 0.1), next), false)
  assert.equal(isBreach(state, repulse(undefined), next), false, 'an event from before Patch 3 carries no Assault')
  assert.equal(isBreach(state, { ...repulse(garrison), outcome: 'taken' } as GameEvent, next), false)
  assert.equal(isBreach(withHex(state, hex.id, { owner: 'orc' }), repulse(garrison), next), false, 'a hex that changed hands is no breach')
})

test('C-27: the recorder counts every assault win once, and its day labels agree with each other', () => {
  const run = runCampaign({ seed: 3, profile: 'steadfast', policy: 'greedy', weeks: 8, variant: BASE })
  const m = run.measures
  const wins = m.assaultWins.rout + m.assaultWins.nonRout
  assert.ok(wins > 0)
  assert.equal(m.siegeDays.length, SIEGE_DAYS_CAP + 1)
  assert.equal(m.siegeDays[0], 0)
  assert.equal(m.siegeDays.reduce((s, v) => s + v, 0), wins, 'each hex taken by assault is counted once, by its assault days')
  for (const d of m.days) {
    if (d & LABEL.breach) assert.ok(d & LABEL.doubt, 'a breach comes from a repulse, which is in doubt')
    if (d & LABEL.noTarget) assert.ok(d & LABEL.noReach, 'no target within the horizon means none today either')
    if (d & LABEL.choice) assert.ok(!(d & LABEL.noReach))
  }
})

test('C-27: the targets report gives G-01 and G-03 with their strict readings beside them, and G-09 from the fallbacks (D-24)', () => {
  const results = [1, 2].map((seed) => runCampaign({ seed, profile: 'steadfast', policy: 'greedy', weeks: 6, variant: BASE }))
  const rows = targetRows(results)
  const row = (id: string): (typeof rows)[number] => rows.find((r) => r.id === id) as (typeof rows)[number]
  assert.match(row('G-01').value, /\(strict \d+\.\d; \d+%; incl\. auto battles \d+\.\d\)$/)
  const [counted, strictMean] = [/^(\d+\.\d)/, /strict (\d+\.\d)/].map((re) => Number(re.exec(row('G-01').value)?.[1]))
  assert.ok(counted >= strictMean, 'counting a Breach never lowers G-01')
  assert.match(row('G-03').value, /^\d+\.\d \(strict \d+\.\d\)$/)
  assert.equal(typeof row('G-09').pass, 'boolean')
  assert.match(row('G-09').value, /^\d+%; \d+%$/)
  const m = results[0].measures
  assert.ok(m.fallbacks.posted <= m.assaultWins.nonRout, 'a fallback follows a non-rout win')
  assert.ok(m.fallbacks.changed <= m.fallbacks.dawns)
})

test('T-04: with no victory, G-05 reads the least-held rival march at week 60, the end’s value beside it', () => {
  const run = runCampaign({ seed: 1, profile: 'steadfast', policy: 'greedy', weeks: 6, variant: BASE })
  assert.equal(run.measures.week60Unheld, undefined, 'a 6-week run never reaches week 60')
  const g05 = (r: typeof run): string => targetRows([r]).find((x) => x.id === 'G-05')?.value as string
  const shares = (v: number): Record<string, number> => ({ heartland: 0, orc: v, goblin: 0.5, dwarf: 0.5, archmage: 0.5, thornwild: 0 })
  const at60 = { ...run, measures: { ...run.measures, unheld: shares(0.02), week60Unheld: shares(0.13) } }
  assert.match(g05(at60), /^13% \(at the end 2%\); week /)
  assert.match(g05({ ...at60, wonWeek: 58 }), /^2% \(at the end 2%\); week /, 'at victory, the victory’s own reading')
  assert.match(g05({ ...run, measures: { ...run.measures, unheld: shares(0.2) } }), /^20% \(at the end 20%\); week /, 'short of week 60, the end')
})

test('D-25: the recorder’s Renown mix adds up to the Renown on every path, and the report gives each deed’s share', () => {
  const run = runCampaign({ seed: 2, profile: 'steadfast', policy: 'greedy', weeks: 8, variant: BASE })
  const mix = run.measures.deedMix ?? {}
  const total = Object.values(mix).reduce((s, v) => s + v, 0)
  assert.ok(total > 0)
  assert.ok(Math.abs(total - (run.measures.deeds ?? []).reduce((s, v) => s + v, 0)) < 1e-6)
  const lines = deedLines([run])
  assert.equal(lines[0], '## Renown by deed')
  for (const kind of ['strongholdTaken', 'counterattackHeld']) assert.ok(lines.some((l) => l.startsWith(`| ${kind} |`)))
})
