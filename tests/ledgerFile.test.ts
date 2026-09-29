import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { LedgerFile, localDateStamp } from '../src/main/ledgerFile'

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fiefdom-'))
}

test('load returns null when nothing has been saved', () => {
  assert.equal(new LedgerFile(tmpDir()).load(), null)
})

test('saves are atomic and ordered, and the first save of a day backs up the previous file', async () => {
  const dir = tmpDir()
  const store = new LedgerFile(dir)
  await store.save('{"n":1}')
  assert.equal(fs.existsSync(path.join(dir, 'backups')), false) // nothing to back up yet
  await Promise.all([store.save('{"n":2}'), store.save('{"n":3}')])
  assert.equal(store.load(), '{"n":3}')
  const backup = path.join(dir, 'backups', `ledger-${localDateStamp()}.json`)
  assert.equal(fs.readFileSync(backup, 'utf8'), '{"n":1}')
  assert.equal(fs.existsSync(path.join(dir, 'ledger.json.tmp')), false)
})

test('invalid JSON is never written', async () => {
  const store = new LedgerFile(tmpDir())
  await assert.rejects(store.save('{oops'))
  assert.throws(() => store.saveSync('nope'))
  assert.equal(store.load(), null)
})

test('a corrupt ledger falls back to the newest backup and is kept for inspection', () => {
  const dir = tmpDir()
  fs.mkdirSync(path.join(dir, 'backups'))
  fs.writeFileSync(path.join(dir, 'backups', 'ledger-2026-09-01.json'), '{"old":true}')
  fs.writeFileSync(path.join(dir, 'backups', 'ledger-2026-09-02.json'), '{"newer":true}')
  fs.writeFileSync(path.join(dir, 'ledger.json'), '{"half-writ')
  assert.equal(new LedgerFile(dir).load(), '{"newer":true}')
  assert.ok(fs.readdirSync(dir).some((f) => f.startsWith('ledger.corrupt-')))
})

test('old backups are pruned', async () => {
  const dir = tmpDir()
  fs.mkdirSync(path.join(dir, 'backups'))
  for (let d = 1; d <= 5; d++) fs.writeFileSync(path.join(dir, 'backups', `ledger-2020-01-0${d}.json`), '{}')
  fs.writeFileSync(path.join(dir, 'ledger.json'), '{"today":true}')
  await new LedgerFile(dir, 3).save('{"x":1}')
  const left = fs.readdirSync(path.join(dir, 'backups')).sort()
  assert.equal(left.length, 3)
  assert.equal(left[2], `ledger-${localDateStamp()}.json`)
})
