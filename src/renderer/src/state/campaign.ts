/**
 * The campaign as the renderer holds it: loaded from campaign.json, changed only through pure game
 * operations, and saved the way the ledger is. No game rules live here.
 */
import { create } from 'zustand'
import { CampaignError } from '../lib/game/errors'
import type { CampaignState } from '../lib/game/types'
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
