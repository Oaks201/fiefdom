// Install the approved Mage Tower tier II–V portraits and tokens.
// Usage: node scripts/install-mage-tower-art.cjs <sharp-module-path>
const fs = require('node:fs')
const path = require('node:path')
const sharp = require(process.argv[2] || 'sharp')

const root = path.resolve(__dirname, '..')
const preview = path.join(root, 'output/art-previews/mage-tower-tiers-3-5-v9')
const assets = path.join(root, 'src/renderer/public/game-assets')
const manifestPath = path.join(assets, 'manifest.json')
const units = ['acolytes', 'wardens', 'magi', 'archmagi']

async function main() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const installs = []
  for (const id of units) {
    for (const [kind, size] of [['portrait', 512], ['token', 128]]) {
      const slot = `company.${id}.${kind}`
      const entry = manifest[slot]
      const file = `${slot}-approved-v1.png`
      const source = path.join(preview, `${id}-${size}.png`)
      const target = path.join(assets, file)
      if (!entry || entry.kind !== kind || entry.size[0] !== size || entry.size[1] !== size) {
        throw new Error(`${slot}: unexpected manifest entry`)
      }
      if (entry.file && entry.file !== file) throw new Error(`${slot}: already uses another asset`)
      const meta = await sharp(source).metadata()
      const alpha = (await sharp(source).stats()).channels[3]
      if (!meta.hasAlpha || meta.width !== size || meta.height !== size || alpha.min !== 0 || alpha.max < 250) {
        throw new Error(`${slot}: expected ${size}x${size} transparent PNG`)
      }
      if (fs.existsSync(target) && !fs.readFileSync(target).equals(fs.readFileSync(source))) {
        throw new Error(`${slot}: target file already has different contents`)
      }
      installs.push({ slot, file, source, target })
    }
  }

  for (const item of installs) {
    fs.copyFileSync(item.source, item.target)
    manifest[item.slot].file = item.file
    console.log(`${item.slot}: ${item.file}`)
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  console.log('Installed the four approved Mage Tower companies.')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
