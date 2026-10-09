import { useState } from 'react'
import { GiQuill } from 'react-icons/gi'
import { sfx } from '../../audio'
import { formatNumber, parseInteger } from '../../lib/format'
import { bidCheck, placeBid } from '../../lib/game/land'
import { hexName } from '../../lib/game/map'
import type { CampaignState, ISODate } from '../../lib/game/types'
import { landRefusalLabel } from '../../lib/game/view/refusals'
import { useCampaign } from '../../state/campaign'
import { toast } from '../../state/toasts'

export interface BidFormProps {
  campaign: CampaignState
  today: ISODate
  hexId: string
  /** The bid whose Offer meets the resistance at today's Trust. */
  suggested: number
  resistance: number
  trust: number
  onDone?(): void
}

/**
 * A sealed bid on a village (Ch 6 "Influence"): the amount, its Offer at today's Trust against the
 * village's resistance, and the engine's own check. The bid is held from the purse now and
 * resolves at the week close.
 */
export function BidForm({ campaign, today, hexId, suggested, resistance, trust, onDone }: BidFormProps): React.JSX.Element {
  const act = useCampaign((s) => s.act)
  const [text, setText] = useState(String(suggested))
  const bid = text.trim() ? parseInteger(text) : 0
  const valid = Number.isInteger(bid) && bid > 0
  const check = valid ? bidCheck(campaign, hexId, bid) : null
  const offer = valid ? Math.round(bid * trust * 10) / 10 : 0

  const place = (): void => {
    if (!valid) return
    if (!act((s) => placeBid(s, hexId, bid, today))) return
    sfx('quill')
    toast(`Bid of ${formatNumber(bid)} placed on ${hexName(hexId)}. It resolves at the week close.`, 'success')
    onDone?.()
  }

  return (
    <div className="bid-form">
      <label className="field">
        <span className="field__label">
          <GiQuill aria-hidden="true" /> Bid on {hexName(hexId)}
        </span>
        <span className="field__box">
          <input value={text} inputMode="numeric" onChange={(e) => setText(e.target.value.replace(/[^\d,]/g, ''))} aria-invalid={!valid || !check?.ok} />
        </span>
      </label>
      <p className="bid-form__offer">
        Offer <strong>{offer.toFixed(1)}</strong> (bid × Trust {trust.toFixed(2)}) against resistance <strong>{formatNumber(resistance)}</strong>
        {valid && (offer >= resistance ? <span className="ok"> · meets it</span> : <span className="short"> · short of it</span>)}
      </p>
      {check && !check.ok && check.reason && <p className="field__problem">{landRefusalLabel(check.reason)}</p>}
      <div className="bid-form__actions">
        <button type="button" className="btn btn--primary btn--small" onClick={place} disabled={!check?.ok}>
          Place the bid
        </button>
        <span className="muted">Half comes back if the village holds; a rival’s counter-bid is not known.</span>
      </div>
    </div>
  )
}
