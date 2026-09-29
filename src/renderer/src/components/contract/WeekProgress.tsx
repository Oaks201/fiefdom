import { GiBootPrints, GiFlame } from 'react-icons/gi'
import type { ContractEval } from '../../lib/contracts'
import { parts, WEEKDAYS_SHORT, weekday } from '../../lib/dates'
import { formatCompact, formatNumber } from '../../lib/format'
import { useUI } from '../../state/ui'

interface Props {
  ev: ContractEval
  /** clicking a day opens it in the Chronicle */
  interactive?: boolean
}

/** Seven small columns per goal: how each day of the contract measured up. */
export function WeekProgress({ ev, interactive = true }: Props): React.JSX.Element {
  const showDay = useUI((s) => s.showDay)
  const c = ev.contract
  const rows = [
    { key: 'steps' as const, label: 'Steps', icon: GiBootPrints, goal: c.stepsGoal, met: ev.stepsDays },
    { key: 'calories' as const, label: 'Calories', icon: GiFlame, goal: c.caloriesGoal, met: ev.caloriesDays }
  ]

  return (
    <div className="progress">
      <div className="progress__grid">
        <div className="progress__corner" />
        {ev.days.map((d) => (
          <button
            key={d.date}
            type="button"
            className={`progress__day ${d.isToday ? 'is-today' : ''}`}
            disabled={!interactive || d.future}
            onClick={() => showDay(d.date)}
            title={interactive && !d.future ? 'Open this day in the Chronicle' : undefined}
          >
            <span className="progress__dayname">{WEEKDAYS_SHORT[weekday(d.date)]}</span>
            <span className="progress__daynum">{parts(d.date).d}</span>
          </button>
        ))}

        {rows.map(({ key, label, icon: Icon, goal }) => (
          <div key={key} className="progress__row" role="row">
            <div className="progress__label">
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </div>
            {ev.days.map((d) => {
              const value = d[key]
              const met = key === 'steps' ? d.stepsMet : d.caloriesMet
              const frac = value !== undefined ? Math.min(1, value / goal) : 0
              const state = d.future ? 'future' : met ? 'met' : value === undefined ? 'empty' : 'short'
              return (
                <div
                  key={d.date}
                  className={`progress__cell is-${state} ${d.isToday ? 'is-today' : ''}`}
                  title={d.future ? 'Not yet' : value === undefined ? 'Nothing recorded' : `${formatNumber(value)} of ${formatNumber(goal)}`}
                >
                  <div className="progress__bar">
                    <div className="progress__fill" style={{ height: `${frac * 100}%` }} />
                  </div>
                  <span className="progress__value">{d.future ? '·' : value === undefined ? '—' : formatCompact(value)}</span>
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <div className="progress__summary">
        {rows.map(({ key, label, met }) => (
          <span key={key}>
            {label} met on <strong>{met}</strong> of 7 days
          </span>
        ))}
      </div>
    </div>
  )
}
