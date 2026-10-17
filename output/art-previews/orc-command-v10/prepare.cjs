const fs = require('node:fs')
const path = require('node:path')
const sharp = require(process.argv[2] || 'sharp')

const root = __dirname
const host = path.resolve(root, '../orc-host-v4')
const assets = path.resolve(root, '../../../src/renderer/public/game-assets')
const oldWarlord = path.join(assets, 'rival.orc.calm-dominion-v5.png')
const units = [
  { id: 'warlord', name: 'Orc Warlord', source: path.join(root, 'sources', 'warlord.png'), shape: 'portrait' },
  { id: 'grunts', name: 'Grunts', source: path.join(host, 'portraits', 'grunts.png') },
  { id: 'wolfRiders', name: 'Wolf Riders', source: path.join(host, 'portraits', 'wolfRiders.png') },
  { id: 'shamans', name: 'Shamans', source: path.join(root, 'sources', 'shamans.png') },
  { id: 'brutes', name: 'Brutes', source: path.join(host, 'portraits', 'brutes.png') },
  { id: 'ugraksWarboss', name: "Ugrak's Warboss", source: path.join(host, 'portraits', 'ugraksWarboss.png') }
]
const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])

async function main() {
  for (const dir of ['portraits', 'tokens', 'icons']) fs.mkdirSync(path.join(root, dir), { recursive: true })
  for (const unit of units.filter(({ id }) => ['warlord', 'shamans'].includes(id))) {
    const meta = await sharp(unit.source).metadata()
    if (!meta.hasAlpha) throw new Error(`${unit.id}: expected transparent source`)
    if (unit.id === 'warlord') {
      if (Math.abs(meta.width / meta.height - 0.8) > 0.02) throw new Error('Unexpected Warlord aspect ratio')
      await sharp(unit.source).resize(512, 640, { fit: 'fill', kernel: 'lanczos3' }).png().toFile(path.join(root, 'portraits', 'warlord.png'))
      await sharp(unit.source).resize(128, 160, { fit: 'fill', kernel: 'lanczos3' }).png().toFile(path.join(root, 'tokens', 'warlord.png'))
      await sharp(unit.source).resize(48, 60, { fit: 'fill', kernel: 'lanczos3' }).png().toFile(path.join(root, 'icons', 'warlord.png'))
    } else {
      if (meta.width !== meta.height) throw new Error('Unexpected Shaman aspect ratio')
      for (const [dir, size] of [['portraits', 512], ['tokens', 128], ['icons', 48]]) {
        await sharp(unit.source).resize(size, size, { kernel: 'lanczos3' }).png().toFile(path.join(root, dir, 'shamans.png'))
      }
    }
  }

  const showcase = units.map(({ id, name }) => {
    const file = id === 'warlord' || id === 'shamans' ? `portraits/${id}.png` : `../orc-host-v4/portraits/${id}.png`
    const token = id === 'warlord' || id === 'shamans' ? `tokens/${id}.png` : `../orc-host-v4/tokens/${id}.png`
    return `<figure class="unit"><img class="portrait" src="${file}" alt="${esc(name)} portrait"><figcaption>${esc(name)}</figcaption><img class="token" src="${token}" width="64" alt="${esc(name)} small preview"></figure>`
  }).join('')
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Orc Warlord and Shaman · Fiefdom</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#171c1f;color:#f0e8d7;font:16px system-ui}main{max-width:1430px;margin:auto;padding:28px}h1,h2{font-family:Georgia,serif;color:#f1cd8f}h1{font-size:34px;margin:0 0 8px}h2{font-size:26px;margin:32px 0 14px}p{max-width:940px;line-height:1.5;color:#cbd3cb}a{color:#f1cd8f}.pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;max-width:800px}.pair figure,.unit{margin:0;padding:14px;background:#283133;border:1px solid #56645a;border-radius:12px;text-align:center}.pair img{display:block;width:100%;max-width:300px;height:375px;object-fit:contain;margin:auto}.pair figcaption,.unit figcaption{font:700 20px Georgia,serif;color:#f1cd8f;margin:8px 0}.roster{display:grid;grid-template-columns:repeat(auto-fill,minmax(195px,1fr));gap:14px}.unit .portrait{display:block;width:100%;height:255px;object-fit:contain;margin:auto}.unit .token{display:block;height:70px;object-fit:contain;margin:auto}@media(max-width:600px){.pair{grid-template-columns:1fr}}
  </style></head><body><main><h1>Orc Warlord · bone circlet and mythic pelts</h1><p>The Warlord has returned to a low circlet-style crown, now carved from bone. The mythic beast pelts remain over his shoulders. The lighter Shaman and the rest of the clan are shown below. These are review concepts; the live game art has not been replaced. <a href="contact-sheet.png">Open the one-page lineup</a>.</p><h2>Warlord: bone crown comparison</h2><div class="pair"><figure><img src="../orc-command-v9/portraits/warlord.png" alt="Previous Warlord with tall bone crown"><figcaption>Previous tall bone crown</figcaption></figure><figure><a href="portraits/warlord.png"><img src="portraits/warlord.png" alt="New Warlord with bone circlet and mythic pelts"></a><figcaption>Bone circlet and mythic pelts</figcaption></figure></div><h2>Orc host together</h2><div class="roster">${showcase}</div></main></body></html>`
  fs.writeFileSync(path.join(root, 'index.html'), html)

  const width = 1120, height = 900, cardW = 340, cardH = 365, gap = 22, leftPad = 29, top = 95
  const layers = []
  const display = async (file) => sharp(file).resize(300, 287, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
  for (let i = 0; i < units.length; i++) {
    const { id, name, source } = units[i]
    const x = leftPad + (i % 3) * (cardW + gap)
    const y = top + Math.floor(i / 3) * (cardH + gap)
    const portrait = id === 'warlord' || id === 'shamans' ? path.join(root, 'portraits', `${id}.png`) : source
    layers.push({ input: { create: { width: cardW, height: cardH, channels: 4, background: '#283133' } }, left: x, top: y })
    layers.push({ input: await display(portrait), left: x + 20, top: y + 6 })
    const font = name.length > 15 ? 20 : 24
    layers.push({ input: Buffer.from(`<svg width="${cardW}" height="60"><text x="14" y="27" font-family="Georgia" font-size="${font}" font-weight="bold" fill="#f1cd8f">${esc(name)}</text><text x="14" y="47" font-family="Arial" font-size="13" fill="#bdc9bd">${id === 'warlord' || id === 'shamans' ? 'New concept' : 'Kept from Orc host v4'}</text></svg>`), left: x, top: y + 297 })
  }
  const header = Buffer.from(`<svg width="${width}" height="${top}"><text x="29" y="48" font-family="Georgia" font-size="38" font-weight="bold" fill="#f1cd8f">Fiefdom · Orc command</text><text x="30" y="75" font-family="Arial" font-size="16" fill="#bdc9bd">New Warlord and lighter Shaman with the rest of the clan · for review</text></svg>`)
  await sharp({ create: { width, height, channels: 4, background: '#171c1f' } }).composite([{ input: header, left: 0, top: 0 }, ...layers]).png().toFile(path.join(root, 'contact-sheet.png'))
  console.log('Prepared Warlord and Shaman portraits with Orc host preview')
}

main().catch((error) => { console.error(error); process.exitCode = 1 })





