const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const sharp = require('C:/Users/lykin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp')

const root = __dirname
const groups = [
  ['crossing-companies-stage-i-v3', ['ironclads','spellblades','beastcatchers','clayGolems','warWagons','alchemists']],
  ['crossing-companies-stage-ii-v3', ['cataphracts','battlemages','rangers','runeGolems','bombardBattery','illusionists']],
  ['crossing-companies-stage-iii-v4', ['ironLegion','knightsOfTheVeil','royalHunt','runeforgedTitans','dragonfireBattery','shadowCourt']]
]
const digest = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')

async function main() {
  for (const [dir, ids] of groups) for (const id of ids) {
    for (const [kind, size] of [['portraits',512],['tokens',128],['icons',48]]) {
      const file = path.resolve(root, '..', dir, kind, `${id}.png`)
      const m = await sharp(file).metadata()
      if (m.width !== size || m.height !== size || !m.hasAlpha) throw Error(`${file}: expected transparent ${size}×${size}`)
    }
  }
  const original = path.resolve(root, '../../../src/renderer/public/game-assets/company.runeGolems.portrait-early-v3.png')
  const preserved = path.resolve(root, '../crossing-companies-stage-ii-v2/sources/runeGolems.png')
  const clearer = path.resolve(root, '../crossing-companies-stage-ii-v3/sources/runeGolems.png')
  if (digest(original) !== digest(preserved)) throw Error('Approved Rune Golem source changed')
  if (digest(original) === digest(clearer)) throw Error('Missing Rune Golem clarity pass')
  for (const file of ['contact-sheet.png','index.html']) if (!fs.existsSync(path.join(root,file))) throw Error(`Missing ${file}`)
  console.log('Verified 18 portraits (512px), tokens (128px), and icons (48px), all with alpha; approved in-game Rune Golem source preserved')
}
main().catch(e => { console.error(e); process.exitCode = 1 })
