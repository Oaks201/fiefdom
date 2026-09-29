import { addDays, parts, startOfWeek, weekday, WEEKDAYS_SHORT, type ISODate } from '../../lib/dates'
import { contractOn } from '../../lib/ledger'
import { dayProgress, dayRepFor } from '../../lib/reputation'
import { useLedgerData, useReputation } from '../../state/hooks'
import { ProgressRing } from '../ProgressRing'

interface Props {
  date: ISODate
  today: ISODate
  weekStartsOn: 0 | 1
  onPick(date: ISODate): void
}

export function WeekStrip({ date, today, weekStartsOn, onPick }: Props): React.JSX.Element {
  const ledger = useLedgerData()
  const rep = useReputation()
  const start = startOfWeek(date, weekStartsOn)
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const nextWeek = addDays(date, 7)

  return (
    <div className="weekstrip">
      <button type="button" className="weekstrip__jump" onClick={() => onPick(addDays(date, -7))} aria-label="Previous week" title="Previous week">
        «
      </button>
      <div className="weekstrip__days">
        {days.map((d) => {
          const future = d > today
          const dayRep = future ? null : dayRepFor(rep, ledger, d)
          const progress = dayRep ? dayProgress(dayRep) : { met: 0, total: 0 }
          const c = contractOn(ledger, d)
          const classes = [
            'weekday',
            d === date ? 'is-selected' : '',
            d === today ? 'is-today' : '',
            future ? 'is-future' : '',
            c ? 'is-contract' : '',
            c && c.startDate === d ? 'is-contract-start' : '',
            c && c.endDate === d ? 'is-contract-end' : ''
          ]
          return (
            <button
              key={d}
              type="button"
              className={classes.filter(Boolean).join(' ')}
              disabled={future}
              onClick={() => onPick(d)}
              aria-label={d}
              aria-current={d === date ? 'date' : undefined}
            >
              <span className="weekday__name">{WEEKDAYS_SHORT[weekday(d)]}</span>
              <span className="weekday__num">{parts(d).d}</span>
              <span className="weekday__ring">
                {dayRep?.applicable ? (
                  <ProgressRing met={progress.met} total={progress.total} perfect={dayRep.perfect} size={24} />
                ) : (
                  <span className="weekday__dot" />
                )}
              </span>
            </button>
          )
        })}
      </div>
      <button
        type="button"
        className="weekstrip__jump"
        onClick={() => onPick(nextWeek > today ? today : nextWeek)}
        disabled={date >= today}
        aria-label="Next week"
        title="Next week"
      >
        »
      </button>
    </div>
  )
}
