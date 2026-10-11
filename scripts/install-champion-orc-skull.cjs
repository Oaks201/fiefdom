// Install the Champion's orc-skull pauldron revision without replacing older art files.
// Usage: node scripts/install-champion-orc-skull.cjs <sharp-module-path>
const fs = require('node:fs')
const path = require('node:path')
const sharp = require(process.argv[2] || 'sharp')

const root = path.resolve(__dirname, '..')
const preview = path.join(root, 'output/art-previews/champion-orc-skull-v1')
const assets = path.join(root, 'src/renderer/public/game-assets')
const manifestPath = path.join(assets, 'manifest.json')

async function main() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const targets = [
    { kind: 'portrait', size: 512, file: 'company.champions.portrait-green-silver-orc-skull-v2.png' },
    { kind: 'token', size: 128, file: 'company.champions.token-green-silver-orc-skull-v2.png' }
  ]
  for (const target of targets) {
    const slot = `company.champions.${target.kind}`
    const entry = manifest[slot]
    const source = path.join(preview, `champion-${target.size}.png`)
    if (entry?.kind !== target.kind || entry.size?.[0] !== target.size || entry.size?.[1] !== target.size) {
      throw new Error(`${slot}: unexpected manifest entry`)
    }
    const meta = await sharp(source).metadata()
    if (meta.width !== target.size || meta.height !== target.size || !meta.hasAlpha) {
      throw new Error(`${source}: wrong size or transparency`)
    }
  }
  for (const target of targets) {
    fs.copyFileSync(path.join(preview, `champion-${target.size}.png`), path.join(assets, target.file))
    manifest[`company.champions.${target.kind}`].file = target.file
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  console.log('Installed Champion orc-skull portrait and token')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
