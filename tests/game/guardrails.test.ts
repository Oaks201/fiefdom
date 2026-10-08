/**
 * Ch 16 guardrails that live in the app's shape rather than its rules (T17's audit,
 * docs/game/guardrail-audit.md), checked by scanning the source:
 * - Privacy: only the Fitbit client (the Google Health API) reaches the network; everything else
 *   the app fetches is its own bundled files.
 * - D-04: no notifications, no tray icon, no background process.
 * - Paying or rushing (Pillar 7): nothing is sold, and dev time travel and the scenario loader exist
 *   only in development builds.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.join(__dirname, '..', '..', 'src')

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return files(p)
    return /\.(ts|tsx|html)$/.test(e.name) ? [p] : []
  })
}

const SOURCES = files(SRC).map((file) => ({ file: path.relative(SRC, file).split(path.sep).join('/'), text: fs.readFileSync(file, 'utf8') }))

/** Lines matching `pattern`, as `file:line: text`, outside comments. */
function hits(pattern: RegExp): string[] {
  return SOURCES.flatMap(({ file, text }) =>
    text.split('\n').flatMap((line, i) => {
      const code = line.replace(/^\s*(\/\/|\*|\/\*).*$/, '')
      return pattern.test(code) ? [`${file}:${i + 1}: ${line.trim()}`] : []
    })
  )
}

test('Ch 16 privacy: only the Fitbit client calls out; every other fetch reads the app’s own files', () => {
  const calls = hits(/\b(fetch|net\.fetch|net\.request)\s*\(|XMLHttpRequest|new WebSocket|sendBeacon|EventSource/)
  const allowed = [
    /^main\/health\.ts:/, // the Google Health API client (deps.fetch is net.fetch, given by healthIpc.ts)
    /^main\/healthIpc\.ts:/,
    /^shared\/api\.ts:.*fetch\(range/, // the bridge's method name, not a call
    /^renderer\/src\/state\/health\.ts:.*bridge\.fetch\(/, // the same bridge, through the main process
    /^renderer\/src\/state\/art\.ts:.*fetch\('game-assets\/manifest\.json'/, // the bundled art manifest
    /^renderer\/src\/audio\/sfx\.ts:.*fetch\(url\)/ // bundled sound files
  ]
  assert.deepEqual(
    calls.filter((c) => !allowed.some((a) => a.test(c))),
    [],
    'a network call outside the Fitbit client'
  )
  // The only addresses in the app are Google's (Fitbit), the local OAuth redirect, and links the user opens.
  const urls = hits(/https?:\/\/(?!127\.0\.0\.1)/).filter((h) => !/googleapis\.com|accounts\.google\.com/.test(h) && !/^main\/index\.ts:.*openExternal/.test(h))
  assert.deepEqual(urls, [])
  const sfx = SOURCES.find((s) => s.file === 'renderer/src/audio/sfx.ts')?.text ?? ''
  assert.doesNotMatch(sfx, /https?:\/\//, 'sound effects load from the app itself')
})

test('Ch 16 privacy: Fitbit tokens are stored only through the OS keychain (safeStorage)', () => {
  const ipc = SOURCES.find((s) => s.file === 'main/healthIpc.ts')?.text ?? ''
  assert.match(ipc, /safeStorage\.isEncryptionAvailable\(\)/)
  assert.match(ipc, /safeStorage\.encryptString/)
})

test('D-04: no notifications, no tray icon and no background process', () => {
  assert.deepEqual(hits(/new Notification\b|\bTray\b|showNotification|powerSaveBlocker|setLoginItemSettings/), [])
})

test('Pillar 7: nothing is sold, and dev time travel and the scenario loader exist only in development builds', () => {
  assert.deepEqual(hits(/\b(checkout|purchase|payment|stripe|paypal|inAppPurchase)\b/i).filter((h) => !/^renderer\/src\/lib\/game\//.test(h)), [])
  const clock = SOURCES.find((s) => s.file === 'renderer/src/state/campaignClock.ts')?.text ?? ''
  assert.match(clock, /export function devAdvanceDays\(days: number\): void \{\n\s+if \(!import\.meta\.env\.DEV\) return/)
  assert.match(clock, /if \(!import\.meta\.env\.DEV\) return real/)
  assert.match(clock, /if \(import\.meta\.env\.DEV && typeof window !== 'undefined'\) \{\n\s+window\.fiefdomDev = /)
  // Only the dev panel imports the scenarios, and the app mounts that panel only in development.
  assert.deepEqual(
    hits(/from ['"].*dev\/scenarios['"]/).map((h) => h.split(':')[0]),
    ['renderer/src/components/game/DevTimeTravel.tsx']
  )
  assert.deepEqual(
    hits(/const DevTimeTravel = import\.meta\.env\.DEV \? lazy\(/).map((h) => h.split(':')[0]),
    ['renderer/src/App.tsx'],
    'the dev panel is loaded only when import.meta.env.DEV'
  )
})
