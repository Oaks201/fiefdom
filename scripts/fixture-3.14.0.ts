/**
 * Before Patch 10: writes the synthetic 3.14.0 save that proves a campaign played through Patches 6 to 9 carries
 * forward in place. The newest fixture before it was 3.4.0, written before Patches 7 to 9 added their records,
 * so no test loaded a save shaped like the live game's today. Run once, on rules 3.14.0, before any later rule
 * changes:
 *
 *   npx tsx scripts/fixture-3.14.0.ts
 *
 * It founds a Steadfast campaign on the simulator's synthetic ledger and plays it with the smarter automatic
 * player (every path, balanced spending, deals, offers taken), as the 3.4.0 fixture does, for `PLAYED_WEEKS`; then
 * writes the state and how to rebuild its ledger to `tests/game/fixtures/campaign-3.14.0.json`. The seed and the
 * length were chosen (with `--probe`) so the save stops with Patches 7 to 9's records under way: reach, the rivals'
 * own sieges of the wilds, binding deals, a ruler's request, Remedy's terms and request, and a plateau siege still
 * standing, so the weeks the carry-forward test plays after it break or extend it. The ledger is the simulator's,
 * rebuilt from its seed and length, so the file holds no health data of anyone's.
 *
 *   npx tsx scripts/fixture-3.14.0.ts --probe   lists, for seeds 1 to 12, the weeks whose close leaves them all
 */
import fs from 'node:fs'
import path from 'node:path'
import { autoplay, type AutoplayPlan } from '../src/renderer/src/lib/game/autoplay'
import { foundCampaign } from '../src/renderer/src/lib/game/campaign'
import { addDays, dayCloseInstant } from '../src/renderer/src/lib/game/clock'
import { RULES } from '../src/renderer/src/lib/game/rules'
import { settle } from '../src/renderer/src/lib/game/settle'
import type { CampaignState, ISODate } from '../src/renderer/src/lib/game/types'
import { FOUNDED_AT, START, TZ, isRoughDay, ledgerFor } from '../sim/ledgerGen'
import { JOURNEY, profileOf } from '../sim/profiles'

const SEED = 7
const PROFILE = 'steadfast'
/** Seed 7 at week 24 is the probe's first save with every record of `underWay` in it. */
const PLAYED_WEEKS = 24
/** The ledger covers the weeks played and the weeks the carry-forward test plays after them. */
const LEDGER_WEEKS = 46
const PLAN: AutoplayPlan = { paths: null, spend: 'balanced', land: 'deals', offers: 'accept', contracts: 'longest', smarter: true }

if (RULES.ruleVersion !== '3.14.0') throw new Error(`The fixture is a 3.14.0 save; these rules are ${RULES.ruleVersion}`)

const after = (day: ISODate): Date => new Date(dayCloseInstant(day, TZ).getTime() + 60_000)
const profile = profileOf(PROFILE)

/** Plays `seed` for `weeks` weeks, calling `onWeek` after each week's last day. */
function play(seed: number, weeks: number, onWeek?: (week: number, state: CampaignState) => void): CampaignState {
  const ledger = ledgerFor(profile, seed, LEDGER_WEEKS * 7)
  const charter = { stepPool: JOURNEY.stepPool, calorieLimit: JOURNEY.calorieLimit, duties: [...JOURNEY.duties] }
  let state = settle(foundCampaign({ startWeight: JOURNEY.startLb, goalWeight: JOURNEY.goalLb, charter, timeZone: TZ, seed, ledger }, FOUNDED_AT), ledger, after(addDays(START, -1)), { launch: true }).state
  let n = 0
  for (let i = 0; i < weeks * 7; i++) {
    const today = addDays(START, i)
    state = autoplay(state, today, PLAN, { rough: isRoughDay(profile, seed, today), nextId: () => `fx-${(n += 1)}` })
    state = settle(state, ledger, after(today), { launch: true }).state
    if ((i + 1) % 7 === 0) onWeek?.((i + 1) / 7, state)
  }
  return state
}

/** What of Patches 7 to 9 the save holds as it stands, each a reason the carry-forward test reads it. */
export function underWay(state: CampaignState): Record<string, boolean> {
  const day = state.settledThrough.day
  const open = (until?: ISODate): boolean => until !== undefined && until > day
  return {
    reach: state.reach !== undefined,
    rivalSiege: Object.values(state.rivals).some((r) => r.ai?.siege !== undefined),
    bindingDeal: state.deals.some((d) => d.binds === true && open(d.until)),
    rulerRequest: (state.world?.requests ?? []).some((r) => open(r.until)),
    healerTerms: state.weight.counsel !== undefined && state.log.some((e) => e.kind === 'charter' && e.by === 'healer'),
    healerRequest: state.weight.request !== undefined && open(state.weight.request.until),
    plateauSiege: state.weight.siege !== undefined,
    standingSiege: state.standingSiege !== undefined,
    active: state.campaign.status === 'active'
  }
}

if (process.argv.includes('--probe')) {
  for (let seed = 1; seed <= 12; seed++) {
    const hits: string[] = []
    play(seed, 34, (week, state) => {
      if (week < 24) return
      const missing = Object.entries(underWay(state)).filter(([, v]) => !v).map(([k]) => k)
      if (missing.length <= 1) hits.push(missing.length === 0 ? `${week} all` : `${week} -${missing[0]}`)
    })
    console.log(`seed ${seed}: ${hits.join(' | ') || 'none'}`)
  }
} else {
  const state = play(SEED, PLAYED_WEEKS)
  const u = underWay(state)
  const missing = Object.entries(u).filter(([, v]) => !v).map(([k]) => k)
  if (missing.length > 0) throw new Error(`The save leaves out ${missing.join(', ')}; probe for another seed or length`)
  const file = path.resolve(__dirname, '..', 'tests', 'game', 'fixtures', 'campaign-3.14.0.json')
  const out = { ruleVersion: RULES.ruleVersion, seed: SEED, profile: PROFILE, ledgerWeeks: LEDGER_WEEKS, playedWeeks: PLAYED_WEEKS, plan: PLAN, state }
  fs.writeFileSync(file, JSON.stringify(out))
  console.log(`${file}: ${(fs.statSync(file).size / 1e6).toFixed(2)} MB, settled through ${state.settledThrough.day} (week ${state.settledThrough.week}), ${state.hexes.filter((h) => h.owner === 'player').length} hexes`)
}
