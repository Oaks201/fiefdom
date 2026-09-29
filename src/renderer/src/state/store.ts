import { create } from 'zustand'
import { createLedger, LedgerError, normalizeLedger } from '../lib/ledger'
import type { Ledger } from '../lib/types'
import { loadLedgerText, saveLedgerText, saveLedgerTextSync } from './persistence'
import { toast } from './toasts'

interface LedgerState {
  status: 'loading' | 'ready' | 'error'
  error: string | null
  ledger: Ledger
  load(): Promise<void>
  /**
   * Applies a pure ledger operation. Rule violations (LedgerError) are shown to the
   * user as a notice and leave the ledger untouched. Returns whether the change was applied.
   */
  apply(op: (ledger: Ledger) => Ledger): boolean
}

export const useLedger = create<LedgerState>((set, get) => ({
  status: 'loading',
  error: null,
  ledger: createLedger(),

  async load() {
    try {
      const text = await loadLedgerText()
      const ledger = text ? normalizeLedger(JSON.parse(text)) : createLedger()
      set({ ledger, status: 'ready', error: null })
    } catch (err) {
      set({ status: 'error', error: err instanceof Error ? err.message : String(err) })
    }
  },

  apply(op) {
    const { ledger, status } = get()
    if (status !== 'ready') return false
    let next: Ledger
    try {
      next = op(ledger)
    } catch (err) {
      if (err instanceof LedgerError) {
        toast(err.message, 'error')
        return false
      }
      throw err
    }
    if (next !== ledger) {
      set({ ledger: next })
      scheduleSave(next)
    }
    return true
  }
}))

// ---------------------------------------------------------------------------
// Saving: debounced while you type, flushed synchronously if the window closes.
// ---------------------------------------------------------------------------
let pending: string | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let failedOnce = false

function scheduleSave(ledger: Ledger): void {
  pending = JSON.stringify(ledger)
  clearTimeout(timer)
  timer = setTimeout(() => void flush(), 350)
}

async function flush(): Promise<void> {
  if (pending === null) return
  const json = pending
  pending = null
  try {
    await saveLedgerText(json)
    failedOnce = false
  } catch (err) {
    console.error('Saving the ledger failed', err)
    if (!failedOnce) toast('The ledger could not be saved. Retrying…', 'error')
    failedOnce = true
    if (pending === null) pending = json
    clearTimeout(timer)
    timer = setTimeout(() => void flush(), 3000)
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (pending !== null) {
      saveLedgerTextSync(pending)
      pending = null
    }
  })
}
