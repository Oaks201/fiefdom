/**
 * Test 10 (Ch 14, Ch 15 "Invariants", Ch 13) over 300 seeded 70-week campaigns, each settled day by
 * day through `settle` by the headless driver (support/campaign-driver.ts), in worker threads.
 * Steady and poor habits meet passive, greedy and diplomatic players, so the runs see conquests,
 * Accords, coalitions, Ultimatums, Sieges, victories and Falls.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { Worker } from 'node:worker_threads'
import type { DriveOptions, Habits, Policy, RunAudit } from './support/campaign-driver'

const WEEKS = 70
const MIX: { habits: Habits; policy: Policy; runs: number }[] = [
  { habits: 'steady', policy: 'greedy', runs: 75 },
  { habits: 'steady', policy: 'diplomat', runs: 75 },
  { habits: 'steady', policy: 'passive', runs: 30 },
  { habits: 'poor', policy: 'greedy', runs: 75 },
  { habits: 'poor', policy: 'passive', runs: 45 }
]

function jobs(): DriveOptions[] {
  let seed = 0
  return MIX.flatMap((m) => Array.from({ length: m.runs }, () => ({ seed: (seed += 1), weeks: WEEKS, habits: m.habits, policy: m.policy })))
}

/** Runs the campaigns across worker threads and gathers each one's audit. */
async function drive(all: DriveOptions[]): Promise<RunAudit[]> {
  const workers = Math.max(1, Math.min(12, os.availableParallelism() - 2))
  const chunks: DriveOptions[][] = Array.from({ length: workers }, () => [])
  all.forEach((job, i) => chunks[i % workers].push(job))
  const results = await Promise.all(
    chunks
      .filter((c) => c.length > 0)
      .map(
        (chunk) =>
          new Promise<RunAudit[]>((resolve, reject) => {
            const worker = new Worker(path.join(__dirname, 'support', 'drive-worker.cjs'), { workerData: chunk })
            worker.once('message', (audits: RunAudit[]) => resolve(audits))
            worker.once('error', reject)
            worker.once('exit', (code) => (code === 0 ? undefined : reject(new Error(`A driver worker exited with code ${code}`))))
          })
      )
  )
  return results.flat().sort((a, b) => a.seed - b.seed)
}

test('Test 10: 300 seeded 70-week campaigns keep every endgame invariant', { timeout: 600_000 }, async (t) => {
  const audits = await drive(jobs())
  assert.equal(audits.length, 300)

  const broken = audits.filter((a) => a.violations.length > 0)
  assert.deepEqual(
    broken.map((a) => ({ seed: a.seed, habits: a.habits, policy: a.policy, violations: a.violations })),
    [],
    'no Fall or Ultimatum before week 36 (44 at Grace III), no ring 0 to 2 hex lost, no Border Campaign on a Gate, capital or player hex, never three rivals allied, no coalition before week 12, Ch 14 pacing'
  )

  // The runs reached the states the invariants are about, so the test is not vacuous.
  const fallen = audits.filter((a) => a.fallenWeek !== undefined)
  const won = audits.filter((a) => a.wonWeek !== undefined)
  assert.ok(fallen.length > 0, 'some campaigns fell')
  assert.ok(won.length > 0, 'some campaigns were won')
  assert.ok(audits.some((a) => a.coalitions.length > 0), 'coalitions formed')
  assert.ok(audits.some((a) => a.resolutions.some((r) => r.how === 'conquered')), 'rivals were conquered')
  assert.ok(audits.some((a) => a.resolutions.some((r) => r.how === 'allied')), 'rivals were allied')
  assert.ok(Math.min(...fallen.map((a) => a.fallenWeek as number)) >= 36)
  assert.ok(Math.min(...won.map((a) => a.wonWeek as number)) >= 36)

  const count = (pred: (a: RunAudit) => boolean): number => audits.filter(pred).length
  const events: Record<string, number> = {}
  for (const a of audits) for (const [id, n] of Object.entries(a.events)) events[id] = (events[id] ?? 0) + n
  t.diagnostic(`fallen ${fallen.length} (earliest week ${Math.min(...fallen.map((a) => a.fallenWeek as number))}); won ${won.length} (earliest week ${Math.min(...won.map((a) => a.wonWeek as number))})`)
  t.diagnostic(`campaigns with a coalition ${count((a) => a.coalitions.length > 0)}; with an Ultimatum ${count((a) => a.ultimatums.length > 0)}; with a resolution ${count((a) => a.resolutions.length > 0)}`)
  t.diagnostic(`world events fired: ${JSON.stringify(events)}`)
})
