import { GiCastle, GiLaurelCrown } from 'react-icons/gi'
import { formatShort, WEEKDAYS_SHORT, weekday } from '../../lib/dates'
import { formatRep } from '../../lib/format'
import { homecomingView } from '../../lib/game/view/shell'
import { useCampaign } from '../../state/campaign'
import { useUI } from '../../state/ui'
import { Modal } from '../Modal'
import { WaxSeal } from '../WaxSeal'

/** The shortest contract the Steward suggests after an absence (Ch 16 "Coming back"). */
const SUGGESTED_DAYS = 3

/**
 * The Homecoming (A-45, Ch 16): after a catch-up of 3 or more days, or an absence of 14 or more,
 * what held, what was lost and the purse's change, told plainly. Chronicle, not judgment.
 */
export function Homecoming(): React.JSX.Element | null {
  const summary = useCampaign((s) => s.homecoming)
  const dismiss = useCampaign((s) => s.dismissHomecoming)
  const go = useUI((s) => s.go)
  if (!summary) return null
  const view = homecomingView(summary, SUGGESTED_DAYS)
  return (
    <Modal open onClose={dismiss} className="modal--homecoming" title="While you were away" labelledBy="homecoming-title">
      <div className="homecoming">
        <p className="homecoming__lede">
          <GiCastle aria-hidden="true" /> {view.daysSettled === 1 ? 'One day was' : `${view.daysSettled} days were`} settled
          {view.awayDays > 0 ? ` after ${view.awayDays} days away` : ''}. Rings 0 to 2 held, as they always will.
        </p>
        <dl className="homecoming__totals">
          <div>
            <dt>Battles held</dt>
            <dd>{view.heldCount}</dd>
          </div>
          <div>
            <dt>Lost</dt>
            <dd>{view.lost.length}</dd>
          </div>
          <div>
            <dt>The purse</dt>
            <dd className="homecoming__purse">
              <WaxSeal color="gold" icon={GiLaurelCrown} size={28} seed={5} /> {formatRep(view.purseChange)}
            </dd>
          </div>
        </dl>
        <ol className="homecoming__days" aria-label="Each day settled">
          {view.days.map((d) => (
            <li key={d.day} className="homecoming__day">
              <span className="homecoming__date">
                {WEEKDAYS_SHORT[weekday(d.day)]} {formatShort(d.day)}
              </span>
              <span>{d.held} held</span>
              <span>{d.lost > 0 ? `${d.lost} lost` : 'nothing lost'}</span>
              <span className="homecoming__change">{formatRep(d.purseChange)}</span>
            </li>
          ))}
        </ol>
        {view.lost.length > 0 && (
          <ul className="homecoming__lost" aria-label="What was lost">
            {view.lost.map((l, i) => (
              <li key={`${l.textId}-${i}`}>{l.text}</li>
            ))}
          </ul>
        )}
        {view.healer && <p className="healer-card">{view.healer.text}</p>}
        <div className="modal__actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              dismiss()
              go('contract')
            }}
          >
            Draft a {view.suggestedTermDays}-day contract
          </button>
          <button type="button" className="btn btn--primary" onClick={dismiss} data-autofocus>
            To the Chronicle
          </button>
        </div>
      </div>
    </Modal>
  )
}
