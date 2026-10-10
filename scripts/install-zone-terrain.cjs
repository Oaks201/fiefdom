// Install approved regional hex tiles (D-09) from a Codex generation batch, sized like the map's
// existing pixel-art tiles:
//
//   node scripts/install-zone-terrain.cjs <batch.json> [path-to-sharp]
//
// batch.json lists [{ "slot": "hex.wilds.dwarf.near", "source": "<generated PNG>" }, …]; other
// fields (mode, prompt, references) are the generation record and are ignored here. Each image is
// cropped to its visible (non-transparent) pixels, fit into the 111 × 128 logical pixel canvas
// with nearest-neighbor sampling, doubled to 222 × 256, checked for real transparency, saved as
// src/renderer/public/game-assets/<slot>.png and set in manifest.json. Then the gallery,
// docs/game/art/zone-terrain/index.html, is rebuilt to show every regional tile installed so far.
const fs = require('node:fs')
const path = require('node:path')
const { parse } = require('./zone-terrain-prompts.cjs')

const ROOT = path.resolve(__dirname, '..')
const ASSETS = path.join(ROOT, 'src', 'renderer', 'public', 'game-assets')
const MANIFEST = path.join(ASSETS, 'manifest.json')
const DIR = path.join(ROOT, 'docs', 'game', 'art', 'zone-terrain')
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 }

/** The box around a raw RGBA image's visible pixels, or null when none is visible. */
function visibleBox({ data, info }) {
  let left = info.width
  let top = info.height
  let right = -1
  let bottom = -1
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * info.channels + 3] === 0) continue
      left = Math.min(left, x)
      right = Math.max(right, x)
      top = Math.min(top, y)
      bottom = Math.max(bottom, y)
    }
  }
  return right < 0 ? null : { left, top, width: right - left + 1, height: bottom - top + 1 }
}

/** Whether the four corners of `box` are see-through, as they are around a hexagon (not a painted background). */
function clearCorners({ data, info }, box) {
  const inset = 2
  const xs = [box.left + inset, box.left + box.width - 1 - inset]
  const ys = [box.top + inset, box.top + box.height - 1 - inset]
  return xs.every((x) => ys.every((y) => data[(y * info.width + x) * info.channels + 3] < 16))
}

async function install(sharp, item, tiles, manifest) {
  const tile = tiles.find((t) => t.slot === item.slot)
  if (!tile) throw new Error(`${item.slot}: not a regional tile in prompts.json`)
  const raw = await sharp(item.source).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const box = visibleBox(raw)
  if (!box) throw new Error(`${item.slot}: the image is fully transparent`)
  if (!clearCorners(raw, box)) throw new Error(`${item.slot}: the corners around the hexagon are not transparent; the generator painted a background`)
  const [lw, lh] = tile.logical
  const [w, h] = tile.size
  const logical = await sharp(item.source).ensureAlpha().extract(box).resize(lw, lh, { fit: 'contain', kernel: 'nearest', background: CLEAR }).png().toBuffer()
  const out = path.join(ASSETS, tile.file)
  await sharp(logical).resize(w, h, { kernel: 'nearest' }).png().toFile(out)
  const alpha = (await sharp(out).stats()).channels[3]
  if (alpha.min !== 0 || alpha.max !== 255) throw new Error(`${item.slot}: expected see-through corners and a solid hexagon (alpha ${alpha.min} to ${alpha.max})`)
  manifest[tile.slot] = { file: tile.file, kind: 'hex', size: [w, h] }
  console.log(`${tile.slot}: ${tile.file}, ${w} × ${h}, transparent`)
}

const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** The gallery: every regional tile under its region, installed or still to make. */
function gallery(tiles, manifest) {
  const { regions } = parse(fs.readFileSync(path.join(DIR, 'descriptors.md'), 'utf8'))
  const groups = new Map()
  for (const t of tiles) {
    const region = t.slot.split('.')[2]
    const name = region.includes('-') ? 'Borders' : regions.get(region).heading
    groups.set(name, [...(groups.get(name) ?? []), t])
  }
  const figure = (t) => {
    const file = manifest[t.slot]?.file
    const art = file ? `<img src="../../../../src/renderer/public/game-assets/${escape(file)}" alt="${escape(t.slot)}">` : '<div class="todo">not yet</div>'
    return `<figure>${art}<figcaption><code>${escape(t.slot)}</code><span>${escape(t.where)}</span></figcaption></figure>`
  }
  const done = tiles.filter((t) => manifest[t.slot]?.file).length
  const sections = [...groups].map(([name, list]) => `<section><h2>${escape(name)}</h2><div class="tiles">${list.map(figure).join('')}</div></section>`).join('\n')
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Regional hex tiles</title><style>body{margin:0;background:#211d1b;color:#efdfbb;font:15px system-ui;padding:24px}main{max-width:1100px;margin:auto}h1{margin-top:0}h2{font-size:19px;margin:28px 0 12px}.tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px}figure{margin:0;background:#302923;border:1px solid #645240;border-radius:8px;overflow:hidden}img,.todo{display:block;width:100%;aspect-ratio:222/256;image-rendering:pixelated}.todo{display:grid;place-items:center;color:#8f7a5c;font-style:italic}figcaption{display:grid;gap:3px;padding:8px 10px;background:#191613;font-size:12px}code{color:#f2d27b;overflow-wrap:anywhere}</style><main><h1>Regional hex tiles</h1><p>${done} of ${tiles.length} installed. The approved descriptions are in <a href="descriptors.md" style="color:#f2d27b">descriptors.md</a>.</p>${sections}</main></html>\n`
}

async function main() {
  const [batchPath, sharpPath] = process.argv.slice(2)
  if (!batchPath) {
    console.error('Usage: node scripts/install-zone-terrain.cjs <batch.json> [path-to-sharp]')
    process.exit(2)
  }
  const sharp = require(sharpPath || 'sharp')
  const tiles = JSON.parse(fs.readFileSync(path.join(DIR, 'prompts.json'), 'utf8'))
  const batch = JSON.parse(fs.readFileSync(batchPath, 'utf8'))
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
  const failed = []
  for (const item of batch) {
    try {
      await install(sharp, item, tiles, manifest)
    } catch (error) {
      failed.push(error.message)
    }
  }
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
  fs.writeFileSync(path.join(DIR, 'index.html'), gallery(tiles, manifest))
  console.log(`Installed ${batch.length - failed.length} of ${batch.length}; gallery: ${path.relative(ROOT, path.join(DIR, 'index.html'))}.`)
  if (failed.length > 0) {
    console.error(`Not installed:\n  ${failed.join('\n  ')}`)
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
