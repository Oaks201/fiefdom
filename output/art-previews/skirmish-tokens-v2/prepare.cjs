const fs = require('node:fs')
const path = require('node:path')
const sharp = require(process.argv[2] || 'sharp')

const root = __dirname
const entries = [
  ['bears', 'Bears', 'Head-only brown bear'],
  ['wolves', 'Wolves', 'Howling gray wolf'],
  ['giantSpiders', 'Giant spiders', 'Colossal close-up'],
  ['villageMilitia', 'Village militia', 'Unchanged']
]

async function main() {
  for (const directory of ['tokens', 'icons']) fs.mkdirSync(path.join(root, directory), { recursive: true })
  for (const [id] of entries) {
    const source = path.join(root, 'sources', `${id}.png`)
    const meta = await sharp(source).metadata()
    if (!meta.hasAlpha || meta.width < 512 || meta.height < 512) throw new Error(`Invalid source: ${id}`)
    const side = Math.min(meta.width, meta.height)
    const left = Math.floor((meta.width - side) / 2)
    const top = Math.floor((meta.height - side) / 2)
    for (const [size, directory] of [[128, 'tokens'], [48, 'icons']]) {
      await sharp(source).extract({ left, top, width: side, height: side })
        .resize(size, size, { kernel: 'lanczos3' }).png()
        .toFile(path.join(root, directory, `${id}.png`))
    }
  }

  const cards = entries.map(([id, title, note]) => `<article><h2>${title}</h2><p>${note}</p><a href="sources/${id}.png"><img class="large" src="sources/${id}.png" alt="${title} source art"></a><div class="sizes"><figure><img src="tokens/${id}.png" width="128" height="128" alt="${title} token"><figcaption>128px map token</figcaption></figure><figure><img src="icons/${id}.png" width="48" height="48" alt="${title} small icon"><figcaption>48px check</figcaption></figure></div></article>`).join('')
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fiefdom · skirmish token concepts</title><style>*{box-sizing:border-box}body{margin:0;background:#171d20;color:#f1ead9;font:16px system-ui}main{max-width:1400px;margin:auto;padding:28px}h1,h2{font-family:Georgia,serif;color:#f1d397}h1{margin:0}p{color:#cbd1c9;line-height:1.5}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px;margin-top:25px}article{min-width:0;background:#252d30;border:1px solid #52615a;border-radius:13px;padding:15px}article h2{margin:0}article p{font-size:13px;margin:5px 0}.large{width:100%;aspect-ratio:1;object-fit:contain;background:#30393c;border-radius:8px}.sizes{display:flex;justify-content:space-around;align-items:end}.sizes figure{margin:12px 0 0;text-align:center}.sizes img{display:block;object-fit:contain;margin:auto;image-rendering:auto}.sizes figcaption{font-size:12px;color:#bac6bb;margin-top:6px}a{color:#f1d397}@media(max-width:900px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:500px){.grid{grid-template-columns:1fr}}</style><main><h1>Skirmish tokens · revised concepts</h1><p>Head-only bear, howling wolf and closer giant spider. Village militia is unchanged. Transparent sources are shown with 128px map tokens and 48px readability checks. These are for review; the game asset slots have not been replaced. <a href="contact-sheet.png">Open the one-page comparison.</a></p><div class="grid">${cards}</div></main>`
  fs.writeFileSync(path.join(root, 'index.html'), html)

  const tile = 280, gap = 16, pad = 24, header = 94
  const width = pad * 2 + entries.length * tile + (entries.length - 1) * gap
  const height = header + pad + tile + 100 + pad
  const svg = s => Buffer.from(s)
  const layers = [{ input: svg(`<svg width="${width}" height="${header}"><text x="24" y="48" font-family="Georgia" font-size="34" font-weight="bold" fill="#f1d397">Fiefdom · skirmish tokens</text><text x="26" y="75" font-family="Arial" font-size="16" fill="#becac0">Revised concepts · 128px map tokens and 48px checks</text></svg>`), left: 0, top: 0 }]
  for (let i = 0; i < entries.length; i++) {
    const [id, title, note] = entries[i]
    const x = pad + i * (tile + gap)
    const y = header + pad
    layers.push({ input: { create: { width: tile, height: tile + 100, channels: 4, background: '#273032' } }, left: x, top: y })
    layers.push({ input: await sharp(path.join(root, 'sources', `${id}.png`)).resize(260, 260).png().toBuffer(), left: x + 10, top: y + 9 })
    layers.push({ input: svg(`<svg width="${tile}" height="75"><text x="12" y="24" font-family="Georgia" font-size="22" font-weight="bold" fill="#f1d397">${title}</text><text x="12" y="48" font-family="Arial" font-size="14" fill="#becac0">${note}</text></svg>`), left: x, top: y + tile })
    layers.push({ input: await sharp(path.join(root, 'icons', `${id}.png`)).png().toBuffer(), left: x + 215, top: y + tile + 37 })
  }
  await sharp({ create: { width, height, channels: 4, background: '#171d20' } }).composite(layers).png().toFile(path.join(root, 'contact-sheet.png'))
  console.log('Prepared four skirmish token concepts')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
