import { GiCrown, GiScales } from 'react-icons/gi'
import { WEEKDAYS, formatShort, formatWeekdayShort } from '../../lib/dates'
import { formatRep, formatSigned, formatWeight } from '../../lib/format'
import { RULES } from '../../lib/game/rules'
import type { CampaignState, ISODate } from '../../lib/game/types'
import { milestonePanel, weighInLog, type MilestoneRow, type WeighInNote } from '../../lib/game/view/chronicle'
import { percent } from '../../lib/game/view/shell'
import { toLb } from '../../lib/game/weight'
import { weighIns } from '../../lib/ledger'
import type { Ledger } from '../../lib/types'

type Unit = CampaignState['campaign']['unit']

const DAY_CLOSE = `${String(RULES.clock.dayCloseHour).padStart(2, '0')}:00`

/** A weigh-in's note: a Milestone broken that week, or its mark reached while its week was still to come. */
function noteText(n: WeighInNote, unit: Unit, week: number): string {
  if (n.kind === 'broken') return `Milestone ${n.index} broken (${n.keeping ? 'kept near the goal' : `${n.mark} ${unit}`})${n.byDispensation ? ' by Dispensation' : ''}`
  return `Reached Milestone ${n.index}’s mark (${n.mark} ${unit})${n.earliestWeek > week ? `; it waits for week ${n.earliestWeek}` : ''}`
}

/** The next Milestone in one line: its mark and earliest week, or what a Keeping Milestone needs. */
function nextText(r: MilestoneRow, unit: Unit): string {
  const { withinShare, weeks } = RULES.milestones.keeping
  if (r.keeping) return `Next: Milestone ${r.index}, kept by staying within ${percent(withinShare)}% of the goal for ${weeks} week closes in a row.`
  const reached = r.breaksAtClose ? ` (mark reached: it breaks when today closes at ${DAY_CLOSE})` : r.lock1 ? ' (mark reached)' : ''
  return `Next: Milestone ${r.index} at ${r.mark} ${unit}, not before week ${r.earliestWeek}${reached}.`
}

/**
 * The weigh-in log (D-13): each week's weigh-in under its weigh-in day, newest first (with the day it
 * was weighed when that was another day), its change since the one before and a note for each
 * Milestone broken or mark reached; below it the next Milestone, the
 * Crown's Grace in plain words and what Momentum paid. Never what a future Milestone unlocks,
 * never Steadiness.
 */
export function WeighInLog({ campaign, ledger, today }: { campaign: CampaignState; ledger: Ledger; today: ISODate }): React.JSX.Element {
  const lb = weighIns(ledger).map((w) => ({ date: w.date, weight: toLb(w.weight, ledger.settings.unit) }))
  const rows = weighInLog(campaign, lb)
  const view = milestonePanel(campaign, lb, today)
  return (
    <section className="panel weighin-log" aria-label="Weigh-ins">
      <header className="panel__head">
        <h3 className="panel__title">
          <GiScales aria-hidden="true" /> Weigh-ins
        </h3>
        <span className="panel__aside">
          {view.broken} of {view.rows.length} Milestones · week {view.week}
        </span>
      </header>
      {rows.length === 0 ? (
        <p className="muted">No weigh-ins yet. Weigh in each {WEEKDAYS[RULES.clock.weighInWeekday]}.</p>
      ) : (
        <ol className="weighin-log__list">
          {rows.map((r) => (
            <li key={r.day} className={`weighin-log__row${r.notes.some((n) => n.kind === 'broken') ? ' is-milestone' : ''}`}>
              <span className="weighin-log__date">
                {formatWeekdayShort(r.day)}
                {r.week > 0 && <span className="weighin-log__week">week {r.week}</span>}
                {r.date && r.date !== r.day && <span className="weighin-log__week">weighed {formatShort(r.date)}</span>}
              </span>
              <span className="weighin-log__weight">{r.weight === null ? <span className="muted">no weigh-in</span> : formatWeight(r.weight, view.unit)}</span>
              <span className={`weighin-log__change${r.change === null || r.change === 0 ? '' : r.change < 0 ? ' is-down' : ' is-up'}`}>{r.change === null ? '' : formatSigned(r.change)}</span>
              {r.notes.length > 0 && (
                <ul className="weighin-log__notes">
                  {r.notes.map((n) => (
                    <li key={`${n.kind}-${n.index}`}>
                      <GiCrown aria-hidden="true" /> {noteText(n, view.unit, r.week)}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
      {view.next && <p className="weighin-log__next">{nextText(view.next, view.unit)}</p>}
      <p className="weighin-log__grace">{view.grace.text}</p>
      {view.momentumReputation !== null && <p className="muted">Momentum paid {formatRep(view.momentumReputation)} at the last week’s close.</p>}
    </section>
  )
}
