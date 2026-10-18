/**
 * The catch-up lines under the Chronicle's week bars and in the Dawn tidings (Patch 6, D-46): plain
 * facts, never a calorie figure under the Healer's floor and none while on pace (C-74). Interface
 * words, so they live here rather than in the text catalog.
 */
import { formatNumber } from '../../lib/format'
import type { CalorieCatchUp, StepCatchUp } from '../../lib/game/view/chronicle'

/** "today", "a day for the 3 days left", "on the day after today", "a day for the 2 days after today". */
function forDays(days: number, afterToday: boolean): string {
  if (days === 1) return afterToday ? 'on the day after today' : 'today'
  return `a day for the ${days} days ${afterToday ? 'after today' : 'left'}`
}

/** "today", "for the 3 days left", "on the day after today", "for the 2 days after today". */
function overDays(days: number, afterToday: boolean): string {
  if (days === 1) return afterToday ? 'on the day after today' : 'today'
  return `for the ${days} days ${afterToday ? 'after today' : 'left'}`
}

export function calorieCatchUpLine(c: CalorieCatchUp): string | null {
  switch (c.kind) {
    case 'none':
      return null
    case 'onPace':
      return 'On pace.'
    case 'ends':
      return `The week’s average comes to ${formatNumber(c.average)}.`
    case 'floor':
      return `Even at the Healer’s floor (${formatNumber(c.floor)}) ${overDays(c.days, c.afterToday)}, the week averages ${formatNumber(c.average)}.`
    case 'figure': {
      const soFar = c.today !== undefined ? ` (${formatNumber(c.today)} so far today)` : ''
      return `About ${formatNumber(c.perDay)} ${forDays(c.days, c.afterToday)} brings the week’s average back to ${formatNumber(c.limit)}${soFar}.`
    }
  }
}

export function stepCatchUpLine(s: StepCatchUp): string | null {
  switch (s.kind) {
    case 'none':
      return null
    case 'met':
      return 'The week’s pool is met.'
    case 'figure':
      if (s.days === 1 && !s.afterToday) return `About ${formatNumber(s.more ?? s.perDay)} more steps today fills the week’s pool.`
      return `About ${formatNumber(s.perDay)} steps ${forDays(s.days, s.afterToday)} fills the week’s pool${s.more ? ` (${formatNumber(s.more)} more today)` : ''}.`
  }
}
