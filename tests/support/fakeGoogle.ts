/**
 * A stand-in for Google's OAuth endpoints and the Health API's dailyRollUp, faithful enough to
 * exercise sign-in (PKCE, loopback redirect, refresh, revoke) and sync (ranges, paging, retries).
 */
import { createHash } from 'node:crypto'
import http from 'node:http'
import type { AddressInfo } from 'node:net'

export const FAKE_CLIENT = { id: '123456789012-fakeclient.apps.googleusercontent.com', secret: 'GOCSPX-not-a-real-secret' }

const ACTIVITY = 'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly'
const NUTRITION = 'https://www.googleapis.com/auth/googlehealth.nutrition.readonly'

export interface FakeGoogleOptions {
  /** date → values; missing dates have no data point */
  data?: Record<string, { steps?: number; calories?: number; eaten?: number; burned?: number }>
  /** reject the 23:59:59 range format with a 400, as some deployments might */
  rejectInclusiveEnd?: boolean
  /** points per page, to exercise paging */
  pageSize?: number
  /** answer the first data request with a 503 */
  flakyOnce?: boolean
  /** the user untics the food log on the consent screen */
  withholdNutrition?: boolean
  /** the user clicks "Cancel" on the consent screen */
  deny?: boolean
}

export interface FakeGoogle {
  base: string
  /** a client_secret.json pointing at this fake */
  clientFile(): string
  /** what the browser does with Google's consent page: follow it back to the loopback */
  visit(url: string): Promise<void>
  /** Google revokes every token (a Testing project's seven days are up) */
  expireAll(): void
  /** the current access tokens stop working, but refresh still does */
  staleAccess(): void
  /** the user withdraws one scope in their Google account: existing tokens lose it, and its data answers 403 */
  revokeScope(scope: string): void
  requests: Array<{ path: string; body: unknown }>
  close(): Promise<void>
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function startFakeGoogle(opts: FakeGoogleOptions = {}): Promise<FakeGoogle> {
  const codes = new Map<string, { challenge: string; redirect: string; scopes: string[] }>()
  const refresh = new Map<string, string[]>() // token → scopes
  const access = new Map<string, string[]>()
  const requests: FakeGoogle['requests'] = []
  let n = 0
  let flaky = !!opts.flakyOnce

  const json = (res: http.ServerResponse, status: number, body: unknown): void => {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(body))
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      if (req.method === 'GET' && url.pathname === '/o/oauth2/auth') {
        const q = url.searchParams
        if (q.get('client_id') !== FAKE_CLIENT.id || q.get('code_challenge_method') !== 'S256' || q.get('response_type') !== 'code') {
          res.writeHead(400).end('bad auth request')
          return
        }
        const redirect = q.get('redirect_uri')!
        const back = new URL(redirect)
        back.searchParams.set('state', q.get('state') ?? '')
        if (opts.deny) {
          back.searchParams.set('error', 'access_denied')
        } else {
          let scopes = (q.get('scope') ?? '').split(' ')
          if (opts.withholdNutrition) scopes = scopes.filter((s) => s !== NUTRITION)
          const code = `code-${++n}`
          codes.set(code, { challenge: q.get('code_challenge')!, redirect, scopes })
          back.searchParams.set('code', code)
        }
        res.writeHead(302, { Location: back.toString() }).end()
        return
      }

      if (req.method === 'POST' && url.pathname === '/token') {
        const f = new URLSearchParams(raw)
        requests.push({ path: url.pathname, body: Object.fromEntries([...f].filter(([k]) => k === 'grant_type')) })
        if (f.get('client_id') !== FAKE_CLIENT.id || f.get('client_secret') !== FAKE_CLIENT.secret) {
          json(res, 401, { error: 'invalid_client', error_description: 'The OAuth client was not found.' })
          return
        }
        if (f.get('grant_type') === 'authorization_code') {
          const grant = codes.get(f.get('code') ?? '')
          codes.delete(f.get('code') ?? '')
          const verifier = f.get('code_verifier') ?? ''
          if (!grant || grant.redirect !== f.get('redirect_uri') || b64url(createHash('sha256').update(verifier).digest()) !== grant.challenge) {
            json(res, 400, { error: 'invalid_grant', error_description: 'Bad code or verifier.' })
            return
          }
          const rt = `rt-${++n}`
          const at = `at-${++n}`
          refresh.set(rt, grant.scopes)
          access.set(at, grant.scopes)
          json(res, 200, { access_token: at, expires_in: 3599, refresh_token: rt, scope: grant.scopes.join(' '), token_type: 'Bearer' })
          return
        }
        if (f.get('grant_type') === 'refresh_token') {
          const scopes = refresh.get(f.get('refresh_token') ?? '')
          if (!scopes) {
            json(res, 400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' })
            return
          }
          const at = `at-${++n}`
          access.set(at, scopes)
          json(res, 200, { access_token: at, expires_in: 3599, scope: scopes.join(' '), token_type: 'Bearer' })
          return
        }
        json(res, 400, { error: 'unsupported_grant_type' })
        return
      }

      if (req.method === 'POST' && url.pathname === '/revoke') {
        refresh.delete(new URLSearchParams(raw).get('token') ?? '')
        res.writeHead(200).end()
        return
      }

      const m = /^\/v4\/users\/me\/dataTypes\/([a-z-]+)\/dataPoints:dailyRollUp$/.exec(url.pathname)
      if (req.method === 'POST' && m) {
        const body = JSON.parse(raw || '{}') as {
          range?: { start?: { date?: Record<string, number> }; end?: { date?: Record<string, number>; time?: Record<string, number> } }
          pageToken?: string
          pageSize?: number
          windowSizeDays?: number
        }
        requests.push({ path: url.pathname, body })
        const scopes = access.get((req.headers.authorization ?? '').replace(/^Bearer /, ''))
        if (!scopes) {
          json(res, 401, { error: { code: 401, message: 'Request had invalid authentication credentials.', status: 'UNAUTHENTICATED' } })
          return
        }
        if (flaky) {
          flaky = false
          json(res, 503, { error: { code: 503, message: 'The service is currently unavailable.', status: 'UNAVAILABLE' } })
          return
        }
        const type = m[1]
        const needs = type === 'nutrition-log' ? NUTRITION : ACTIVITY
        if (!scopes.includes(needs)) {
          json(res, 403, { error: { code: 403, message: 'Request had insufficient authentication scopes.', status: 'PERMISSION_DENIED' } })
          return
        }
        const s = body.range?.start?.date
        const e = body.range?.end?.date
        const endTime = body.range?.end?.time
        if (!s || !e || body.windowSizeDays !== 1) {
          json(res, 400, { error: { code: 400, message: 'Invalid range.', status: 'INVALID_ARGUMENT' } })
          return
        }
        const maxDays = type === 'total-calories' ? 14 : 90
        const requestedSize = body.pageSize ?? 1440
        // Google validates the page's duration as well as the requested range.
        if (body.windowSizeDays * requestedSize > maxDays) {
          json(res, 400, {
            error: {
              code: 400,
              message: 'Invalid argument in request.',
              status: 'INVALID_ARGUMENT',
              details: [{
                '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
                reason: 'INVALID_ROLLUP_QUERY_DURATION',
                domain: 'health.googleapis.com',
                metadata: { field: 'range', maxDurationDays: String(maxDays), dataType: type }
              }]
            }
          })
          return
        }
        const inclusiveEnd = endTime?.hours === 23
        if (opts.rejectInclusiveEnd && inclusiveEnd) {
          json(res, 400, { error: { code: 400, message: 'Range end must be a day boundary.', status: 'INVALID_ARGUMENT' } })
          return
        }
        const iso = (d: Record<string, number>): string =>
          `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`
        const first = iso(s)
        let last = iso(e)
        if (!inclusiveEnd) last = new Date(Date.parse(`${last}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
        const span = Math.round((Date.parse(`${last}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / 86_400_000) + 1
        if (span > maxDays) {
          // (total-calories counts resting metabolism too; the app reads active-energy-burned instead)
          json(res, 400, { error: { code: 400, message: 'Range too long.', status: 'INVALID_ARGUMENT' } })
          return
        }
        const points: unknown[] = []
        for (let t = Date.parse(`${first}T00:00:00Z`); t <= Date.parse(`${last}T00:00:00Z`); t += 86_400_000) {
          const day = new Date(t).toISOString().slice(0, 10)
          const v = opts.data?.[day]
          const [year, month, dd] = day.split('-').map(Number)
          const civil = (h: number, mi: number, sec: number): unknown => ({ date: { year, month, day: dd }, time: { hours: h, minutes: mi, seconds: sec } })
          const point: Record<string, unknown> = { civilStartTime: civil(0, 0, 0), civilEndTime: civil(23, 59, 59) }
          if (type === 'steps' && v?.steps !== undefined) point.steps = { countSum: String(v.steps) }
          else if (type === 'active-energy-burned' && v?.calories !== undefined) point.activeEnergyBurned = { kcalSum: v.calories }
          else if (type === 'total-calories' && v?.burned !== undefined) point.totalCalories = { kcalSum: v.burned }
          else if (type === 'total-calories' && v?.calories !== undefined) point.totalCalories = { kcalSum: v.calories + 1800 }
          else if (type === 'nutrition-log' && v?.eaten !== undefined) point.nutritionLog = { energy: { kcalSum: v.eaten } }
          else continue
          points.push(point)
        }
        const size = Math.min(requestedSize, opts.pageSize ?? requestedSize)
        const from = body.pageToken ? Number(body.pageToken) : 0
        const page = points.slice(from, from + size)
        json(res, 200, { rollupDataPoints: page, ...(from + size < points.length ? { nextPageToken: String(from + size) } : {}) })
        return
      }

      res.writeHead(404).end()
    })
  })

  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  return {
    base,
    requests,
    clientFile: () =>
      JSON.stringify({
        installed: {
          client_id: FAKE_CLIENT.id,
          project_id: 'fiefdom-test',
          auth_uri: `${base}/o/oauth2/auth`,
          token_uri: `${base}/token`,
          client_secret: FAKE_CLIENT.secret,
          redirect_uris: ['http://localhost']
        }
      }),
    async visit(authUrl: string) {
      const consent = await fetch(authUrl, { redirect: 'manual' })
      const back = consent.headers.get('location')
      if (!back) throw new Error(`consent page answered ${consent.status}`)
      const res = await fetch(back)
      await res.text()
    },
    expireAll() {
      refresh.clear()
      access.clear()
    },
    staleAccess() {
      access.clear()
    },
    revokeScope(scope: string) {
      for (const tokens of [access, refresh]) for (const [token, scopes] of tokens) tokens.set(token, scopes.filter((s) => s !== scope))
    },
    close: () =>
      new Promise<void>((r) => {
        server.close(() => r())
        server.closeAllConnections()
      })
  }
}
