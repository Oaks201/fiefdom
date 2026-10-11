// Install approved starter-company portraits and tokens from an imagegen batch.
// Usage: node scripts/install-starter-companies.cjs <batch.json> <sharp-module-path>
const fs = require('node:fs')
const path = require('node:path')
const sharp = require(process.argv[3] || 'sharp')

const root = path.resolve(__dirname, '..')
const assets = path.join(root, 'src/renderer/public/game-assets')
const archive = path.join(root, 'docs/game/art/superseded/starter-companies-before-v4')
const manifestPath = path.join(assets, 'manifest.json')
const ids = new Set(['watchmen', 'palisadeCrew', 'militia', 'hedgeWardens'])

async function main() {
  if (!process.argv[2]) throw new Error('Batch JSON required')
  const batch = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
  if (batch.length !== ids.size || new Set(batch.map(x => x.id)).size !== ids.size || batch.some(x => !ids.has(x.id))) throw new Error('Expected the four starter companies')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const moves = []
  for (const item of batch) {
    const source = path.resolve(item.source)
    const meta = await sharp(source).metadata()
    if (!meta.hasAlpha || meta.width !== meta.height) throw new Error(`${item.id}: square transparent source required`)
    const logical = await sharp(source).resize(256, 256, {
      fit: 'contain', kernel: 'nearest', background: { r: 0, g: 0, b: 0, alpha: 0 }
    }).png().toBuffer()
    const targets = [
      { kind: 'portrait', size: 512 },
      { kind: 'token', size: 128 }
    ]
    for (const target of targets) {
      const slot = `company.${item.id}.${target.kind}`
      const previous = manifest[slot]?.file
      if (!previous || manifest[slot].size[0] !== target.size || manifest[slot].size[1] !== target.size) throw new Error(`${slot}: bad manifest entry`)
      const file = `${slot}-revised-${item.revision || 'v4'}.png`
      if (previous === file) {
        console.log(`${slot}: already installed`)
        continue
      }
      await sharp(logical).resize(target.size, target.size, { kernel: 'nearest' }).png().toFile(path.join(assets, file))
      const image = await sharp(path.join(assets, file)).metadata()
      const alpha = (await sharp(path.join(assets, file)).stats()).channels[3]
      if (!image.hasAlpha || image.width !== target.size || image.height !== target.size || alpha.min !== 0 || alpha.max !== 255) throw new Error(`${slot}: invalid output`)
      moves.push({ from: path.join(assets, previous), to: path.join(archive, previous) })
      manifest[slot].file = file
      console.log(`${slot}: ${target.size}x${target.size}, transparent`)
    }
  }
  fs.mkdirSync(archive, { recursive: true })
  for (const move of moves) {
    if (path.dirname(path.resolve(move.from)) !== assets || path.dirname(path.resolve(move.to)) !== archive) throw new Error('Invalid archive path')
    if (!fs.existsSync(move.from) || fs.existsSync(move.to)) throw new Error(`Archive collision: ${move.to}`)
  }
  for (const move of moves) fs.renameSync(move.from, move.to)
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  console.log(`Archived ${moves.length} previous images and updated the manifest.`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
