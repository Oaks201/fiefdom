const fs = require('node:fs')
const path = require('node:path')
const sharp = require('C:/Users/lykin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp')

const root = __dirname
const groups = [
  ['Barracks × Foundry', 'dwarf-orc', '../player-cross-barracks-foundry-trial-v3'],
  ['Barracks × Merchant Hall', 'goblin-orc', '../player-crossings-remaining-v14'],
  ['Barracks × Mage Tower', 'mage-orc', '../player-crossings-remaining-v14'],
  ['Foundry × Merchant Hall', 'dwarf-goblin', '../player-crossings-remaining-v14'],
  ['Foundry × Mage Tower', 'dwarf-mage', '../player-crossings-remaining-v14'],
  ['Merchant Hall × Mage Tower', 'goblin-mage', '../player-crossings-remaining-v14']
]
const tiers = ['II', 'III', 'IV', 'V']

function svg(width, height, lines) {
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${lines.map(({ x, y, value, size = 20, color = '#f1d397', family = 'Georgia', weight = 'bold' }) => `<text x="${x}" y="${y}" fill="${color}" font-family="${family}" font-size="${size}" font-weight="${weight}">${value.replaceAll('&', '&amp;')}</text>`).join('')}</svg>`)
}

async function main() {
  const width = 1470, rowHeight = 382, height = 105 + groups.length * rowHeight
  const layers = [{ input: svg(width, 96, [{ x: 32, y: 46, value: 'Fiefdom · all six crossings', size: 34 }, { x: 34, y: 78, value: 'Tier II → Tier III → Tier IV → Tier V · First row approved, remaining rows in review', size: 17, family: 'Arial', color: '#cbd5cc', weight: 'normal' }]), left: 0, top: 0 }]
  for (let row = 0; row < groups.length; row++) {
    const [label, pair, relative] = groups[row]
    const top = 105 + row * rowHeight
    layers.push({ input: svg(width, 32, [{ x: 34, y: 24, value: label, size: 23 }]), left: 0, top })
    for (let col = 0; col < 4; col++) {
      const tier = col + 2
      const file = path.resolve(root, relative, 'portraits', `player_t${tier}_${pair}.png`)
      const left = 34 + col * 355
      layers.push({ input: { create: { width: 330, height: 340, channels: 4, background: '#26322e' } }, left, top: top + 34 })
      layers.push({ input: await sharp(file).resize(258, 323).png().toBuffer(), left: left + 36, top: top + 37 })
      layers.push({ input: svg(85, 32, [{ x: 3, y: 23, value: tiers[col], size: 19 }]), left: left + 8, top: top + 336 })
    }
  }
  await sharp({ create: { width, height, channels: 4, background: '#171e1d' } }).composite(layers).png().toFile(path.join(root, 'contact-sheet.png'))

  const sections = groups.map(([label, pair, relative], i) => `<section><h2>${label}${i === 0 ? ' · approved' : ' · review'}</h2><div class="row">${tiers.map((tier, j) => { const name = `player_t${j + 2}_${pair}.png`; return `<figure><a href="${relative}/portraits/${name}"><img class="portrait" src="${relative}/portraits/${name}" alt="${label} tier ${tier}"></a><figcaption>Tier ${tier}</figcaption><img class="icon" src="${relative}/icons/${name}" alt="${label} tier ${tier} at audience size"></figure>` }).join('')}</div></section>`).join('')
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fiefdom · crossing comparison</title><style>*{box-sizing:border-box}body{margin:0;background:#171e1d;color:#eee9db;font:16px system-ui}main{max-width:1500px;margin:auto;padding:24px}h1,h2{font-family:Georgia,serif;color:#f1d397}p{line-height:1.5}a{color:#f1d397}.row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}section{margin:30px 0 42px}figure{margin:0;padding:12px;background:#26322e;border:1px solid #53655a;border-radius:10px;text-align:center}.portrait{display:block;width:100%;height:auto}.icon{display:block;width:150px;height:188px;object-fit:contain;margin:12px auto 0;background:#f5e8c9;border:3px solid #28704e;border-radius:8px;padding:4px}figcaption{font:700 18px Georgia,serif;margin:8px;color:#f1d397}@media(max-width:800px){.row{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:500px){.row{grid-template-columns:1fr}}</style><main><h1>All six crossing paths</h1><p>Each row shows Tiers II–V. Barracks × Foundry is approved and installed; the other five are concepts for review. <a href="contact-sheet.png">Open the full comparison image</a>.</p>${sections}</main></html>`
  fs.writeFileSync(path.join(root, 'index.html'), html)
  console.log('Prepared six-path comparison')
}

main().catch(error => { console.error(error); process.exitCode = 1 })








