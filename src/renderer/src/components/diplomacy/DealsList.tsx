import { useMemo, useState } from 'react'
import { GiShakingHands } from 'react-icons/gi'
import { sfx } from '../../audio'
import { makeDeal } from '../../lib/game/land'
import type { CampaignState, ISODate, RivalId } from '../../lib/game/types'
import { dealReaction, dealsView, type DealLine } from '../../lib/game/view/diplomacy'
import { amount } from '../../lib/game/view/refusals'
import { rivalName } from '../../lib/game/view/shell'
import { useCampaign } from '../../state/campaign'
import { GameArt } from '../game/GameArt'

function keyOf(d: DealLine): string {
  return `${d.kind}:${d.hexId ?? ''}:${d.target ?? ''}`
}

/**
 * What a rival will deal on (Ch 6 "Trade and negotiation"): every line of `availableDeals` with its
 * price, what it needs and what it does. Unavailable lines stay listed with the engine's reason.
 * Striking one asks once more, then shows the rival's one-line reaction.
 */
export function DealsList({ campaign, today, rival, highlight }: { campaign: CampaignState; today: ISODate; rival: RivalId; highlight?: string }): React.JSX.Element {
  const act = useCampaign((s) => s.act)
  const deals = useMemo(() => dealsView(campaign, rival, today), [campaign, rival, today])
  const [confirming, setConfirming] = useState<string | null>(null)
  const [reaction, setReaction] = useState<{ rival: RivalId; textId: string; text: string } | null>(null)
  const mood = campaign.rivals[rival].disposition.player === 'war' ? 'angry' : 'calm'

  const strike = (d: DealLine): void => {
    const done = act((s) => makeDeal(s, rival, { kind: d.kind, ...(d.hexId ? { hexId: d.hexId } : {}), ...(d.target ? { target: d.target } : {}) }, today))
    setConfirming(null)
    if (!done) return
    sfx('coin')
    setReaction({ rival, ...dealReaction(rival, d) })
  }

  return (
    <section className="panel deals" aria-label={`Deals with ${rivalName(rival)}`}>
      <header className="panel__head">
        <h3 className="panel__title">
          <GiShakingHands aria-hidden="true" /> Deals with {rivalName(rival)}
        </h3>
        <span className="panel__aside">Prices are fixed by the court</span>
      </header>
      {reaction?.rival === rival && (
        <div className="court-reply">
          <GameArt slot={`rival.${rival}.${mood}`} owner={rival} width={56} label={rivalName(rival)} />
          <blockquote data-text-id={reaction.textId}>{reaction.text}</blockquote>
        </div>
      )}
      <table className="deals__table">
        <thead>
          <tr>
            <th>Deal</th>
            <th className="num">Price</th>
            <th>Needs</th>
            <th>Does</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {deals.map((d) => {
            const k = keyOf(d)
            return (
              <tr key={k} className={`${d.available ? 'is-open' : 'is-shut'} ${highlight && d.hexId === highlight ? 'is-highlight' : ''}`}>
                <td>
                  <strong>{d.name}</strong>
                </td>
                <td className="num">{(d.kind === 'buyHex' || d.kind === 'sellHex') && !d.hexId ? '—' : d.kind === 'sellHex' ? `+${amount(d.price)}` : amount(d.price)}</td>
                <td className="deals__needs">{d.requires}</td>
                <td className="deals__does">{d.effect}</td>
                <td className="deals__act">
                  {d.available ? (
                    confirming === k ? (
                      <span className="deals__confirm">
                        <button type="button" className="btn btn--primary btn--small" onClick={() => strike(d)}>
                          {d.kind === 'sellHex' ? `Sell for ${amount(d.price)}` : `Pay ${amount(d.price)}`}
                        </button>
                        <button type="button" className="btn btn--ghost btn--small" onClick={() => setConfirming(null)}>
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button type="button" className="btn btn--small" onClick={() => setConfirming(k)}>
                        Strike
                      </button>
                    )
                  ) : (
                    <span className="deals__why" data-text-id={d.reason?.textId}>
                      {d.reason?.text}
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}
