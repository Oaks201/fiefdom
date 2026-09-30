import { useEffect, useRef } from 'react'
import { GiScrollUnfurled, GiScales } from 'react-icons/gi'
import { CalendarButton } from '../components/chronicle/MonthCalendar'
import { DayLedger } from '../components/chronicle/DayLedger'
import { DutyList } from '../components/chronicle/DutyList'
import { Tally } from '../components/chronicle/Tally'
import { WeekStrip } from '../components/chronicle/WeekStrip'
import { calorieMetricFor, contractStatus } from '../lib/contracts'
import { addDays, diffDays, formatLong, formatRelativeDay, formatShort, WEEKDAYS, weekday } from '../lib/dates'
import { contractOn, dutiesSwornUnder, openContract } from '../lib/ledger'
import { useToday } from '../state/clock'
import { useLedgerData } from '../state/hooks'
import { isDialogOpen, isTyping, useUI } from '../state/ui'

export function ChroniclePage(): React.JSX.Element {
  const today = useToday()
  const rawDate = useUI((s) => s.date)
  const setDate = useUI((s) => s.setDate)
  const go = useUI((s) => s.go)
  const ledger = useLedgerData()
  const date = rawDate > today ? today : rawDate
  const weekStartsOn = ledger.settings.weekStartsOn

  const stepsRef = useRef<HTMLInputElement>(null)
  const caloriesRef = useRef<HTMLInputElement>(null)
  const newDutyRef = useRef<HTMLInputElement>(null)

  const pick = (d: string): void => setDate(d > today ? today : d)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e) || isDialogOpen()) return
      const current = useUI.getState().date
      const step = e.shiftKey ? 7 : 1
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setDate(addDays(current, -step))
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        const next = addDays(current, step)
        setDate(next > today ? today : next)
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault()
        setDate(today)
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault()
        stepsRef.current?.focus()
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault()
        caloriesRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setDate, today])

  const contract = contractOn(ledger, date)
  // calories eaten against a limit — or burned, for a contract sealed under the old rule
  const calorieMetric = calorieMetricFor(ledger, date)
  const relative = formatRelativeDay(date, today)
  const dayOfContract = contract ? diffDays(contract.startDate, date) + 1 : 0

  // A gentle nudge about the contract, shown on today's page only.
  const open = openContract(ledger)
  const status = open ? contractStatus(open, today) : null
  let banner: React.JSX.Element | null = null
  if (date === today) {
    if (!open) {
      banner = (
        <div className="banner">
          <GiScrollUnfurled className="banner__icon" aria-hidden="true" />
          <span>No contract is in force. Your steps and calories are recorded, but earn nothing until you bind yourself to terms.</span>
          <button type="button" className="btn btn--small" onClick={() => go('contract')}>
            Draft a contract
          </button>
        </div>
      )
    } else if (status === 'awaiting' || (status === 'active' && open.endDate === today)) {
      banner = (
        <div className="banner banner--urgent">
          <GiScales className="banner__icon" aria-hidden="true" />
          <span>
            {status === 'awaiting'
              ? `Your contract ended on ${WEEKDAYS[weekday(open.endDate)]}, ${formatShort(open.endDate)}. Declare your final weight to close it.`
              : 'This is the last day of your contract. The final weigh-in is open.'}
          </span>
          <button type="button" className="btn btn--small" onClick={() => go('contract')}>
            Weigh in
          </button>
        </div>
      )
    } else if (status === 'upcoming') {
      banner = (
        <div className="banner">
          <GiScrollUnfurled className="banner__icon" aria-hidden="true" />
          <span>Your next contract begins on {WEEKDAYS[weekday(open.startDate)]}, {formatShort(open.startDate)}.</span>
        </div>
      )
    }
  }

  return (
    <div className="chronicle">
      <header className="daynav">
        <button type="button" className="daynav__arrow" onClick={() => pick(addDays(date, -1))} aria-label="Previous day" title="Previous day (←)">
          ‹
        </button>
        <div className="daynav__center">
          <div className="daynav__eyebrow">{relative ?? ' '}</div>
          <h1 className="daynav__date">{formatLong(date, today)}</h1>
          <div className="daynav__sub">
            {contract ? (
              <>
                Day {dayOfContract} of 7 under the contract of {formatShort(contract.startDate)}
              </>
            ) : (
              'No contract binds this day'
            )}
          </div>
        </div>
        <button
          type="button"
          className="daynav__arrow"
          onClick={() => pick(addDays(date, 1))}
          disabled={date >= today}
          aria-label="Next day"
          title="Next day (→)"
        >
          ›
        </button>
      </header>

      <div className="stripbar">
        <WeekStrip date={date} today={today} weekStartsOn={weekStartsOn} onPick={pick} />
        <div className="stripbar__tools">
          <button type="button" className="btn btn--ghost btn--small" onClick={() => setDate(today)} disabled={date === today} title="Back to today (T)">
            Today
          </button>
          <CalendarButton value={date} today={today} weekStartsOn={weekStartsOn} onPick={pick} />
        </div>
      </div>

      {banner}

      <div className="chronicle__tallies">
        <Tally metric="steps" date={date} inputRef={stepsRef} />
        <Tally key={calorieMetric} metric={calorieMetric} date={date} inputRef={caloriesRef} />
      </div>

      <div className="chronicle__lower">
        <DutyList date={date} today={today} newDutyRef={newDutyRef} />
        <DayLedger date={date} today={today} />
      </div>

      <footer className="shortcuts" aria-label="Keyboard shortcuts">
        <span>
          <kbd className="kbd">←</kbd>
          <kbd className="kbd">→</kbd> day
        </span>
        <span>
          <kbd className="kbd">Shift</kbd>+<kbd className="kbd">←</kbd>
          <kbd className="kbd">→</kbd> week
        </span>
        <span>
          <kbd className="kbd">T</kbd> today
        </span>
        <span>
          <kbd className="kbd">S</kbd> steps
        </span>
        <span>
          <kbd className="kbd">C</kbd> calories
        </span>
        <span>
          <kbd className="kbd">1</kbd>–<kbd className="kbd">9</kbd> duties
        </span>
        {!dutiesSwornUnder(ledger) && (
          <span>
            <kbd className="kbd">N</kbd> new duty
          </span>
        )}
        <span>
          <kbd className="kbd">+1200</kbd> adds to a tally
        </span>
      </footer>
    </div>
  )
}
