// The story-text catalog's progress (book Ch 17 "Writing", A-46, tasks T14 and A3). Run it with
// `npm run text:check`. It reads src/renderer/src/data/text/*.json and reports:
//   - every slot still on its placeholder (no `final` written yet), by catalog file;
//   - every Healer entry not yet approved (its `final` is never shown until it is, Ch 17);
//   - a `{placeholder}` in a `final` that its template does not offer (an error: it would show raw);
//   - a `final` longer than Ch 17's sentence count for its kind of slot (a warning).
// It exits 1 only for the error; placeholders and unapproved lines are the normal state of work.
const fs = require('node:fs')
const path = require('node:path')

const TEXT = path.join(__dirname, '..', 'src', 'renderer', 'src', 'data', 'text')

/** Ch 17's lengths, as the most sentences a `final` may have, by id prefix (the longest prefix wins). */
const MAX_SENTENCES = [
  ['healer.', 3],
  ['milestones.', 4],
  ['rivals.', 2],
  ['events.', 3],
  ['coalitions.', 3],
  ['endings.', 6],
  ['crossings.', 2],
  ['units.', 1],
  ['items.', 1],
  ['battle.', 2],
  ['herald.', 2]
]

const PLACEHOLDER = /\{(\w+)\}/g
const names = (s) => new Set(Array.from(s.matchAll(PLACEHOLDER), (m) => m[1]))

function sentences(text) {
  return text.split(/(?<=[.!?])\s+(?=\S)/).filter((s) => s.trim() !== '').length
}

function limitFor(id) {
  // An event's title is a name, not sentences.
  if (/^events\.[^.]+\.title$/.test(id)) return 1
  let best = null
  for (const [prefix, max] of MAX_SENTENCES) if (id.startsWith(prefix) && (!best || prefix.length > best[0].length)) best = [prefix, max]
  return best ? best[1] : null
}

function main() {
  const files = fs.readdirSync(TEXT).filter((f) => f.endsWith('.json')).sort()
  const placeholderSlots = []
  const unapproved = []
  const errors = []
  const warnings = []
  let total = 0
  const byFile = []
  for (const file of files) {
    const entries = JSON.parse(fs.readFileSync(path.join(TEXT, file), 'utf8'))
    let open = 0
    let written = 0
    for (const [id, entry] of Object.entries(entries)) {
      total++
      if (entry.final === null) {
        open++
        placeholderSlots.push(id)
      } else {
        written++
        const offered = names(entry.template)
        for (const n of names(entry.final)) if (!offered.has(n)) errors.push(`${id}: the final uses {${n}}, which its template does not offer`)
        const max = limitFor(id)
        const count = sentences(entry.final)
        if (max !== null && count > max) warnings.push(`${id}: ${count} sentences, Ch 17 allows ${max}`)
      }
      if (id.startsWith('healer.') && entry.approved !== true) unapproved.push(id)
    }
    byFile.push(`  ${file}: ${written} written, ${open} on placeholder`)
  }
  console.log(`text:check: ${total} slots, ${total - placeholderSlots.length} written, ${placeholderSlots.length} on placeholder.`)
  for (const line of byFile) console.log(line)
  const list = (title, items, all) => {
    if (items.length === 0) return
    console.log(`${title}: ${items.length}`)
    for (const x of items.slice(0, all ? items.length : 12)) console.log(`  ${x}`)
    if (!all && items.length > 12) console.log(`  … and ${items.length - 12} more (--all lists every one)`)
  }
  const all = process.argv.includes('--all')
  list('On placeholder', placeholderSlots, all)
  list('Healer entries not approved (the placeholder shows until they are)', unapproved, true)
  list('Too long for Ch 17', warnings, true)
  list('Errors', errors, true)
  if (errors.length > 0) process.exit(1)
}

main()
