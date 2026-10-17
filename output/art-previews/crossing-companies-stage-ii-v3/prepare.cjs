const fs = require('node:fs')
const path = require('node:path')
const sharp = require('C:/Users/lykin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp')

const root = __dirname
const units = [
  ['cataphracts', 'Cataphracts', 'Barracks × Foundry'],
  ['battlemages', 'Battlemages', 'Barracks × Mage Tower'],
  ['rangers', 'Rangers', 'Barracks × Merchant Hall'],
  ['runeGolems', 'Rune Golems', 'Foundry × Mage Tower · clarity pass'],
  ['bombardBattery', 'Bombard Battery', 'Foundry × Merchant Hall'],
  ['illusionists', 'Illusionists', 'Mage Tower × Merchant Hall']
]
const reference = path.resolve(root, '../player-army-colors-v1')

function svg(width, height, lines) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${lines.map(([x, y, value, size = 20, fill = '#f2d696']) => `<text x="${x}" y="${y}" font-family="Georgia" font-weight="bold" font-size="${size}" fill="${fill}">${value.replaceAll('&', '&amp;')}</text>`).join('')}</svg>`)
}

async function sheet(name, cards, title, subtitle) {
  const width = 1590, height = 1060, layers = [
    { input: svg(width, 100, [[30, 45, title, 33], [31, 75, subtitle, 16, '#c8d1c8']]), left: 0, top: 0 }
  ]
  for (let i = 0; i < cards.length; i++) {
    const [file, label, note] = cards[i]
    const x = 24 + i % 3 * 522, y = 105 + Math.floor(i / 3) * 475
    layers.push({ input: { create: { width: 500, height: 455, channels: 4, background: '#26322e' } }, left: x, top: y })
    layers.push({ input: await sharp(file).resize(390, 390, { fit: 'contain' }).png().toBuffer(), left: x + 54, top: y + 7 })
    layers.push({ input: svg(485, 60, [[12, 29, label, 23], [12, 52, note, 14, '#d1d8d2']]), left: x + 8, top: y + 390 })
  }
  await sharp({ create: { width, height, channels: 4, background: '#171e1d' } }).composite(layers).png().toFile(path.join(root, name))
}

async function main() {
  for (const dir of ['portraits', 'tokens', 'icons']) fs.mkdirSync(path.join(root, dir), { recursive: true })
  for (const [id] of units) {
    const input = path.join(root, 'sources', `${id}.png`)
    await sharp(input).resize(512, 512, { fit: 'contain', background: '#00000000' }).png().toFile(path.join(root, 'portraits', `${id}.png`))
    await sharp(input).resize(128, 128, { fit: 'contain', background: '#00000000' }).png().toFile(path.join(root, 'tokens', `${id}.png`))
    await sharp(input).resize(48, 48, { fit: 'contain', background: '#00000000' }).png().toFile(path.join(root, 'icons', `${id}.png`))
  }
  await sheet('contact-sheet.png', units.map(([id, label, note]) => [path.join(root, 'portraits', `${id}.png`), label, note]), 'Fiefdom · Stage II crossing companies', 'Six review portraits · Rune Golem clarity pass · review concepts')
  await sheet('style-audit.png', [
    [path.join(reference, 'menAtArms-512.png'), 'Men-at-Arms', 'Approved Barracks style'],
    [path.join(reference, 'acolytes-512.png'), 'Acolytes', 'Approved Mage style'],
    [path.join(reference, 'ballistaCrew-512.png'), 'Ballista Crew', 'Approved Foundry style'],
    [path.join(root, 'portraits', 'cataphracts.png'), 'Cataphracts', 'New Stage II crossing'],
    [path.join(root, 'portraits', 'illusionists.png'), 'Illusionists', 'New Stage II crossing'],
    [path.join(root, 'portraits', 'bombardBattery.png'), 'Bombard Battery', 'New Stage II crossing']
  ], 'Fiefdom · crossing company style check', 'Approved units above · new Stage II units below · identical scale')
  const cards = units.map(([id, label, note]) => `<figure><a href="portraits/${id}.png"><img class="portrait" src="portraits/${id}.png" alt="${label}"></a><figcaption>${label}</figcaption><p>${note}</p><img class="token" src="tokens/${id}.png" alt="${label} token"><img class="icon" src="icons/${id}.png" alt="${label} at small icon size"></figure>`).join('')
  fs.writeFileSync(path.join(root, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fiefdom · Stage II crossing companies</title><style>*{box-sizing:border-box}body{margin:0;background:#171e1d;color:#eee9db;font:16px system-ui}main{max-width:1600px;margin:auto;padding:24px}h1{font:700 36px Georgia;color:#f2d696}a{color:#f2d696}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:15px;margin-top:25px}figure{margin:0;text-align:center;background:#26322e;border:1px solid #53655a;border-radius:10px;padding:14px}.portrait{display:block;width:100%;max-width:400px;margin:auto}.token{width:128px;height:128px;object-fit:contain;background:#f5e8c9;border:2px solid #28704e;border-radius:8px;margin:8px}.icon{width:48px;height:48px;object-fit:contain;background:#f5e8c9;border:2px solid #28704e;border-radius:5px;margin:8px}figcaption{font:700 21px Georgia;color:#f2d696}p{margin:8px 0;color:#c8d1c8}@media(max-width:800px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:540px){.grid{grid-template-columns:1fr}}</style><main><h1>Stage II crossing companies</h1><p>Review concepts only. The Rune Golem has a higher-clarity review version faithful to your approved design; no game art has been replaced. <a href="contact-sheet.png">Comparison sheet</a> · <a href="style-audit.png">Style comparison</a></p><div class="grid">${cards}</div></main></html>`)
  console.log(`Prepared ${units.length} crossing company portraits, tokens, icons and review sheets`)
}

main().catch(error => { console.error(error); process.exitCode = 1 })
