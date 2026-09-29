import { useCallback, useMemo } from 'react'
import { sfx } from '../audio'
import type { ISODate } from '../lib/dates'
import { formatRep } from '../lib/format'
import { computeReputation, type RepSummary } from '../lib/reputation'
import type { Ledger } from '../lib/types'
import { useClock, useToday } from './clock'
import { emitFloat } from './floats'
import { useLedger } from './store'
import { toast } from './toasts'

let cache: { ledger: Ledger; today: ISODate; value: RepSummary } | null = null

/** Memoised across every component: recomputed only when the ledger or the date changes. */
export function getReputation(ledger: Ledger, today: ISODate): RepSummary {
  if (cache && cache.ledger === ledger && cache.today === today) return cache.value
  const value = computeReputation(ledger, today)
  cache = { ledger, today, value }
  return value
}

export function useReputation(): RepSummary {
  const ledger = useLedger((s) => s.ledger)
  const today = useToday()
  return useMemo(() => getReputation(ledger, today), [ledger, today])
}

export function useLedgerData(): Ledger {
  return useLedger((s) => s.ledger)
}

/**
 * Applies a change and celebrates it: the reputation gained or lost floats up from `anchor`,
 * and completing a perfect day on `date` is announced.
 */
export function useApplyWithFeedback(): (op: (l: Ledger) => Ledger, anchor?: Element | null, date?: ISODate) => boolean {
  const apply = useLedger((s) => s.apply)
  return useCallback(
    (op, anchor, date) => {
      const today = useClock.getState().today
      const beforeLedger = useLedger.getState().ledger
      if (!apply(op)) return false
      const afterLedger = useLedger.getState().ledger
      if (afterLedger === beforeLedger) return true
      const before = getReputation(beforeLedger, today)
      const after = getReputation(afterLedger, today)
      const delta = after.total - before.total
      if (delta !== 0 && anchor) emitFloat(formatRep(delta), anchor, delta > 0 ? 'gain' : 'loss')

      // the reward, layered just after the action's own sound
      const was = date ? before.days.get(date) : undefined
      const is = date ? after.days.get(date) : undefined
      if (is?.perfect && !was?.perfect) {
        sfx('perfect', 0.12)
        const streak = is.streak > 1 ? ` Streak: ${is.streak} days.` : ''
        toast(`A perfect day — every term met, every duty kept.${streak}`, 'success')
      } else if (is && was && ((is.stepsMet && !was.stepsMet) || (is.caloriesMet && !was.caloriesMet))) {
        sfx('goal', 0.1)
      } else if (delta > 0) {
        sfx('coin', 0.1)
      } else if (delta < 0) {
        sfx('lose', 0.04)
      }
      return true
    },
    [apply]
  )
}

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
