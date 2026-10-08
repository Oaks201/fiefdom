/**
 * The simulator (T13): hundreds of seeded whole campaigns through the real game modules, in worker
 * threads, then the tuning report. Per D-02 it only reports; nothing in `rules.ts` changes.
 *
 *   npm run sim                      the full run: base, income check and sweeps, then the report
 *   npm run sim -- --quick           a few campaigns of each kind, for a fast look (writes to the scratch folder)
 *   npm run sim -- --report-only     rebuild the report and CSVs from the last run's saved results
 *
 * Options: --runs 300 (per profile, for greedy and smarter), --push-runs 50, --income-runs 50, --sweep-runs 30,
 * --weeks 70, --workers <n> (default: every core), --out docs/game/sim, --results sim/.results.
 *
 * The same options always give byte-identical CSVs: every campaign is seeded, results are sorted
 * before anything is written, and the run's timing goes only into the report's prose.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Worker } from 'node:worker_threads'
import type { RunOptions, RunResult } from './campaign'
import { BASE, DELTAS, INCOME, LEVERS, variantOf } from './overrides'
import type { PolicyId } from './policy'
import { PROFILES, type ProfileId } from './profiles'
import { writeReport, type RunMeta, type VariantInfo } from './report'
import type { WorkerJob, WorkerMessage } from './worker'

interface Options {
  runs: number
  pushRuns: number
  incomeRuns: number
  sweepRuns: number
  weeks: number
  workers: number
  out: string
  results: string
  reportOnly: boolean
}

const ROOT = path.resolve(__dirname, '..')
/** The income check covers the first 48 weeks (Ch 15). */
const INCOME_WEEKS = 48
const INCOME_PROFILES: ProfileId[] = ['steadfast', 'steadfastPlateau', 'committed', 'wavering']
const SWEEP_PROFILES: ProfileId[] = ['steadfast', 'committed']
/** Campaigns per worker thread; each thread loads the game once. */
const CHUNK = 20
const QUICK = { runs: 6, pushRuns: 3, incomeRuns: 3, sweepRuns: 3 }

function parseArgs(argv: string[]): Options {
  const o: Options = {
    runs: 300,
    pushRuns: 50,
    incomeRuns: 50,
    sweepRuns: 30,
    weeks: 70,
    workers: os.availableParallelism(),
    out: path.join(ROOT, 'docs', 'game', 'sim'),
    results: path.join(ROOT, 'sim', '.results'),
    reportOnly: false
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = (): string => argv[++i]
    if (a === '--quick') {
      Object.assign(o, QUICK)
      o.out = path.join(os.tmpdir(), 'fiefdom-sim-quick')
      o.results = path.join(o.out, '.results')
    } else if (a === '--report-only') o.reportOnly = true
    else if (a === '--runs') o.runs = Number(next())
    else if (a === '--push-runs') o.pushRuns = Number(next())
    else if (a === '--income-runs') o.incomeRuns = Number(next())
    else if (a === '--sweep-runs') o.sweepRuns = Number(next())
    else if (a === '--weeks') o.weeks = Number(next())
    else if (a === '--workers') o.workers = Number(next())
    else if (a === '--out') o.out = path.resolve(next())
    else if (a === '--results') o.results = path.resolve(next())
    else throw new Error(`Unknown option ${a}`)
  }
  return o
}

function seeds(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i + 1)
}

/** Every campaign the run needs, grouped by rules variant. */
export function plan(o: Pick<Options, 'runs' | 'pushRuns' | 'incomeRuns' | 'sweepRuns' | 'weeks'>): Map<string, RunOptions[]> {
  const byVariant = new Map<string, RunOptions[]>()
  const add = (variant: string, profile: ProfileId, policy: PolicyId, n: number, weeks: number): void => {
    const list = byVariant.get(variant) ?? []
    for (const seed of seeds(n)) list.push({ seed, profile, policy, weeks, variant })
    byVariant.set(variant, list)
  }
  for (const p of PROFILES) {
    add(BASE, p.id, 'greedy', o.runs, o.weeks)
    add(BASE, p.id, 'smarter', o.runs, o.weeks)
    add(BASE, p.id, 'push', o.pushRuns, o.weeks)
  }
  for (const p of INCOME_PROFILES) add(INCOME, p, 'greedy', o.incomeRuns, Math.min(o.weeks, INCOME_WEEKS))
  for (const lever of LEVERS) for (const d of DELTAS) for (const p of SWEEP_PROFILES) add(variantOf(lever.id, d), p, 'greedy', o.sweepRuns, o.weeks)
  return byVariant
}

/** Runs every campaign across `workers` threads; resolves with the results and each variant's lever values. */
async function runAll(byVariant: Map<string, RunOptions[]>, workers: number): Promise<{ results: RunResult[]; levers: Record<string, number[]> }> {
  const chunks: WorkerJob[] = []
  for (const [variant, runs] of byVariant) for (let i = 0; i < runs.length; i += CHUNK) chunks.push({ variant, runs: runs.slice(i, i + CHUNK) })
  // Longest campaigns first, so the pool drains evenly.
  chunks.sort((a, b) => b.runs[0].weeks - a.runs[0].weeks)
  const total = chunks.reduce((s, c) => s + c.runs.length, 0)
  const results: RunResult[] = []
  const levers: Record<string, number[]> = {}
  const started = Date.now()
  let next = 0
  const work = (): Promise<void> =>
    new Promise((resolve, reject) => {
      if (next >= chunks.length) return resolve()
      const chunk = chunks[next++]
      const worker = new Worker(path.join(__dirname, 'worker.cjs'), { workerData: chunk })
      worker.on('message', (m: WorkerMessage) => {
        if (m.type === 'done') return void (levers[chunk.variant] = m.lever)
        results.push(m.result)
        if (results.length % 50 === 0 || results.length === total) {
          const s = (Date.now() - started) / 1000
          process.stderr.write(`  ${results.length} / ${total} campaigns, ${Math.round(s)} s (about ${Math.round((s / results.length) * (total - results.length))} s left)\n`)
        }
      })
      worker.once('error', reject)
      worker.once('exit', (code) => (code === 0 ? work().then(resolve, reject) : reject(new Error(`A simulator worker (${chunk.variant}) exited with code ${code}`))))
    })
  await Promise.all(Array.from({ length: Math.max(1, workers) }, () => work()))
  return { results, levers }
}

function variantInfo(levers: Record<string, number[]>): VariantInfo[] {
  return LEVERS.flatMap((l) => DELTAS.map((d) => ({ variant: variantOf(l.id, d), lever: l.id, label: l.label, source: l.source, delta: d, values: levers[variantOf(l.id, d)] ?? [] })))
}

async function main(): Promise<void> {
  const o = parseArgs(process.argv.slice(2))
  fs.mkdirSync(o.results, { recursive: true })
  const resultsFile = path.join(o.results, 'results.json')
  const metaFile = path.join(o.results, 'meta.json')
  let results: RunResult[]
  let meta: RunMeta
  if (o.reportOnly) {
    results = JSON.parse(fs.readFileSync(resultsFile, 'utf8')) as RunResult[]
    meta = JSON.parse(fs.readFileSync(metaFile, 'utf8')) as RunMeta
  } else {
    const byVariant = plan(o)
    const count = [...byVariant.values()].reduce((s, r) => s + r.length, 0)
    process.stderr.write(`Fiefdom simulator: ${count} campaigns in ${byVariant.size} rules variants on ${o.workers} workers\n`)
    const started = Date.now()
    const done = await runAll(byVariant, o.workers)
    results = done.results
    meta = {
      options: { runs: o.runs, pushRuns: o.pushRuns, incomeRuns: o.incomeRuns, sweepRuns: o.sweepRuns, weeks: o.weeks, incomeWeeks: INCOME_WEEKS },
      seconds: Math.round((Date.now() - started) / 1000),
      workers: o.workers,
      machine: { cpus: os.cpus().length, model: os.cpus()[0]?.model ?? 'unknown', node: process.version, platform: `${os.platform()} ${os.arch()}` },
      variants: variantInfo(done.levers)
    }
    fs.writeFileSync(resultsFile, JSON.stringify(results))
    fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2))
  }
  const written = writeReport(results, meta, o.out)
  process.stderr.write(`Wrote ${written.map((f) => path.relative(ROOT, f)).join(', ')}\n`)
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
