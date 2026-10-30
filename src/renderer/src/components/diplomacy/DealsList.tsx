import { useMemo, useState } from 'react'
import { GiShakingHands } from 'react-icons/gi'
import { sfx } from '../../audio'
import { makeDeal } from '../../lib/game/land'
import type { CampaignState, ISODate, RivalId } from '../../lib/game/types'
import { dealsView, type DealLine } from '../../lib/game/view/diplomacy'
import { amount } from '../../lib/game/view/refusals'
import { rivalName } from '../../lib/game/view/shell'
import { useCampaign } from '../../state/campaign'

/** One offer card (Patch 8, A5): a deal, or every hex of one trade with a picker. */
interface OfferCard {
  key: string
  title: string
  lines: DealLine[]
}

/** The deals as cards: a hex trade's rows (one per hex) become one card, every other deal its own. */
function cardsOf(deals: readonly DealLine[]): OfferCard[] {
  const out: OfferCard[] = []
  for (const d of deals) {
    if (d.kind === 'buyHex' || d.kind === 'sellHex') {
      const key = d.kind
      const card = out.find((c) => c.key === key)
      if (card) card.lines.push(d)
      else out.push({ key, title: d.kind === 'buyHex' ? 'Buy a hex' : 'Sell a hex', lines: [d] })
    } else out.push({ key: `${d.kind}:${d.target ?? ''}`, title: d.name, lines: [d] })
  }
  return out
}

/**
 * What a rival will deal on (Ch 6 "Trade and negotiation"), in the Audience, as offer cards (Patch 8,
 * A5): each deal `dealsView` lists, with its price, what it needs and what it does; a hex trade is one
 * card with a hex picker, `highlight` choosing the hex (the hex panel's "Buy"). Striking one asks once
 * more, then `onStruck` lets the Audience voice the rival. A deal he won't strike yet can be put to him
 * all the same, and `onRefused` lets him say why (A4); the engine's reason stays on the card.
 */
export function DealsList({
  campaign,
  today,
  rival,
  highlight,
  onStruck,
  onRefused
}: {
  campaign: CampaignState
  today: ISODate
  rival: RivalId
  highlight?: string
  onStruck(deal: DealLine): void
  onRefused?(deal: DealLine): void
}): React.JSX.Element {
  const act = useCampaign((s) => s.act)
  const cards = useMemo(() => cardsOf(dealsView(campaign, rival, today)), [campaign, rival, today])
  const [confirming, setConfirming] = useState<string | null>(null)
  const [picked, setPicked] = useState<Record<string, string>>({})

  const strike = (d: DealLine): void => {
    const done = act((s) => makeDeal(s, rival, { kind: d.kind, ...(d.hexId ? { hexId: d.hexId } : {}), ...(d.target ? { target: d.target } : {}) }, today))
    setConfirming(null)
    if (!done) return
    sfx('coin')
    onStruck(d)
  }

  return (
    <section className="panel deals" aria-label={`Deals with ${rivalName(rival)}`}>
      <header className="panel__head">
        <h3 className="panel__title">
          <GiShakingHands aria-hidden="true" /> Make an offer
        </h3>
        <span className="panel__aside">Prices are fixed by the court</span>
      </header>
      {cards.length === 0 ? (
        <p className="muted">No deal is open with {rivalName(rival)}.</p>
      ) : (
        <div className="offers">
          {cards.map((card) => {
            const choice = picked[card.key] ?? (card.lines.find((l) => l.hexId === highlight) ?? card.lines.find((l) => l.available) ?? card.lines[0]).hexId
            const d = card.lines.find((l) => l.hexId === choice) ?? card.lines[0]
            const k = `${card.key}:${d.hexId ?? ''}`
            const hexes = card.lines.filter((l) => l.hexId !== undefined)
            return (
              <article key={card.key} className={`offer ${d.available ? 'is-open' : 'is-shut'} ${highlight && card.lines.some((l) => l.hexId === highlight) ? 'is-highlight' : ''}`}>
                <header className="offer__head">
                  <strong className="offer__title">{card.title}</strong>
                  <span className="offer__price">{d.kind === 'sellHex' ? `+${amount(d.price)}` : amount(d.price)}</span>
                </header>
                {hexes.length > 0 && (
                  <select className="offer__pick" value={d.hexId} onChange={(e) => setPicked({ ...picked, [card.key]: e.target.value })} aria-label={`${card.title}: which hex`}>
                    {hexes.map((l) => (
                      <option key={l.hexId} value={l.hexId}>
                        {l.hexName} · {l.kind === 'sellHex' ? `+${amount(l.price)}` : amount(l.price)}
                        {l.available ? '' : ' (not now)'}
                      </option>
                    ))}
                  </select>
                )}
                <p className="offer__does">{d.effect}</p>
                <p className="offer__needs">Needs: {d.requires}</p>
                <div className="offer__act">
                  {d.available ? (
                    confirming === k ? (
                      <>
                        <button type="button" className="btn btn--primary btn--small" onClick={() => strike(d)}>
                          {d.kind === 'sellHex' ? `Sell for ${amount(d.price)}` : `Pay ${amount(d.price)}`}
                        </button>
                        <button type="button" className="btn btn--ghost btn--small" onClick={() => setConfirming(null)}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button type="button" className="btn btn--small" onClick={() => setConfirming(k)}>
                        Strike
                      </button>
                    )
                  ) : (
                    <>
                      <span className="offer__why" data-text-id={d.reason?.textId}>
                        {d.reason?.text}
                      </span>
                      {onRefused && (
                        <button type="button" className="btn btn--ghost btn--small" onClick={() => onRefused(d)} title={`Put it to ${rivalName(rival)} anyway`}>
                          Ask
                        </button>
                      )}
                    </>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
