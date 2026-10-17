const fs = require('node:fs')
const path = require('node:path')
const sharp = require(process.argv[2] || 'sharp')

const root = __dirname
const earlier = path.resolve(root, '../orc-host-v3')
const assets = path.resolve(root, '../../../src/renderer/public/game-assets')
const manifest = JSON.parse(fs.readFileSync(path.join(assets, 'manifest.json'), 'utf8'))
const units = [
  { id: 'grunts', name: 'Grunts', note: 'Warm mid-olive skin and plain stitched leathers' },
  { id: 'wolfRiders', name: 'Wolf Riders', note: 'Slightly cool olive skin, mohawk and prowling wolf' },
  { id: 'shamans', name: 'Shamans', note: 'Dark olive skin and glowing runes preserved' },
  { id: 'brutes', name: 'Brutes', note: 'Earthy olive skin and black eye paint preserved' },
  { id: 'ugraksWarboss', name: "Ugrak's Warboss", note: 'Mid olive skin, manticore pelt and aligned tusk bands' }
]
const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])

async function main() {
  for (const dir of ['portraits', 'tokens', 'icons']) fs.mkdirSync(path.join(root, dir), { recursive: true })
  for (const { id } of units) {
    const source = path.join(root, 'sources', `${id}.png`)
    const meta = await sharp(source).metadata()
    if (meta.width !== meta.height || !meta.hasAlpha) throw new Error(`${id} is not a transparent square`)
    const portrait = path.join(root, 'portraits', `${id}.png`)
    await sharp(source).resize(512, 512, { kernel: 'lanczos3' }).png().toFile(portrait)
    await sharp(portrait).resize(128, 128, { kernel: 'lanczos3' }).png().toFile(path.join(root, 'tokens', `${id}.png`))
    await sharp(portrait).resize(48, 48, { kernel: 'lanczos3' }).png().toFile(path.join(root, 'icons', `${id}.png`))
  }

  const warlordFile = manifest['rival.orc.calm'].file
  const warlordUrl = `../../../src/renderer/public/game-assets/${warlordFile}`
  const cards = units.map(({ id, name, note }) => `<article><h2>${esc(name)}</h2><p>${esc(note)}</p><div class="images"><figure><img src="${esc(path.relative(root, path.join(earlier, 'portraits', `${id}.png`)).replace(/\\/g, '/'))}" alt="Earlier ${esc(name)} concept"><figcaption>Before</figcaption></figure><figure><a href="portraits/${id}.png"><img src="portraits/${id}.png" alt="Revised ${esc(name)} concept"></a><figcaption>Revised</figcaption></figure></div><div class="sizes"><img src="tokens/${id}.png" width="96" height="96" alt="${esc(name)} token"><img src="icons/${id}.png" width="48" height="48" alt="${esc(name)} small icon"><span>Map token and small icon</span></div></article>`).join('')
  fs.writeFileSync(path.join(root, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Orc host clan colors · Fiefdom</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#171c1f;color:#f0e7d5;font:16px system-ui}main{max-width:1320px;margin:auto;padding:28px}h1,h2{font-family:Georgia,serif;color:#f0cd8d}h1{font-size:34px;margin:0 0 8px}h2{font-size:24px;margin:0}p{line-height:1.5;color:#cbd2c9}a{color:#efd08f}.intro{max-width:980px}.context{display:flex;align-items:center;gap:18px;padding:14px;background:#2a3030;border-radius:12px;max-width:700px;margin:24px 0}.context img{width:140px;height:175px;object-fit:contain}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:16px}article{padding:16px;background:#262e2f;border:1px solid #59655c;border-radius:13px}article p{font-size:13px;margin:5px 0 12px;min-height:40px}.images{display:grid;grid-template-columns:1fr 1fr;gap:10px}.images figure{margin:0;text-align:center;background:#343c3d;border-radius:8px;padding:8px}.images img{display:block;width:100%;aspect-ratio:1;object-fit:contain}.images figcaption{font-weight:700;margin:6px 0}.sizes{display:flex;align-items:end;gap:12px;margin-top:12px}.sizes img{object-fit:contain}.sizes span{font-size:12px;color:#bac6bd}@media(max-width:450px){.grid{grid-template-columns:1fr}.context img{width:100px;height:130px}}</style></head><body><main><h1>Orc host · clan colors</h1><p class="intro">The skin-tone range is dialed back so the host feels like one clan. The Warboss's tusk bands are also realigned. This gallery compares the latest portraits with the prior pass at map-token size. Concepts are staged for review and have not replaced the game art. <a href="contact-sheet.png">Open the one-page lineup</a>.</p><div class="context"><img src="${warlordUrl}" alt="Approved Orc Warlord"><div><h2>Orc Warlord reference</h2><p>The existing rival portrait, shown here to compare the host's faces and skin tones.</p></div></div><div class="grid">${cards}</div></main></body></html>`)

  const tileW = 330, tileH = 370, gap = 20, pad = 28, header = 86
  const width = pad * 2 + tileW * 3 + gap * 2
  const height = header + pad + tileH * 2 + gap + pad
  const comps = []
  const render = async (file, w, h) => sharp(file).resize(w, h, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
  const addCard = async (index, name, file, iconFile) => {
    const x = pad + (index % 3) * (tileW + gap)
    const y = header + pad + Math.floor(index / 3) * (tileH + gap)
    comps.push({ input: { create: { width: tileW, height: tileH, channels: 4, background: '#283132' } }, left: x, top: y })
    comps.push({ input: await render(file, 286, 286), left: x + 22, top: y + 8 })
    const fontSize = name.length > 15 ? 21 : 25
    const label = Buffer.from(`<svg width="${tileW}" height="66"><text x="12" y="27" font-family="Georgia" font-size="${fontSize}" font-weight="bold" fill="#f0cd8d">${esc(name)}</text><text x="12" y="49" font-family="Arial" font-size="14" fill="#bac7bb">${index === 0 ? 'Approved rival reference' : 'Revised host concept'}</text></svg>`)
    comps.push({ input: label, left: x, top: y + 294 })
    if (iconFile) comps.push({ input: await sharp(iconFile).png().toBuffer(), left: x + tileW - 58, top: y + tileH - 58 })
  }
  await addCard(0, 'Orc Warlord', path.join(assets, warlordFile))
  for (let i = 0; i < units.length; i++) {
    const { id, name } = units[i]
    await addCard(i + 1, name, path.join(root, 'portraits', `${id}.png`), path.join(root, 'icons', `${id}.png`))
  }
  const title = Buffer.from(`<svg width="${width}" height="${header}"><text x="28" y="47" font-family="Georgia" font-size="37" font-weight="bold" fill="#f0cd8d">Fiefdom · Orc host clan colors</text><text x="29" y="74" font-family="Arial" font-size="16" fill="#b8c4b9">Five coordinated portraits beside the approved Orc Warlord · staged for review</text></svg>`)
  await sharp({ create: { width, height, channels: 4, background: '#171c1f' } }).composite([{ input: title, left: 0, top: 0 }, ...comps]).png().toFile(path.join(root, 'contact-sheet.png'))
  console.log('Prepared five Orc portraits, tokens, icons, gallery and contact sheet')
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
