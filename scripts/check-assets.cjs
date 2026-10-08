// The game's art slots (book Ch 17 "Placeholders first", A-08, task T14). Run it with
// `npm run assets:check`:
//
//   node scripts/check-assets.cjs            report missing slots, unknown files and wrong sizes (exit 0)
//   node scripts/check-assets.cjs --strict   the same, but exit 1 when anything is missing or wrong
//   node scripts/check-assets.cjs --write    also (re)write the manifest with every slot, keeping each `file`
//
// The slot inventory comes from the codex (companies, hybrids, hosts, elites, quarries, items,
// events) plus Ch 17's fixed lists (hex terrains and overlays, 20 building tiers, 5 castle tiers,
// 12 rival portraits, 6 banners, 10 Milestone scenes, the big moments and the interface kit).
// Every run rewrites docs/game/assets.md, the owner's checklist of every slot (task A2).
//
// The manifest, src/renderer/public/game-assets/manifest.json, maps each slot id to
// { file: string | null, kind, size: [w, h] }. <GameArt slot="…"> shows a slot's file when the
// manifest names one, and a placeholder otherwise. Sizes are read from PNG and WebP headers.
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const CODEX = path.join(ROOT, 'src', 'renderer', 'src', 'data', 'codex')
const ASSETS = path.join(ROOT, 'src', 'renderer', 'public', 'game-assets')
const MANIFEST = path.join(ASSETS, 'manifest.json')
const CHECKLIST = path.join(ROOT, 'docs', 'game', 'assets.md')

const read = (name) => JSON.parse(fs.readFileSync(path.join(CODEX, name), 'utf8'))

/** Pixel sizes by kind of slot (width, height). */
const SIZES = {
  hex: [222, 256],
  overlay: [222, 256],
  building: [512, 512],
  castle: [768, 768],
  rival: [512, 640],
  token: [128, 128],
  portrait: [512, 512],
  item: [128, 128],
  banner: [256, 512],
  event: [768, 512],
  milestone: [1920, 1080],
  moment: [1920, 1080],
  frame: [512, 512],
  button: [256, 64],
  parchment: [1024, 1024],
  seal: [128, 128],
  icon: [64, 64]
}

const WHERE = {
  hex: 'Realm map',
  overlay: 'Realm map',
  building: 'Castle screen',
  castle: 'Map center, castle screen',
  rival: 'Diplomacy, reports',
  token: 'Army, battles',
  portrait: 'Army, Grand Battles',
  item: 'Armory',
  banner: 'Map, battles',
  event: 'World events',
  milestone: 'Milestone moments',
  moment: 'Big-moment cards',
  frame: 'Everywhere',
  button: 'Everywhere',
  parchment: 'Everywhere',
  seal: 'Everywhere',
  icon: 'Everywhere'
}

/** Every art slot, in a stable order. */
function inventory() {
  const slots = []
  const add = (id, kind, name) => slots.push({ id, kind, name, size: SIZES[kind], where: WHERE[kind] })

  for (const t of ['castle', 'building', 'wild', 'den', 'village', 'road', 'gate', 'lairMouth', 'capital', 'realm', 'lair', 'battlefield', 'ruins']) add(`hex.${t}`, 'hex', `Hex terrain: ${t}`)
  for (const o of ['contested', 'scorched']) add(`hex.overlay.${o}`, 'overlay', `Hex overlay: ${o}`)

  const companies = read('companies.json')
  for (const b of companies.buildings) for (let tier = 1; tier <= 5; tier++) add(`building.${b.id}.${tier}`, 'building', `${b.name}, Tier ${tier}`)
  for (let tier = 1; tier <= 5; tier++) add(`castle.${tier}`, 'castle', `Castle, Tier ${tier}`)

  const rivals = read('rivals.json').rivals
  for (const r of rivals) for (const mood of ['calm', 'angry', 'humbled']) add(`rival.${r.id}.${mood}`, 'rival', `${r.ruler}, ${mood}`)

  const lines = []
  for (const c of companies.companies) lines.push([c.id, c.name])
  for (const x of read('crossings.json')) for (const h of x.hybrids) lines.push([h.id, h.name])
  for (const h of read('hosts.json').hosts) {
    lines.push([h.commander.id, h.commander.name])
    for (const u of h.companies) lines.push([u.id, u.name])
  }
  const elites = read('elites.json')
  lines.push([elites.sworn.id, elites.sworn.name])
  for (const [id, name] of lines) {
    add(`company.${id}.token`, 'token', `${name}: token`)
    add(`company.${id}.portrait`, 'portrait', `${name}: portrait`)
  }
  for (const e of elites.elites) add(`portrait.${e.id}`, 'portrait', `${e.name}: portrait`)
  const seen = new Set()
  for (const q of read('mythics.json').quarries) {
    for (const u of q.roster) {
      if (seen.has(u.id)) continue
      seen.add(u.id)
      add(`portrait.${u.id}`, 'portrait', `${u.name}: portrait`)
    }
  }

  for (const i of read('items.json')) add(`item.${i.id}`, 'item', `${i.name}: icon`)
  for (const owner of ['player', 'orc', 'goblin', 'dwarf', 'archmage', 'neutral']) add(`banner.${owner}`, 'banner', `Banner: ${owner}`)
  for (const e of read('events.json')) add(`event.${e.id}`, 'event', `Event card: ${e.name}`)
  for (let n = 1; n <= 10; n++) add(`milestone.${n}`, 'milestone', `Milestone ${n} scene`)
  for (const m of ['grandBattleWon', 'grandBattleLost', 'coalition', 'ultimatum', 'victory', 'fall']) add(`moment.${m}`, 'moment', `Big moment: ${m}`)

  add('ui.frame', 'frame', 'Interface: carved frame')
  add('ui.button', 'button', 'Interface: button')
  add('ui.parchment', 'parchment', 'Interface: parchment panel')
  add('ui.seal', 'seal', 'Interface: wax seal')
  for (const i of ['purse', 'respect', 'valor', 'grace', 'steps', 'calories', 'duties', 'weight']) add(`ui.icon.${i}`, 'icon', `Interface icon: ${i}`)
  return slots
}

/** A PNG's or WebP's pixel size from its header, or null when the file is neither. */
function imageSize(file) {
  const buf = fs.readFileSync(file)
  if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47 && buf.toString('ascii', 12, 16) === 'IHDR') {
    return [buf.readUInt32BE(16), buf.readUInt32BE(20)]
  }
  if (buf.length >= 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buf.toString('ascii', 12, 16)
    if (chunk === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff]
    if (chunk === 'VP8L') {
      const b = buf.readUInt32LE(21)
      return [(b & 0x3fff) + 1, ((b >> 14) & 0x3fff) + 1]
    }
    if (chunk === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)]
  }
  return null
}

function readManifest() {
  if (!fs.existsSync(MANIFEST)) return {}
  return JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
}

function writeManifest(slots, current) {
  const out = {}
  for (const s of slots) out[s.id] = { file: current[s.id]?.file ?? null, kind: s.kind, size: s.size }
  fs.mkdirSync(ASSETS, { recursive: true })
  fs.writeFileSync(MANIFEST, `${JSON.stringify(out, null, 2)}\n`)
  return out
}

function writeChecklist(slots, manifest, status) {
  const lines = [
    '# Game art: the slot checklist',
    '',
    'Generated by `npm run assets:check` (scripts/check-assets.cjs); do not edit by hand. Every art slot the game draws, from the book’s Ch 17 asset table and the codex. To add art: save the file in `src/renderer/public/game-assets/` at the size shown (PNG or WebP), set its `file` in `manifest.json` (the suggested name is below), and reload. `<GameArt>` shows a placeholder for every slot until then.',
    '',
    `Slots: ${slots.length}. With a file: ${slots.filter((s) => status.get(s.id) === 'ok').length}.`,
    '',
    '| Slot | What | File (suggested) | Size (px) | Where it shows | Status |',
    '| --- | --- | --- | --- | --- | --- |'
  ]
  for (const s of slots) {
    const file = manifest[s.id]?.file ?? `${s.id}.png`
    lines.push(`| \`${s.id}\` | ${s.name} | \`${file}\` | ${s.size[0]} × ${s.size[1]} | ${s.where} | ${status.get(s.id)} |`)
  }
  fs.writeFileSync(CHECKLIST, `${lines.join('\n')}\n`)
}

function main() {
  const args = new Set(process.argv.slice(2))
  const slots = inventory()
  let manifest = readManifest()
  if (args.has('--write') || Object.keys(manifest).length === 0) manifest = writeManifest(slots, manifest)

  const problems = { missing: [], notInManifest: [], wrongSize: [], unknown: [], unreadable: [] }
  const status = new Map()
  const referenced = new Set()
  for (const s of slots) {
    const entry = manifest[s.id]
    if (!entry) {
      problems.notInManifest.push(s.id)
      status.set(s.id, 'not in manifest')
      continue
    }
    if (!entry.file) {
      problems.missing.push(s.id)
      status.set(s.id, 'missing')
      continue
    }
    referenced.add(entry.file)
    const file = path.join(ASSETS, entry.file)
    if (!fs.existsSync(file)) {
      problems.missing.push(`${s.id} (${entry.file} not found)`)
      status.set(s.id, 'missing')
      continue
    }
    const size = imageSize(file)
    if (!size) {
      problems.unreadable.push(`${s.id} (${entry.file} is not a PNG or WebP)`)
      status.set(s.id, 'unreadable')
    } else if (size[0] !== s.size[0] || size[1] !== s.size[1]) {
      problems.wrongSize.push(`${s.id} (${entry.file} is ${size[0]} × ${size[1]}, wants ${s.size[0]} × ${s.size[1]})`)
      status.set(s.id, `wrong size (${size[0]} × ${size[1]})`)
    } else status.set(s.id, 'ok')
  }
  const known = new Set(slots.map((s) => s.id))
  for (const id of Object.keys(manifest)) if (!known.has(id)) problems.unknown.push(`${id} (in the manifest, but no such slot)`)
  if (fs.existsSync(ASSETS)) {
    for (const f of fs.readdirSync(ASSETS)) if (f !== 'manifest.json' && !referenced.has(f)) problems.unknown.push(`${f} (a file no slot uses)`)
  }
  writeChecklist(slots, manifest, status)

  const report = (title, list) => {
    if (list.length === 0) return
    console.log(`${title}: ${list.length}`)
    for (const x of list.slice(0, args.has('--all') ? list.length : 12)) console.log(`  ${x}`)
    if (list.length > 12 && !args.has('--all')) console.log(`  … and ${list.length - 12} more (--all lists every one)`)
  }
  console.log(`assets:check: ${slots.length} slots, ${slots.filter((s) => status.get(s.id) === 'ok').length} with art.`)
  report('Missing', problems.missing)
  report('Not in the manifest (run with --write)', problems.notInManifest)
  report('Wrong size', problems.wrongSize)
  report('Not PNG or WebP', problems.unreadable)
  report('Unknown', problems.unknown)
  console.log(`Wrote ${path.relative(ROOT, CHECKLIST)}.`)
  const bad = Object.values(problems).some((l) => l.length > 0)
  if (args.has('--strict') && bad) process.exit(1)
}

main()
