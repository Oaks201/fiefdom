import { GiCrown, GiLockedFortress, GiOpenGate } from 'react-icons/gi'
import { formatShort } from '../../lib/dates'
import { formatRep } from '../../lib/format'
import type { CampaignState, ISODate } from '../../lib/game/types'
import { milestonePanel } from '../../lib/game/view/chronicle'
import { toLb } from '../../lib/game/weight'
import { weighIns } from '../../lib/ledger'
import type { Ledger } from '../../lib/types'

/**
 * The ten Milestones and the Crown's Grace (Ch 9): each mark with its earliest week and which
 * locks are met, the broken ones with their dates, and the Grace in plain words. Never what a
 * future Milestone unlocks, never Steadiness; Momentum shows as reputation earned.
 */
export function MilestonePanel({ campaign, ledger, today }: { campaign: CampaignState; ledger: Ledger; today: ISODate }): React.JSX.Element {
  const unit = ledger.settings.unit
  const lb = weighIns(ledger).map((w) => ({ date: w.date, weight: toLb(w.weight, unit) }))
  const view = milestonePanel(campaign, lb, today)
  return (
    <section className="panel milestones" aria-label="Milestones">
      <header className="panel__head">
        <h3 className="panel__title">
          <GiCrown aria-hidden="true" /> Milestones
        </h3>
        <span className="panel__aside">
          {view.broken} of {view.rows.length} · week {view.week}
        </span>
      </header>
      <ol className="milestones__list">
        {view.rows.map((r) => (
          <li key={r.index} className={`milestone ${r.brokenOn ? 'is-broken' : ''} ${view.next?.index === r.index ? 'is-next' : ''}`}>
            <span className="milestone__index">{r.index}</span>
            <span className="milestone__mark">
              {r.keeping ? 'Keep' : ''} {r.mark} {view.unit}
            </span>
            {r.brokenOn ? (
              <span className="milestone__state">broken {formatShort(r.brokenOn)}{r.byDispensation ? ' (Dispensation)' : ''}</span>
            ) : (
              <span className="milestone__state">
                <span className={`lock ${r.lock1 ? 'is-met' : ''}`} title={r.keeping ? 'Hold near the goal for 4 weeks' : 'Reach the mark'}>
                  {r.lock1 ? <GiOpenGate aria-hidden="true" /> : <GiLockedFortress aria-hidden="true" />} mark
                </span>{' '}
                <span className={`lock ${r.lock2 ? 'is-met' : ''}`} title={`Not before week ${r.earliestWeek}`}>
                  {r.lock2 ? <GiOpenGate aria-hidden="true" /> : <GiLockedFortress aria-hidden="true" />} week {r.earliestWeek}
                </span>
              </span>
            )}
          </li>
        ))}
      </ol>
      <p className="milestones__grace">{view.grace.text}</p>
      {view.momentumReputation !== null && <p className="muted">Momentum paid {formatRep(view.momentumReputation)} at the last week’s close.</p>}
    </section>
  )
}
