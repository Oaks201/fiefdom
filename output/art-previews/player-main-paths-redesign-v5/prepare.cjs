const fs = require('node:fs')
const path = require('node:path')
const sharp = require(process.argv[2] || 'sharp')
const root = __dirname
const previews = path.dirname(root)
const game = path.resolve(root, '../../../src/renderer/public/game-assets')
const rows = [['orc','Barracks'], ['mage','Mage Tower'], ['dwarf','Foundry'], ['goblin','Merchant Hall']]
const previous=path.join(previews,'player-main-paths-redesign-v4/generated')
const changed=new Set(['player_t2_mage','player_t3_mage'])
const entries = [{id:'player_t1', source:path.join(previous,'player_t1.png'), replacement:null}]
for (const [branch] of rows) for(let tier=2;tier<=5;tier++) {
 const id=`player_t${tier}_${branch}`
 entries.push({id,source:path.join(previous,id+'.png'),replacement:changed.has(id)?path.join(root,'edits',id+'.png'):null})
}
const svg = text => Buffer.from(text)
async function sheet(dir, name) {
 const width=1800,height=1990, cell=330, rowHeight=455, left=100, top=135, layers=[]
 layers.push({input:svg(`<svg width="1800" height="130"><text x="35" y="52" fill="#f1d397" font-family="Georgia" font-weight="bold" font-size="38">Fiefdom · Four paths, portrait review</text><text x="35" y="83" fill="#c4cec4" font-family="Arial" font-size="18">Mage II–III green robes and Tier III hood hair · all other portraits preserved</text>${[1,2,3,4,5].map((t,i)=>`<text x="${left+i*cell+105}" y="120" fill="#f1d397" font-family="Georgia" font-size="22">Tier ${t}</text>`).join('')}</svg>`),left:0,top:0})
 for(let r=0;r<rows.length;r++) {
  const [branch,label]=rows[r],y=top+r*rowHeight
  layers.push({input:svg(`<svg width="1800" height="35"><text x="35" y="26" fill="#f1d397" font-family="Georgia" font-size="27" font-weight="bold">${label}</text></svg>`),left:0,top:y})
  for(let tier=1;tier<=5;tier++) {
   const id=tier===1?'player_t1':`player_t${tier}_${branch}`,x=left+(tier-1)*cell
   let src=path.join(root,dir,`${id}.png`)
   if(!fs.existsSync(src))src=path.join(root,'sources',`${id}.png`)
   layers.push({input:{create:{width:cell-12,height:403,channels:4,background:'#293532'}},left:x,top:y+39})
   layers.push({input:await sharp(src).resize(308,385,{fit:'contain',background:'#00000000'}).png().toBuffer(),left:x+5,top:y+46})
  }
 }
 await sharp({create:{width,height,channels:4,background:'#171e1d'}}).composite(layers).png().toFile(path.join(root,name))
}
async function main() {
 for(const dir of ['sources','generated','portraits']) fs.mkdirSync(path.join(root,dir),{recursive:true})
 for(const e of entries) {
  fs.copyFileSync(e.source,path.join(root,'sources',e.id+'.png'))
  fs.copyFileSync(e.replacement||e.source,path.join(root,'generated',e.id+'.png'))
 }
 await sheet('sources','source-sheet.png')
 const manifest=JSON.parse(fs.readFileSync(path.join(game,'manifest.json'),'utf8'))
 const refs=[['Rival',path.join(game,manifest['rival.dwarf.calm'].file)],['Rival',path.join(game,manifest['rival.archmage.calm'].file)],['Host',path.join(previews,'four-hosts-v1/portraits/goblin-goldenGuard.png')],['Host',path.join(previews,'four-hosts-v1/portraits/mage-apprentices.png')],['Company',path.join(game,manifest['company.militia.portrait'].file)]]
 const layers=[]
 for(let i=0;i<refs.length;i++) layers.push({input:await sharp(refs[i][1]).resize(240,300,{fit:'contain',background:'#00000000'}).png().toBuffer(),left:i*250+5,top:15})
 await sharp({create:{width:1250,height:330,channels:4,background:'#293532'}}).composite(layers).png().toFile(path.join(root,'style-reference.png'))
 await sheet('generated','progress-sheet.png')
 if(entries.every(e=>fs.existsSync(path.join(root,'generated',e.id+'.png')))) {
  const revised=changed
  for(const e of entries) {
   const same=fs.readFileSync(e.source).equals(fs.readFileSync(path.join(root,'generated',e.id+'.png')))
   if(same===revised.has(e.id))throw Error('Unexpected preservation/revision state: '+e.id)
  }
  console.log('Verified 15 preserved portraits and 2 revised portraits')
  for(const e of entries) {const meta=await sharp(path.join(root,'generated',e.id+'.png')).metadata();if(!meta.hasAlpha)throw Error('Missing alpha: '+e.id);await sharp(path.join(root,'generated',e.id+'.png')).resize(512,640,{fit:'contain',background:'#00000000'}).png().toFile(path.join(root,'portraits',e.id+'.png'))}
  await sheet('portraits','contact-sheet.png')
  const auditLayers=[]
  for(let i=0;i<refs.length;i++)auditLayers.push({input:await sharp(refs[i][1]).resize(150,188,{fit:'contain',background:'#00000000'}).png().toBuffer(),left:25+i*170,top:15})
  for(let r=0;r<rows.length;r++)for(let t=1;t<=5;t++) {
   const id=t===1?'player_t1':`player_t${t}_${rows[r][0]}`
   auditLayers.push({input:await sharp(path.join(root,'portraits',id+'.png')).resize(150,188).png().toBuffer(),left:25+(t-1)*170,top:220+r*200})
  }
  await sharp({create:{width:890,height:1030,channels:4,background:'#293532'}}).composite(auditLayers).png().toFile(path.join(root,'audience-size-audit.png'))
  fs.writeFileSync(path.join(root,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Four player paths · building backgrounds</title><style>body{margin:0;background:#171e1d;color:#eee9db;font:17px system-ui}main{max-width:1800px;margin:auto;padding:24px}a{color:#f1d397}h1{font-family:Georgia}img{display:block;width:100%;height:auto}</style><main><h1>Four player paths · building backgrounds</h1><p><a href="contact-sheet.png">Open or save the full comparison image</a> · Review concepts</p><img src="contact-sheet.png" alt="Four player paths from tier one through five"></main></html>`)
  console.log('Prepared all 17 portraits and four-path comparison')
 } else console.log('Prepared sources and style reference; final portraits still in progress')
}
main().catch(e=>{console.error(e);process.exitCode=1})
