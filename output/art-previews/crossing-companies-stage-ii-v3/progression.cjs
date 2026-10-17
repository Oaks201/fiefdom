const path = require('node:path')
const sharp = require('C:/Users/lykin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp')

const root = __dirname
const stageI = path.resolve(root, '../crossing-companies-stage-i-v3/portraits')
const stageII = path.join(root, 'portraits')
const lines = [
  ['Ironclads', 'Cataphracts', 'ironclads', 'cataphracts'],
  ['Spellblades', 'Battlemages', 'spellblades', 'battlemages'],
  ['Beastcatchers', 'Rangers', 'beastcatchers', 'rangers'],
  ['Clay Golems', 'Rune Golems', 'clayGolems', 'runeGolems'],
  ['War Wagons', 'Bombard Battery', 'warWagons', 'bombardBattery'],
  ['Alchemists', 'Illusionists', 'alchemists', 'illusionists']
]
const text = (width, height, entries) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${entries.map(([x,y,s,size=20])=>`<text x="${x}" y="${y}" font-family="Georgia" font-weight="bold" font-size="${size}" fill="#f2d696">${s}</text>`).join('')}</svg>`)

async function main() {
  const width = 1080, rowHeight = 235, height = 95 + rowHeight * lines.length
  const layers = [{ input: text(width, 85, [[24, 39, 'Fiefdom · crossing companies', 31], [26, 70, 'Stage I → Stage II · review concepts', 19]]), left: 0, top: 0 }]
  for (let row = 0; row < lines.length; row++) {
    const [nameI, nameII, idI, idII] = lines[row]
    const y = 95 + row * rowHeight
    for (const [col, name, file] of [[0, nameI, path.join(stageI, `${idI}.png`)], [1, nameII, path.join(stageII, `${idII}.png`)]]) {
      const x = 20 + col * 530
      layers.push({ input: { create: { width: 505, height: 220, channels: 4, background: '#26322e' } }, left: x, top: y })
      layers.push({ input: await sharp(file).resize(197, 197, { fit: 'contain' }).png().toBuffer(), left: x + 15, top: y + 12 })
      layers.push({ input: text(285, 75, [[6, 28, name, 21], [6, 56, col ? 'STAGE II' : 'STAGE I', 16]]), left: x + 215, top: y + 72 })
    }
  }
  await sharp({ create: { width, height, channels: 4, background: '#171e1d' } }).composite(layers).png().toFile(path.join(root, 'progression-sheet.png'))
  console.log('Prepared Stage I–II progression sheet')
}
main().catch(e => { console.error(e); process.exitCode = 1 })
