import { GiScrollUnfurled, GiShakingHands } from 'react-icons/gi'
import { formatShort } from '../../lib/dates'
import { formatNumber, formatRep, formatSigned } from '../../lib/format'
import type { CampaignState } from '../../lib/game/types'
import { archiveCards } from '../../lib/game/view/contract'
import { percent, rivalName } from '../../lib/game/view/shell'

const STATUS: Record<string, string> = { active: 'In force', queued: 'Queued', paid: 'Paid', withdrawn: 'Withdrawn' }

/** The campaign's contracts in the Archive: length, score, payout and the pledge's result (T14). */
export function CampaignArchive({ campaign }: { campaign: CampaignState }): React.JSX.Element {
  const cards = archiveCards(campaign)
  return (
    <section className="campaign-archive" aria-label="Campaign contracts">
      <h2 className="campaign-archive__title">Contracts of the realm</h2>
      {cards.length === 0 ? (
        <p className="muted">No campaign contract has been sealed yet.</p>
      ) : (
        <div className="archive__grid">
          {cards.map((c) => (
            <article key={c.id} className={`campaign-card campaign-card--${c.status}`}>
              <header>
                {c.kind === 'accord' ? <GiShakingHands aria-hidden="true" /> : <GiScrollUnfurled aria-hidden="true" />}
                <strong>{c.kind === 'accord' && c.rival ? `Accord with ${rivalName(c.rival)}` : `${c.termDays}-day contract`}</strong>
                <span className="campaign-card__status">{STATUS[c.status] ?? c.status}</span>
              </header>
              <p className="campaign-card__dates">
                {formatShort(c.startDate)} – {formatShort(c.endDate)}
                {c.respiteDates.length > 0 ? ` · ${c.respiteDates.length} Respite` : ''}
              </p>
              <dl>
                <div>
                  <dt>Score</dt>
                  <dd>{c.score !== undefined ? `${percent(c.score)}%` : '—'}</dd>
                </div>
                <div>
                  <dt>Payout</dt>
                  <dd>{c.payout !== undefined ? formatRep(c.payout) : '—'}</dd>
                </div>
                {c.pledge > 0 && (
                  <div>
                    <dt>Pledge {formatNumber(c.pledge)}</dt>
                    <dd>{c.pledgeResult !== undefined ? formatSigned(c.pledgeResult) : 'held'}</dd>
                  </div>
                )}
              </dl>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
