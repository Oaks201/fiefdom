import fs from 'node:fs'
import { foundCampaign } from '../src/renderer/src/lib/game/campaign'
import { addDays, campaignWeek, dayCloseInstant } from '../src/renderer/src/lib/game/clock'
import { settle } from '../src/renderer/src/lib/game/settle'
import { mapView, buildingsView, castleView, rosterView } from '../src/renderer/src/lib/game/view/realm'
import { armoryView } from '../src/renderer/src/lib/game/view/armory'
import { moodOf } from '../src/renderer/src/lib/game/view/diplomacy'
import { replayView } from '../src/renderer/src/lib/game/view/battle'
import { RIVAL_IDS } from '../src/renderer/src/lib/game/types'
import { FOUNDED_AT, START, TZ, ledgerFor, isRoughDay } from '../sim/ledgerGen'
import { JOURNEY, profileOf, type ProfileId } from '../sim/profiles'
import { act, type PolicyId } from '../sim/policy'
const slots = new Map<string, number>()
const events = new Map<string, number>()
const fixtureWeeks = new Set<number>()
const mark=(id:string, week:number)=>slots.set(id, Math.min(week,slots.get(id)??Infinity))
for(const profileId of ['perfect','steadfast','committed','wavering'] as ProfileId[]) for(const policy of ['greedy','smarter','push'] as PolicyId[]) for(const seed of [11,29,73]) {
 const profile=profileOf(profileId), ledger=ledgerFor(profile,seed,70)
 let state=foundCampaign({startWeight:JOURNEY.startLb,goalWeight:JOURNEY.goalLb,charter:{stepPool:JOURNEY.stepPool,calorieLimit:JOURNEY.calorieLimit,duties:[...JOURNEY.duties]},timeZone:TZ,seed,ledger},FOUNDED_AT)
 let n=0
 const collect=(day:string)=>{
  const week=campaignWeek(START,day,1)
  if(week>10)return
  for(const h of mapView(state,day)){mark(h.slot,week);if(h.status!=='held')mark('hex.overlay.'+h.status,week)}
  for(const b of buildingsView(state))mark(b.slot,week)
  mark(castleView(state).slot,week)
  for(const c of rosterView(state,day))mark(c.art,week)
  for(const r of RIVAL_IDS)mark(`rival.${r}.${moodOf(state,r)}`,week)
  const armory=armoryView(state,day)
  for(const rank of armory.ranks)for(const i of rank.items??[])mark(i.art,week)
  for(const c of armory.elites.cards??[])mark(c.art,week)
  for(const m of state.weight.milestones)if(m.brokenOn)mark(`milestone.${m.index}`,week)
  for(const e of state.worldEvents)events.set(e.id,Math.min(week,events.get(e.id)??Infinity))
  for(const b of state.grandBattles){const replay=replayView(state,b.id);for(const u of replay?.units??[])mark(u.art,week);if(b.result)mark(b.result==='victory'?'moment.grandBattleWon':'moment.grandBattleLost',week)}
 }
 for(let i=0;i<70;i++){
  const day=addDays(START,i);collect(day)
  state=act(state,day,{policy,rough:isRoughDay(profile,seed,day),nextId:()=>`art-audit-${++n}`})
  state=settle(state,ledger,new Date(dayCloseInstant(day,TZ).getTime()+60000)).state
  collect(day)
  const week=state.settledThrough.week
  if(profileId==='perfect'&&policy==='greedy'&&seed===11&&[1,3,6,10].includes(week)&&!fixtureWeeks.has(week)){
   fixtureWeeks.add(week)
   const dir=`output/art-qa/first-ten-weeks/fixtures/week-${week}`
   fs.mkdirSync(dir,{recursive:true})
   const open=addDays(state.settledThrough.day,1)
   fs.writeFileSync(dir+'/campaign.json',JSON.stringify({...state,settlement:{...state.settlement,lastLaunch:open}}))
   fs.writeFileSync(dir+'/ledger.json',JSON.stringify({...ledger,profile:{title:'Lord',name:'Art Review',holding:'Ashford'},settings:{...ledger.settings,sound:{music:false,effects:false,musicVolume:0,effectsVolume:0}}}))
   fs.writeFileSync(dir+'/now.txt',new Date(dayCloseInstant(state.settledThrough.day,TZ).getTime()+8*3600000).toISOString())
  }
 }
}
const result={campaigns:36,weeks:10,slots:Object.fromEntries([...slots].sort()),events:Object.fromEntries([...events].sort())}
fs.mkdirSync('output/art-qa/first-ten-weeks',{recursive:true})
fs.writeFileSync('output/art-qa/first-ten-weeks/exposure.json',JSON.stringify(result,null,2))
console.log(JSON.stringify(result,null,2))
if(process.argv.includes('--strict')){
 const manifest=JSON.parse(fs.readFileSync('src/renderer/public/game-assets/manifest.json','utf8'))
 const required=[...slots.keys(),...[...events.keys()].map(id=>'event.'+id)]
 const missing=required.filter(id=>!manifest[id]?.file||!fs.existsSync('src/renderer/public/game-assets/'+manifest[id].file))
 if(missing.length){console.error('First ten weeks still missing art: '+missing.join(', '));process.exitCode=1}else console.log('All observed first-ten-week encounters have installed artwork.')
}
