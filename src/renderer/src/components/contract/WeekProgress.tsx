import type { IconType } from 'react-icons'
import { GiBootPrints, GiCheckMark, GiFlame, GiKnifeFork } from 'react-icons/gi'
import type { ContractDayEval, ContractEval } from '../../lib/contracts'
import { parts, WEEKDAYS_SHORT, weekday } from '../../lib/dates'
import { formatCompact, formatNumber } from '../../lib/format'
import { useUI } from '../../state/ui'

interface Props {
  ev: ContractEval
  /** clicking a day opens it in the Chronicle */
  interactive?: boolean
}

interface Row {
  key: string
  label: string
  icon: IconType
  cell(d: ContractDayEval): { frac: number; state: 'met' | 'short' | 'over' | 'empty'; value: string; title: string }
  summary: React.JSX.Element
}

/** Seven small columns per goal: how each day of the contract measured up. */
export function WeekProgress({ ev, interactive = true }: Props): React.JSX.Element {
  const showDay = useUI((s) => s.showDay)
  const c = ev.contract
  const limit = c.calorieRule === 'limit'

  const rows: Row[] = [
    {
      key: 'steps',
      label: 'Steps',
      icon: GiBootPrints,
      cell: (d) => ({
        frac: d.steps !== undefined ? Math.min(1, d.steps / c.stepsGoal) : 0,
        state: d.stepsMet ? 'met' : d.steps === undefined ? 'empty' : 'short',
        value: d.steps === undefined ? '—' : formatCompact(d.steps),
        title: d.steps === undefined ? 'Nothing recorded' : `${formatNumber(d.steps)} of ${formatNumber(c.stepsGoal)} steps`
      }),
      summary: (
        <>
          Steps met on <strong>{ev.stepsDays}</strong> of 7 days
        </>
      )
    },
    {
      key: 'calories',
      label: limit ? 'Eaten' : 'Burned',
      icon: limit ? GiKnifeFork : GiFlame,
      cell: (d) => {
        const v = d.calories
        const title =
          v === undefined
            ? 'Nothing recorded'
            : limit
              ? `${formatNumber(v)} eaten — ${d.caloriesOver ? `over the ${formatNumber(c.caloriesGoal)} limit` : `limit ${formatNumber(c.caloriesGoal)}`}`
              : `${formatNumber(v)} of ${formatNumber(c.caloriesGoal)} burned`
        return {
          frac: v !== undefined ? Math.min(1, v / c.caloriesGoal) : 0,
          state: d.caloriesMet ? 'met' : v === undefined ? 'empty' : d.caloriesOver ? 'over' : 'short',
          value: v === undefined ? '—' : formatCompact(v),
          title
        }
      },
      summary: limit ? (
        <>
          Within the limit on <strong>{ev.caloriesDays}</strong> of 7 days
        </>
      ) : (
        <>
          Calories met on <strong>{ev.caloriesDays}</strong> of 7 days
        </>
      )
    }
  ]

  const sworn = ev.duties.length
  if (sworn) {
    rows.push({
      key: 'duties',
      label: 'Duties',
      icon: GiCheckMark,
      cell: (d) => ({
        frac: d.dutiesKept / sworn,
        state: d.dutiesKept === sworn ? 'met' : d.dutiesKept === 0 ? 'empty' : 'short',
        value: `${d.dutiesKept}/${sworn}`,
        title: `${d.dutiesKept} of ${sworn} sworn ${sworn === 1 ? 'duty' : 'duties'} kept`
      }),
      summary: (
        <>
          Duties kept <strong>{ev.dutiesKept}</strong> of {sworn * 7}
        </>
      )
    })
  }

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

        {rows.map(({ key, label, icon: Icon, cell }) => (
          <div key={key} className={`progress__row progress__row--${key}`} role="row">
            <div className="progress__label">
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </div>
            {ev.days.map((d) => {
              const x = cell(d)
              const state = d.future ? 'future' : x.state
              return (
                <div key={d.date} className={`progress__cell is-${state} ${d.isToday ? 'is-today' : ''}`} title={d.future ? 'Not yet' : x.title}>
                  <div className="progress__bar">
                    <div className="progress__fill" style={{ height: `${(d.future ? 0 : x.frac) * 100}%` }} />
                  </div>
                  <span className="progress__value">{d.future ? '·' : x.value}</span>
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <div className="progress__summary">
        {rows.map(({ key, summary }) => (
          <span key={key}>{summary}</span>
        ))}
      </div>
    </div>
  )
}
