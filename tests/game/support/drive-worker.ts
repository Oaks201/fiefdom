/** A worker thread for the invariants test: drives each campaign it is given and posts back its audit. */
import { parentPort, workerData } from 'node:worker_threads'
import { auditRun, driveCampaign, type DriveOptions } from './campaign-driver'

const jobs = workerData as DriveOptions[]
parentPort?.postMessage(jobs.map((o) => auditRun(o, driveCampaign(o))))
