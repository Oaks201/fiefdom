// Isolated live art verification. Run screens-data.ts first, then this after assets are installed.
// node scripts/art-qa.cjs [--production]
// Uses scratch fixture copies and unique Electron user-data, never the player's saves.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { ROOT, connect, evaluate, launch, pageTarget, sleep, stop } = require('./screens.cjs')

const production = process.argv.includes('--production')
const mode = production ? 'production-offline' : 'development'
const out = path.join(ROOT, 'output', 'art-qa', mode)
const fixtureRoot = path.join(ROOT, 'output', 'art-qa', 'fixtures')
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/renderer/public/game-assets/manifest.json'), 'utf8'))
const installed = Object.entries(manifest).filter(([, slot]) => slot.file).map(([id, slot]) => ({ id, ...slot }))
const classes = new Set(installed.map((slot) => slot.kind))
if (classes.size !== 17) throw new Error(`Expected 17 installed art classes; found ${classes.size}`)
const revisedSlots = ['rival.orc.calm','company.militia.token','company.militia.portrait','event.merchantCaravan','milestone.1','moment.grandBattleWon']
const revisedFiles = revisedSlots.map(id => installed.find(slot => slot.id===id))
if (revisedFiles.some(slot => !slot || !/-(pixel-v2|early-v3)\.png$/.test(slot.file))) throw new Error('The reviewed pixel revisions are not active in the manifest')
fs.mkdirSync(out, { recursive: true })
const report = { mode, classes: [...classes], assets: installed.length, revisedFiles, checkpoints: [], runtimeErrors: [] }
const port = production ? 9458 : 9457

async function until(cdp, expression, label) {
  for (let i = 0; i < 100; i++) {
    if (await evaluate(cdp, expression)) return
    await sleep(100)
  }
  throw new Error(`Timed out waiting for ${label}`)
}

async function capture(cdp, name, width, height) {
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  const filename = `${name}-${width}x${height}.png`
  fs.writeFileSync(path.join(out, filename), Buffer.from(shot.data, 'base64'))
  return filename
}

async function audit(cdp, name, width, height) {
  const result = await evaluate(cdp, `(() => {
    const selectors = ['html','body','.desk__main','.page__content','.modal','.modal__body','.dev-art-grid']
    const widths = selectors.flatMap(selector => [...document.querySelectorAll(selector)].map(el => ({ selector, client:el.clientWidth, scroll:el.scrollWidth })))
    const rendered = [...document.querySelectorAll('[data-slot]')].map(el => { const box=el.getBoundingClientRect();const style=getComputedStyle(el);return { slot:el.dataset.slot, tag:el.tagName.toLowerCase(), loaded:el.tagName.toLowerCase()==='img'?el.complete&&el.naturalWidth>0:el.tagName.toLowerCase()==='image', url:el.getAttribute('src')||el.getAttribute('href'), width:box.width,height:box.height,naturalWidth:el.naturalWidth,naturalHeight:el.naturalHeight,objectFit:style.objectFit,imageRendering:style.imageRendering,backgroundTexture:el.classList.contains('sheet__art') } })
    const clippedGalleryImages = [...document.querySelectorAll('.dev-art-card__image img')].flatMap(img=>{const image=img.getBoundingClientRect();const outer=img.parentElement.getBoundingClientRect();return image.left<outer.left-1||image.right>outer.right+1||image.top<outer.top-1||image.bottom>outer.bottom+1?[{slot:img.dataset.slot,width:image.width,height:image.height,containerWidth:outer.width,containerHeight:outer.height}]:[]})
    return { protocol:location.protocol, offline:!navigator.onLine, widths, rendered, clippedGalleryImages, galleryCount:document.querySelector('.dev-art-count')?.textContent, cards:document.querySelectorAll('.dev-art-card').length }
  })()`)
  const overflow = result.widths.filter(w => w.client > 0 && w.scroll > w.client + 1)
  if (overflow.length) throw new Error(`${name} horizontal overflow: ${JSON.stringify(overflow)}`)
  if (result.rendered.some(r => r.tag === 'img' && !r.loaded)) throw new Error(`${name}: broken rendered image`)
  const wrongRendering = result.rendered.filter(r => (r.tag==='img'||r.tag==='image') && r.loaded && r.imageRendering!==(r.backgroundTexture?'auto':'pixelated'))
  if (wrongRendering.length) throw new Error(`${name}: incorrect pixel rendering: ${JSON.stringify(wrongRendering)}`)
  const staleRevisions = result.rendered.filter(r => r.loaded && revisedSlots.includes(r.slot) && !r.url?.includes(revisedFiles.find(f=>f.id===r.slot)?.file))
  if (staleRevisions.length) throw new Error(`${name}: stale pixel revision URLs: ${JSON.stringify(staleRevisions)}`)
  const distorted = result.rendered.filter(r => r.tag==='img' && r.loaded && !r.backgroundTexture && r.width>0 && r.height>0 && r.objectFit==='fill' && Math.abs((r.width/r.height)/(r.naturalWidth/r.naturalHeight)-1)>.03)
  if (distorted.length) throw new Error(`${name}: artwork stretched: ${JSON.stringify(distorted)}`)
  if (name.startsWith('art-samples') && (result.cards !== 17 || !result.galleryCount.startsWith('17 of 17'))) throw new Error('Gallery is missing installed classes')
  if (name.startsWith('art-samples') && result.clippedGalleryImages.length) throw new Error(`Gallery clips artwork: ${JSON.stringify(result.clippedGalleryImages)}`)
  if (name === 'realm-map' && !result.rendered.some(r => r.slot==='hex.wild' && r.loaded)) throw new Error('Wild terrain missing from founding realm')
  if (name === 'buildings-castle' && !['castle.1','building.barracks.1'].every(slot => result.rendered.some(r => r.slot===slot && r.loaded))) throw new Error('Starting building/castle images missing')
  if (name === 'orc-diplomacy' && !result.rendered.some(r => r.slot==='rival.orc.calm' && r.loaded)) throw new Error('Starting orc portrait missing')
  if (name === 'starting-army' && !result.rendered.some(r => r.slot==='company.militia.token' && r.loaded)) throw new Error('Starting militia token missing from Army roster')
  if (production && result.protocol !== 'file:') throw new Error('Production app is not running from local file URLs')
  if (production && !result.offline) throw new Error('Production offline emulation was not applied')
  const image = await capture(cdp, name, width, height)
  report.checkpoints.push({ name, width, height, image, ...result })
  console.log(`${mode}: ${name} ${width}x${height} verified`)
}

async function decodeInstalled(cdp) {
  const decoded = await evaluate(cdp, `await (async () => {
    const slots=${JSON.stringify(installed)}
    return await Promise.all(slots.map(async slot => {
      const img=new Image(); img.src=new URL('game-assets/'+slot.file,document.baseURI).href
      try { await img.decode(); return { id:slot.id,url:img.src,width:img.naturalWidth,height:img.naturalHeight,ok:img.naturalWidth===slot.size[0]&&img.naturalHeight===slot.size[1] } }
      catch(error) { return { id:slot.id,url:img.src,ok:false,error:String(error) } }
    }))
  })()`)
  if (!Array.isArray(decoded)) throw new Error(`Decode returned unexpected value: ${JSON.stringify(decoded)}`)
  if (decoded.some(d => !d.ok)) throw new Error(`Assets did not decode at expected sizes: ${JSON.stringify(decoded.filter(d=>!d.ok))}`)
  report.decoded = decoded
  console.log(`${mode}: ${decoded.length} installed images decoded at exact dimensions`)
}

async function session(fixture, work) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'fiefdom-art-qa-'))
  const data = path.join(out, `${fixture}-data`)
  fs.cpSync(path.join(fixtureRoot, fixture), data, { recursive: true })
  const app = launch({ data, port, dev: !production, userData, stdio:'pipe' })
  const appLog = fs.createWriteStream(path.join(out, `${fixture}-app.log`))
  app.stdout?.pipe(appLog, { end:false })
  app.stderr?.pipe(appLog, { end:false })
  let cdp
  try {
    const target = await pageTarget(port)
    cdp = await connect(target.webSocketDebuggerUrl, msg => {
      if (msg.method === 'Runtime.exceptionThrown') report.runtimeErrors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text)
    })
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')
    await until(cdp, `!!document.querySelector('.topbar')`, 'app ready')
    await sleep(1000)
    if (production) {
      await cdp.send('Network.enable')
      await cdp.send('Network.emulateNetworkConditions', { offline:true,latency:0,downloadThroughput:0,uploadThroughput:0 })
      await cdp.send('Network.overrideNetworkState', { offline:true,latency:0,downloadThroughput:0,uploadThroughput:0,connectionType:'none' })
      await cdp.send('Page.reload', { ignoreCache:true })
      await until(cdp, `!!document.querySelector('.topbar')`, 'offline app reload')
      await sleep(1000)
      await cdp.send('Network.emulateNetworkConditions', { offline:true,latency:0,downloadThroughput:0,uploadThroughput:0 })
      await cdp.send('Network.overrideNetworkState', { offline:true,latency:0,downloadThroughput:0,uploadThroughput:0,connectionType:'none' })
      if (await evaluate(cdp, `!!document.querySelector('.dev-art-toggle')`)) throw new Error('Development art preview leaked into production')
    }
    await decodeInstalled(cdp)
    await work(cdp)
  } finally {
    cdp?.close()
    await stop(app)
    appLog.end()
    // These paths are created by this runner and never point at player data.
    try {
      const safeRoot=path.resolve(os.tmpdir())
      const safePath=path.resolve(userData)
      if (path.dirname(safePath)!==safeRoot || !path.basename(safePath).startsWith('fiefdom-art-qa-')) throw new Error('Unexpected QA temporary path')
      fs.rmSync(safePath, { recursive:true,force:true,maxRetries:8,retryDelay:250 })
    }
    catch (error) { (report.cleanupWarnings ??= []).push(`QA user-data cleanup: ${error.message}`) }
  }
}

async function main() {
  if (!production) await session('fresh', async cdp => {
    if (await evaluate(cdp, `!![...document.querySelectorAll('nav.tabs .tab')].find(b=>b.textContent.trim()==='Realm')`)) throw new Error('Fresh fixture unexpectedly has a campaign')
    await evaluate(cdp, `document.querySelector('.dev-art-toggle').click()`)
    await until(cdp, `document.querySelectorAll('.dev-art-card').length===17`, '17 art cards')
    await sleep(500)
    const beforeReload = await evaluate(cdp, `document.querySelector('.dev-art-card img').getAttribute('src')`)
    await evaluate(cdp, `document.querySelector('.dev-art-toolbar button').click()`)
    await until(cdp, `document.querySelector('.dev-art-card img')?.getAttribute('src')!==${JSON.stringify(beforeReload)} && [...document.querySelectorAll('.dev-art-card img')].every(img=>img.complete&&img.naturalWidth>0)`, 'art reload and cache revision')
    report.reloadVerified = true
    for (const [width,height] of [[1024,768],[1920,1080]]) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width,height,deviceScaleFactor:1,mobile:false })
      await sleep(300)
      // Capture every normal modal scroll position so the full gallery can be reviewed.
      const positions = await evaluate(cdp, `(() => {const el=document.querySelector('.modal-backdrop');const limit=el.scrollHeight-el.clientHeight; return [...new Set([0,Math.round(limit/2),limit])];})()`)
      for (let i=0;i<positions.length;i++) {
        await evaluate(cdp, `document.querySelector('.modal-backdrop').scrollTo(0,${positions[i]})`)
        await sleep(150)
        await audit(cdp, `art-samples-${i+1}`, width,height)
      }
    }
  })
  await session('founded', async cdp => {
    await evaluate(cdp, `document.querySelector('.modal--homecoming .modal__close')?.click()`)
    for (const [width,height] of [[1024,768],[1920,1080]]) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width,height,deviceScaleFactor:1,mobile:false })
      await evaluate(cdp, `[...document.querySelectorAll('nav.tabs .tab')].find(b=>b.textContent.trim()==='Realm').click()`)
      await until(cdp, `!!document.querySelector('.hexmap__svg')`, 'realm map')
      await evaluate(cdp, `document.querySelector('.desk__main').scrollTo(0,0)`)
      await sleep(600)
      await audit(cdp, 'realm-map', width,height)
      await evaluate(cdp, `document.querySelector('.realm-lower').scrollIntoView({block:'start'})`)
      await sleep(200)
      await audit(cdp, 'buildings-castle', width,height)
      await evaluate(cdp, `[...document.querySelectorAll('.realm-tab')].find(b=>b.textContent.trim()==='The army').click()`)
      await until(cdp, `!!document.querySelector('.roster__table')`, 'starting Army roster')
      await evaluate(cdp, `document.querySelector('.realm-lower').scrollIntoView({block:'start'})`)
      await sleep(250)
      await audit(cdp, 'starting-army', width,height)
      await evaluate(cdp, `[...document.querySelectorAll('nav.tabs .tab')].find(b=>b.textContent.trim()==='Diplomacy').click()`)
      await until(cdp, `!!document.querySelector('.court--orc')`, 'orc diplomacy')
      await sleep(500)
      await audit(cdp, 'orc-diplomacy', width,height)
    }
  })
  if (report.runtimeErrors.length) throw new Error(`Runtime errors: ${JSON.stringify(report.runtimeErrors)}`)
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report,null,2))
  console.log(`${mode}: all visual and image checks passed; report in ${path.relative(ROOT,out)}`)
}

main().catch(error => {
  report.failure = error.stack
  fs.writeFileSync(path.join(out, 'report.json'),JSON.stringify(report,null,2))
  console.error(error)
  process.exitCode = 1
})
