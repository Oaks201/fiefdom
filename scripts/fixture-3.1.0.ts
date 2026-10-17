/**
 * Patch 4 (spec section 2 item 6, C-48): writes the synthetic 3.1.0 save that proves a running
 * campaign carries forward to 3.2.0 in place. Run once, on rules 3.1.0, before Patch 4 changed any rule:
 *
 *   npx tsx scripts/fixture-3.1.0.ts
 *
 * It founds a Steadfast campaign on the simulator's synthetic ledger, plays it with the automatic
 * player (every path, balanced spending, deals, offers taken) for `PLAYED_WEEKS`, and writes the state
 * and how to rebuild its ledger to `tests/game/fixtures/campaign-3.1.0.json`. The ledger is the
 * simulator's, rebuilt from its seed and length, so the file holds no health data of anyone's.
 */
import fs from 'node:fs'
import path from 'node:path'
import { autoplay, type AutoplayPlan } from '../src/renderer/src/lib/game/autoplay'
import { foundCampaign } from '../src/renderer/src/lib/game/campaign'
import { addDays, dayCloseInstant } from '../src/renderer/src/lib/game/clock'
import { RULES } from '../src/renderer/src/lib/game/rules'
import { settle } from '../src/renderer/src/lib/game/settle'
import type { ISODate } from '../src/renderer/src/lib/game/types'
import { FOUNDED_AT, START, TZ, isRoughDay, ledgerFor } from '../sim/ledgerGen'
import { JOURNEY, profileOf } from '../sim/profiles'

const SEED = 7
const PROFILE = 'steadfast'
const PLAYED_WEEKS = 24
/** The ledger covers the weeks played and the weeks the carry-forward test plays after them. */
const LEDGER_WEEKS = 40
const PLAN: AutoplayPlan = { paths: null, spend: 'balanced', land: 'deals', offers: 'accept', contracts: 'longest' }

if (RULES.ruleVersion !== '3.1.0') throw new Error(`The fixture is a 3.1.0 save; these rules are ${RULES.ruleVersion}`)

const after = (day: ISODate): Date => new Date(dayCloseInstant(day, TZ).getTime() + 60_000)
const profile = profileOf(PROFILE)
const ledger = ledgerFor(profile, SEED, LEDGER_WEEKS * 7)
const charter = { stepPool: JOURNEY.stepPool, calorieLimit: JOURNEY.calorieLimit, duties: [...JOURNEY.duties] }
let state = settle(foundCampaign({ startWeight: JOURNEY.startLb, goalWeight: JOURNEY.goalLb, charter, timeZone: TZ, seed: SEED, ledger }, FOUNDED_AT), ledger, after(addDays(START, -1)), { launch: true }).state
let n = 0
for (let i = 0; i < PLAYED_WEEKS * 7; i++) {
  const today = addDays(START, i)
  state = autoplay(state, today, PLAN, { rough: isRoughDay(profile, SEED, today), nextId: () => `fx-${(n += 1)}` })
  state = settle(state, ledger, after(today), { launch: true }).state
}

const file = path.resolve(__dirname, '..', 'tests', 'game', 'fixtures', 'campaign-3.1.0.json')
const out = { ruleVersion: RULES.ruleVersion, seed: SEED, profile: PROFILE, ledgerWeeks: LEDGER_WEEKS, playedWeeks: PLAYED_WEEKS, plan: PLAN, state }
fs.writeFileSync(file, JSON.stringify(out))
console.log(`${file}: ${(fs.statSync(file).size / 1e6).toFixed(2)} MB, settled through ${state.settledThrough.day} (week ${state.settledThrough.week}), ${state.hexes.filter((h) => h.owner === 'player').length} hexes`)
