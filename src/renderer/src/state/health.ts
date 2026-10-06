/**
 * Fitbit sync, as the renderer sees it. The Google sign-in, tokens and requests all live in the
 * main process; this side asks for daily totals and folds them into the ledger, never replacing
 * a number typed by hand. Manual entry keeps working whether or not Fitbit ever connects.
 */
import { create } from 'zustand'
import type { HealthMetric, HealthStatus } from '../../../shared/api'
import { sfx } from '../audio'
import { addDays } from '../lib/dates'
import { formatNumber } from '../lib/format'
import { mergeSynced } from '../lib/ledger'
import { useClock } from './clock'
import { getReputation } from './hooks'
import { useLedger } from './store'
import { toast } from './toasts'

const bridge = typeof window !== 'undefined' ? window.fiefdom?.health : undefined

/** How many days back each sync reads (Google allows at most 14 per request for calories burned). */
export const SYNC_DAYS = 14
const AUTO_EVERY_MS = 15 * 60_000
const STALE_AFTER_MS = 5 * 60_000

export const METRIC_NAMES: Record<HealthMetric, string> = {
  steps: 'steps',
  eaten: 'calories eaten (food log)',
  calories: 'calories burned in activity',
  burned: 'total calories burned'
}

type Busy = null | 'import' | 'connect' | 'disconnect' | 'forget'

interface HealthState {
  /** false in a plain browser, where there is no main process to ask */
  available: boolean
  status: HealthStatus | null
  syncing: boolean
  /** when the last sync finished, in ms */
  lastSync: number | null
  /** what went wrong on the last sync, if anything */
  lastError: string | null
  busy: Busy
  refresh(): Promise<HealthStatus | null>
  sync(options?: { quiet?: boolean }): Promise<void>
  importClient(): Promise<void>
  connect(nutrition: boolean): Promise<void>
  cancelConnect(): Promise<void>
  disconnect(): Promise<void>
  forgetClient(): Promise<void>
}

/** IPC rejections arrive as "Error invoking remote method 'x': Error: the message". */
export function ipcMessage(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err)
  return text.replace(/^Error invoking remote method '[^']+': (?:[A-Za-z]*Error: )?/, '')
}

export const useHealth = create<HealthState>((set, get) => {
  /** Runs a connection chore with a busy marker, surfacing failures as a notice. */
  const chore = async (busy: Busy, work: () => Promise<HealthStatus>, success?: (s: HealthStatus) => void): Promise<void> => {
    if (!bridge || get().busy) return
    set({ busy })
    try {
      const status = await work()
      set({ status })
      success?.(status)
    } catch (err) {
      toast(ipcMessage(err), 'error')
      sfx('error')
      void get().refresh()
    } finally {
      set({ busy: null })
    }
  }

  return {
    available: !!bridge,
    status: null,
    syncing: false,
    lastSync: null,
    lastError: null,
    busy: null,

    async refresh() {
      if (!bridge) return null
      try {
        const status = await bridge.status()
        set({ status })
        return status
      } catch (err) {
        console.warn('Fitbit status unavailable', err)
        return null
      }
    },

    async sync({ quiet = false } = {}) {
      if (!bridge || get().syncing) return
      if (useLedger.getState().status !== 'ready') return
      set({ syncing: true })
      try {
        const today = useClock.getState().today
        const result = await bridge.fetch({ start: addDays(today, -(SYNC_DAYS - 1)), end: today })
        const problems = Object.entries(result.errors).map(([m, why]) => `${METRIC_NAMES[m as HealthMetric]}: ${why}`)
        set({ status: result.status, lastSync: Date.now(), lastError: problems.length ? problems.join(' · ') : null })

        const before = useLedger.getState().ledger
        useLedger.getState().apply((l) => mergeSynced(l, result.points))
        announce(before, today, quiet)
        if (!quiet && problems.length) toast(`Fitbit: ${problems[0]}`, 'error')
        else if (!quiet) toast(result.points.length ? 'Fitbit is synced.' : 'Fitbit had nothing new to report.', 'success')
      } catch (err) {
        const message = ipcMessage(err)
        set({ lastError: message })
        void get().refresh()
        if (!quiet) toast(`Fitbit: ${message}`, 'error')
      } finally {
        set({ syncing: false })
      }
    },

    importClient: () =>
      chore('import', () => bridge!.importClient(), (s) => {
        if (s.hasClient) sfx('quill')
      }),

    connect: (nutrition) =>
      chore('connect', () => bridge!.connect({ nutrition }), (s) => {
        if (!s.connected) return
        sfx('seal')
        toast('Fitbit is connected. Your numbers will fill in on their own.', 'success')
        void get().sync({ quiet: true })
      }),

    async cancelConnect() {
      await bridge?.cancelConnect().catch(() => undefined)
    },

    disconnect: () =>
      chore('disconnect', () => bridge!.disconnect(), () => {
        set({ lastSync: null, lastError: null })
        toast('Fitbit is disconnected. Numbers already synced stay in the ledger.')
      }),

    forgetClient: () =>
      chore('forget', () => bridge!.forgetClient(), () => {
        set({ lastSync: null, lastError: null })
      })
  }
})

/** A quiet word when Fitbit alone carries today over a goal. */
function announce(before: ReturnType<typeof useLedger.getState>['ledger'], today: string, quiet: boolean): void {
  const after = useLedger.getState().ledger
  if (after === before) return
  const was = getReputation(before, today).days.get(today)
  const is = getReputation(after, today).days.get(today)
  if (!was || !is) return
  if (is.stepsMet && !was.stepsMet) {
    sfx('goal')
    toast(`Fitbit counts ${formatNumber(after.days[today]?.steps ?? 0)} steps — today’s steps goal is met.`, 'success')
  } else if (!quiet && is.total !== was.total) {
    sfx(is.total > was.total ? 'coin' : 'lose')
  }
}

/**
 * Keeps Fitbit in step while the app is open: once at start, every quarter hour,
 * and whenever the window regains focus after a while away.
 */
export function startHealthSync(): () => void {
  if (!bridge) return () => undefined
  const state = useHealth.getState
  let stopped = false
  const maybeSync = (): void => {
    const s = state()
    if (stopped || !s.status?.connected || s.syncing) return
    if (s.lastSync && Date.now() - s.lastSync < STALE_AFTER_MS) return
    void s.sync({ quiet: true })
  }
  void state()
    .refresh()
    .then((status) => {
      if (status?.connected) void state().sync({ quiet: true })
    })
  const timer = setInterval(() => {
    if (state().status?.connected) void state().sync({ quiet: true })
  }, AUTO_EVERY_MS)
  window.addEventListener('focus', maybeSync)
  return () => {
    stopped = true
    clearInterval(timer)
    window.removeEventListener('focus', maybeSync)
  }
}
