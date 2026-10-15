import { useLedgerData } from '../../state/hooks'
import { refoundAsOf } from '../../lib/game/refound'
import { formatShort } from '../../lib/dates'
import { useCampaign } from '../../state/campaign'
import { useUI } from '../../state/ui'

/**
 * The Realm page while the campaign was founded under older rules (D-21, section 7.1): it can't be
 * settled on the new map, so its pages are closed and this offers the re-founding wizard.
 */
export function RefoundOffer(): React.JSX.Element | null {
  const outdated = useCampaign((s) => s.outdated)
  const setFoundingOpen = useUI((s) => s.setFoundingOpen)
  const ledger = useLedgerData()
  if (!outdated) return null
  const asOf = refoundAsOf(ledger, outdated)
  return (
    <div className="game-page realm-page">
      <header className="page-head">
        <h1 className="page-title">The Realm</h1>
        <p className="page-sub">
          This campaign was founded under rules {outdated.campaign.ruleVersion}, before the map of four marches. It can’t be settled on the new map, so its pages are closed
          until it is re-founded. The ledger works as always.
        </p>
      </header>
      <div className="panel refound-offer">
        <ul>
          <li>The new campaign starts as of {asOf ? <strong>{formatShort(asOf)}</strong> : 'its first day'}, and every day since is settled, the war included.</li>
          <li>Your real contracts carry over, each judged on its own terms; the days between them by the terms of the time.</li>
          <li>Four answers say how the days before today were played: whose paths, what to spend on, how to take land, and offers.</li>
          <li>You see the result before anything is written. The old campaign file is kept in the backups folder for good.</li>
        </ul>
        <button type="button" className="btn btn--primary" onClick={() => setFoundingOpen(true)}>
          Re-found the campaign on the new map…
        </button>
      </div>
    </div>
  )
}
