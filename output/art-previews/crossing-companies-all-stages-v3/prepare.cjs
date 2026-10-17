const fs = require('node:fs')
const path = require('node:path')
const sharp = require('C:/Users/lykin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp')

const root = __dirname
const stages = [
  path.resolve(root, '../crossing-companies-stage-i-v3'),
  path.resolve(root, '../crossing-companies-stage-ii-v3'),
  path.resolve(root, '../crossing-companies-stage-iii-v4')
]
const rows = [
  ['Barracks × Foundry', ['ironclads', 'Ironclads'], ['cataphracts', 'Cataphracts'], ['ironLegion', 'The Iron Legion']],
  ['Barracks × Mage Tower', ['spellblades', 'Spellblades'], ['battlemages', 'Battlemages'], ['knightsOfTheVeil', 'Knights of the Veil']],
  ['Barracks × Merchant Hall', ['beastcatchers', 'Beastcatchers'], ['rangers', 'Rangers'], ['royalHunt', 'The Royal Hunt']],
  ['Foundry × Mage Tower', ['clayGolems', 'Clay Golems'], ['runeGolems', 'Rune Golems'], ['runeforgedTitans', 'Runeforged Titans']],
  ['Foundry × Merchant Hall', ['warWagons', 'War Wagons'], ['bombardBattery', 'Bombard Battery'], ['dragonfireBattery', 'Dragonfire Battery']],
  ['Mage Tower × Merchant Hall', ['alchemists', 'Alchemists'], ['illusionists', 'Illusionists'], ['shadowCourt', 'The Shadow Court']]
]
const svg = (w, h, lines) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${lines.map(([x,y,s,size=20,color='#f2d696'])=>`<text x="${x}" y="${y}" font-family="Georgia" font-size="${size}" font-weight="bold" fill="${color}">${s.replaceAll('&','&amp;')}</text>`).join('')}</svg>`)

async function main() {
  const width = 1620, rowH = 360, height = 112 + rows.length * rowH
  const layers = [{ input: svg(width, 110, [[30, 44, 'Fiefdom · all crossing companies', 35], [32, 77, 'Six paths · Stage I → II → III · review concepts', 18, '#c8d1c8']]), left: 0, top: 0 }]
  for (let r = 0; r < rows.length; r++) {
    const [pair, ...units] = rows[r]
    const y = 112 + r * rowH
    layers.push({ input: svg(width, 34, [[24, 27, pair, 23]]), left: 0, top: y })
    for (let c = 0; c < 3; c++) {
      const [id, label] = units[c], x = 24 + c * 532
      const file = path.join(stages[c], 'portraits', `${id}.png`)
      layers.push({ input: { create: { width: 510, height: 315, channels: 4, background: '#26322e' } }, left: x, top: y + 36 })
      layers.push({ input: await sharp(file).resize(272, 272, { fit: 'contain' }).png().toBuffer(), left: x + 14, top: y + 46 })
      layers.push({ input: svg(205, 90, [[3, 31, label, label.length > 17 ? 18 : 21], [4, 58, `STAGE ${['I','II','III'][c]}`, 16]]), left: x + 296, top: y + 143 })
    }
  }
  await sharp({ create: { width, height, channels: 4, background: '#171e1d' } }).composite(layers).png().toFile(path.join(root, 'contact-sheet.png'))
  const sections = rows.map(([pair,...units]) => `<section><h2>${pair}</h2><div class="row">${units.map(([id,label],c)=>{ const rel = `../${path.basename(stages[c])}`; return `<figure><a href="${rel}/portraits/${id}.png"><img class="portrait" src="${rel}/portraits/${id}.png" alt="${label}"></a><figcaption>Stage ${['I','II','III'][c]} · ${label}</figcaption><img class="icon" src="${rel}/icons/${id}.png" alt="${label} small icon"></figure>` }).join('')}</div></section>`).join('')
  fs.writeFileSync(path.join(root, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fiefdom · all crossing companies</title><style>*{box-sizing:border-box}body{margin:0;background:#171e1d;color:#eee9db;font:16px system-ui}main{max-width:1600px;margin:auto;padding:24px}h1,h2{font-family:Georgia;color:#f2d696}h1{font-size:36px}h2{margin:20px 0 12px}a{color:#f2d696}.row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:15px}section{margin:30px 0 42px}figure{margin:0;background:#26322e;border:1px solid #53655a;border-radius:10px;text-align:center;padding:12px}.portrait{width:100%;max-width:390px}.icon{display:block;width:48px;height:48px;object-fit:contain;margin:10px auto;background:#f5e8c9;border:2px solid #28704e;border-radius:5px}figcaption{font:700 20px Georgia;color:#f2d696}p{line-height:1.5}@media(max-width:800px){.row{grid-template-columns:1fr}}</style><main><h1>All crossing companies</h1><p>Six complete three-stage progressions for review. The Rune Golem has a clearer review redraw faithful to the approved design. These concepts are not installed in the game. <a href="contact-sheet.png">Open the full comparison image</a>.</p>${sections}</main></html>`)
  console.log('Prepared 18-portrait crossing company comparison')
}
main().catch(e => { console.error(e); process.exitCode = 1 })
