// Install the reviewed green-and-silver company art and the rival dominion portraits.
// Usage: node scripts/install-green-silver-army-and-rival-backdrops.cjs <sharp-module-path>
const fs = require('node:fs')
const path = require('node:path')
const sharp = require(process.argv[2] || 'sharp')

const root = path.resolve(__dirname, '..')
const assets = path.join(root, 'src/renderer/public/game-assets')
const manifestPath = path.join(assets, 'manifest.json')
const companies = path.join(root, 'output/art-previews/player-army-colors-v1')
const rivals = path.join(root, 'output/art-previews/rival-dominion-backdrops-v5')
const companyIds = [
  'militia', 'menAtArms', 'pikemen', 'knights', 'champions',
  'watchmen', 'sellswords', 'caravanGuard', 'freeLances', 'gildedHost',
  'hedgeWardens', 'acolytes', 'wardens', 'magi', 'archmagi',
  'palisadeCrew', 'crossbowmen', 'ballistaCrew', 'trebuchetBattery', 'ironColossus'
]
const rivalIds = ['orc', 'goblin', 'archmage', 'dwarf']
const moods = ['calm', 'angry', 'humbled']

async function requirePng(file, width, height) {
  if (!fs.existsSync(file)) throw new Error(`Missing asset: ${file}`)
  const meta = await sharp(file).metadata()
  if (meta.format !== 'png' || meta.width !== width || meta.height !== height || !meta.hasAlpha) {
    throw new Error(`${file}: expected transparent ${width} × ${height} PNG`)
  }
}

function requireSlot(manifest, id, kind, width, height) {
  const entry = manifest[id]
  if (entry?.kind !== kind || entry.size?.[0] !== width || entry.size?.[1] !== height) {
    throw new Error(`${id}: unexpected manifest slot`)
  }
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const work = []
  for (const id of companyIds) for (const [kind, size] of [['portrait', 512], ['token', 128]]) {
    const slot = `company.${id}.${kind}`
    const source = path.join(companies, `${id}-${size}.png`)
    const file = `company.${id}.${kind}-green-silver-v1.png`
    requireSlot(manifest, slot, kind, size, size)
    await requirePng(source, size, size)
    work.push({ slot, source, file })
  }
  for (const id of rivalIds) for (const mood of moods) {
    const slot = `rival.${id}.${mood}`
    const source = path.join(rivals, `${id}-${mood}-512x640.png`)
    const file = `rival.${id}.${mood}-dominion-v5.png`
    requireSlot(manifest, slot, 'rival', 512, 640)
    await requirePng(source, 512, 640)
    work.push({ slot, source, file })
  }
  const bannerSource = path.join(companies, 'banner-green-silver-source.png')
  const bannerFile = 'banner.player-green-silver-v1.png'
  requireSlot(manifest, 'banner.player', 'banner', 256, 512)
  if (!fs.existsSync(bannerSource) || !(await sharp(bannerSource).metadata()).hasAlpha) {
    throw new Error('Missing transparent green-and-silver banner source')
  }

  for (const item of work) {
    fs.copyFileSync(item.source, path.join(assets, item.file))
    manifest[item.slot].file = item.file
  }
  await sharp(bannerSource).resize(256, 512, { fit: 'contain', background: '#00000000', kernel: 'lanczos3' })
    .png().toFile(path.join(assets, bannerFile))
  manifest['banner.player'].file = bannerFile
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  console.log(`Installed ${companyIds.length} company portrait/token pairs, ${rivalIds.length * moods.length} rival portraits, and the player banner.`)
}

main().catch(error => { console.error(error); process.exitCode = 1 })
