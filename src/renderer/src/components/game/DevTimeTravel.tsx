import { useState } from 'react'
import { campaignNow, devAdvanceDays, useDevClock } from '../../state/campaignClock'
import { useCampaign } from '../../state/campaign'
import { textProgress } from '../../state/text'
import './DevTimeTravel.css'

/**
 * Development builds only (A-09): moves the campaign's "now" a day or a week and settles, shows
 * FIEFDOM_DEV_NOW, and counts the text catalog's placeholder and written slots. App.tsx loads it
 * only under `import.meta.env.DEV`, so production builds never contain it and no player can reach it.
 */
export default function DevTimeTravel(): React.JSX.Element {
  useDevClock((s) => s.offsetMs)
  const campaign = useCampaign((s) => s.campaign)
  const [open, setOpen] = useState(false)
  const now = campaignNow()
  const fixed = import.meta.env.FIEFDOM_DEV_NOW
  const text = textProgress()
  return (
    <aside className={`dev-travel ${open ? 'is-open' : ''}`} aria-label="Development time travel">
      <button type="button" className="dev-travel__toggle" onClick={() => setOpen(!open)} title="Development tools (not in the player's build)">
        DEV
      </button>
      {open && (
        <div className="dev-travel__panel">
          <p>
            Now: <strong>{now.toLocaleString()}</strong>
          </p>
          <p className="muted">FIEFDOM_DEV_NOW: {fixed ?? 'unset'}</p>
          <p className="muted">Settled through: {campaign?.settledThrough.day ?? 'no campaign'}</p>
          <div className="dev-travel__buttons">
            <button type="button" className="btn btn--small" onClick={() => devAdvanceDays(1)} disabled={!campaign}>
              +1 day
            </button>
            <button type="button" className="btn btn--small" onClick={() => devAdvanceDays(5)} disabled={!campaign}>
              +5 days
            </button>
            <button type="button" className="btn btn--small" onClick={() => devAdvanceDays(7)} disabled={!campaign}>
              +1 week
            </button>
          </div>
          <table className="dev-travel__text">
            <caption>Story text: written / placeholder</caption>
            <tbody>
              {text.map((f) => (
                <tr key={f.file}>
                  <td>{f.file}</td>
                  <td>{f.written}</td>
                  <td>{f.placeholder}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </aside>
  )
}
