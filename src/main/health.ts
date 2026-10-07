/**
 * Fitbit data through the Google Health API — the route Fitbit now takes (and the one the
 * fitbit-game script uses). Sign-in is Google's installed-app OAuth flow: a loopback redirect to
 * 127.0.0.1 with PKCE. Daily totals come from `dataPoints:dailyRollUp`.
 *
 * Nothing here imports Electron, so it can be tested against a fake Google in plain Node. The
 * Electron side supplies `fetch`, a way to open the browser, and encrypted storage.
 */
import { createHash, randomBytes } from 'node:crypto'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import type { HealthFetchResult, HealthMetric, HealthPoint, HealthStatus } from '../shared/api'

export const SCOPES = {
  /** steps and calories burned */
  activity: 'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  /** the food log: calories eaten */
  nutrition: 'https://www.googleapis.com/auth/googlehealth.nutrition.readonly'
} as const

export const DEFAULT_API_BASE = 'https://health.googleapis.com'

/**
 * How each metric is read: the data type, where the day's total sits in a rollup point, and the longest
 * range one request may ask for. "Calories burned" means calories burned in activity: Google's
 * `total-calories` also counts resting metabolism (about 2,000 a day), which would make a contract's
 * "burn 500 calories" term pass on every day. That total is read separately, as `burned`, only to
 * estimate maintenance for the Healer's range (A-06); it never judges a contract.
 */
const SOURCES: Record<HealthMetric, { type: string; scope: string; maxDays: number; read(point: Record<string, unknown>): unknown }> = {
  steps: { type: 'steps', scope: SCOPES.activity, maxDays: 90, read: (p) => pick(p, 'steps', 'countSum') },
  calories: { type: 'active-energy-burned', scope: SCOPES.activity, maxDays: 90, read: (p) => pick(p, 'activeEnergyBurned', 'kcalSum') },
  eaten: { type: 'nutrition-log', scope: SCOPES.nutrition, maxDays: 90, read: (p) => pick(p, 'nutritionLog', 'energy', 'kcalSum') },
  burned: { type: 'total-calories', scope: SCOPES.activity, maxDays: 14, read: (p) => pick(p, 'totalCalories', 'kcalSum') }
}

/** The metrics a connection shows as tallies. `burned` is read beside them on request, never shown. */
const METRIC_ORDER: HealthMetric[] = ['steps', 'calories', 'eaten']

/** Extra reads that never become tallies. */
export interface FetchExtras {
  /** total calories burned, resting included (A-06) */
  burned?: boolean
}
/** Where Google's OAuth endpoints live, in current and older client files. */
const GOOGLE_HOSTS = new Set(['accounts.google.com', 'oauth2.googleapis.com', 'www.googleapis.com'])
const GOOGLE_REVOKE = 'https://oauth2.googleapis.com/revoke'

function isLoopback(host: string): boolean {
  return host === '127.0.0.1' || host === 'localhost' || host === '[::1]'
}
const SIGN_IN_TIMEOUT_MS = 5 * 60_000
const MAX_RANGE_DAYS = 90

// ---------------------------------------------------------------------------
// Configuration and storage
// ---------------------------------------------------------------------------

export interface ClientConfig {
  clientId: string
  clientSecret: string
  authUri: string
  tokenUri: string
}

/** What is kept between launches. The Electron side encrypts the secrets before they touch the disk. */
export interface StoredHealth {
  client?: ClientConfig
  refreshToken?: string
  /** scopes Google granted */
  scopes?: string[]
  /** why the connection needs attention */
  problem?: string
}

export interface HealthStore {
  read(): StoredHealth
  write(data: StoredHealth): void
  /** the secrets are encrypted by the operating system */
  readonly encrypted: boolean
}

export interface HealthDeps {
  fetch: typeof fetch
  /** opens Google's consent page in the user's browser */
  openExternal(url: string): Promise<void> | void
  store: HealthStore
  apiBase?: string
  /** called once the browser hands the sign-in back, so the app can come to the front */
  onSignedIn?(): void
  /** milliseconds to wait between retries (tests shorten it) */
  retryDelayMs?: number
}

/** The part of a client ID worth showing: "123456…apps.googleusercontent.com". */
export function clientHint(clientId: string): string {
  const [head, ...rest] = clientId.split('.')
  const short = head.length > 10 ? `${head.slice(0, 6)}…${head.slice(-4)}` : head
  return [short, ...rest].join('.')
}

/**
 * Reads the JSON that Google Cloud Console offers for download ("client_secret_….json").
 * A Desktop-app client has an `installed` section; a Web client, `web`.
 */
export function parseClientFile(text: string): ClientConfig {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('That file is not JSON. Choose the client file downloaded from Google Cloud Console.')
  }
  const root = isObj(raw) ? raw : {}
  const section = isObj(root.installed) ? root.installed : isObj(root.web) ? root.web : null
  if (!section) throw new Error('That is not a Google OAuth client file. It should hold an “installed” (Desktop app) client.')
  const clientId = section.client_id
  const clientSecret = section.client_secret
  if (typeof clientId !== 'string' || !clientId.trim()) throw new Error('The client file has no client_id.')
  if (typeof clientSecret !== 'string' || !clientSecret.trim()) throw new Error('The client file has no client_secret.')
  const authUri = typeof section.auth_uri === 'string' ? section.auth_uri : 'https://accounts.google.com/o/oauth2/auth'
  const tokenUri = typeof section.token_uri === 'string' ? section.token_uri : 'https://oauth2.googleapis.com/token'
  for (const u of [authUri, tokenUri]) {
    let url: URL
    try {
      url = new URL(u)
    } catch {
      throw new Error('The client file has an unreadable address in it.')
    }
    // the secret and tokens are only ever sent to Google (or, for testing, to this computer)
    const google = url.protocol === 'https:' && GOOGLE_HOSTS.has(url.hostname)
    if (!google && !(url.protocol === 'http:' && isLoopback(url.hostname))) throw new Error('The client file points somewhere other than Google.')
  }
  return { clientId: clientId.trim(), clientSecret: clientSecret.trim(), authUri, tokenUri }
}

/** What a set of granted scopes can read. */
export function metricsFor(scopes: readonly string[] | undefined): HealthMetric[] {
  const granted = new Set(scopes ?? [])
  return METRIC_ORDER.filter((m) => granted.has(SOURCES[m].scope))
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
  }
}

/** Google has withdrawn access; only a new sign-in will do. */
export class ReconnectNeeded extends Error {}

class Cancelled extends Error {}

/** Google's error bodies look like {"error":{"code":403,"message":"…","status":"PERMISSION_DENIED"}}. */
function googleMessage(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string; status?: string } | string; error_description?: string }
    if (typeof parsed.error === 'object' && parsed.error?.message) return parsed.error.message
    if (parsed.error_description) return parsed.error_description
    if (typeof parsed.error === 'string') return parsed.error
  } catch {
    /* not JSON */
  }
  return `HTTP ${status}`
}

function friendly(err: unknown, metric: HealthMetric): string {
  if (err instanceof ApiError) {
    if (err.status === 403) {
      return metric === 'eaten'
        ? 'Google refused the food log — add the nutrition scope to your project, then connect again'
        : 'Google refused — check that the Google Health API is enabled and its scopes are added, then connect again'
    }
    if (err.status === 404) return 'this data isn’t available for your account'
    if (err.status === 429) return 'Google is busy; it will be tried again shortly'
    return err.message
  }
  const text = err instanceof Error ? err.message : String(err)
  return /fetch failed|ENOTFOUND|ECONNREFUSED|ERR_INTERNET|ERR_NAME|network/i.test(text) ? 'Google could not be reached — are you online?' : text
}

// ---------------------------------------------------------------------------
// Dates: Google's CivilDateTime is a local date and time with no zone.
// ---------------------------------------------------------------------------

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function isoToUTC(iso: string): number {
  const m = ISO_RE.exec(iso)
  if (!m) throw new Error(`Not a date: ${iso}`)
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (new Date(t).toISOString().slice(0, 10) !== iso) throw new Error(`Not a date: ${iso}`)
  return t
}

function utcToISO(t: number): string {
  return new Date(t).toISOString().slice(0, 10)
}

function addDaysISO(iso: string, n: number): string {
  return utcToISO(isoToUTC(iso) + n * 86_400_000)
}

function daysBetween(a: string, b: string): number {
  return Math.round((isoToUTC(b) - isoToUTC(a)) / 86_400_000)
}

function civil(iso: string, hours = 0, minutes = 0, seconds = 0): object {
  const [year, month, day] = iso.split('-').map(Number)
  return { date: { year, month, day }, time: { hours, minutes, seconds, nanos: 0 } }
}

/** "first through last", written the two ways Google accepts: ending at 23:59:59, or at the next midnight. */
function rangeFormats(first: string, last: string): object[] {
  return [
    { start: civil(first), end: civil(last, 23, 59, 59) },
    { start: civil(first), end: civil(addDaysISO(last, 1)) }
  ]
}

function pointDate(point: Record<string, unknown>): string | null {
  const start = point.civilStartTime
  const d = isObj(start) ? start.date : undefined
  if (!isObj(d)) return null
  const { year, month, day } = d
  if (typeof year !== 'number' || typeof month !== 'number' || typeof day !== 'number') return null
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// The service
// ---------------------------------------------------------------------------

interface PendingSignIn {
  cancel(): void
}

export class HealthService {
  private data: StoredHealth
  private access: { token: string; expiresAt: number } | null = null
  private pending: PendingSignIn | null = null
  private readonly apiBase: string

  constructor(private readonly deps: HealthDeps) {
    this.apiBase = (deps.apiBase ?? DEFAULT_API_BASE).replace(/\/+$/, '')
    try {
      this.data = deps.store.read()
    } catch {
      this.data = {}
    }
  }

  status(): HealthStatus {
    const connected = !!this.data.client && !!this.data.refreshToken
    return {
      hasClient: !!this.data.client,
      clientHint: this.data.client ? clientHint(this.data.client.clientId) : null,
      connected,
      metrics: connected ? metricsFor(this.data.scopes) : [],
      problem: this.data.problem ?? null,
      encrypted: this.deps.store.encrypted,
      connecting: !!this.pending
    }
  }

  private save(next: StoredHealth): void {
    this.data = next
    this.deps.store.write(next)
  }

  /** Takes the client file's text. A different client means signing in again. */
  setClient(text: string): HealthStatus {
    const client = parseClientFile(text)
    const same = this.data.client?.clientId === client.clientId
    this.access = same ? this.access : null
    this.save(same ? { ...this.data, client } : { client })
    return this.status()
  }

  forgetClient(): HealthStatus {
    this.pending?.cancel()
    this.access = null
    this.save({})
    return this.status()
  }

  cancelConnect(): void {
    this.pending?.cancel()
  }

  /** Signs in through the browser. Resolves with the new status; a cancelled sign-in simply changes nothing. */
  async connect(options: { nutrition: boolean }): Promise<HealthStatus> {
    const client = this.data.client
    if (!client) throw new Error('Load your Google client file first.')
    if (this.pending) throw new Error('A sign-in is already waiting in your browser.')

    const verifier = base64url(randomBytes(48))
    const challenge = base64url(createHash('sha256').update(verifier).digest())
    const state = base64url(randomBytes(24))
    const scopes = [SCOPES.activity, ...(options.nutrition ? [SCOPES.nutrition] : [])]

    const loop = await startLoopback(state)
    let cancel!: () => void
    const cancelled = new Promise<never>((_, reject) => {
      cancel = () => reject(new Cancelled('Sign-in cancelled.'))
    })
    cancelled.catch(() => undefined) // Cancel can be pressed before anything awaits it
    this.pending = { cancel }
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('The sign-in timed out. Try connecting again.')), SIGN_IN_TIMEOUT_MS)
    })
    timeout.catch(() => undefined)

    try {
      const url = new URL(client.authUri)
      url.searchParams.set('client_id', client.clientId)
      url.searchParams.set('redirect_uri', loop.redirectUri)
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('scope', scopes.join(' '))
      url.searchParams.set('access_type', 'offline')
      url.searchParams.set('prompt', 'consent')
      url.searchParams.set('code_challenge', challenge)
      url.searchParams.set('code_challenge_method', 'S256')
      url.searchParams.set('state', state)
      await this.deps.openExternal(url.toString())

      const code = await Promise.race([loop.code, cancelled, timeout])
      this.deps.onSignedIn?.()
      const tokens = await this.tokenRequest(client, {
        grant_type: 'authorization_code',
        code,
        redirect_uri: loop.redirectUri,
        code_verifier: verifier
      })
      if (typeof tokens.refresh_token !== 'string' || !tokens.refresh_token) {
        throw new Error('Google did not grant lasting access. Try connecting again.')
      }
      const granted = typeof tokens.scope === 'string' && tokens.scope.trim() ? tokens.scope.trim().split(/\s+/) : scopes
      this.keepAccess(tokens)
      const problem = metricsFor(granted).includes('steps')
        ? undefined
        : 'Google didn’t share your activity, so steps can’t be read. Connect again and allow it.'
      this.save({ client, refreshToken: tokens.refresh_token, scopes: granted, ...(problem ? { problem } : {}) })
    } catch (err) {
      if (!(err instanceof Cancelled)) throw err
    } finally {
      clearTimeout(timer)
      this.pending = null
      loop.close()
    }
    return this.status()
  }

  /** Forgets the connection, and asks Google to revoke it too. */
  async disconnect(): Promise<HealthStatus> {
    const token = this.data.refreshToken
    const client = this.data.client
    this.access = null
    this.save(client ? { client } : {})
    if (token && client) {
      try {
        const tokenUrl = new URL(client.tokenUri)
        const revoke = isLoopback(tokenUrl.hostname) ? new URL('/revoke', tokenUrl) : new URL(GOOGLE_REVOKE)
        await this.deps.fetch(revoke, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token }).toString(),
          signal: AbortSignal.timeout(8000)
        })
      } catch {
        /* the local copy is gone either way */
      }
    }
    return this.status()
  }

  /**
   * Daily totals for each date from `start` to `end` inclusive, for whatever the granted scopes allow.
   * `extras.burned` also reads total calories burned, when the activity scope was granted.
   */
  async fetchDays(start: string, end: string, extras: FetchExtras = {}): Promise<HealthFetchResult> {
    if (!this.data.client || !this.data.refreshToken) throw new Error('Fitbit is not connected.')
    const span = daysBetween(start, end)
    if (span < 0 || span >= MAX_RANGE_DAYS) throw new Error('That range of days cannot be read.')

    const metrics = metricsFor(this.data.scopes)
    if (extras.burned && (this.data.scopes ?? []).includes(SOURCES.burned.scope)) metrics.push('burned')

    const points: HealthPoint[] = []
    const errors: HealthFetchResult['errors'] = {}
    for (const metric of metrics) {
      try {
        const values = await this.rollup(metric, start, end)
        for (const [date, value] of values) points.push({ date, metric, value })
      } catch (err) {
        if (err instanceof ReconnectNeeded) throw err
        errors[metric] = friendly(err, metric)
      }
    }
    return { points, errors, status: this.status() }
  }

  // -------------------------------------------------------------------------

  private async rollup(metric: HealthMetric, first: string, last: string): Promise<Map<string, number>> {
    const source = SOURCES[metric]
    const url = `${this.apiBase}/v4/users/me/dataTypes/${source.type}/dataPoints:dailyRollUp`
    const values = new Map<string, number>()

    for (let chunkStart = first; chunkStart <= last; ) {
      const chunkEnd = [addDaysISO(chunkStart, source.maxDays - 1), last].sort()[0]
      // Google caps windowSizeDays * pageSize too; its default can exceed the nutrition limit.
      const pageSize = daysBetween(chunkStart, chunkEnd) + 1
      let lastError: unknown = null
      for (const range of rangeFormats(chunkStart, chunkEnd)) {
        try {
          let pageToken: string | undefined
          do {
            const body: Record<string, unknown> = { range, windowSizeDays: 1, pageSize, ...(pageToken ? { pageToken } : {}) }
            const data = await this.post(url, body)
            const list = Array.isArray(data.rollupDataPoints) ? data.rollupDataPoints : []
            for (const point of list) {
              if (!isObj(point)) continue
              const date = pointDate(point)
              const raw = source.read(point)
              const value = typeof raw === 'string' ? Number(raw) : raw
              if (date && typeof value === 'number' && Number.isFinite(value)) values.set(date, value)
            }
            pageToken = typeof data.nextPageToken === 'string' && data.nextPageToken ? data.nextPageToken : undefined
          } while (pageToken)
          lastError = null
          break
        } catch (err) {
          lastError = err
          // only a malformed range is worth asking again in the other format
          if (!(err instanceof ApiError) || err.status !== 400) break
        }
      }
      if (lastError) throw lastError
      chunkStart = addDaysISO(chunkEnd, 1)
    }
    return values
  }

  private async post(url: string, body: object): Promise<Record<string, unknown>> {
    const delay = this.deps.retryDelayMs ?? 1000
    let refreshed = false
    for (let attempt = 0; ; attempt++) {
      const token = await this.accessToken()
      let res: Response
      try {
        res = await this.deps.fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(30_000)
        })
      } catch (err) {
        if (attempt < 2) {
          await sleep(delay * 2 ** attempt)
          continue
        }
        throw err
      }
      if (res.status === 401 && !refreshed) {
        // the access token went stale early; fetch a fresh one once
        refreshed = true
        this.access = null
        continue
      }
      if ((res.status === 429 || res.status >= 500) && attempt < 3) {
        await sleep(delay * 2 ** attempt)
        continue
      }
      const text = await res.text()
      if (!res.ok) throw new ApiError(res.status, googleMessage(res.status, text))
      try {
        const parsed: unknown = JSON.parse(text || '{}')
        return isObj(parsed) ? parsed : {}
      } catch {
        throw new ApiError(res.status, 'Google sent something unreadable.')
      }
    }
  }

  private async accessToken(): Promise<string> {
    if (this.access && Date.now() < this.access.expiresAt - 60_000) return this.access.token
    const client = this.data.client
    const refreshToken = this.data.refreshToken
    if (!client || !refreshToken) throw new ReconnectNeeded('Fitbit is not connected.')
    let tokens: Record<string, unknown>
    try {
      tokens = await this.tokenRequest(client, { grant_type: 'refresh_token', refresh_token: refreshToken })
    } catch (err) {
      if (err instanceof ApiError && /invalid_grant|expired|revoked/i.test(err.message)) {
        const problem =
          'Google has ended Fiefdom’s access to Fitbit — a project in Testing only keeps it for seven days, and it also ends if access is revoked. Connect again.'
        this.save({ client, problem })
        this.access = null
        throw new ReconnectNeeded(problem)
      }
      throw err
    }
    this.keepAccess(tokens)
    if (this.data.problem) this.save({ ...this.data, problem: undefined })
    return this.access!.token
  }

  private keepAccess(tokens: Record<string, unknown>): void {
    if (typeof tokens.access_token !== 'string') throw new Error('Google sent no access token.')
    const life = typeof tokens.expires_in === 'number' ? tokens.expires_in : 3600
    this.access = { token: tokens.access_token, expiresAt: Date.now() + life * 1000 }
  }

  private async tokenRequest(client: ClientConfig, params: Record<string, string>): Promise<Record<string, unknown>> {
    const res = await this.deps.fetch(client.tokenUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ client_id: client.clientId, client_secret: client.clientSecret, ...params }).toString(),
      signal: AbortSignal.timeout(30_000)
    })
    const text = await res.text()
    if (!res.ok) {
      let code = ''
      try {
        const parsed = JSON.parse(text) as { error?: unknown }
        if (typeof parsed.error === 'string') code = parsed.error
      } catch {
        /* not JSON */
      }
      const message = googleMessage(res.status, text)
      throw new ApiError(res.status, code && !message.includes(code) ? `${code}: ${message}` : message)
    }
    const parsed: unknown = JSON.parse(text)
    return isObj(parsed) ? parsed : {}
  }
}

// ---------------------------------------------------------------------------
// The loopback redirect: a tiny server on 127.0.0.1 that waits for Google to send the browser back.
// ---------------------------------------------------------------------------

const PAGE = (title: string, line: string): string => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Fiefdom</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#2d190b;font-family:Georgia,serif;color:#2a1a0c}
main{max-width:30rem;padding:2.2rem 2.6rem;background:#f3e3bd;border-radius:6px;box-shadow:0 10px 30px rgba(0,0,0,.5);text-align:center}
h1{margin:0 0 .6rem;font-size:1.7rem;color:#8b1e1a}p{margin:0;font-size:1.1rem;line-height:1.5}
</style></head><body><main><h1>${title}</h1><p>${line}</p></main></body></html>`

function startLoopback(state: string): Promise<{ redirectUri: string; code: Promise<string>; close(): void }> {
  return new Promise((resolveStart, rejectStart) => {
    let settle!: { resolve(code: string): void; reject(err: Error): void }
    const code = new Promise<string>((resolve, reject) => {
      settle = { resolve, reject }
    })
    code.catch(() => undefined) // a rejection nobody awaits yet must not crash the app
    let done = false

    const server = http.createServer((req, res) => {
      let url: URL
      try {
        url = new URL(req.url ?? '/', 'http://127.0.0.1')
      } catch {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('Bad request')
        return
      }
      if (req.method !== 'GET' || url.pathname !== '/' || url.searchParams.get('state') !== state || done) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('Not found')
        return
      }
      done = true
      const error = url.searchParams.get('error')
      const got = url.searchParams.get('code')
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
      if (got && !error) {
        res.end(PAGE('Fiefdom is connected', 'You can close this tab and return to your ledger.'))
        settle.resolve(got)
      } else {
        res.end(PAGE('Fiefdom was not connected', 'Nothing was shared. You can close this tab.'))
        settle.reject(new Error(error === 'access_denied' ? 'You declined to share your Fitbit data with Fiefdom.' : `Google refused the sign-in (${error ?? 'no code'}).`))
      }
    })
    server.on('error', rejectStart)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      resolveStart({
        redirectUri: `http://127.0.0.1:${port}/`,
        code,
        close: () => {
          server.close()
          server.closeAllConnections?.()
        }
      })
    })
  })
}

// ---------------------------------------------------------------------------

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function pick(o: Record<string, unknown>, ...path: string[]): unknown {
  let cur: unknown = o
  for (const key of path) {
    if (!isObj(cur)) return undefined
    cur = cur[key]
  }
  return cur
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
