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
import { debouncedSaver } from './saver'
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
  /**
   * Runs a player action that answers `{ ok, reason?, state }` (the contract, land, deal, world and
   * Armory actions). A refusal is shown as a notice; returns whether it was done.
   */
  act(op: (campaign: CampaignState) => { ok: boolean; reason?: string | { code: string }; state: CampaignState }): boolean
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

  act(op) {
    const { campaign, status } = get()
    if (status !== 'ready' || campaign === null) return false
    let done: ReturnType<typeof op>
    try {
      done = op(campaign)
    } catch (err) {
      if (err instanceof CampaignError) {
        toast(err.message, 'error')
        return false
      }
      throw err
    }
    if (!done.ok) {
      const reason = done.reason
      toast(typeof reason === 'string' ? reason : reason ? `Refused: ${reason.code}` : 'That cannot be done now.', 'error')
      return false
    }
    if (done.state !== campaign) {
      set({ campaign: done.state })
      scheduleSave(done.state)
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

// Saving: debounced, flushed synchronously if the window closes, as the ledger is.
const scheduleSave = debouncedSaver('campaign', saveCampaignText, saveCampaignTextSync)
