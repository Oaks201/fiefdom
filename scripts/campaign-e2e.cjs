// The end-to-end campaign run (task T17), with no new dependencies: it builds a temp data folder
// with a synthetic Steadfast ledger (the simulator's own generator), launches the development build
// (dev time travel, A-09, and the runtime invariants run only there), founds a campaign through the
// wizard, and plays a year through the real screens:
//
//   node scripts/campaign-e2e.cjs [--weeks 52] [--out docs/game/screens/t17] [--port 9335] [--keep]
//
// - Every 4 weeks it buys a tier, courts a village, sets the day's orders and seals the longest
//   contract, each through its page; it fights the first Grand Battle by hand from the top bar.
// - Each day it advances the dev clock one day (the app settles, and in development checks Ch 15's
//   invariants after every settlement, logging the seed and stopping on a failure), and dismisses
//   the big-moment cards and the Homecoming.
// - It saves screenshots at fixed checkpoints (the founding, every 4 weeks, the hand-fought battle
//   and the end) and records every console error, uncaught page exception and main-process error.
// - It writes <out>/e2e-summary.json and exits 1 on any invariant failure or uncaught error.
//
// On Linux without a display, run it under xvfb-run. --keep leaves the data folder for a look.
require('tsx/cjs')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { ROOT, connect, evaluate, launch, pageTarget, sleep, stop } = require('./screens.cjs')
const { FOUNDED_AT, START, TZ, ledgerFor } = require('../sim/ledgerGen.ts')
const { JOURNEY, profileOf } = require('../sim/profiles.ts')

const DAYS_PER_WEEK = 7
const BLOCK_DAYS = 28
const SEED = 1

function args() {
  const o = { weeks: 52, out: path.join(ROOT, 'docs', 'game', 'screens', 't17'), port: 9335, keep: false, format: 'jpeg' }
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--keep') o.keep = true
    else if (a === '--weeks') o.weeks = Number(argv[++i])
    else if (a === '--out') o.out = path.resolve(argv[++i])
    else if (a === '--port') o.port = Number(argv[++i])
    else if (a === '--format') o.format = argv[++i]
    else throw new Error(`Unknown option ${a}`)
  }
  return o
}

/** The data folder: a Steadfast ledger from 28 days before the start through the run and a week beyond. */
function dataFolder(weeks) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fiefdom-e2e-'))
  const ledger = ledgerFor(profileOf('steadfast'), SEED, weeks * DAYS_PER_WEEK)
  ledger.profile = { ...ledger.profile, title: 'Lord', name: 'Rich', holding: 'Ashford' }
  fs.writeFileSync(path.join(dir, 'ledger.json'), JSON.stringify(ledger, null, 2))
  return dir
}

/** Helpers defined in the page once: setting React-controlled fields, clicking by text, dismissing cards. */
const PAGE_HELPERS = `
window.__e2e = {
  set(el, value) {
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, String(value))
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
  },
  byText(selector, text) {
    return [...document.querySelectorAll(selector)].find((el) => el.textContent.trim().includes(text)) ?? null
  },
  click(el) {
    if (!el || el.disabled) return false
    el.click()
    return true
  },
  tab(label) {
    return window.__e2e.click([...document.querySelectorAll('nav.tabs .tab')].find((b) => b.textContent.trim().startsWith(label)))
  },
  /** Closes big-moment cards and the Homecoming; returns how many it closed. */
  dismiss() {
    let n = 0
    for (let i = 0; i < 20; i++) {
      const moment = document.querySelector('.moment .moment__actions .btn--primary')
      const home = document.querySelector('.modal--homecoming .modal__close')
      const el = moment ?? home
      if (!el) break
      el.click()
      n++
    }
    return n
  },
  centre(selector) {
    const el = document.querySelector(selector)
    if (!el || el.disabled) return null
    el.scrollIntoView({ block: 'center' })
    const r = el.getBoundingClientRect()
    return [r.left + r.width / 2, r.top + r.height / 2]
  }
}
true`

async function main() {
  const o = args()
  fs.mkdirSync(o.out, { recursive: true })
  const data = dataFolder(o.weeks)
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'fiefdom-e2e-user-'))
  const log = { consoleErrors: [], pageExceptions: [], mainErrors: [], invariantFailures: [], shots: [], actions: [] }
  const app = launch({ data, port: o.port, dev: true, userData, stdio: ['ignore', 'pipe', 'pipe'], env: { FIEFDOM_DEV_NOW: FOUNDED_AT.toISOString(), TZ } })
  // The main process and Chromium both write here. Chromium's own "[pid:ERROR:…]" lines (GPU, D-Bus in a
  // container) are not the app's; JavaScript errors from the main process are.
  const onOutput = (chunk) => {
    for (const line of String(chunk).split('\n')) {
      if (/\b(Uncaught|TypeError|ReferenceError|RangeError|SyntaxError|Error:)/.test(line) && !/^\[\d+:\d+\/\d+\.\d+:(ERROR|WARNING|INFO)/.test(line.trim()) && !/^\s*\[\d+:/.test(line)) log.mainErrors.push(line.trim())
    }
  }
  app.stdout.on('data', onOutput)
  app.stderr.on('data', onOutput)

  let cdp
  const started = Date.now()
  let status = 'unfinished'
  try {
    const target = await pageTarget(o.port)
    cdp = await connect(target.webSocketDebuggerUrl, (msg) => {
      if (msg.method === 'Runtime.consoleAPICalled' && (msg.params.type === 'error' || msg.params.type === 'assert')) {
        const text = msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')
        log.consoleErrors.push(text)
        if (text.includes('Campaign invariant broken')) log.invariantFailures.push(text)
      }
      if (msg.method === 'Runtime.exceptionThrown') log.pageExceptions.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text)
    })
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false })
    for (let i = 0; i < 240; i++) {
      if (await evaluate(cdp, `!!document.querySelector('.topbar') && !!window.fiefdomDev`)) break
      await sleep(250)
    }
    await sleep(3000)
    await evaluate(cdp, PAGE_HELPERS)
    const run = (js) => evaluate(cdp, js)
    const shot = async (name) => {
      const jpeg = o.format === 'jpeg'
      const r = await cdp.send('Page.captureScreenshot', jpeg ? { format: 'jpeg', quality: 70 } : { format: 'png' })
      const file = path.join(o.out, `${name}.${jpeg ? 'jpg' : 'png'}`)
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'))
      log.shots.push(path.relative(ROOT, file))
    }
    const hold = async (selector, ms = 1500) => {
      const at = await run(`window.__e2e.centre(${JSON.stringify(selector)})`)
      if (!at) return false
      const [x, y] = at
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 })
      await sleep(ms)
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 })
      await sleep(500)
      return true
    }
    /** Polls `js` in the page until it is truthy, or gives up after `ms`. */
    const waitFor = async (js, ms = 15_000) => {
      for (const until = Date.now() + ms; Date.now() < until; ) {
        const value = await run(js)
        if (value) return value
        await sleep(150)
      }
      return null
    }
    const campaign = () => run(`(() => { const c = window.fiefdomDev.campaign(); return c && { status: c.campaign.status, startDate: c.campaign.startDate, settled: c.settledThrough, seed: c.campaign.seed, buildings: c.buildings, castle: c.castleTier, hexes: c.hexes.filter((h) => h.owner === 'player').length, contracts: c.contracts.history.length + (c.contracts.active ? 1 : 0) + (c.contracts.queued ? 1 : 0), grand: c.log.filter((e) => e.kind === 'grandBattle' && e.stage === 'fought').length } })()`)
    const act = (what, ok, detail = '') => log.actions.push({ day: dayNo, what, ok, ...(detail ? { detail } : {}) })
    let dayNo = 0

    // ── The founding, through the wizard ──
    await run(`window.__e2e.click(document.querySelector('button.tool[aria-label="Settings"]'))`)
    await waitFor(`!!window.__e2e.byText('button', 'Found a campaign')`)
    await run(`window.__e2e.click(window.__e2e.byText('button', 'Found a campaign'))`)
    await waitFor(`!!document.querySelector('.modal--founding .wizard__grid input')`)
    const stepIs = (n) => waitFor(`document.querySelector('.modal--founding .wizard__steps li.is-on')?.textContent.trim() === ${JSON.stringify(n)}`)
    await run(`(() => { const inputs = document.querySelectorAll('.modal--founding .wizard__grid input'); window.__e2e.set(inputs[0], ${JOURNEY.startLb}); window.__e2e.set(inputs[1], ${JOURNEY.goalLb}); return true })()`)
    await waitFor(`!document.querySelector('.modal--founding .modal__actions .btn--primary')?.disabled`)
    await shot('00-wizard-journey')
    await run(`window.__e2e.click(document.querySelector('.modal--founding .modal__actions .btn--primary'))`)
    await stepIs('For the Healer')
    await run(`window.__e2e.click(document.querySelector('.modal--founding .modal__actions .btn--primary'))`)
    await stepIs('The Charter')
    // The Charter: the journey's step pool, and a calorie limit at or above the Healer's floor.
    await run(`(() => {
      const inputs = document.querySelectorAll('.modal--founding .wizard__grid input')
      window.__e2e.set(inputs[0], ${JOURNEY.stepPool})
      const floor = Number((document.querySelector('.wizard__floor strong')?.textContent ?? '').replace(/[^0-9]/g, '')) || 0
      window.__e2e.set(inputs[1], Math.max(${JOURNEY.calorieLimit}, floor))
      return true
    })()`)
    await waitFor(`!document.querySelector('.modal--founding .modal__actions .btn--primary')?.disabled`)
    await shot('01-wizard-charter')
    await run(`window.__e2e.click(document.querySelector('.modal--founding .modal__actions .btn--primary'))`)
    await stepIs('Seal the realm')
    await waitFor(`!!document.querySelector('.modal--founding .seal-button')`)
    let founded = null
    for (let attempt = 0; attempt < 3 && !founded; attempt++) {
      await hold('.modal--founding .seal-button', 2200)
      founded = await waitFor(`(() => { const c = window.fiefdomDev.campaign(); return c && { seed: c.campaign.seed, startDate: c.campaign.startDate } })()`, 5_000)
    }
    if (!founded) throw new Error('The founding wizard did not found a campaign')
    act('found', true, `seed ${founded.seed}, starts ${founded.startDate}`)
    await shot('02-founded')

    // ── A year, a day at a time ──
    let handFought = null
    // The day's orders on the Realm page: the weakest target that isn't a village, and the companies
    // its assault banners allow. Set every day, so a garrison repulsed one day is pushed again the next.
    const orders = async () => {
      if (!(await run(`!!document.querySelector('.realm-board .orders')`))) {
        await run(`window.__e2e.tab('Realm')`)
        await waitFor(`!!document.querySelector('.realm-board .orders')`)
      }
      const ordered = await run(`(() => {
        const select = document.querySelector('.orders .assault-slot select')
        if (!select || select.disabled || select.options.length < 2) return false
        // Not a village: those are courted, not stormed, when the purse allows.
        const villages = new Set(window.fiefdomDev.campaign().hexes.filter((h) => h.village).map((h) => h.id))
        const garrison = (o) => Number(o.textContent.split('garrison ').pop())
        const options = [...select.options].slice(1).sort((a, b) => villages.has(a.value) - villages.has(b.value) || garrison(a) - garrison(b))
        window.__e2e.set(select, options[0].value)
        return true
      })()`)
      if (!ordered) return 0
      await sleep(250)
      return run(`(() => {
        const banners = Number((document.querySelector('.assault-slot .field__label')?.textContent.match(/of (\\d+) companies/) ?? [])[1] ?? 1)
        let n = 0
        for (const row of document.querySelectorAll('.orders__companies tbody tr')) {
          if (n >= banners) break
          const buttons = row.querySelectorAll('.segmented button[role=radio]')
          if (buttons.length > 1 && !buttons[1].classList.contains('is-on') && window.__e2e.click(buttons[1])) n++
          else if (buttons[1]?.classList.contains('is-on')) n++
        }
        return n
      })()`)
    }

    const monthly = async (month) => {
      // Buy a tier: the first building (or the castle) whose next step is open.
      await run(`window.__e2e.tab('Realm')`)
      await waitFor(`!!document.querySelector('.realm-board .orders')`)
      await run(`window.__e2e.click([...document.querySelectorAll('.realm-tab')].find((t) => t.textContent.includes('Buildings')))`)
      await waitFor(`!!document.querySelector('.buildings')`)
      const bought = await run(`window.__e2e.click([...document.querySelectorAll('.buildings .next-step .btn--primary')].find((b) => !b.disabled) ?? null)`)
      act('buy a tier', bought)
      await sleep(300)
      // Court a village: the first village whose panel offers an open courtship, at the suggested bid.
      const villages = await run(`(() => { const c = window.fiefdomDev.campaign(); return c.hexes.filter((h) => h.village && h.owner !== 'player').map((h) => h.id) })()`)
      let courted = false
      for (const id of villages) {
        await run(`(() => { const g = document.querySelector('[data-hex="${id}"]'); if (!g) return false; g.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true })()`)
        await sleep(120)
        const open = await run(`window.__e2e.click([...document.querySelectorAll('.hex-panel .hex-action.is-open button')].find((b) => b.textContent.includes('Court')) ?? null)`)
        if (!open) continue
        await sleep(200)
        courted = await run(`window.__e2e.click(document.querySelector('.bid-form__actions .btn--primary'))`)
        if (courted) break
      }
      act('court a village', courted)
      await sleep(300)
      const sent = await orders()
      act('set orders', sent > 0, `${sent} companies sent`)
      await sleep(300)
      await shot(`${String(month + 3).padStart(2, '0')}-month-${month}-realm`)
      // Seal the longest contract the realm allows.
      await run(`window.__e2e.tab('Contract')`)
      await waitFor(`!!document.querySelector('.campaign-contract')`)
      const picked = await run(`window.__e2e.click([...document.querySelectorAll('.length-picker .length')].filter((l) => !l.classList.contains('is-locked')).pop() ?? null)`)
      const contractsBefore = (await campaign()).contracts
      if (picked) await hold('.deed--campaign .seal-button', 1500)
      const contractsAfter = (await campaign()).contracts
      act('seal a contract', contractsAfter > contractsBefore, picked ? '' : 'no contract could be drafted (one is queued)')
      await run(`window.__e2e.tab('Chronicle')`)
      await sleep(300)
    }

    const fightByHand = async () => {
      const opened = await run(`window.__e2e.click(document.querySelector('.tool--battle.has-alert'))`)
      if (!opened) return null
      await waitFor(`!!document.querySelector('.prep__begin')`)
      await sleep(500)
      await shot('80-battle-preparation')
      const begun = await run(`window.__e2e.click(document.querySelector('.prep__begin .btn--primary'))`)
      if (!begun) {
        await run(`window.__e2e.click(document.querySelector('.battle-page__back'))`)
        return null
      }
      await waitFor(`!!window.__e2e.byText('.battle__actions button', 'Resolve round')`)
      let rounds = 0
      for (let r = 0; r < 6; r++) {
        const live = await run(`!!window.__e2e.byText('.battle__actions button', 'Resolve round')`)
        if (!live) break
        await run(`window.__e2e.click([...document.querySelectorAll('.order-card')].find((c) => !c.disabled) ?? null)`)
        await sleep(200)
        await run(`window.__e2e.click(document.querySelector('.orders-hand__targets .chip'))`)
        await sleep(200)
        if (r === 0) await shot('81-battle-round-1')
        const resolved = await run(`window.__e2e.click(window.__e2e.byText('.battle__actions button', 'Resolve round'))`)
        if (!resolved) break
        rounds++
        await sleep(2200)
      }
      await shot('82-battle-result')
      const result = await run(`(() => { const c = window.fiefdomDev.campaign(); const b = c.grandBattles.filter((x) => x.setup).pop(); return b ? { trigger: b.trigger, result: b.result ?? null, date: b.battleDate } : null })()`)
      await run(`window.__e2e.click(document.querySelector('.battle-page__back')) || window.__e2e.click(window.__e2e.byText('button', 'Back'))`)
      await sleep(400)
      return { rounds, ...(result ?? {}) }
    }

    const days = o.weeks * DAYS_PER_WEEK
    for (dayNo = 1; dayNo <= days; dayNo++) {
      await run('window.fiefdomDev.advanceDays(1)')
      await sleep(250)
      await run('window.__e2e.dismiss()')
      if (log.invariantFailures.length > 0) break
      const now = await campaign()
      if (!now || now.status === 'fallen') break
      if ((dayNo - 1) % BLOCK_DAYS === 0) await monthly(Math.floor((dayNo - 1) / BLOCK_DAYS) + 1)
      else if ((await orders()) > 0) log.dailyOrders = (log.dailyOrders ?? 0) + 1
      if (!handFought) {
        handFought = await fightByHand()
        if (handFought) act('fight a Grand Battle by hand', true, JSON.stringify(handFought))
      }
      await run('window.__e2e.dismiss()')
      if (dayNo % DAYS_PER_WEEK === 0) process.stderr.write(`  week ${dayNo / DAYS_PER_WEEK}: ${JSON.stringify(now)}\n`)
    }
    const end = await campaign()
    status = end?.status ?? 'none'
    // Map hover after a year of play (T15's measure): the real pointer across every hex, each React commit timed.
    await run(`window.__e2e.tab('Realm')`)
    await sleep(800)
    await run('window.__fiefdomCommits = []; true')
    const points = await run(`[...document.querySelectorAll('[data-hex]')].map((g) => { const r = g.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2] })`)
    for (const [x, y] of points) {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
      await sleep(25)
    }
    await sleep(300)
    const commits = (await run('(window.__fiefdomCommits ?? []).map((c) => c.ms)')).sort((a, b) => a - b)
    log.hover = {
      hexes: points.length,
      commits: commits.length,
      maxMs: Number((commits[commits.length - 1] ?? 0).toFixed(2)),
      p95Ms: Number((commits[Math.floor(commits.length * 0.95)] ?? 0).toFixed(2)),
      meanMs: Number((commits.reduce((s, v) => s + v, 0) / Math.max(1, commits.length)).toFixed(2))
    }
    for (const [label, name] of [['Chronicle', '90-end-chronicle'], ['Realm', '91-end-realm'], ['Diplomacy', '92-end-diplomacy'], ['Armory', '93-end-armory']]) {
      await run(`window.__e2e.tab(${JSON.stringify(label)})`)
      await sleep(700)
      await shot(name)
    }
    log.end = end
    log.handFought = handFought
  } finally {
    cdp?.close()
    await stop(app)
    fs.rmSync(userData, { recursive: true, force: true })
    if (!o.keep) fs.rmSync(data, { recursive: true, force: true })
    else console.error(`data kept in ${data}`)
  }
  const summary = {
    weeks: o.weeks,
    start: START,
    seconds: Math.round((Date.now() - started) / 1000),
    status,
    ...log
  }
  fs.writeFileSync(path.join(o.out, 'e2e-summary.json'), JSON.stringify(summary, null, 2))
  const failed = log.invariantFailures.length + log.pageExceptions.length + log.mainErrors.length
  console.log(
    `${o.weeks} weeks: ${status}; hover max ${log.hover?.maxMs} ms over ${log.hover?.commits} commits; ${log.invariantFailures.length} invariant failures, ${log.pageExceptions.length} uncaught page exceptions, ${log.consoleErrors.length} console errors, ${log.mainErrors.length} main-process errors; ${log.actions.filter((a) => a.ok).length} of ${log.actions.length} actions done; ${log.shots.length} screenshots in ${path.relative(ROOT, o.out)}`
  )
  if (failed > 0 || !log.handFought) process.exit(1)
}

main().catch((err) => {
  console.error(err.stack ?? err.message)
  process.exit(1)
})
