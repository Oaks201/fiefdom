/**
 * T17's performance checks, on campaigns the simulator's player has really played:
 *
 *   npx tsx scripts/campaign-perf.ts [--seed 1] [--profile steadfast]
 *
 * - Catch-up: a campaign played for 20 weeks, then left for 365 days, settled in one call (as the
 *   app does at its next launch). The target is under 2 s.
 * - Size: campaign.json (the app saves `JSON.stringify(state)`) after 70 weeks of play, kept going
 *   past a victory into the Reign. The target is under 5 MB.
 *
 * Both are timed three times and the best is reported, so a busy machine doesn't decide the number.
 */
import { foundCampaign } from '../src/renderer/src/lib/game/campaign'
import { addDays, dayCloseInstant } from '../src/renderer/src/lib/game/clock'
import { settle } from '../src/renderer/src/lib/game/settle'
import type { CampaignState, ISODate } from '../src/renderer/src/lib/game/types'
import type { Ledger } from '../src/renderer/src/lib/types'
import { FOUNDED_AT, START, TZ, isRoughDay, ledgerFor } from '../sim/ledgerGen'
import { act, type PolicyId } from '../sim/policy'
import { JOURNEY, profileOf, type ProfileId } from '../sim/profiles'

const PLAYED_WEEKS = 20
const AWAY_DAYS = 365
const SIZE_WEEKS = 70
const TRIES = 3
const MB = 1_048_576

function option(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`)
  return at >= 0 ? process.argv[at + 1] : fallback
}

const seed = Number(option('seed', '1'))
const profile = profileOf(option('profile', 'steadfast') as ProfileId)
const policy = option('policy', 'greedy') as PolicyId
const after = (day: ISODate): Date => new Date(dayCloseInstant(day, TZ).getTime() + 60_000)

/** The campaign after `weeks` weeks of the policy's play, day by day. */
function play(ledger: Ledger, weeks: number): CampaignState {
  const charter = { stepPool: JOURNEY.stepPool, calorieLimit: JOURNEY.calorieLimit, duties: [...JOURNEY.duties] }
  let state = settle(foundCampaign({ startWeight: JOURNEY.startLb, goalWeight: JOURNEY.goalLb, charter, timeZone: TZ, seed, ledger }, FOUNDED_AT), ledger, after(addDays(START, -1)), { launch: true }).state
  let n = 0
  for (let i = 0; i < weeks * 7; i++) {
    const today = addDays(START, i)
    state = act(state, today, { policy, rough: isRoughDay(profile, seed, today), nextId: () => `perf-${(n += 1)}` })
    state = settle(state, ledger, after(today)).state
    if (state.campaign.status === 'fallen') break
  }
  return state
}

const ledger = ledgerFor(profile, seed, Math.max(PLAYED_WEEKS * 7 + AWAY_DAYS, SIZE_WEEKS * 7))

const played = play(ledger, PLAYED_WEEKS)
const back = after(addDays(played.settledThrough.day, AWAY_DAYS))
let best = Number.POSITIVE_INFINITY
let caught: ReturnType<typeof settle> | null = null
for (let t = 0; t < TRIES; t++) {
  const started = performance.now()
  caught = settle(played, ledger, back, { launch: true })
  best = Math.min(best, performance.now() - started)
}
console.log(
  `Catch-up: ${profile.name} (${policy}, seed ${seed}) played ${PLAYED_WEEKS} weeks (${played.hexes.filter((h) => h.owner === 'player').length} hexes, ${played.log.length} log events), then ${AWAY_DAYS} days away: ${caught?.summary.days.length} days settled in ${Math.round(best)} ms (best of ${TRIES}; target under 2,000 ms); status ${caught?.state.campaign.status}`
)

const long = play(ledger, SIZE_WEEKS)
const bytes = Buffer.byteLength(JSON.stringify(long))
console.log(
  `Size: after ${SIZE_WEEKS} weeks of play (status ${long.campaign.status}, ${long.log.length} log events, ${long.purse.events.length} purse events, ${long.settlement.snapshots.length} day snapshots), campaign.json is ${(bytes / MB).toFixed(2)} MB (target under 5 MB)`
)
