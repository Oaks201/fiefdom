// Verify the installed files and export actual 48px token previews.
// Usage: node check.cjs <sharp-module-path>
const fs = require('node:fs')
const path = require('node:path')
const sharp = require(process.argv[2] || 'sharp')

async function main() {
  const root = path.resolve(__dirname, '../../../..')
  const assets = path.join(root, 'src/renderer/public/game-assets')
  const manifest = JSON.parse(fs.readFileSync(path.join(assets, 'manifest.json'), 'utf8'))
  for (const id of ['watchmen', 'palisadeCrew', 'militia', 'hedgeWardens']) {
    for (const [kind, size] of [['portrait', 512], ['token', 128]]) {
      const slot = `company.${id}.${kind}`
      const entry = manifest[slot]
      const revision = id === 'palisadeCrew' ? 'v7' : 'v4'
      if (!entry?.file?.endsWith(`-revised-${revision}.png`) || entry.size[0] !== size || entry.size[1] !== size) throw Error(`${slot}: wrong manifest entry`)
      const file = path.join(assets, entry.file)
      const info = await sharp(file).metadata()
      const alpha = (await sharp(file).stats()).channels[3]
      if (info.width !== size || info.height !== size || !info.hasAlpha || alpha.min !== 0 || alpha.max !== 255) throw Error(`${slot}: wrong PNG size or transparency`)
    }
    await sharp(path.join(assets, manifest[`company.${id}.token`].file))
      .resize(48, 48, { kernel: 'nearest' })
      .png()
      .toFile(path.join(__dirname, `${id}-48.png`))
    console.log(`${id}: 512px portrait, 128px token, 48px preview OK`)
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
