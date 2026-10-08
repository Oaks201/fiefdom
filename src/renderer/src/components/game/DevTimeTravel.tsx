import { useState } from 'react'
import { applyScenario, DEV_SCENARIOS } from '../../lib/game/dev/scenarios'
import { momentsFor } from '../../lib/game/view/endgame'
import { campaignNow, campaignToday, devAdvanceDays, useDevClock } from '../../state/campaignClock'
import { useCampaign } from '../../state/campaign'
import { useMoments } from '../../state/moments'
import { textProgress } from '../../state/text'
import { toast } from '../../state/toasts'
import './DevTimeTravel.css'

/** Development only (T15 gap 3): applies a prepared scenario to the open campaign; the app saves it. */
function loadScenario(id: string): boolean {
  const scenario = DEV_SCENARIOS.find((s) => s.id === id)
  if (!scenario) return false
  const before = useCampaign.getState().campaign?.log.length ?? 0
  const done = useCampaign.getState().apply((s) => applyScenario(s, id, campaignToday(s.campaign.timeZone)) ?? s)
  const after = useCampaign.getState().campaign
  if (done && after) {
    toast(`Scenario: ${scenario.title}.`, 'success')
    // What the scenario posted raises its cards, as a settlement's events would.
    useMoments.getState().showAll(momentsFor(after, after.log.slice(before)))
  }
  return done
}

// Scripts (scripts/screens.cjs) load scenarios the same way. This module exists only in dev builds.
if (window.fiefdomDev) window.fiefdomDev.scenario = loadScenario

/**
 * Development builds only (A-09): moves the campaign's "now" a day or a week and settles, shows
 * FIEFDOM_DEV_NOW, loads prepared scenarios (T15 gap 3), and counts the text catalog's
 * placeholder and written slots. App.tsx loads it
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
          <details className="dev-travel__scenarios">
            <summary>Scenarios</summary>
            <ul>
              {DEV_SCENARIOS.map((s) => (
                <li key={s.id}>
                  <button type="button" className="btn btn--small" onClick={() => loadScenario(s.id)} disabled={!campaign} title={s.detail}>
                    {s.title}
                  </button>
                </li>
              ))}
            </ul>
          </details>
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
