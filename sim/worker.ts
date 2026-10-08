/**
 * A simulator worker thread (T13): one rules variant, a list of campaigns. It installs the variant's
 * override before anything loads `rules.ts`, checks that the loaded `RULES` carries it, then runs
 * each campaign and posts its result back as it finishes.
 */
import { parentPort, workerData } from 'node:worker_threads'
import type { RunOptions, RunResult } from './campaign'
import { checkOverride, installOverride } from './overrides'

export interface WorkerJob {
  variant: string
  runs: RunOptions[]
}

export type WorkerMessage = { type: 'result'; result: RunResult } | { type: 'done'; lever: number[] }

const job = workerData as WorkerJob
installOverride(job.variant)
// Required only now, so rules.ts is compiled through the override hook.
const { RULES } = require('../src/renderer/src/lib/game/rules') as typeof import('../src/renderer/src/lib/game/rules')
const lever = checkOverride(job.variant, RULES)
const { runCampaign } = require('./campaign') as typeof import('./campaign')

for (const run of job.runs) parentPort?.postMessage({ type: 'result', result: runCampaign(run) } satisfies WorkerMessage)
parentPort?.postMessage({ type: 'done', lever } satisfies WorkerMessage)
