import { useEffect, useState } from 'react'
import { GiCycle, GiPadlock, GiWatch } from 'react-icons/gi'
import { sfx } from '../audio'
import { formatAgo } from '../lib/format'
import { METRIC_NAMES, useHealth } from '../state/health'
import { Switch } from './Switch'

const SCOPES = {
  activity: 'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  nutrition: 'https://www.googleapis.com/auth/googlehealth.nutrition.readonly'
}

/**
 * Settings → Fitbit. Fitbit data now comes through Google's Health API, which needs a Google Cloud
 * OAuth client of your own (a Desktop app client). Typing numbers by hand works regardless.
 */
export function FitbitSettings({ open }: { open: boolean }): React.JSX.Element | null {
  const h = useHealth()
  const s = h.status
  const [nutrition, setNutrition] = useState(true)

  const refresh = h.refresh
  useEffect(() => {
    if (open) void refresh()
  }, [open, refresh])

  if (!h.available) return null

  const connecting = h.busy === 'connect' || !!s?.connecting
  const reading = s?.metrics.map((m) => METRIC_NAMES[m]) ?? []

  return (
    <section className="settings__section fitbit">
      <h3 className="settings__heading">Fitbit</h3>
      <div className={`fitbit__card ${s?.connected ? 'is-connected' : ''}`}>
        <GiWatch className="fitbit__icon" aria-hidden="true" />
        <div className="fitbit__body">
          {!s ? (
            <p className="fitbit__lead">Looking for a connection…</p>
          ) : s.connected ? (
            <>
              <p className="fitbit__lead">
                <strong>Connected.</strong> Reading {reading.length ? listOf(reading) : 'nothing yet'}.
              </p>
              <p className="fitbit__status">
                {h.syncing ? 'Syncing…' : h.lastSync ? `Last synced ${formatAgo(h.lastSync)}.` : 'Not synced yet.'} The last two weeks are read each time,
                every quarter hour while Fiefdom is open.
              </p>
              {h.lastError && <p className="fitbit__problem">{h.lastError}</p>}
              {!s.metrics.includes('eaten') && (
                <p className="fitbit__note">
                  Your food log isn’t shared, so calories eaten are typed by hand. To add it, disconnect and connect again with the food log switched on.
                </p>
              )}
            </>
          ) : s.hasClient ? (
            <>
              <p className="fitbit__lead">
                Client loaded <code>{s.clientHint}</code>. Now connect your Google account — Google will ask in your browser.
              </p>
              {s.problem && <p className="fitbit__problem">{s.problem}</p>}
              <div className="fitbit__option">
                <span>
                  Also read the calories you log as food
                  <span className="fitbit__hint">needs the nutrition scope added to your Google project</span>
                </span>
                <Switch on={nutrition} label="Read the food log" onChange={setNutrition} />
              </div>
            </>
          ) : (
            <>
              <p className="fitbit__lead">
                Steps, calories burned in activity and the calories you log as food can fill in on their own. Numbers you type yourself are never overwritten, and
                typing them by hand keeps working either way.
              </p>
              {s.problem && <p className="fitbit__problem">{s.problem}</p>}
            </>
          )}

          <div className="fitbit__actions">
            {s?.connected ? (
              <>
                <button type="button" className="btn btn--small" disabled={h.syncing} onClick={() => void h.sync()}>
                  <GiCycle aria-hidden="true" className={h.syncing ? 'spin' : ''} /> Sync now
                </button>
                <button type="button" className="btn btn--ghost btn--small" disabled={!!h.busy} onClick={() => void h.disconnect()}>
                  Disconnect
                </button>
              </>
            ) : s?.hasClient ? (
              connecting ? (
                <>
                  <span className="fitbit__waiting">Waiting for you in the browser…</span>
                  <button type="button" className="btn btn--ghost btn--small" onClick={() => void h.cancelConnect()}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="btn btn--primary btn--small" disabled={!!h.busy} onClick={() => void h.connect(nutrition)}>
                    Connect with Google
                  </button>
                  <button type="button" className="btn btn--ghost btn--small" disabled={!!h.busy} onClick={() => void h.importClient()}>
                    Load a different file…
                  </button>
                  <button type="button" className="link" disabled={!!h.busy} onClick={() => void h.forgetClient()}>
                    Forget it
                  </button>
                </>
              )
            ) : (
              <button
                type="button"
                className="btn btn--small"
                disabled={!!h.busy || !s}
                onClick={() => {
                  sfx('click')
                  void h.importClient()
                }}
              >
                Load your Google client file…
              </button>
            )}
          </div>
          {s && !s.encrypted && (s.hasClient || s.connected) && (
            <p className="fitbit__note">
              <GiPadlock aria-hidden="true" /> This computer offers no secure storage, so the connection is saved unencrypted in Fiefdom’s folder.
            </p>
          )}
        </div>
      </div>

      <details className="fitbit__help">
        <summary>Setting up Fitbit through Google</summary>
        <ol>
          <li>
            In <strong>Google Cloud Console</strong>, open the project you use for Fitbit (or make one) and enable the <strong>Google Health API</strong>.
          </li>
          <li>
            Under <strong>Google Auth Platform → Data Access</strong>, add these scopes:
            <code>{SCOPES.activity}</code> for steps and calories burned in activity, and <code>{SCOPES.nutrition}</code> for the calories you log as food.
          </li>
          <li>
            Under <strong>Clients</strong>, create a <strong>Desktop app</strong> client and download its JSON — the <code>client_secret_….json</code> file. Load
            it here with the button above.
          </li>
          <li>
            While the project is in <strong>Testing</strong>, add your Google account under <strong>Audience → Test users</strong>. Google ends a Testing
            connection after seven days; Fiefdom will say so, and connecting again takes a click.
          </li>
        </ol>
      </details>
    </section>
  )
}

function listOf(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}
