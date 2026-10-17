import { useState } from 'react'
import { GiShield } from 'react-icons/gi'
import { sfx } from '../../audio'
import { formatNumber, parseInteger } from '../../lib/format'
import { holdVillage } from '../../lib/game/goblin'
import { hexName } from '../../lib/game/map'
import type { CampaignState, ISODate } from '../../lib/game/types'
import { holdRefusalLabel } from '../../lib/game/view/refusals'
import { weekCloseView } from '../../lib/game/view/shell'
import { useCampaign } from '../../state/campaign'
import { toast } from '../../state/toasts'
import { weekCloseAt } from '../game/WeekClose'

/**
 * Holding a village against the Goblin's bid (Patch 4, D-29): reputation spent now, counted × Trust at
 * the week close against his offer. His offer is never shown; the panel says only whether, as things
 * stand, the village holds. Spent either way.
 */
export function HoldForm({ campaign, today, hexId, trust, onDone }: { campaign: CampaignState; today: ISODate; hexId: string; trust: number; onDone?(): void }): React.JSX.Element {
  const act = useCampaign((s) => s.act)
  const [text, setText] = useState('')
  const value = text.trim() ? parseInteger(text) : 0
  const valid = Number.isInteger(value) && value > 0

  const hold = (): void => {
    if (!valid) return
    const done = holdVillage(campaign, hexId, value, today)
    if (!done.ok) {
      if (done.reason) toast(holdRefusalLabel(done.reason), 'error')
      return
    }
    if (!act(() => done)) return
    sfx('coin')
    toast(`${formatNumber(value)} spent to hold ${hexName(hexId)}. The Goblin’s bid resolves at the week close, ${weekCloseAt(weekCloseView(campaign.campaign.weekStartsOn, today))}.`, 'success')
    setText('')
    onDone?.()
  }

  return (
    <div className="bid-form">
      <label className="field">
        <span className="field__label">
          <GiShield aria-hidden="true" /> Hold {hexName(hexId)}
        </span>
        <span className="field__box">
          <input value={text} inputMode="numeric" onChange={(e) => setText(e.target.value.replace(/[^\d,]/g, ''))} aria-invalid={text.trim() !== '' && !valid} />
        </span>
      </label>
      <p className="bid-form__offer">
        It counts × Trust {trust.toFixed(2)}: <strong>{valid ? (value * trust).toFixed(1) : '0.0'}</strong> beside the village’s loyalty
      </p>
      <div className="bid-form__actions">
        <button type="button" className="btn btn--primary btn--small" onClick={hold} disabled={!valid}>
          Hold it
        </button>
        <span className="muted">Spent whether or not it holds; his offer is not known.</span>
      </div>
    </div>
  )
}
