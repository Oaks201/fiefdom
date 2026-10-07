import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { CampaignFile, LedgerFile, localDateStamp } from '../src/main/ledgerFile'

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fiefdom-campaign-'))
}

/** `count` distinct, long-past backup names for `name`, oldest first. */
function oldBackups(name: string, count: number): string[] {
  const list: string[] = []
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(2020, 0, 1 + i))
    list.push(`${name}-${d.toISOString().slice(0, 10)}.json`)
  }
  return list
}

test('A-08: campaign load returns null when no campaign has been saved', () => {
  assert.equal(new CampaignFile(tmpDir()).load(), null)
})

test('A-08: campaign saves are atomic and ordered, and the first save of a day backs up the previous campaign.json', async () => {
  const dir = tmpDir()
  const store = new CampaignFile(dir)
  await store.save('{"n":1}')
  assert.equal(fs.readFileSync(path.join(dir, 'campaign.json'), 'utf8'), '{"n":1}')
  assert.equal(fs.existsSync(path.join(dir, 'backups')), false) // nothing to back up yet
  await Promise.all([store.save('{"n":2}'), store.save('{"n":3}')])
  assert.equal(store.load(), '{"n":3}')
  const backup = path.join(dir, 'backups', `campaign-${localDateStamp()}.json`)
  assert.equal(fs.readFileSync(backup, 'utf8'), '{"n":1}')
  // one backup per day: the later saves did not replace it
  assert.deepEqual(fs.readdirSync(path.join(dir, 'backups')), [`campaign-${localDateStamp()}.json`])
  assert.equal(fs.existsSync(path.join(dir, 'campaign.json.tmp')), false)
  // the campaign never touches the ledger's file
  assert.equal(fs.existsSync(path.join(dir, 'ledger.json')), false)
  store.saveSync('{"n":4}')
  assert.equal(store.load(), '{"n":4}')
})

test('A-08: an invalid campaign is never written', async () => {
  const dir = tmpDir()
  const store = new CampaignFile(dir)
  await assert.rejects(store.save('{oops'), /campaign/)
  assert.throws(() => store.saveSync('nope'), /campaign/)
  assert.equal(store.load(), null)
  assert.equal(fs.existsSync(path.join(dir, 'campaign.json')), false)
})

test('A-08: a corrupt campaign.json falls back to the newest good backup and the damaged copy is kept', () => {
  const dir = tmpDir()
  fs.mkdirSync(path.join(dir, 'backups'))
  fs.writeFileSync(path.join(dir, 'backups', 'campaign-2026-09-01.json'), '{"old":true}')
  fs.writeFileSync(path.join(dir, 'backups', 'campaign-2026-09-02.json'), '{"newer":true}')
  fs.writeFileSync(path.join(dir, 'backups', 'campaign-2026-09-03.json'), '{"newest-but-broken') // skipped
  fs.writeFileSync(path.join(dir, 'backups', 'ledger-2026-09-04.json'), '{"ledger":true}') // never the campaign's
  fs.writeFileSync(path.join(dir, 'campaign.json'), '{"half-writ')
  assert.equal(new CampaignFile(dir).load(), '{"newer":true}')
  const corrupt = fs.readdirSync(dir).filter((f) => /^campaign\.corrupt-\d+\.json$/.test(f))
  assert.equal(corrupt.length, 1)
  assert.equal(fs.readFileSync(path.join(dir, corrupt[0]), 'utf8'), '{"half-writ')
  assert.equal(fs.existsSync(path.join(dir, 'ledger.json')), false)
})

test('A-08: the newest 30 campaign backups are kept by default', async () => {
  const dir = tmpDir()
  fs.mkdirSync(path.join(dir, 'backups'))
  const seeded = oldBackups('campaign', 35)
  for (const name of seeded) fs.writeFileSync(path.join(dir, 'backups', name), '{}')
  fs.writeFileSync(path.join(dir, 'campaign.json'), '{"yesterday":true}')
  await new CampaignFile(dir).save('{"today":true}')
  const left = fs.readdirSync(path.join(dir, 'backups')).sort()
  assert.equal(left.length, 30)
  // today's backup plus the newest 29 of the old ones
  assert.deepEqual(left, [...seeded.slice(-29), `campaign-${localDateStamp()}.json`].sort())
  assert.equal(fs.readFileSync(path.join(dir, 'backups', `campaign-${localDateStamp()}.json`), 'utf8'), '{"yesterday":true}')
})

test('A-08: pruning campaign backups never touches ledger backups, and pruning ledger backups never touches campaign backups', async () => {
  const dir = tmpDir()
  const backups = path.join(dir, 'backups')
  fs.mkdirSync(backups)
  const ledgerOld = oldBackups('ledger', 35)
  const campaignOld = oldBackups('campaign', 35)
  for (const name of [...ledgerOld, ...campaignOld]) fs.writeFileSync(path.join(backups, name), '{}')
  fs.writeFileSync(path.join(dir, 'campaign.json'), '{"campaign":1}')
  fs.writeFileSync(path.join(dir, 'ledger.json'), '{"ledger":1}')

  await new CampaignFile(dir).save('{"campaign":2}')
  let names = fs.readdirSync(backups)
  assert.equal(names.filter((f) => f.startsWith('campaign-')).length, 30)
  assert.deepEqual(names.filter((f) => f.startsWith('ledger-')).sort(), ledgerOld) // all 35 still there

  await new LedgerFile(dir).save('{"ledger":2}')
  names = fs.readdirSync(backups)
  assert.equal(names.filter((f) => f.startsWith('ledger-')).length, 30)
  assert.equal(names.filter((f) => f.startsWith('campaign-')).length, 30) // unchanged by the ledger
  assert.equal(fs.readFileSync(path.join(backups, `ledger-${localDateStamp()}.json`), 'utf8'), '{"ledger":1}')
  assert.equal(fs.readFileSync(path.join(backups, `campaign-${localDateStamp()}.json`), 'utf8'), '{"campaign":1}')
})

test('the ledger still lives in ledger.json and the campaign in campaign.json, side by side', async () => {
  const dir = tmpDir()
  const ledger = new LedgerFile(dir)
  const campaign = new CampaignFile(dir)
  assert.equal(ledger.file, path.join(dir, 'ledger.json'))
  assert.equal(campaign.file, path.join(dir, 'campaign.json'))
  assert.equal(ledger.backupDir, campaign.backupDir)
  await ledger.save('{"ledger":true}')
  assert.equal(fs.existsSync(path.join(dir, 'campaign.json')), false)
  await campaign.save('{"campaign":true}')
  assert.equal(fs.readFileSync(path.join(dir, 'ledger.json'), 'utf8'), '{"ledger":true}')
  assert.equal(ledger.load(), '{"ledger":true}')
  assert.equal(campaign.load(), '{"campaign":true}')
  await assert.rejects(ledger.save('{bad'), /Refusing to write an invalid ledger/)
})
