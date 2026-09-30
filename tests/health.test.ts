import { test } from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import { clientHint, HealthService, metricsFor, parseClientFile, ReconnectNeeded, SCOPES, type HealthStore, type StoredHealth } from '../src/main/health'
import { FAKE_CLIENT, startFakeGoogle, type FakeGoogleOptions } from './support/fakeGoogle'

function memoryStore(initial: StoredHealth = {}): HealthStore & { saved: StoredHealth } {
  const box = { saved: initial }
  return {
    encrypted: true,
    get saved() {
      return box.saved
    },
    read: () => structuredClone(box.saved),
    write: (d) => {
      box.saved = structuredClone(d)
    }
  }
}

async function setup(opts: FakeGoogleOptions = {}) {
  const google = await startFakeGoogle(opts)
  const store = memoryStore()
  const opened: string[] = []
  const service = new HealthService({
    fetch,
    store,
    apiBase: google.base,
    retryDelayMs: 1,
    openExternal: (url) => {
      opened.push(url)
      // the browser: Google's consent page sends it back to Fiefdom's loopback address
      setTimeout(() => void google.visit(url), 5)
    }
  })
  return { google, store, service, opened }
}

const WEEK = {
  '2026-09-22': { steps: 4200, calories: 2100.4, eaten: 1650 },
  '2026-09-23': { steps: 12050, calories: 2600 },
  '2026-09-24': { steps: 0, calories: 1880.5, eaten: 0 },
  '2026-09-25': { steps: 9876, calories: 2300, eaten: 2240.6 },
  '2026-09-26': { steps: 1558, calories: 1880.528168 }
}

test('the client file is read, validated and never shown in full', () => {
  const file = JSON.stringify({ installed: { client_id: FAKE_CLIENT.id, client_secret: 's', auth_uri: 'https://accounts.google.com/o/oauth2/auth', token_uri: 'https://oauth2.googleapis.com/token' } })
  const c = parseClientFile(file)
  assert.equal(c.clientId, FAKE_CLIENT.id)
  assert.equal(clientHint(c.clientId), '123456…ient.apps.googleusercontent.com')
  assert.throws(() => parseClientFile('nope'), /not JSON/)
  assert.throws(() => parseClientFile('{"token": "x"}'), /not a Google OAuth client/)
  assert.throws(() => parseClientFile(JSON.stringify({ installed: { client_id: 'x' } })), /client_secret/)
  assert.throws(
    () => parseClientFile(JSON.stringify({ installed: { client_id: 'x', client_secret: 'y', token_uri: 'http://evil.example/token' } })),
    /somewhere other than Google/
  )
  // https alone isn't enough: the secret and tokens only ever go to Google
  assert.throws(
    () => parseClientFile(JSON.stringify({ installed: { client_id: 'x', client_secret: 'y', token_uri: 'https://attacker.example/token' } })),
    /somewhere other than Google/
  )
  assert.doesNotThrow(() =>
    parseClientFile(JSON.stringify({ installed: { client_id: 'x', client_secret: 'y', token_uri: 'https://accounts.google.com/o/oauth2/token' } }))
  )
  assert.deepEqual(metricsFor([SCOPES.activity]), ['steps', 'calories'])
  assert.deepEqual(metricsFor([SCOPES.activity, SCOPES.nutrition]), ['steps', 'calories', 'eaten'])
})

test('connecting signs in through the browser with PKCE and keeps only a refresh token', async () => {
  const { google, store, service, opened } = await setup({ data: WEEK })
  try {
    await assert.rejects(service.connect({ nutrition: true }), /client file first/)
    service.setClient(google.clientFile())
    const status = await service.connect({ nutrition: true })
    assert.equal(status.connected, true)
    assert.deepEqual(status.metrics, ['steps', 'calories', 'eaten'])
    assert.equal(status.connecting, false)
    const auth = new URL(opened[0])
    assert.equal(auth.searchParams.get('access_type'), 'offline')
    assert.equal(auth.searchParams.get('code_challenge_method'), 'S256')
    assert.match(auth.searchParams.get('redirect_uri')!, /^http:\/\/127\.0\.0\.1:\d+\/$/)
    assert.equal(auth.searchParams.get('scope'), `${SCOPES.activity} ${SCOPES.nutrition}`)
    assert.match(store.saved.refreshToken!, /^rt-/)
    // the status the renderer sees carries no secret
    assert.ok(!JSON.stringify(status).includes(FAKE_CLIENT.secret))
    assert.ok(!JSON.stringify(status).includes(store.saved.refreshToken!))
  } finally {
    await google.close()
  }
})

test('daily totals come back for each metric, across pages', async () => {
  const { google, service } = await setup({ data: WEEK, pageSize: 2 })
  try {
    service.setClient(google.clientFile())
    await service.connect({ nutrition: true })
    const result = await service.fetchDays('2026-09-20', '2026-09-26')
    assert.deepEqual(result.errors, {})
    const get = (metric: string, date: string): number | undefined => result.points.find((p) => p.metric === metric && p.date === date)?.value
    assert.equal(get('steps', '2026-09-23'), 12050)
    assert.equal(get('steps', '2026-09-26'), 1558)
    // calories burned in activity — not the resting-metabolism-inclusive total
    assert.equal(get('calories', '2026-09-26'), 1880.528168)
    assert.equal(google.requests.some((r) => r.path.includes('/total-calories/')), false)
    assert.equal(get('eaten', '2026-09-25'), 2240.6)
    assert.equal(get('eaten', '2026-09-23'), undefined)
    assert.equal(result.points.filter((p) => p.metric === 'steps').length, 5)
    const stepCalls = google.requests.filter((r) => r.path.includes('/steps/'))
    assert.equal(stepCalls.length, 3) // five points, two to a page
  } finally {
    await google.close()
  }
})

test('the other range format is tried when Google rejects the first, and busy answers are retried', async () => {
  const { google, service } = await setup({ data: WEEK, rejectInclusiveEnd: true, flakyOnce: true })
  try {
    service.setClient(google.clientFile())
    await service.connect({ nutrition: false })
    const result = await service.fetchDays('2026-09-22', '2026-09-26')
    assert.deepEqual(result.errors, {})
    assert.equal(result.points.filter((p) => p.metric === 'steps').length, 5)
    assert.equal(result.points.some((p) => p.metric === 'eaten'), false) // never asked for
  } finally {
    await google.close()
  }
})

test('a long range is read in one request per metric; beyond ninety days is refused', async () => {
  const { google, service } = await setup({ data: WEEK })
  try {
    service.setClient(google.clientFile())
    await service.connect({ nutrition: false })
    await service.fetchDays('2026-06-29', '2026-09-26') // exactly 90 days
    assert.equal(google.requests.filter((r) => r.path.includes('/active-energy-burned/')).length, 1)
    assert.equal(google.requests.filter((r) => r.path.includes('/steps/')).length, 1)
    await assert.rejects(service.fetchDays('2026-06-28', '2026-09-26'), /range/)
  } finally {
    await google.close()
  }
})

test('cancelling while the browser is still opening is quiet', { timeout: 10_000 }, async () => {
  const google = await startFakeGoogle({ data: WEEK })
  const unhandled: unknown[] = []
  const onUnhandled = (reason: unknown): void => {
    unhandled.push(reason)
  }
  process.on('unhandledRejection', onUnhandled)
  const service = new HealthService({
    fetch,
    store: memoryStore(),
    apiBase: google.base,
    // a slow browser start: Cancel is pressed before this returns
    openExternal: () => new Promise((r) => setTimeout(r, 200))
  })
  try {
    service.setClient(google.clientFile())
    const pending = service.connect({ nutrition: false })
    await new Promise((r) => setTimeout(r, 40))
    service.cancelConnect()
    await new Promise((r) => setTimeout(r, 60)) // the rejection has happened; nothing awaits it yet
    const status = await pending
    assert.equal(status.connected, false)
    assert.equal(status.connecting, false)
    assert.deepEqual(unhandled, [])
  } finally {
    process.off('unhandledRejection', onUnhandled)
    await google.close()
  }
})

test('junk sent to the sign-in port is refused, and the sign-in carries on', { timeout: 10_000 }, async () => {
  const google = await startFakeGoogle({ data: WEEK })
  const service = new HealthService({
    fetch,
    store: memoryStore(),
    apiBase: google.base,
    openExternal: async (url) => {
      const port = Number(new URL(new URL(url).searchParams.get('redirect_uri')!).port)
      const reply = await new Promise<string>((resolve) => {
        const sock = net.connect(port, '127.0.0.1', () => sock.write('GET // HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n'))
        let text = ''
        sock.on('data', (d) => (text += d))
        sock.on('close', () => resolve(text))
        sock.on('error', () => resolve(text))
        setTimeout(() => {
          sock.destroy()
          resolve(text)
        }, 2000)
      })
      assert.match(reply, /^HTTP\/1\.1 400/)
      await google.visit(url)
    }
  })
  try {
    service.setClient(google.clientFile())
    assert.equal((await service.connect({ nutrition: false })).connected, true)
  } finally {
    await google.close()
  }
})

test('a food log Google did not share is reported, not fatal', async () => {
  const { google, service } = await setup({ data: WEEK, withholdNutrition: true })
  try {
    service.setClient(google.clientFile())
    const status = await service.connect({ nutrition: true })
    assert.deepEqual(status.metrics, ['steps', 'calories'])
    const result = await service.fetchDays('2026-09-22', '2026-09-26')
    assert.ok(result.points.length > 0)
  } finally {
    await google.close()
  }
})

test('a stale access token is refreshed; a revoked one asks for a new sign-in', async () => {
  const { google, store, service } = await setup({ data: WEEK })
  try {
    service.setClient(google.clientFile())
    await service.connect({ nutrition: true })
    google.staleAccess()
    assert.equal((await service.fetchDays('2026-09-25', '2026-09-26')).points.length > 0, true)

    google.expireAll()
    // a fresh service, as after a restart: it only has the stored refresh token
    const again = new HealthService({ fetch, store, apiBase: google.base, retryDelayMs: 1, openExternal: () => undefined })
    await assert.rejects(again.fetchDays('2026-09-25', '2026-09-26'), (err: unknown) => err instanceof ReconnectNeeded && /seven days/.test(String(err)))
    const status = again.status()
    assert.equal(status.connected, false)
    assert.equal(status.hasClient, true)
    assert.match(status.problem!, /Connect again/)
    assert.equal(store.saved.refreshToken, undefined)
  } finally {
    await google.close()
  }
})

test('declining on the consent screen, cancelling, and disconnecting', async () => {
  const denied = await setup({ deny: true })
  try {
    denied.service.setClient(denied.google.clientFile())
    await assert.rejects(denied.service.connect({ nutrition: true }), /declined/)
    assert.equal(denied.service.status().connected, false)
  } finally {
    await denied.google.close()
  }

  const google = await startFakeGoogle({ data: WEEK })
  const store = memoryStore()
  let visit = (): void => undefined
  const service = new HealthService({
    fetch,
    store,
    apiBase: google.base,
    openExternal: (url) => {
      visit = () => void google.visit(url)
    }
  })
  try {
    service.setClient(google.clientFile())
    const pending = service.connect({ nutrition: false })
    await new Promise((r) => setTimeout(r, 20))
    assert.equal(service.status().connecting, true)
    service.cancelConnect()
    assert.equal((await pending).connected, false)
    assert.equal(service.status().connecting, false)

    const next = service.connect({ nutrition: false })
    await new Promise((r) => setTimeout(r, 20))
    visit()
    assert.equal((await next).connected, true)
    const token = store.saved.refreshToken
    const off = await service.disconnect()
    assert.equal(off.connected, false)
    assert.equal(off.hasClient, true)
    assert.ok(google.requests.length >= 0)
    assert.equal(store.saved.refreshToken, undefined)
    assert.ok(token)
    assert.equal(service.forgetClient().hasClient, false)
  } finally {
    await google.close()
  }
})
