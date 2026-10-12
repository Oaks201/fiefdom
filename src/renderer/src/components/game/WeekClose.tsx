import { GiSandsOfTime } from 'react-icons/gi'
import { formatWeekdayShort } from '../../lib/dates'
import type { ISODate, WeekStartsOn } from '../../lib/game/types'
import { weekCloseView, type WeekCloseView } from '../../lib/game/view/shell'

/** "04:00 on Mon, Oct 12" */
export function weekCloseAt(v: WeekCloseView): string {
  return `${v.time} on ${formatWeekdayShort(v.closesOn)}`
}

/** "tonight", "2 days left" */
export function weekCloseLeft(v: WeekCloseView): string {
  return v.daysLeft === 1 ? 'tonight' : `${v.daysLeft} days left`
}

/** One line naming when this week closes (A-04): "The week closes at 04:00 on Mon, Oct 12 (tonight)." */
export function WeekCloseNote({ weekStartsOn, today, className = '' }: { weekStartsOn: WeekStartsOn; today: ISODate; className?: string }): React.JSX.Element {
  const v = weekCloseView(weekStartsOn, today)
  return (
    <p className={`week-close ${className}`}>
      <GiSandsOfTime aria-hidden="true" /> The week closes at {weekCloseAt(v)} ({weekCloseLeft(v)}).
    </p>
  )
}
