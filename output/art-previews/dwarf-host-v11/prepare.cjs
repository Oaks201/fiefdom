const fs = require('node:fs')
const path = require('node:path')
const sharp = require(process.argv[2] || 'sharp')

const root = __dirname
const entries = [
  ['thunderers', 'Thunderers', 'Unchanged'],
  ['ironbreakers', 'Ironbreakers', 'Unchanged'],
  ['runePriests', 'Rune Priests', 'Unchanged'],
  ['hammerers', 'Hammerers', 'Helm and fixed hammer'],
  ['anvilGuard', 'The Anvil Guard', 'Slightly angled anvil shield']
]

async function main() {
  for (const directory of ['portraits', 'tokens', 'icons']) fs.mkdirSync(path.join(root, directory), { recursive: true })
  for (const [id] of entries) {
    const source = path.join(root, 'sources', `${id}.png`)
    const meta = await sharp(source).metadata()
    if (!meta.hasAlpha || meta.width < 512 || meta.height < 512) throw new Error(`Invalid transparent source: ${id}`)
    const side = Math.min(meta.width, meta.height)
    const left = Math.floor((meta.width - side) / 2)
    const top = Math.floor((meta.height - side) / 2)
    const portrait = path.join(root, 'portraits', `${id}.png`)
    await sharp(source).extract({ left, top, width: side, height: side })
      .resize(512, 512, { kernel: 'lanczos3' }).png().toFile(portrait)
    for (const [size, directory] of [[128, 'tokens'], [48, 'icons']]) {
      await sharp(portrait).resize(size, size, { kernel: 'lanczos3' }).png()
        .toFile(path.join(root, directory, `${id}.png`))
    }
  }

  const cards = entries.map(([id, name, note]) => `<article><h2>${name}</h2><p>${note}</p><a href="portraits/${id}.png"><img class="portrait" src="portraits/${id}.png" alt="${name} portrait"></a><div class="small"><figure><img src="tokens/${id}.png" width="96" height="96" alt="${name} map token"><figcaption>Map token</figcaption></figure><figure><img src="icons/${id}.png" width="48" height="48" alt="${name} icon"><figcaption>Small icon</figcaption></figure></div></article>`).join('')
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fiefdom · Dwarf Host concepts</title><style>*{box-sizing:border-box}body{margin:0;background:#171d20;color:#f1ead9;font:16px system-ui}main{max-width:1460px;margin:auto;padding:28px}h1,h2{font-family:Georgia,serif;color:#f1d397}h1{font-size:34px;margin:0 0 8px}h2{font-size:23px;margin:0}.lede{max-width:850px;color:#cbd1c9;line-height:1.5}.grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:15px;margin-top:28px}article{min-width:0;background:#252d30;border:1px solid #52615a;border-radius:13px;padding:14px}article p{color:#b8c8bb;font-size:13px;margin:5px 0}.portrait{display:block;width:100%;aspect-ratio:1;object-fit:contain;background:#30393c;border-radius:8px}.small{display:flex;justify-content:space-around;align-items:end;padding-top:10px}.small figure{margin:0;text-align:center}.small img{display:block;object-fit:contain;margin:auto}.small figcaption{font-size:12px;color:#bac6bb;margin-top:4px}a{color:#f1d397}@media(max-width:1100px){.grid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:650px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:430px){.grid{grid-template-columns:1fr}}</style><main><h1>Dwarf Host · revised concepts</h1><p class="lede">Hammerers and The Anvil Guard are revised. Thunderers, Ironbreakers, and Rune Priests are unchanged. Portraits, map tokens, and small icons are shown for review only; no game assets were replaced. <a href="contact-sheet.png">Open the one-page overview.</a></p><div class="grid">${cards}</div></main></html>`
  fs.writeFileSync(path.join(root, 'index.html'), html)

  const tileWidth = 270, tileHeight = 350, gap = 16, pad = 25, header = 100
  const width = pad * 2 + tileWidth * entries.length + gap * (entries.length - 1)
  const height = header + pad + tileHeight + pad
  const svg = text => Buffer.from(text)
  const layers = [{ input: svg(`<svg width="${width}" height="${header}"><text x="25" y="49" font-family="Georgia" font-size="36" font-weight="bold" fill="#f1d397">Fiefdom · Dwarf Host</text><text x="27" y="79" font-family="Arial" font-size="17" fill="#becac0">Two revised portraits · three unchanged companions</text></svg>`), left: 0, top: 0 }]
  for (let index = 0; index < entries.length; index++) {
    const [id, name, note] = entries[index]
    const x = pad + index * (tileWidth + gap)
    const y = header + pad
    layers.push({ input: { create: { width: tileWidth, height: tileHeight, channels: 4, background: '#273032' } }, left: x, top: y })
    layers.push({ input: await sharp(path.join(root, 'portraits', `${id}.png`)).resize(240, 240).png().toBuffer(), left: x + 15, top: y + 12 })
    layers.push({ input: svg(`<svg width="${tileWidth}" height="70"><text x="14" y="23" font-family="Georgia" font-size="${name.length > 15 ? 19 : 22}" font-weight="bold" fill="#f1d397">${name}</text><text x="14" y="47" font-family="Arial" font-size="13" fill="#b8c8bb">${note}</text></svg>`), left: x, top: y + 256 })
    layers.push({ input: await sharp(path.join(root, 'icons', `${id}.png`)).png().toBuffer(), left: x + 206, top: y + 288 })
  }
  await sharp({ create: { width, height, channels: 4, background: '#171d20' } })
    .composite(layers).png().toFile(path.join(root, 'contact-sheet.png'))
  console.log('Prepared five Dwarf Host portraits, tokens, icons, and contact sheet')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
