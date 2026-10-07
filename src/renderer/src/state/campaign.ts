/**
 * The campaign as the renderer holds it: loaded from campaign.json, changed only through pure game
 * operations, and saved the way the ledger is. No game rules live here.
 */
import { create } from 'zustand'
import { CampaignError } from '../lib/game/errors'
import { settle, type SettleResult, type SettleSummary } from '../lib/game/settle'
import type { CampaignState } from '../lib/game/types'
import type { Ledger } from '../lib/types'
import { loadCampaignText, saveCampaignText, saveCampaignTextSync } from './persistence'
import { toast } from './toasts'

interface CampaignStore {
  status: 'loading' | 'ready' | 'error'
  error: string | null
  /** null until a campaign is founded */
  campaign: CampaignState | null
  load(): Promise<void>
  /**
   * Applies a pure campaign operation. Rule violations (CampaignError) are shown to the user as a
   * notice and leave the campaign untouched. Returns whether the change was applied; with no
   * campaign there is nothing to apply it to.
   */
  apply(op: (campaign: CampaignState) => CampaignState): boolean
  /** Sets a newly founded campaign (from `foundCampaign`) and saves it. */
  found(campaign: CampaignState): void
  /**
   * Settles every closed day up to `now` against the ledger and saves once (T06). Returns the
   * result, or null with no campaign. A launch records the launch date (A-10).
   */
  settleNow(ledger: Ledger, now: Date, options?: { launch?: boolean }): SettleResult | null
  /** The last settlement's summary when it calls for the Homecoming (A-45); the screen is T16's. */
  homecoming: SettleSummary | null
  dismissHomecoming(): void
}

export const useCampaign = create<CampaignStore>((set, get) => ({
  status: 'loading',
  error: null,
  campaign: null,

  async load() {
    try {
      const text = await loadCampaignText()
      const parsed: unknown = text ? JSON.parse(text) : null
      if (parsed !== null && (typeof parsed !== 'object' || Array.isArray(parsed))) throw new Error('The campaign file holds no campaign.')
      set({ campaign: parsed as CampaignState | null, status: 'ready', error: null })
    } catch (err) {
      set({ status: 'error', error: err instanceof Error ? err.message : String(err) })
    }
  },

  apply(op) {
    const { campaign, status } = get()
    if (status !== 'ready' || campaign === null) return false
    let next: CampaignState
    try {
      next = op(campaign)
    } catch (err) {
      if (err instanceof CampaignError) {
        toast(err.message, 'error')
        return false
      }
      throw err
    }
    if (next !== campaign) {
      set({ campaign: next })
      scheduleSave(next)
    }
    return true
  },

  found(campaign) {
    set({ campaign, status: 'ready', error: null })
    scheduleSave(campaign)
  },

  settleNow(ledger, now, options) {
    const { campaign, status } = get()
    if (status !== 'ready' || campaign === null) return null
    const result = settle(campaign, ledger, now, options)
    if (result.state !== campaign) {
      set({ campaign: result.state })
      scheduleSave(result.state)
    }
    if (result.summary.homecoming) set({ homecoming: result.summary })
    return result
  },

  homecoming: null,
  dismissHomecoming() {
    set({ homecoming: null })
  }
}))

// ---------------------------------------------------------------------------
// Saving: debounced, flushed synchronously if the window closes. Mirrors state/store.ts.
// ---------------------------------------------------------------------------
let pending: string | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let failedOnce = false

function scheduleSave(campaign: CampaignState): void {
  pending = JSON.stringify(campaign)
  clearTimeout(timer)
  timer = setTimeout(() => void flush(), 350)
}

async function flush(): Promise<void> {
  if (pending === null) return
  const json = pending
  pending = null
  try {
    await saveCampaignText(json)
    failedOnce = false
  } catch (err) {
    console.error('Saving the campaign failed', err)
    if (!failedOnce) toast('The campaign could not be saved. Retrying…', 'error')
    failedOnce = true
    if (pending === null) pending = json
    clearTimeout(timer)
    timer = setTimeout(() => void flush(), 3000)
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (pending !== null) {
      saveCampaignTextSync(pending)
      pending = null
    }
  })
}
