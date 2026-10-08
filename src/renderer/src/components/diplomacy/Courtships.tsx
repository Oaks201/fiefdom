import { useMemo, useState } from 'react'
import { GiQuill } from 'react-icons/gi'
import { formatShort } from '../../lib/dates'
import { formatNumber } from '../../lib/format'
import type { CampaignState, ISODate, RivalId } from '../../lib/game/types'
import { courtshipsView } from '../../lib/game/view/diplomacy'
import { amount } from '../../lib/game/view/refusals'
import { rivalName } from '../../lib/game/view/shell'
import { BidForm } from './BidForm'

/**
 * Courtships (Ch 6 "Influence"): open bids with their Offer at today's Trust and the slots used, a
 * new bid on any village touching your land, and past results from the log. Offers resolve at the
 * week close.
 */
export function Courtships({ campaign, today }: { campaign: CampaignState; today: ISODate }): React.JSX.Element {
  const view = useMemo(() => courtshipsView(campaign), [campaign])
  const [chosen, setChosen] = useState<string>('')
  const village = view.villages.find((v) => v.hexId === chosen)
  return (
    <section className="panel courtships" aria-label="Courtships">
      <header className="panel__head">
        <h3 className="panel__title">
          <GiQuill aria-hidden="true" /> Courtships
        </h3>
        <span className="panel__aside">
          {view.open} of {view.slots} slots · Trust {view.trust.toFixed(2)}
        </span>
      </header>
      {view.bids.length === 0 ? (
        <p className="muted">No village is being courted.</p>
      ) : (
        <table className="courtships__table">
          <thead>
            <tr>
              <th>Village</th>
              <th className="num">Bid</th>
              <th className="num">Offer now</th>
              <th className="num">Resists</th>
              <th>Placed</th>
            </tr>
          </thead>
          <tbody>
            {view.bids.map((b) => (
              <tr key={b.hexId}>
                <td>
                  Hex {b.label} <span className="muted">({b.owner === 'neutral' ? 'unaligned' : rivalName(b.owner as RivalId)})</span>
                </td>
                <td className="num">{formatNumber(b.bid)}</td>
                <td className="num">{b.offer.toFixed(1)}</td>
                <td className="num">{b.resistance !== undefined ? amount(b.resistance) : '—'}</td>
                <td>{formatShort(b.placedOn)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted courtships__when">Offers resolve at the week close: the village defects when the Offer reaches its resistance; if it holds, half the bid comes back and its loyalty drops.</p>

      <div className="courtships__new">
        <label className="field">
          <span className="field__label">Court a village</span>
          <span className="field__box">
            <select value={chosen} onChange={(e) => setChosen(e.target.value)}>
              <option value="">{view.villages.length === 0 ? 'No village touches your land' : 'Choose a village…'}</option>
              {view.villages.map((v) => (
                <option key={v.hexId} value={v.hexId}>
                  Hex {v.label} · {v.ownerName} · resists {amount(v.resistance)} · about {formatNumber(v.suggested)}
                  {v.available ? '' : ' (closed)'}
                </option>
              ))}
            </select>
          </span>
        </label>
        {village && !village.available && village.reason && <p className="field__problem">{village.reason.label}</p>}
        {village && village.available && (
          <BidForm key={village.hexId} campaign={campaign} today={today} hexId={village.hexId} suggested={village.suggested} resistance={village.resistance} trust={view.trust} onDone={() => setChosen('')} />
        )}
      </div>

      {view.results.length > 0 && (
        <>
          <h4 className="courtships__past">Past courtships</h4>
          <ul className="courtships__results">
            {view.results.slice(0, 12).map((r, i) => (
              <li key={`${r.day}-${r.hexId}-${i}`} className={`result result--${r.outcome}`}>
                <span className="result__day">{formatShort(r.day)}</span> Hex {r.label}, bid {formatNumber(r.bid)}:{' '}
                {r.outcome === 'defected'
                  ? r.winner && r.winner !== 'player'
                    ? `won by ${rivalName(r.winner as RivalId)}`
                    : 'defected to you'
                  : r.outcome === 'held'
                    ? `held; loyalty −${amount(r.loyaltyDrop ?? 0)}`
                    : 'void; the bid came back'}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
