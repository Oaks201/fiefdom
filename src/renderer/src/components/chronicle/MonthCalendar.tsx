import { useEffect, useRef, useState } from 'react'
import { GiCalendar } from 'react-icons/gi'
import { sfx } from '../../audio'
import { addDays, MONTHS, parts, startOfWeek, WEEKDAYS_SHORT, type ISODate } from '../../lib/dates'
import { contractOn } from '../../lib/ledger'
import { dayProgress, dayRepFor } from '../../lib/reputation'
import { useLedgerData, useReputation } from '../../state/hooks'
import { ProgressRing } from '../ProgressRing'

function shiftMonth(ym: { y: number; m: number }, n: number): { y: number; m: number } {
  const total = ym.y * 12 + ym.m + n
  return { y: Math.floor(total / 12), m: ((total % 12) + 12) % 12 }
}

interface Props {
  value: ISODate
  today: ISODate
  weekStartsOn: 0 | 1
  onPick(date: ISODate): void
}

/** The calendar button beside the date, with its month-at-a-glance popover. */
export function CalendarButton({ value, today, weekStartsOn, onPick }: Props): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent): void => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  return (
    <div className="calendar-wrap" ref={wrap}>
      <button
        type="button"
        className={`btn btn--ghost btn--icon ${open ? 'is-active' : ''}`}
        onClick={() => {
          if (!open) sfx('flip')
          setOpen((o) => !o)
        }}
        aria-expanded={open}
        title="Open the calendar"
        aria-label="Open the calendar"
      >
        <GiCalendar />
      </button>
      {open && (
        <MonthCalendar
          value={value}
          today={today}
          weekStartsOn={weekStartsOn}
          onPick={(d) => {
            onPick(d)
            setOpen(false)
          }}
        />
      )}
    </div>
  )
}

function MonthCalendar({ value, today, weekStartsOn, onPick }: Props): React.JSX.Element {
  const ledger = useLedgerData()
  const rep = useReputation()
  const [ym, setYm] = useState(() => {
    const p = parts(value)
    return { y: p.y, m: p.m }
  })
  const first = `${ym.y}-${String(ym.m + 1).padStart(2, '0')}-01`
  const gridStart = startOfWeek(first, weekStartsOn)
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  const heads = Array.from({ length: 7 }, (_, i) => WEEKDAYS_SHORT[(i + weekStartsOn) % 7])
  const nextDisabled = first.slice(0, 7) >= today.slice(0, 7)

  return (
    <div className="calendar sheet sheet--small" role="dialog" aria-label="Choose a day">
      <div className="sheet__paper" aria-hidden="true" />
      <div className="calendar__head">
        <button type="button" className="btn btn--ghost btn--icon" onClick={() => setYm((v) => shiftMonth(v, -1))} aria-label="Previous month">
          ‹
        </button>
        <div className="calendar__title">
          {MONTHS[ym.m]} {ym.y}
        </div>
        <button type="button" className="btn btn--ghost btn--icon" disabled={nextDisabled} onClick={() => setYm((v) => shiftMonth(v, 1))} aria-label="Next month">
          ›
        </button>
      </div>
      <div className="calendar__grid">
        {heads.map((h) => (
          <div key={h} className="calendar__weekday">
            {h}
          </div>
        ))}
        {cells.map((d) => {
          const p = parts(d)
          const future = d > today
          const dayRep = future ? null : dayRepFor(rep, ledger, d)
          const progress = dayRep ? dayProgress(dayRep) : { met: 0, total: 0 }
          const classes = [
            'calendar__day',
            p.m !== ym.m ? 'is-other' : '',
            d === today ? 'is-today' : '',
            d === value ? 'is-selected' : '',
            contractOn(ledger, d) ? 'is-contract' : ''
          ]
          return (
            <button key={d} type="button" className={classes.filter(Boolean).join(' ')} disabled={future} onClick={() => onPick(d)} aria-label={d}>
              <span className="calendar__num">{p.d}</span>
              {dayRep?.applicable && <ProgressRing met={progress.met} total={progress.total} perfect={dayRep.perfect} size={20} />}
            </button>
          )
        })}
      </div>
      <div className="calendar__foot">
        <button type="button" className="btn btn--ghost btn--small" onClick={() => onPick(today)}>
          Go to today
        </button>
      </div>
    </div>
  )
}
