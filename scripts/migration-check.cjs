// Migration safety for the owner's real ledger (task T17 scope 4). Run it on a COPY of ledger.json;
// it never writes the file you give it, and the ledger must never be committed.
//
//   node scripts/migration-check.cjs <path to a copy of ledger.json> [--goal 168] [--app]
//
// 1. Migration: reads the ledger as the app does (normalizeLedger), and reports the version change
//    and the weigh-ins imported from legacy contracts (A-05, A-106).
// 2. The Archive: every legacy contract evaluates exactly as before (the imported weigh-ins change
//    nothing the Archive shows), and no contract field the file holds is changed by the migration.
// 3. Founding: founds a campaign from the migrated ledger (refused while a legacy contract is open,
//    A-07) and settles it up to now; the ledger in memory is unchanged by both.
// 4. With --app (after `npm run build`; under xvfb-run on Linux without a display): the built app is
//    opened twice on a scratch copy, first to migrate, then, with a campaign beside the ledger, to
//    settle at launch. ledger.json is byte-identical across the settling launch: game code never
//    writes it.
//
// Exits 1 if any check fails.
require('tsx/cjs')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { launch, sleep, stop } = require('./screens.cjs')
const { normalizeLedger, openContract, weighIns } = require('../src/renderer/src/lib/ledger.ts')
const { evaluateContract } = require('../src/renderer/src/lib/contracts.ts')
const { foundCampaign } = require('../src/renderer/src/lib/game/campaign.ts')
const { openDay } = require('../src/renderer/src/lib/game/clock.ts')
const { settle } = require('../src/renderer/src/lib/game/settle.ts')

const APP_WAIT_MS = 15_000
const DEFAULT_GOAL_SHARE = 0.9

function args() {
  const argv = process.argv.slice(2)
  const o = { file: null, goal: null, app: false, port: 9341 }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--goal') o.goal = Number(argv[++i])
    else if (argv[i] === '--app') o.app = true
    else if (argv[i] === '--port') o.port = Number(argv[++i])
    else o.file = argv[i]
  }
  if (!o.file) {
    console.error('Usage: node scripts/migration-check.cjs <copy of ledger.json> [--goal <weight>] [--app]')
    process.exit(2)
  }
  return o
}

const hash = (text) => crypto.createHash('sha256').update(text).digest('hex').slice(0, 16)
const problems = []
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`)
  if (!ok) problems.push(what)
}

async function main() {
  const o = args()
  const text = fs.readFileSync(o.file, 'utf8')
  const raw = JSON.parse(text)
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const now = new Date()
  const today = openDay(now, zone)
  console.log(`ledger ${o.file}: version ${raw.version ?? 1}, ${Object.keys(raw.days ?? {}).length} days, ${(raw.contracts ?? []).length} contracts, sha256 ${hash(text)}`)

  // 1. Migration.
  const ledger = normalizeLedger(JSON.parse(text))
  const before = new Set(Object.entries(raw.days ?? {}).filter(([, d]) => typeof d?.weight === 'number').map(([date]) => date))
  const imported = weighIns(ledger).filter((w) => !before.has(w.date))
  check(ledger.version === 2, `migrates to version 2 (from ${raw.version ?? 1})`)
  console.log(`     ${imported.length} weigh-ins imported from legacy contracts${imported.length ? `: ${imported.map((w) => `${w.date} ${w.weight}`).join(', ')}` : ''}`)

  // 2. The Archive.
  const withoutImports = JSON.parse(JSON.stringify(ledger))
  for (const w of imported) delete withoutImports.days[w.date].weight
  let same = 0
  for (const c of ledger.contracts) {
    const a = JSON.stringify(evaluateContract(ledger, c, today))
    const b = JSON.stringify(evaluateContract(withoutImports, c, today))
    if (a === b) same += 1
    else problems.push(`contract ${c.id} evaluates differently once its weigh-ins are imported`)
  }
  check(same === ledger.contracts.length, `the Archive evaluates all ${ledger.contracts.length} legacy contracts exactly as before the import`)
  const changed = []
  for (const r of raw.contracts ?? []) {
    const m = ledger.contracts.find((c) => c.id === r.id)
    if (!m) changed.push(`${r.id}: missing`)
    else for (const k of Object.keys(r)) if (JSON.stringify(r[k]) !== JSON.stringify(m[k])) changed.push(`${r.id}.${k}: ${JSON.stringify(r[k])} → ${JSON.stringify(m[k])}`)
  }
  check(changed.length === 0, `no legacy contract field is changed by the migration${changed.length ? ` (${changed.slice(0, 5).join('; ')})` : ''}`)

  // 3. Founding and a settlement, in memory.
  const open = openContract(ledger)
  let campaign = null
  if (open) {
    console.log(`note A legacy contract (${open.id}) is still open: founding is refused until it closes with its weigh-in (A-07).`)
  } else {
    const latest = weighIns(ledger).at(-1)
    const start = latest?.weight
    if (!start) console.log('note No weigh-in in the ledger: the founding check needs one.')
    else {
      const goal = o.goal ?? Math.round(start * DEFAULT_GOAL_SHARE)
      const frozen = JSON.stringify(ledger)
      const habits = ledger.habits.filter((h) => !h.retiredOn).slice(0, 5).map((h) => h.name)
      try {
        campaign = foundCampaign({ startWeight: start, goalWeight: goal, unit: ledger.settings.unit, charter: { stepPool: 50_000, calorieLimit: 2_500, duties: habits.length ? habits : ['Read'] }, timeZone: zone, seed: 1, ledger }, now)
        const settled = settle(campaign, ledger, new Date(now.getTime() + 2 * 86_400_000), { launch: true })
        check(true, `founds a campaign (${start} → ${goal} ${ledger.settings.unit}, starting ${campaign.campaign.startDate}) and settles ${settled.summary.days.length} days`)
        campaign = settled.state
      } catch (err) {
        check(false, `founding: ${err.message}`)
      }
      check(JSON.stringify(ledger) === frozen, 'founding and settling leave the ledger untouched')
    }
  }

  // 4. The real app, on a scratch copy.
  if (o.app) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fiefdom-migration-'))
    fs.copyFileSync(o.file, path.join(dir, 'ledger.json'))
    const open = async () => {
      const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'fiefdom-migration-user-'))
      const app = launch({ data: dir, port: o.port, userData })
      await sleep(APP_WAIT_MS)
      await stop(app)
      fs.rmSync(userData, { recursive: true, force: true })
    }
    await open()
    const migrated = fs.readFileSync(path.join(dir, 'ledger.json'), 'utf8')
    console.log(`     after the first launch: ledger.json version ${JSON.parse(migrated).version}, sha256 ${hash(migrated)}`)
    if (campaign) {
      fs.writeFileSync(path.join(dir, 'campaign.json'), JSON.stringify(campaign))
      await open()
      const after = fs.readFileSync(path.join(dir, 'ledger.json'), 'utf8')
      check(after === migrated, `ledger.json is byte-identical across a launch that settles the campaign (sha256 ${hash(after)})`)
      const saved = JSON.parse(fs.readFileSync(path.join(dir, 'campaign.json'), 'utf8'))
      console.log(`     campaign.json after that launch: settled through ${saved.settledThrough?.day}, last launch ${saved.settlement?.lastLaunch}`)
    }
    fs.rmSync(dir, { recursive: true, force: true })
  }

  console.log(problems.length === 0 ? 'All migration checks passed.' : `${problems.length} check(s) failed.`)
  if (problems.length > 0) process.exit(1)
}

main().catch((err) => {
  console.error(err.stack ?? err.message)
  process.exit(1)
})
