// Actual simulated first-ten-week states, in an isolated development app; no player saves.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os')
const {ROOT,launch,pageTarget,connect,evaluate,stop,sleep}=require('./screens.cjs')
const out=path.join(ROOT,'output/art-qa/first-ten-weeks/live'),report={checkpoints:[],errors:[]}
fs.mkdirSync(out,{recursive:true})
async function until(cdp,expression){for(let i=0;i<100;i++){if(await evaluate(cdp,expression))return;await sleep(100)}throw new Error('Timed out: '+expression)}
async function check(cdp,name,width,height){
 await sleep(300)
 const audit=await evaluate(cdp,`(() => {const images=[...document.querySelectorAll('[data-slot]')].map(el=>{const b=el.getBoundingClientRect(),s=getComputedStyle(el);return {slot:el.dataset.slot,tag:el.tagName.toLowerCase(),placeholder:el.classList.contains('game-art--placeholder')||el.classList.contains('game-art--placeholder-svg'),loaded:el.tagName.toLowerCase()==='img'?el.complete&&el.naturalWidth>0:el.tagName.toLowerCase()==='image',width:b.width,height:b.height,naturalWidth:el.naturalWidth,naturalHeight:el.naturalHeight,fit:s.objectFit,rendering:s.imageRendering,url:el.getAttribute('src')||el.getAttribute('href'),texture:el.classList.contains('sheet__art')}});return {images,overflow:[...document.querySelectorAll('html,body,.desk__main,.page__content')].filter(e=>e.clientWidth>0&&e.scrollWidth>e.clientWidth+1).map(e=>e.className)}})()`)
 const bad=audit.images.filter(i=>i.placeholder||!i.loaded||(!i.texture&&i.rendering!=='pixelated')||(!i.texture&&i.tag==='img'&&i.fit==='fill'&&Math.abs((i.width/i.height)/(i.naturalWidth/i.naturalHeight)-1)>.03))
 if(bad.length||audit.overflow.length)throw new Error(name+': '+JSON.stringify({bad,overflow:audit.overflow}))
 const shot=await cdp.send('Page.captureScreenshot',{format:'png'}),file=name+'-'+width+'x'+height+'.png'
 fs.writeFileSync(path.join(out,file),Buffer.from(shot.data,'base64'))
 report.checkpoints.push({name,width,height,file,...audit});console.log('Verified '+file)
}
async function main(){
 for(const week of [1,3,6,10]){
  const fixture=path.join(ROOT,'output/art-qa/first-ten-weeks/fixtures/week-'+week),data=path.join(out,'week-'+week+'-data'),userData=fs.mkdtempSync(path.join(os.tmpdir(),'fiefdom-early-art-'))
  fs.cpSync(fixture,data,{recursive:true})
  const now=fs.readFileSync(path.join(fixture,'now.txt'),'utf8').trim()
  const app=launch({data,port:9459,dev:true,userData,env:{FIEFDOM_DEV_NOW:now},stdio:'pipe'})
  const log=fs.createWriteStream(path.join(out,'week-'+week+'-app.log'));app.stdout.pipe(log,{end:false});app.stderr.pipe(log,{end:false})
  let cdp
  try{
   cdp=await connect((await pageTarget(9459)).webSocketDebuggerUrl,msg=>{if(msg.method==='Runtime.exceptionThrown')report.errors.push(msg.params.exceptionDetails.exception?.description||msg.params.exceptionDetails.text)})
   await cdp.send('Page.enable');await cdp.send('Runtime.enable')
   await until(cdp,`!!document.querySelector('.topbar')`);await sleep(1000)
   await evaluate(cdp,`document.querySelector('.modal--homecoming .modal__close')?.click()`)
   await evaluate(cdp,`await (async()=>{for(let i=0;i<20;i++){const button=document.querySelector('.moment__actions .btn--primary');if(!button)break;button.click();await new Promise(resolve=>setTimeout(resolve,50))}})()`)
   for(const[width,height]of [[1024,768],[1920,1080]]){
    await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false})
    await evaluate(cdp,`[...document.querySelectorAll('nav.tabs .tab')].find(b=>b.textContent.trim()==='Realm').click()`)
    await until(cdp,`!!document.querySelector('.hexmap__svg')`)
    await evaluate(cdp,`document.querySelector('.desk__main').scrollTo(0,0)`)
    await check(cdp,'week-'+week+'-map',width,height)
    await evaluate(cdp,`document.querySelector('.realm-lower').scrollIntoView({block:'start'})`)
    await check(cdp,'week-'+week+'-buildings',width,height)
    await evaluate(cdp,`[...document.querySelectorAll('.realm-tab')].find(b=>b.textContent.trim()==='The army').click()`)
    await check(cdp,'week-'+week+'-army',width,height)
    await evaluate(cdp,`[...document.querySelectorAll('nav.tabs .tab')].find(b=>b.textContent.trim()==='Diplomacy').click()`)
    await until(cdp,`document.querySelectorAll('.court').length===4`)
    await check(cdp,'week-'+week+'-courts',width,height)
    const armory=await evaluate(cdp,`(() => {const b=[...document.querySelectorAll('nav.tabs .tab')].find(b=>b.textContent.trim()==='Armory');if(b){b.click();return true}return false})()`)
    if(armory)await check(cdp,'week-'+week+'-armory',width,height)
   }
  }finally{cdp?.close();await stop(app);log.end();if(path.dirname(path.resolve(userData))===path.resolve(os.tmpdir())&&path.basename(userData).startsWith('fiefdom-early-art-'))fs.rmSync(userData,{recursive:true,force:true})}
 }
 if(report.errors.length)throw new Error('Renderer errors: '+JSON.stringify(report.errors))
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log('Early campaign image QA passed.')
}
main().catch(e=>{report.failure=e.stack;fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.error(e);process.exitCode=1})
