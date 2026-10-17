const fs = require('node:fs')
const path = require('node:path')
const sharp = require('C:/Users/lykin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp')

const root = __dirname
const portraits = path.join(root, 'portraits')
const icons = path.join(root, 'icons')
const approved = path.resolve(root, '../player-main-paths-redesign-v5/portraits')
fs.mkdirSync(portraits, { recursive: true })
fs.mkdirSync(icons, { recursive: true })

async function main() {
  const names = ['player_t1.png', ...[2, 3, 4, 5].map(tier => `player_t${tier}_dwarf-orc.png`)]
  for (const name of names) {
    const source = name === 'player_t1.png' ? path.join(approved, name) : path.join(root, 'sources', name)
    await sharp(source).resize(512, 640, { fit: 'fill', kernel: 'lanczos3' }).png().toFile(path.join(portraits, name))
    await sharp(path.join(portraits, name)).resize(150, 188).png().toFile(path.join(icons, name))
  }

  const labels = ['Shared Tier I', 'Tier II', 'Tier III', 'Tier IV', 'Tier V']
  const cards = names.map((name, index) => `<figure><a href="portraits/${name}"><img class="portrait" src="portraits/${name}" alt="${labels[index]} portrait"></a><figcaption>${labels[index]}</figcaption><img class="icon" src="icons/${name}" alt="${labels[index]} at audience size"></figure>`).join('')
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fiefdom · Barracks × Foundry trial</title><style>*{box-sizing:border-box}body{margin:0;background:#171e1d;color:#eee9db;font:16px system-ui}main{max-width:1500px;margin:auto;padding:24px}h1{font-family:Georgia,serif;color:#f1d397}p{line-height:1.5}a{color:#f1d397}.row{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:14px}figure{margin:0;padding:10px;background:#25302d;border:1px solid #53655a;border-radius:10px;text-align:center}.portrait{width:100%;height:auto;display:block}.icon{display:block;width:150px;height:188px;object-fit:contain;margin:12px auto 0;background:#f5e8c9;border:3px solid #28704e;border-radius:8px;padding:4px}figcaption{font:700 18px Georgia,serif;margin:8px;color:#f1d397}@media(max-width:900px){.row{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:500px){.row{grid-template-columns:1fr}}</style><main><h1>Barracks × Foundry · trial progression</h1><p>Shared noble → military workshop → fortified smithy → forge bastion → mountain arsenal. This crossing is a review concept and has not been installed in the game. <a href="contact-sheet.png">Open the shareable comparison image</a> · <a href="../player-main-paths-redesign-v5/index.html">Compare the approved main paths</a>.</p><div class="row">${cards}</div></main></html>`
  fs.writeFileSync(path.join(root, 'index.html'), html)

  const width = 1500, height = 475
  const layers = [{ input: Buffer.from(`<svg width="1500" height="90"><text x="34" y="49" font-family="Georgia" font-size="34" font-weight="bold" fill="#f1d397">Barracks × Foundry · first crossing trial</text><text x="36" y="79" font-family="Arial" font-size="17" fill="#cbd7ce">Shared Tier I → Tier II → Tier III → Tier IV → Tier V · Review concept</text></svg>`), left: 0, top: 0 }]
  for (let i = 0; i < names.length; i++) {
    const left = 32 + 295 * i
    layers.push({ input: { create: { width: 270, height: 355, channels: 4, background: '#25302d' } }, left, top: 96 })
    layers.push({ input: await sharp(path.join(portraits, names[i])).resize(248, 310).png().toBuffer(), left: left + 11, top: 102 })
    layers.push({ input: Buffer.from(`<svg width="270" height="36"><text x="12" y="27" font-family="Georgia" font-size="19" font-weight="bold" fill="#f1d397">${labels[i]}</text></svg>`), left, top: 413 })
  }
  await sharp({ create: { width, height, channels: 4, background: '#171e1d' } }).composite(layers).png().toFile(path.join(root, 'contact-sheet.png'))
  console.log('Prepared crossing trial', names)
}

main().catch(error => { console.error(error); process.exitCode = 1 })
