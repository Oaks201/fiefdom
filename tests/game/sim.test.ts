/**
 * The simulator's smoke test (T13): a couple of short campaigns through the real modules, the rules
 * hook in a worker thread, and the report built from what they give. The full run is `npm run sim`.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Worker } from 'node:worker_threads'
import { RULES } from '../../src/renderer/src/lib/game/rules'
import { runCampaign, type RunOptions, type RunResult } from '../../sim/campaign'
import { BASE, LEVERS, variantOf } from '../../sim/overrides'
import { writeReport, type RunMeta } from '../../sim/report'
import type { WorkerMessage } from '../../sim/worker'

const WEEKS = 8
const RUNS: RunOptions[] = [
  { seed: 1, profile: 'steadfast', policy: 'greedy', weeks: WEEKS, variant: BASE },
  { seed: 2, profile: 'committed', policy: 'smarter', weeks: WEEKS, variant: BASE }
]

test('T13 smoke: two 8-week campaigns are deterministic, settle every week and keep the invariants', () => {
  for (const run of RUNS) {
    const first = runCampaign(run)
    const again = runCampaign(run)
    assert.deepEqual(again, first, 'the same options give the same result')
    assert.deepEqual(first.violations, [])
    assert.equal(first.status, 'active')
    assert.ok(first.lastWeek >= WEEKS, `settled through week ${first.lastWeek}`)
    assert.equal(first.income.length, first.lastWeek)
    assert.ok(first.income.reduce((s, v) => s + v, 0) > 0, 'the player earned behavior income')
    assert.ok(first.benchmark.every((v) => v > 0))
    assert.equal(first.hexes.player.length, Math.ceil(first.lastWeek / RULES.grandBattles.monthWeeks))
  }
})

test('T13: a worker is served a patched RULES for its variant, while this thread and rules.ts keep the book values', async () => {
  const lever = LEVERS.find((l) => l.id === 'hostShare')
  assert.ok(lever)
  const variant = variantOf('hostShare', 10)
  const before = fs.readFileSync(path.join(__dirname, '../../src/renderer/src/lib/game/rules.ts'), 'utf8')
  const messages: WorkerMessage[] = await new Promise((resolve, reject) => {
    const got: WorkerMessage[] = []
    const worker = new Worker(path.join(__dirname, '../../sim/worker.cjs'), { workerData: { variant, runs: [{ ...RUNS[0], weeks: 1, variant }] } })
    worker.on('message', (m: WorkerMessage) => got.push(m))
    worker.once('error', reject)
    worker.once('exit', (code) => (code === 0 ? resolve(got) : reject(new Error(`worker exited with ${code}`))))
  })
  const done = messages.find((m) => m.type === 'done')
  assert.ok(done && done.type === 'done')
  assert.deepEqual(done.lever, [0.66, 0.55, 0.77])
  assert.ok(messages.some((m) => m.type === 'result' && m.result.variant === variant))
  assert.deepEqual(lever.read(RULES), [0.6, 0.5, 0.7])
  assert.equal(fs.readFileSync(path.join(__dirname, '../../src/renderer/src/lib/game/rules.ts'), 'utf8'), before)
})

test('T13: the report and its CSVs build from a handful of runs, byte for byte the same each time', () => {
  const results: RunResult[] = RUNS.map(runCampaign)
  const meta: RunMeta = {
    options: { runs: 1, pushRuns: 0, incomeRuns: 0, sweepRuns: 0, weeks: WEEKS, incomeWeeks: WEEKS },
    seconds: 1,
    workers: 1,
    machine: { cpus: 1, model: 'test', node: process.version, platform: 'test' },
    variants: []
  }
  const dirs = [0, 1].map(() => fs.mkdtempSync(path.join(os.tmpdir(), 'fiefdom-sim-')))
  try {
    const written = dirs.map((d) => writeReport(results, meta, d))
    assert.ok(written[0].some((f) => f.endsWith('report.md')))
    const report = fs.readFileSync(path.join(dirs[0], 'report.md'), 'utf8')
    assert.match(report, /## The Ch 15 targets/)
    assert.match(report, /## The owner's decision list/)
    for (const file of written[0]) {
      const twin = path.join(dirs[1], path.relative(dirs[0], file))
      assert.equal(fs.readFileSync(file, 'utf8'), fs.readFileSync(twin, 'utf8'), path.basename(file))
    }
    assert.match(fs.readFileSync(path.join(dirs[0], 'data', 'runs.csv'), 'utf8'), /^variant,profile,policy,seed,/)
  } finally {
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true })
  }
})
