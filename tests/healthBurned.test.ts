import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HealthService, SCOPES, type HealthStore, type StoredHealth } from '../src/main/health'
import { createLedger, mergeSynced, setMetric } from '../src/renderer/src/lib/ledger'
import { startFakeGoogle, type FakeGoogleOptions } from './support/fakeGoogle'

function memoryStore(initial: StoredHealth = {}): HealthStore {
  let saved = initial
  return {
    encrypted: true,
    read: () => structuredClone(saved),
    write: (d) => {
      saved = structuredClone(d)
    }
  }
}

async function connected(opts: FakeGoogleOptions = {}) {
  const google = await startFakeGoogle(opts)
  const service = new HealthService({
    fetch,
    store: memoryStore(),
    apiBase: google.base,
    retryDelayMs: 1,
    openExternal: (url) => {
      setTimeout(() => void google.visit(url), 5)
    }
  })
  service.setClient(google.clientFile())
  const status = await service.connect({ nutrition: true })
  return { google, service, status }
}

const MONTH: FakeGoogleOptions['data'] = {
  '2026-09-01': { steps: 4000, burned: 2310 },
  '2026-09-14': { burned: 2455.5 },
  '2026-09-15': { steps: 9000, calories: 600, eaten: 2200, burned: 2702 },
  '2026-09-29': { calories: 400 }, // no total of its own: the fake answers calories + 1800
  '2026-09-30': { steps: 7000, eaten: 1900, burned: 2180 }
}

const totalCalls = (requests: Array<{ path: string; body: unknown }>) => requests.filter((r) => r.path.includes('/dataTypes/total-calories/'))

test('A-06: total-calories is read for a range, fourteen days a request, and comes back as burned', async () => {
  const { google, service, status } = await connected({ data: MONTH })
  try {
    // burned is never a tally the connection shows
    assert.deepEqual(status.metrics, ['steps', 'calories', 'eaten'])
    const result = await service.fetchDays('2026-09-01', '2026-09-30', { burned: true })
    assert.deepEqual(result.errors, {})
    const burned = result.points.filter((p) => p.metric === 'burned').sort((a, b) => a.date.localeCompare(b.date))
    assert.deepEqual(burned, [
      { date: '2026-09-01', metric: 'burned', value: 2310 },
      { date: '2026-09-14', metric: 'burned', value: 2455.5 },
      { date: '2026-09-15', metric: 'burned', value: 2702 },
      { date: '2026-09-29', metric: 'burned', value: 2200 },
      { date: '2026-09-30', metric: 'burned', value: 2180 }
    ])
    // the activity figure is still the active one, not the total
    assert.equal(result.points.find((p) => p.metric === 'calories' && p.date === '2026-09-15')?.value, 600)
    // thirty days, at most fourteen per request: 14 + 14 + 2
    const calls = totalCalls(google.requests)
    assert.equal(calls.length, 3)
    assert.deepEqual(calls.map((c) => (c.body as { pageSize?: number }).pageSize), [14, 14, 2])
    assert.equal(service.status().metrics.includes('burned'), false)
  } finally {
    await google.close()
  }
})

test('A-06: synced total calories set burned on their days, and a hand-typed eaten is still never overwritten', async () => {
  const { google, service } = await connected({ data: MONTH })
  try {
    const result = await service.fetchDays('2026-09-01', '2026-09-30', { burned: true })
    let l = setMetric(createLedger(), '2026-09-15', 'eaten', 1750)
    l = mergeSynced(l, result.points)
    assert.equal(l.days['2026-09-01'].burned, 2310)
    assert.equal(l.days['2026-09-14'].burned, 2456) // whole calories, like every tally
    assert.equal(l.days['2026-09-15'].burned, 2702)
    assert.equal(l.days['2026-09-29'].burned, 2200)
    assert.equal(l.days['2026-09-30'].burned, 2180)
    assert.equal(l.days['2026-09-02'], undefined)
    // the hand-typed food log stands; Fitbit's figure is only remembered beside it
    assert.equal(l.days['2026-09-15'].eaten, 1750)
    assert.equal(l.days['2026-09-15'].synced?.eaten, 2200)
    assert.deepEqual(l.days['2026-09-15'].manual, { eaten: true })
    // burned is never marked as typed by hand, on any day
    for (const day of Object.values(l.days)) assert.equal(Object.hasOwn(day.manual ?? {}, 'burned'), false)
    assert.equal(l.days['2026-09-30'].manual, undefined)
  } finally {
    await google.close()
  }
})

test('A-06: without the burned extra, total-calories is never requested', async () => {
  const { google, service } = await connected({ data: MONTH })
  try {
    const result = await service.fetchDays('2026-09-01', '2026-09-30')
    assert.deepEqual(result.errors, {})
    assert.equal(result.points.some((p) => p.metric === 'burned'), false)
    assert.equal(totalCalls(google.requests).length, 0)
    await service.fetchDays('2026-09-01', '2026-09-30', {})
    await service.fetchDays('2026-09-01', '2026-09-30', { burned: false })
    assert.equal(totalCalls(google.requests).length, 0)
  } finally {
    await google.close()
  }
})

test('A-06: revoking the activity scope reports an error for burned just as it does for steps', async () => {
  const { google, service } = await connected({ data: MONTH })
  try {
    google.revokeScope(SCOPES.activity)
    const result = await service.fetchDays('2026-09-15', '2026-09-30', { burned: true })
    assert.ok(result.errors.steps, 'steps reports an error')
    assert.ok(result.errors.calories, 'calories reports an error')
    assert.ok(result.errors.burned, 'burned reports an error')
    assert.equal(result.errors.burned, result.errors.steps)
    assert.equal(result.errors.eaten, undefined) // the food log is still shared
    assert.deepEqual([...new Set(result.points.map((p) => p.metric))], ['eaten'])
    assert.ok(totalCalls(google.requests).length >= 1) // it was asked, and refused
  } finally {
    await google.close()
  }
})
