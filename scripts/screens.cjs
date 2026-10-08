// Screenshots of the built app (task T14 gap 4), with no dependencies: it launches Electron with
// --remote-debugging-port, drives the page through the Chrome DevTools Protocol over Node's
// built-in WebSocket, and saves PNGs.
//
//   npm run build
//   node scripts/screens.cjs --data <data dir> --out <folder> [--sizes 1024x768,1920x1080]
//                            [--scenario <steps.json>] [--port 9333] [--format png|jpeg] [--dev]
//
// --data   the folder the app reads ledger.json and campaign.json from (FIEFDOM_DATA_DIR). Use a
//          scratch copy: the app saves into it. `npx tsx scripts/screens-data.ts <root>` makes some.
// --out    where the PNGs go, named <step>-<width>x<height>.png.
// --scenario  a JSON list of steps: { "name": "...", "eval": "<JS run in the page>", "wait": ms,
//          "shot": false }. The JS may use top-level await. A step may also move the real pointer:
//          "mouse": "<JS giving [[x, y], …] in viewport pixels>", with "mouseDelay" ms between
//          moves (T15's hover measurement), or press and hold it: "hold": "<JS giving [x, y]>",
//          "holdMs": ms (T16's hold-to-confirm buttons). Without a scenario, the script shoots every
//          tab the top bar shows.
// --format jpeg  smaller files (quality 70), for screenshots kept in the repo.
// --dev    run the development build (`electron-vite dev`) instead of the built app, so the
//          dev-only tools (time travel, A-09) are there to drive: `window.fiefdomDev`.
//
// The app runs with its own user-data folder in the temp directory, so it never touches (or
// collides with) a copy of Fiefdom that is already open.
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')

function args() {
  const out = { sizes: '1024x768,1920x1080', port: '9333' }
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dev') out.dev = true
    else if (a.startsWith('--')) out[a.slice(2)] = argv[++i]
  }
  if (!out.data || !out.out) {
    console.error('Usage: node scripts/screens.cjs --data <dir> --out <dir> [--sizes WxH,…] [--scenario steps.json] [--port 9333]')
    process.exit(2)
  }
  return out
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function pageTarget(port, tries = 240) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`)
      const list = await res.json()
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      if (page) return page
    } catch {
      // not up yet
    }
    await sleep(250)
  }
  throw new Error('The app did not open a page to debug.')
}

/** A tiny CDP client: send(method, params) resolves with the result. */
function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    let next = 1
    const waiting = new Map()
    ws.onmessage = (event) => {
      const msg = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString())
      if (msg.id && waiting.has(msg.id)) {
        const { ok, fail } = waiting.get(msg.id)
        waiting.delete(msg.id)
        if (msg.error) fail(new Error(`${msg.error.message} (${msg.error.code})`))
        else ok(msg.result)
      }
    }
    ws.onerror = () => reject(new Error('Could not connect to the app.'))
    ws.onopen = () =>
      resolve({
        send(method, params = {}) {
          const id = next++
          ws.send(JSON.stringify({ id, method, params }))
          return new Promise((ok, fail) => waiting.set(id, { ok, fail }))
        },
        close() {
          ws.close()
        }
      })
  })
}

async function evaluate(cdp, expression) {
  const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, replMode: true })
  if (r.exceptionDetails) throw new Error(`In the page: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`)
  return r.result.value
}

/** Every tab the top bar shows, as steps that click it. */
async function defaultScenario(cdp) {
  const labels = await evaluate(cdp, `[...document.querySelectorAll('nav.tabs .tab')].map((b) => b.textContent.trim())`)
  return labels.map((label) => ({
    name: label.toLowerCase().replace(/[^a-z]+/g, '-'),
    eval: `[...document.querySelectorAll('nav.tabs .tab')].find((b) => b.textContent.trim() === ${JSON.stringify(label)}).click()`,
    wait: 700
  }))
}

async function main() {
  const o = args()
  const electron = require(path.join(ROOT, 'node_modules', 'electron'))
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'fiefdom-screens-'))
  fs.mkdirSync(o.out, { recursive: true })
  const env = { ...process.env, FIEFDOM_DATA_DIR: path.resolve(o.data), ELECTRON_ENABLE_LOGGING: '0' }
  const app = 'dev' in o
    ? spawn(process.execPath, [path.join(ROOT, 'node_modules', 'electron-vite', 'bin', 'electron-vite.js'), 'dev', '--remoteDebuggingPort', o.port, '--', `--user-data-dir=${userData}`], { cwd: ROOT, env, stdio: 'ignore' })
    : spawn(electron, ['.', `--remote-debugging-port=${o.port}`, `--user-data-dir=${userData}`], { cwd: ROOT, env, stdio: 'ignore' })
  let cdp
  try {
    const target = await pageTarget(o.port)
    cdp = await connect(target.webSocketDebuggerUrl)
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')
    // Let the ledger load and the campaign settle at launch.
    for (let i = 0; i < 60; i++) {
      if (await evaluate(cdp, `!!document.querySelector('.topbar')`)) break
      await sleep(250)
    }
    await sleep(Number(o.settle ?? 2500))
    const steps = o.scenario ? JSON.parse(fs.readFileSync(o.scenario, 'utf8')) : await defaultScenario(cdp)
    for (const size of o.sizes.split(',')) {
      const [width, height] = size.split('x').map(Number)
      await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
      await sleep(400)
      for (const step of steps) {
        if (step.mouse) {
          for (const [x, y] of await evaluate(cdp, step.mouse)) {
            await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
            await sleep(step.mouseDelay ?? 30)
          }
        }
        if (step.hold) {
          const [x, y] = await evaluate(cdp, step.hold)
          await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
          await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 })
          await sleep(step.holdMs ?? 1200)
          await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 })
          await sleep(300)
        }
        const value = step.eval ? await evaluate(cdp, step.eval) : undefined
        if (step.log) console.log(`${step.name}: ${JSON.stringify(value)}`)
        await sleep(step.wait ?? 600)
        if (step.shot === false) continue
        const jpeg = o.format === 'jpeg'
        const shot = await cdp.send('Page.captureScreenshot', jpeg ? { format: 'jpeg', quality: 70 } : { format: 'png' })
        const file = path.join(o.out, `${step.name}-${width}x${height}.${jpeg ? 'jpg' : 'png'}`)
        fs.writeFileSync(file, Buffer.from(shot.data, 'base64'))
        console.log(`saved ${path.relative(process.cwd(), file)}`)
      }
    }
  } finally {
    cdp?.close()
    // The dev server starts Electron as a child: end the whole tree.
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(app.pid), '/T', '/F'], { stdio: 'ignore' })
    else app.kill()
    await sleep(500)
    fs.rmSync(userData, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
