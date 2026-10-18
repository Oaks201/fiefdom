import { GiBootPrints, GiCheckMark, GiKnifeFork, GiShakingHands } from 'react-icons/gi'
import { addDays, formatShort, parts, WEEKDAYS, WEEKDAYS_SHORT, weekday } from '../../lib/dates'
import { formatNumber } from '../../lib/format'
import type { ISODate } from '../../lib/game/types'
import type { ProgressDay, RunningView } from '../../lib/game/view/contract'
import { percent, rivalName } from '../../lib/game/view/shell'
import { useUI } from '../../state/ui'

function day(d: ISODate): string {
  return `${WEEKDAYS[weekday(d)]}, ${formatShort(d)}`
}

function plural(n: number, one: string, many: string): string {
  return `${formatNumber(n)} ${n === 1 ? one : many}`
}

/** A day's figures in words, for its tooltip. */
function dayTitle(d: ProgressDay, today: ISODate): string {
  const head = `${WEEKDAYS_SHORT[weekday(d.date)]}, ${formatShort(d.date)}`
  if (d.state === 'upcoming') return `${head}: not yet`
  const steps = d.steps === undefined ? 'no steps recorded' : `${formatNumber(d.steps)} steps`
  const food =
    d.calories === 'unlogged' ? 'no food logged' : `${formatNumber(d.eaten as number)} kcal${d.calories === 'over' ? ', over the limit' : d.calories === 'underFloor' ? ', well under the floor' : ''}`
  const duties = `${d.dutiesKept} of ${d.dutiesSworn} duties`
  const note = d.state === 'respite' ? ' (a Respite day: left out of the score)' : d.date === today ? ' (so far today)' : ''
  return `${head}: ${steps} · ${food} · ${duties}${note}`
}

function DayCell({ d, today }: { d: ProgressDay; today: ISODate }): React.JSX.Element {
  const showDay = useUI((s) => s.showDay)
  const title = dayTitle(d, today)
  const marks = d.state !== 'upcoming' && d.state !== 'respite'
  return (
    <button
      type="button"
      className={`cal-day is-${d.state}`}
      disabled={d.state === 'upcoming'}
      title={title}
      aria-label={title}
      onClick={() => showDay(d.date)}
    >
      <span className="cal-day__num">{parts(d.date).d}</span>
      {d.state === 'respite' && <span className="cal-day__rest">Rest</span>}
      {marks && (
        <span className="cal-day__marks" aria-hidden="true">
          <span className={`cal-day__bar ${d.stepsShare >= 1 ? 'is-met' : ''}`} style={{ ['--fill' as string]: d.stepsShare }} />
          <span className={`cal-day__bar ${d.tableShare >= 1 ? 'is-met' : ''}`} style={{ ['--fill' as string]: d.tableShare }} />
          <span className={`cal-day__bar ${d.dutiesSworn > 0 && d.dutiesKept >= d.dutiesSworn ? 'is-met' : ''}`} style={{ ['--fill' as string]: d.dutiesSworn > 0 ? d.dutiesKept / d.dutiesSworn : 0 }} />
        </span>
      )}
    </button>
  )
}

/**
 * The running contract's progress (D-45): how far through it is, the score so far and what lies
 * behind each pillar, and every day of it by calendar week with each week's score.
 */
export function ContractProgress({ running, today }: { running: RunningView; today: ISODate }): React.JSX.Element {
  const c = running.contract
  const p = running.progress
  const status = !running.started ? `Begins ${day(c.startDate)}` : running.lastDay ? 'In force · the last day' : `In force · Day ${running.dayNumber} of ${running.totalDays}`
  const r = c.respiteDates.length
  const rested = r === 0 ? '' : r === 1 ? ' A Respite day moved its end a day later.' : ` ${r} Respite days moved its end ${r} days later.`
  const when = !running.started
    ? `It begins at dawn on ${day(c.startDate)}.`
    : running.lastDay
      ? `Today is its last day. It is paid when the day closes.${rested}`
      : `${plural(running.daysLeft, 'day remains', 'days remain')} after today; it ends ${day(c.endDate)}.${rested}`
  const n = running.settledDays
  const facts = {
    steps: n > 0 ? `${formatNumber(p.steps.walked)} of ${formatNumber(p.steps.share)}, the pool’s share for ${plural(n, 'day', 'days')}` : 'No day has settled yet.',
    table:
      p.table.average === null
        ? n > 0
          ? `Nothing logged on ${plural(n, 'day', 'days')}.`
          : 'No day has settled yet.'
        : `Logged on ${p.table.logged} of ${plural(p.table.days, 'day', 'days')}, averaging ${formatNumber(p.table.average)} kcal against ${formatNumber(p.calorieLimit)}`,
    duties: n > 0 ? `${formatNumber(p.duties.kept)} of ${formatNumber(p.duties.sworn)} kept` : 'No day has settled yet.'
  }
  const pillars = [
    { key: 'steps', label: 'Steps', icon: GiBootPrints, value: p.pillars.steps, fact: facts.steps },
    { key: 'table', label: 'Calories', icon: GiKnifeFork, value: p.pillars.table, fact: facts.table },
    { key: 'duties', label: 'Duties', icon: GiCheckMark, value: p.pillars.duties, fact: facts.duties }
  ]
  const firstWeek = p.weeks[0]?.weekStart ?? c.startDate

  return (
    <section className="panel running contract-progress" aria-label="The contract’s progress">
      <div className={`status-ribbon status-ribbon--${running.started ? 'active' : 'upcoming'}`}>{status}</div>
      <header className="panel__head">
        <h3 className="panel__title">
          {c.kind === 'accord' ? (
            <>
              <GiShakingHands aria-hidden="true" /> Accord with {c.rival ? rivalName(c.rival) : ''}
            </>
          ) : (
            `A ${c.termDays}-day contract`
          )}
        </h3>
        <span className="panel__aside">
          {formatShort(c.startDate)} to {formatShort(c.endDate)}
        </span>
      </header>

      <div className="contract-progress__days">
        <div className="contract-progress__track" style={{ ['--fill' as string]: running.totalDays > 0 ? running.dayNumber / running.totalDays : 0 }} />
        <p className="muted">{when}</p>
      </div>

      <div className="running__score">
        <strong className="running__q">{n > 0 ? `${percent(running.score)}%` : '—'}</strong>
        <span className="muted">score so far, over {plural(n, 'settled day', 'settled days')}</span>
      </div>
      <ul className="pillars pillars--facts">
        {pillars.map(({ key, label, icon: Icon, value, fact }) => (
          <li key={key}>
            <span className="pillars__name">
              <Icon aria-hidden="true" /> {label}
            </span>
            <span className="pillars__bar" style={{ ['--fill' as string]: value }} />
            <span className="pillars__value">{n > 0 ? `${percent(value)}%` : '—'}</span>
            <span className="pillars__fact">{fact}</span>
          </li>
        ))}
      </ul>

      <div className="contract-cal" role="group" aria-label="The contract day by day">
        <div className="contract-cal__row contract-cal__row--head">
          {Array.from({ length: 7 }, (_, i) => (
            <span key={i} className="contract-cal__weekday">
              {WEEKDAYS_SHORT[weekday(addDays(firstWeek, i))]}
            </span>
          ))}
          <span className="contract-cal__weekday">
            Week
          </span>
        </div>
        {p.weeks.map((w) => (
          <div key={w.weekStart} className="contract-cal__row">
            {w.days.map((d, i) => (d ? <DayCell key={d.date} d={d} today={today} /> : <span key={i} className="cal-day is-outside" />))}
            <span className="contract-cal__score" title="This week’s score so far, over its settled days">
              {w.score === null ? '—' : `${percent(w.score)}%`}
            </span>
          </div>
        ))}
      </div>
      <p className="contract-cal__legend muted">
        Each day, top to bottom: steps against {formatNumber(p.dailySteps)} (a seventh of the pool), calories against {formatNumber(p.calorieLimit)}, and duties kept. The score counts settled days; today’s
        figures join it when the day closes. Choose a day to open it in the Chronicle.
      </p>
    </section>
  )
}
