// Codex prompts for the regional hex tiles (D-09), built from the owner-approved descriptions:
//
//   node scripts/zone-terrain-prompts.cjs
//
// reads docs/game/art/zone-terrain/descriptors.md (one table row per tile, under each region's
// heading and **Look:** line) and writes docs/game/art/zone-terrain/prompts.json: per slot, the
// output file, its size, the reference images and the full prompt with the region's look and the
// house style the existing map tiles were made with (docs/game/art/first-ten-weeks/hex.den.json).
// Edit the descriptions, not prompts.json.
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const DIR = path.join(ROOT, 'docs', 'game', 'art', 'zone-terrain')
const SOURCE = path.join(DIR, 'descriptors.md')
const OUT = path.join(DIR, 'prompts.json')

/** The tile whose outline every tile matches, then the style reference (the owner's portrait). */
const REFERENCES = ['src/renderer/public/game-assets/hex.wild.png', 'docs/game/art/reference/owner-portrait.png']

/** Where the game draws a badge over a terrain, so the art leaves it room. */
const BADGE_ROOM = {
  capital: 'The game draws a round crown badge over the middle of this tile, so the stronghold should fill the hexagon and still read around the center.',
  battlefield: 'The game draws a small pill-shaped marker over the middle of this tile, so keep the telling details toward the edges.',
  village: 'The game draws a small round badge near the upper-left corner of this tile, so keep the main buildings clear of that corner.'
}

const HOUSE_STYLE = [
  'Format: one pointy-top HEXAGON terrain tile exactly like the supporting terrain input, flat overhead/isometric hybrid; fill only the hex silhouette with points top and bottom and vertical side edges; no pedestal, no extruded base, no perspective diamond, no outer glow. The supporting terrain image determines the outline and proportions.',
  "Style: match the supplied owner's portrait: genuine hand-painted PIXEL ART, connected square pixel clusters, crisp stepped contours, warm dark brown outline, broad 4-5 discrete shade facets per material, golden upper-left light, rich earthy saturated colors. Low resolution hand-placed pixels nearest enlarged; NO blended smooth gradients, NO 3D render, NO photography, NO noisy fine scratches, NO blurry pixels, NO dithering.",
  'Readability: the tile is seen at about 60 pixels wide on the map next to tiles of other regions, so use one large landmark and two or three supporting details, never clutter, in the region palette.',
  'Never: writing, letters, numbers, readable runes, logos, coats of arms, UI, frame, or watermark; banners are plain cloth; no bodies or gore.',
  'Composition: pointy-top 222:256 canvas. Genuinely transparent background, clean entire silhouette with a little clear margin, no background rectangle or checkerboard painted into art. Logical pixel canvas 256 pixels on shorter edge nearest enlarged.'
].join('\n')

/** Each region's heading and look, and every tile row, from the descriptions. */
function parse(markdown) {
  const regions = new Map()
  const tiles = []
  let heading = null
  let look = null
  for (const line of markdown.split(/\r?\n/)) {
    const h = /^## (.+)$/.exec(line)
    if (h) {
      heading = h[1]
      look = null
      continue
    }
    const l = /^\*\*Look:\*\* (.+)$/.exec(line)
    if (l) look = l[1][0].toUpperCase() + l[1].slice(1)
    const row = /^\| `(hex\.[^`]+)` \| (.+?) \| (.+?) \|$/.exec(line)
    if (!row) continue
    const [, slot, where, subject] = row
    const [, terrain, region] = slot.split('.')
    if (look && !regions.has(region)) regions.set(region, { heading, look })
    tiles.push({ slot, terrain, region, where, subject })
  }
  return { regions, tiles }
}

function prompt(tile, regions) {
  const pair = tile.region.split('-')
  const lines = [
    `Use case: stylized-concept. Production raster art asset for the Fiefdom medieval strategy game's realm map. Input images are visual STYLE references: the first is an existing map tile whose hexagon outline and proportions this tile must match exactly; the second sets the pixel-art style. Asset id: ${tile.slot}.`
  ]
  if (pair.length === 1) {
    const r = regions.get(tile.region)
    lines.push(`Region: ${r.heading}. ${r.look}`)
  } else {
    const [a, b] = pair.map((id) => regions.get(id))
    lines.push(`Region: a border tile where ${a.heading} meets ${b.heading}; blend both looks, each half facing its own region as the subject says, meeting in the middle rather than at a hard seam.`)
    lines.push(`${a.heading}: ${a.look}`)
    lines.push(`${b.heading}: ${b.look}`)
  }
  lines.push(`Subject: ${tile.subject}`)
  if (BADGE_ROOM[tile.terrain]) lines.push(BADGE_ROOM[tile.terrain])
  lines.push(HOUSE_STYLE)
  return lines.join('\n')
}

function main() {
  const { regions, tiles } = parse(fs.readFileSync(SOURCE, 'utf8'))
  for (const t of tiles) {
    for (const id of t.region.split('-')) if (!regions.has(id)) throw new Error(`${t.slot}: no region "${id}" with a **Look:** line`)
  }
  const out = tiles.map((t) => ({
    slot: t.slot,
    file: `${t.slot}.png`,
    size: [222, 256],
    logical: [111, 128],
    where: t.where,
    references: REFERENCES,
    prompt: prompt(t, regions)
  }))
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n')
  console.log(`Wrote ${path.relative(ROOT, OUT)}: ${out.length} prompts.`)
}

if (require.main === module) main()

module.exports = { parse }
