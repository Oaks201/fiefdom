// Install a reviewed generation batch using the game's existing pixel-art sizing.
// Usage: node scripts/install-rival-art.cjs <batch.json> <sharp-module-path>
const fs = require('node:fs')
const path = require('node:path')
const sharp = require(process.argv[3] || 'sharp')
const root = path.resolve(__dirname, '..')
const assets = path.join(root, 'src/renderer/public/game-assets')
const manifestPath = path.join(assets, 'manifest.json')

async function main() {
  const batch = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  for (const item of batch) {
    if (!/^rival\.(orc|goblin|dwarf|archmage)\.(calm|angry|humbled)$/.test(item.slot)) throw new Error('Invalid slot')
    const file = `${item.slot}-revised-v4.png`
    const sourceMeta = await sharp(item.source).metadata()
    if (!sourceMeta.hasAlpha) throw new Error(`${item.slot}: missing transparency`)
    const logical = await sharp(item.source).resize(256, 320, {
      fit: 'contain', kernel: 'nearest', background: { r: 0, g: 0, b: 0, alpha: 0 }
    }).png().toBuffer()
    await sharp(logical).resize(512, 640, { kernel: 'nearest' }).png().toFile(path.join(assets, file))
    const stats = await sharp(path.join(assets, file)).stats()
    if (stats.channels[3].min !== 0 || stats.channels[3].max !== 255) throw new Error(`${item.slot}: invalid alpha`)
    manifest[item.slot].file = file
    console.log(`${item.slot}: 512x640, transparent`)
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  const galleryDir = path.join(root, 'docs/game/art/rivals-v4')
  fs.mkdirSync(galleryDir, { recursive: true })
  const names = { orc: 'Orc', goblin: 'Goblin', dwarf: 'Dwarf', archmage: 'Mage' }
  const rows = Object.entries(names).map(([id, name]) => `<section><h2>${name}</h2><div class="portraits">${['calm', 'angry', 'humbled'].map(mood => `<figure><img src="../../../../src/renderer/public/game-assets/${manifest[`rival.${id}.${mood}`].file}" alt="${name}, ${mood}"><figcaption>${mood}</figcaption></figure>`).join('')}</div></section>`).join('\n')
  fs.writeFileSync(path.join(galleryDir, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fiefdom rival portraits</title><style>body{margin:0;background:#211d1b;color:#efdfbb;font:16px system-ui;padding:24px}main{max-width:960px;margin:auto}h1{margin-top:0}h2{font-size:20px}.portraits{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}figure{margin:0;background:#302923;border:1px solid #645240;border-radius:8px;overflow:hidden}img{display:block;width:100%;height:auto;image-rendering:pixelated}figcaption{text-align:center;padding:12px;text-transform:capitalize;background:#191613}section{margin-bottom:28px}</style><main><h1>Rival portraits</h1><p>Calm, angry, and humbled — the complete revised set.</p>${rows}</main></html>`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
