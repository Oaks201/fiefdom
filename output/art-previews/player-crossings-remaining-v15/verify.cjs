const fs = require('node:fs')
const path = require('node:path')
const sharp = require('C:/Users/lykin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp')

async function main() {
  const root = __dirname
  const pairs = ['dwarf-goblin', 'dwarf-mage', 'goblin-mage', 'goblin-orc', 'mage-orc']
  for (const pair of pairs) for (let tier = 2; tier <= 5; tier++) {
    const name = `player_t${tier}_${pair}.png`
    for (const [folder, width, height] of [['portraits', 512, 640], ['icons', 150, 188]]) {
      const file = path.join(root, folder, name)
      if (!fs.existsSync(file)) throw new Error(`Missing ${file}`)
      const meta = await sharp(file).metadata()
      if (meta.width !== width || meta.height !== height || !meta.hasAlpha) throw new Error(`Invalid ${file}: ${meta.width}x${meta.height}, alpha ${meta.hasAlpha}`)
    }
  }
  console.log('Verified 20 portraits at 512×640 and 20 audience previews at 150×188, all with alpha')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
