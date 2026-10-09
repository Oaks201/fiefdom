/**
 * Runs settlement in the app (T06, D-04): once at launch, after the first Fitbit sync attempt (or
 * 10 seconds, whichever comes first), and again at every 04:00 rollover in the campaign's time
 * zone while the app stays open. There is no background process: a closed app settles at its
 * next launch.
 *
 * Development builds can move "now" (A-09): `FIEFDOM_DEV_NOW` fixes the starting instant, and
 * `devAdvanceDays` (also on `window.fiefdomDev`) moves it forward and settles; scripts can read the
 * campaign with `window.fiefdomDev.campaign()`. All are compiled out of production builds and never
 * reachable by the player.
 */
import { openDay } from '../lib/game/clock'
import { momentsFor } from '../lib/game/view/endgame'
import type { ISODate } from '../lib/game/types'
import { useCampaign } from './campaign'
import { appNow, devShiftNow } from './clock'
import { useHealth } from './health'
import { useMoments } from './moments'
import { useLedger } from './store'

/** At launch, settle after the first Fitbit sync attempt or this long, whichever comes first. */
const LAUNCH_SYNC_WAIT_MS = 10_000
/** How often to look for a 04:00 rollover while the app is open. */
const TICK_MS = 15_000
const DAY_MS = 86_400_000

/** The campaign's "now": the app's, which development builds can move (A-09). */
export function campaignNow(): Date {
  return appNow()
}

/** Resolves once the first Fitbit sync has been tried (or can't be), or after `timeoutMs`. */
function firstSyncAttempt(timeoutMs: number): Promise<void> {
  type Health = ReturnType<typeof useHealth.getState>
  const tried = (s: Health): boolean =>
    !s.available || s.lastSync !== null || s.lastError !== null || (s.status !== null && !s.status.connected)
  return new Promise((resolve) => {
    if (tried(useHealth.getState())) {
      resolve()
      return
    }
    const finish = (): void => {
      clearTimeout(timer)
      unsubscribe()
      resolve()
    }
    const timer = setTimeout(finish, timeoutMs)
    const unsubscribe = useHealth.subscribe((s) => {
      if (tried(s)) finish()
    })
  })
}

let lastOpenDay: ISODate | null = null

/** Settles up to now against the current ledger and saves once. */
function runSettle(launch: boolean): void {
  const campaign = useCampaign.getState().campaign
  if (!campaign) {
    lastOpenDay = null
    return
  }
  const now = campaignNow()
  try {
    const result = useCampaign.getState().settleNow(useLedger.getState().ledger, now, { launch })
    // The big moments a settlement raises (Ch 17): Milestones, Grand Battles the Marshal fought and
    // decisive ones, coalitions, Ultimatums, victory and the Fall.
    if (result) useMoments.getState().showAll(momentsFor(result.state, result.events))
  } catch (err) {
    console.error('Settling the campaign failed', err)
  }
  lastOpenDay = openDay(now, campaign.campaign.timeZone)
}

/**
 * Starts the campaign clock. Call once the ledger and the campaign file are both loaded; returns
 * a function that stops it.
 */
export function startCampaignClock(): () => void {
  let stopped = false
  let timer: ReturnType<typeof setInterval> | undefined

  const tick = (): void => {
    const campaign = useCampaign.getState().campaign
    if (stopped || !campaign) return
    if (openDay(campaignNow(), campaign.campaign.timeZone) !== lastOpenDay) runSettle(false)
  }

  void firstSyncAttempt(LAUNCH_SYNC_WAIT_MS).then(() => {
    if (stopped) return
    runSettle(true)
    timer = setInterval(tick, TICK_MS)
    window.addEventListener('focus', tick)
    document.addEventListener('visibilitychange', tick)
  })

  return () => {
    stopped = true
    clearInterval(timer)
    window.removeEventListener('focus', tick)
    document.removeEventListener('visibilitychange', tick)
  }
}

/** Development only (A-09): moves "now" forward by whole days and settles. A no-op in production. */
export function devAdvanceDays(days: number): void {
  if (!import.meta.env.DEV) return
  devShiftNow(days * DAY_MS)
  runSettle(true)
}

/** The campaign's open day now: the day the player acts on, in the campaign's time zone. */
export function campaignToday(timeZone: string): ISODate {
  return openDay(campaignNow(), timeZone)
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.fiefdomDev = { advanceDays: devAdvanceDays, now: campaignNow, campaign: () => useCampaign.getState().campaign }
}
