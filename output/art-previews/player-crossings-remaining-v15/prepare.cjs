const fs = require('node:fs')
const path = require('node:path')
const sharp = require('C:/Users/lykin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp')

const root = __dirname
const sources = path.join(root, 'sources')
const portraits = path.join(root, 'portraits')
const icons = path.join(root, 'icons')
const main = path.resolve(root, '../player-main-paths-redesign-v5/portraits')
const lockedCross = path.resolve(root, '../player-cross-barracks-foundry-trial-v3/portraits')
const paths = [
  ['dwarf-goblin', 'Foundry × Merchant Hall'],
  ['dwarf-mage', 'Foundry × Mage Tower'],
  ['goblin-mage', 'Merchant Hall × Mage Tower'],
  ['goblin-orc', 'Merchant Hall × Barracks'],
  ['mage-orc', 'Mage Tower × Barracks']
]
const roman = ['II', 'III', 'IV', 'V']

function textSvg(width, height, lines) {
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${lines.map(({ x, y, text, size = 20, color = '#f1d397', family = 'Georgia', weight = 'bold' }) => `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${color}">${text.replaceAll('&', '&amp;')}</text>`).join('')}</svg>`)
}

async function sheet(file, rows, heading, subtitle) {
  const width = 1470, rowHeight = 382, height = 105 + rows.length * rowHeight
  const layers = [{ input: textSvg(width, 98, [{ x: 32, y: 46, text: heading, size: 34 }, { x: 34, y: 77, text: subtitle, size: 17, family: 'Arial', color: '#c8d1c8', weight: 'normal' }]), left: 0, top: 0 }]
  for (let row = 0; row < rows.length; row++) {
    const [label, filenames, dir] = rows[row]
    const top = 105 + row * rowHeight
    layers.push({ input: textSvg(width, 33, [{ x: 34, y: 25, text: label, size: 23 }]), left: 0, top })
    for (let col = 0; col < filenames.length; col++) {
      const left = 34 + col * 355
      layers.push({ input: { create: { width: 330, height: 340, channels: 4, background: '#26322e' } }, left, top: top + 34 })
      layers.push({ input: await sharp(path.join(dir, filenames[col])).resize(258, 323).png().toBuffer(), left: left + 36, top: top + 37 })
      layers.push({ input: textSvg(85, 32, [{ x: 3, y: 23, text: roman[col], size: 19 }]), left: left + 8, top: top + 336 })
    }
  }
  await sharp({ create: { width, height, channels: 4, background: '#171e1d' } }).composite(layers).png().toFile(path.join(root, file))
}

async function styleSheet() {
  const referenceRows = [
    ['Locked main paths', [main + '/player_t5_orc.png', main + '/player_t5_dwarf.png', main + '/player_t5_goblin.png', main + '/player_t5_mage.png', lockedCross + '/player_t5_dwarf-orc.png']],
    ['Remaining crossings', paths.map(([p]) => path.join(portraits, `player_t5_${p}.png`))]
  ]
  const width = 1660, height = 920, layers = [{ input: textSvg(width, 105, [{ x: 34, y: 47, text: 'Tier V · art style comparison', size: 34 }, { x: 34, y: 80, text: 'Locked portraits above · five new crossings below · same scale', size: 17, family: 'Arial', color: '#c8d1c8', weight: 'normal' }]), left: 0, top: 0 }]
  for (let row = 0; row < referenceRows.length; row++) {
    const [label, files] = referenceRows[row]
    const y = 107 + row * 400
    layers.push({ input: textSvg(width, 35, [{ x: 34, y: 26, text: label, size: 24 }]), left: 0, top: y })
    for (let col = 0; col < files.length; col++) {
      const x = 30 + col * 325
      layers.push({ input: { create: { width: 306, height: 352, channels: 4, background: '#26322e' } }, left: x, top: y + 36 })
      layers.push({ input: await sharp(files[col]).resize(280, 350).png().toBuffer(), left: x + 13, top: y + 37 })
    }
  }
  await sharp({ create: { width, height, channels: 4, background: '#171e1d' } }).composite(layers).png().toFile(path.join(root, 'style-audit.png'))
}

async function mainTask() {
  for (const dir of [portraits, icons]) fs.mkdirSync(dir, { recursive: true })
  for (const [pair] of paths) for (let tier = 2; tier <= 5; tier++) {
    const name = `player_t${tier}_${pair}.png`
    await sharp(path.join(sources, name)).resize(512, 640, { fit: 'fill', kernel: 'lanczos3' }).png().toFile(path.join(portraits, name))
    await sharp(path.join(portraits, name)).resize(150, 188).png().toFile(path.join(icons, name))
  }
  await sheet('contact-sheet.png', paths.map(([pair, label]) => [label, [2, 3, 4, 5].map(tier => `player_t${tier}_${pair}.png`), portraits]), 'Fiefdom · remaining crossings', 'Five progressions · Tiers II–V · Review concepts')
  await styleSheet()

  const sections = paths.map(([pair, label]) => `<section><h2>${label}</h2><div class="row">${[2, 3, 4, 5].map(tier => { const name = `player_t${tier}_${pair}.png`; return `<figure><a href="portraits/${name}"><img class="portrait" src="portraits/${name}" alt="${label}, tier ${tier}"></a><figcaption>Tier ${roman[tier - 2]}</figcaption><img class="icon" src="icons/${name}" alt="${label}, tier ${tier}, audience size"></figure>` }).join('')}</div></section>`).join('')
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fiefdom · remaining crossing portraits</title><style>*{box-sizing:border-box}body{margin:0;background:#171e1d;color:#eee9db;font:16px system-ui}main{max-width:1500px;margin:auto;padding:24px}h1,h2{font-family:Georgia,serif;color:#f1d397}p{line-height:1.5}a{color:#f1d397}.row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}section{margin:30px 0 42px}figure{margin:0;padding:12px;background:#26322e;border:1px solid #53655a;border-radius:10px;text-align:center}.portrait{display:block;width:100%;height:auto}.icon{display:block;width:150px;height:188px;object-fit:contain;margin:12px auto 0;background:#f5e8c9;border:3px solid #28704e;border-radius:8px;padding:4px}figcaption{font:700 18px Georgia,serif;margin:8px;color:#f1d397}@media(max-width:800px){.row{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:500px){.row{grid-template-columns:1fr}}</style><main><h1>Remaining crossing portraits</h1><p>Twenty Tier II–V concepts for review. These five crossings are not installed in the game. <a href="contact-sheet.png">Full progression sheet</a> · <a href="style-audit.png">Compare Tier V with locked art</a>.</p>${sections}</main></html>`
  fs.writeFileSync(path.join(root, 'index.html'), html)
  console.log('Prepared 20 review-only crossing portraits and comparison sheets')
}

mainTask().catch(error => { console.error(error); process.exitCode = 1 })
