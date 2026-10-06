// Guards the game build's ground rules (docs/game/README.md, Conventions 3, 4 and 7). Run it with
// `npm run check:game`. It fails when:
//   - src/renderer/src/lib/game/** reads real time or real randomness (Math.random, Date.now, or
//     `new Date(` outside clock.ts);
//   - a numeric literal outside rules.ts is not 0, 1, -1, 2 or 100 and its line lacks a
//     `// rules-ok: <reason>` comment;
//   - validateCodex() or validateCatalog() reports errors, or a text slot the codex needs is missing.
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const GAME_DIR = path.join(ROOT, 'src', 'renderer', 'src', 'lib', 'game')
const ALLOWED_NUMBERS = new Set([0, 1, -1, 2, 100])
const RULES_OK = /\/\/\s*rules-ok:\s*\S/

/** Real time and real randomness. `exempt` names the one file allowed to use it. */
const FORBIDDEN = [
  { pattern: /\bMath\s*\.\s*random\b/, what: 'Math.random (use rng.ts)' },
  { pattern: /\bDate\s*\.\s*now\b/, what: 'Date.now (take `now` as a parameter)' },
  { pattern: /\bperformance\s*\.\s*now\b/, what: 'performance.now (take `now` as a parameter)' },
  { pattern: /\bcrypto\s*\.\s*(getRandomValues|randomUUID)\b/, what: 'crypto randomness (use rng.ts)' },
  { pattern: /\bnew\s+Date\s*\(/, what: 'new Date( (only clock.ts handles real time)', exempt: 'clock.ts' }
]

const NUMBER = /(?<![\w$])(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*)?\.?\d[\d_]*(?:[eE][+-]?\d+)?)n?(?![\w$])/g

/**
 * Blanks out comments, strings and regex literals (keeping line breaks), so the checks below see
 * only code. Template literal text is blanked; `${…}` expressions inside it stay as code.
 */
function codeOnly(src) {
  const out = src.split('')
  const blank = (from, to) => {
    for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' '
  }
  // Each frame is the brace depth of a `${` expression; when it closes we are back in the template.
  const templateFrames = []
  let i = 0
  let lastSignificant = ''
  const regexCanStart = () => lastSignificant === '' || /[(,=:[!&|?{};+\-*%<>~^]/.test(lastSignificant)

  const scanTemplate = () => {
    // At the start of template text (just after ` or a closing } of `${…}`).
    const start = i
    while (i < src.length) {
      if (src[i] === '\\') i += 2
      else if (src[i] === '`') {
        blank(start, i)
        i++
        lastSignificant = '`'
        return
      } else if (src[i] === '$' && src[i + 1] === '{') {
        blank(start, i)
        i += 2
        templateFrames.push(0)
        lastSignificant = '{'
        return
      } else i++
    }
    blank(start, i)
  }

  while (i < src.length) {
    const c = src[i]
    const next = src[i + 1]
    if (c === '/' && next === '/') {
      const end = src.indexOf('\n', i)
      const stop = end === -1 ? src.length : end
      blank(i, stop)
      i = stop
    } else if (c === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2)
      const stop = end === -1 ? src.length : end + 2
      blank(i, stop)
      i = stop
    } else if (c === "'" || c === '"') {
      let j = i + 1
      while (j < src.length && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1
      blank(i + 1, j)
      i = j + 1
      lastSignificant = c
    } else if (c === '`') {
      i++
      scanTemplate()
    } else if (c === '/' && regexCanStart()) {
      let j = i + 1
      let inClass = false
      while (j < src.length && src[j] !== '\n') {
        if (src[j] === '\\') j += 2
        else if (src[j] === '[') (inClass = true), j++
        else if (src[j] === ']') (inClass = false), j++
        else if (src[j] === '/' && !inClass) break
        else j++
      }
      blank(i + 1, j)
      j++
      while (j < src.length && /[a-z]/i.test(src[j])) j++
      i = j
      lastSignificant = '/'
    } else if (c === '{' && templateFrames.length > 0) {
      templateFrames[templateFrames.length - 1]++
      lastSignificant = c
      i++
    } else if (c === '}' && templateFrames.length > 0 && templateFrames[templateFrames.length - 1] === 0) {
      templateFrames.pop()
      i++
      scanTemplate()
    } else {
      if (c === '}' && templateFrames.length > 0) templateFrames[templateFrames.length - 1]--
      if (!/\s/.test(c)) {
        // Words such as `return` or `typeof` can come before a regex; treat them like operators.
        if (/[\w$]/.test(c)) {
          const word = /^[\w$]+/.exec(src.slice(i))[0]
          lastSignificant = /^(return|typeof|case|do|else|in|of|void|yield|await|delete|throw|new)$/.test(word) ? '(' : 'a'
          i += word.length
          continue
        }
        lastSignificant = c
      }
      i++
    }
  }
  return out.join('')
}

/** Problems in one source file of lib/game. `name` is its path relative to lib/game. */
function scanSource(src, name) {
  const problems = []
  const code = codeOnly(src).split('\n')
  const raw = src.split('\n')
  code.forEach((line, index) => {
    const where = `${name}:${index + 1}`
    for (const rule of FORBIDDEN) {
      if (rule.exempt !== name && rule.pattern.test(line)) problems.push(`${where}: uses ${rule.what}`)
    }
    if (name === 'rules.ts' || RULES_OK.test(raw[index])) return
    for (const match of line.matchAll(NUMBER)) {
      let value = Number(match[0].replace(/_/g, '').replace(/n$/, ''))
      const before = line.slice(0, match.index).trimEnd()
      // A unary minus: '-' after an operator, an opening bracket or the start of the line.
      if (before.endsWith('-') && !/[\w$)\]]$/.test(before.slice(0, -1).trimEnd())) value = -value
      if (!ALLOWED_NUMBERS.has(value)) {
        problems.push(`${where}: number ${value} belongs in rules.ts or the codex (or add "// rules-ok: <reason>")`)
      }
    }
  })
  return problems
}

function listSources(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return listSources(full)
    return /\.(ts|tsx|mts|cts|js|mjs|cjs)$/.test(entry.name) ? [full] : []
  })
}

function checkSources() {
  const files = listSources(GAME_DIR)
  const problems = files.flatMap((file) =>
    scanSource(fs.readFileSync(file, 'utf8'), path.relative(GAME_DIR, file).split(path.sep).join('/'))
  )
  return { files: files.length, problems }
}

function checkData() {
  const { register } = require('tsx/cjs/api')
  const unregister = register()
  try {
    const codex = require(path.join(GAME_DIR, 'codex.ts'))
    const text = require(path.join(GAME_DIR, 'text.ts'))
    const problems = [
      ...codex.validateCodex().map((e) => `codex: ${e}`),
      ...text.validateCatalog().map((e) => `text: ${e}`),
      ...codex
        .requiredTextIds()
        .filter((id) => !text.hasText(id))
        .map((id) => `text: missing slot "${id}" that the codex needs`)
    ]
    return { slots: text.textIds().length, problems }
  } finally {
    unregister()
  }
}

function main() {
  const sources = checkSources()
  const data = checkData()
  const problems = [...sources.problems, ...data.problems]
  if (problems.length > 0) {
    console.error(`check:game found ${problems.length} problem(s):`)
    for (const p of problems) console.error(`  ${p}`)
    process.exit(1)
  }
  console.log(`check:game OK: ${sources.files} game files, codex valid, ${data.slots} text slots.`)
}

if (require.main === module) main()

module.exports = { scanSource, codeOnly }
