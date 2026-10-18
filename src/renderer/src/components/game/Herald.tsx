import type { IconType } from 'react-icons'
import { GiCrossedSwords, GiHornInternal, GiScrollQuill, GiSwordClash, GiSpeaker } from 'react-icons/gi'
import type { ISODate } from '../../lib/game/types'
import { battleNotices } from '../../lib/game/view/battle'
import { heraldView, type HeraldSection } from '../../lib/game/view/shell'
import { ledYesterday } from '../../lib/game/view/skirmish'
import { useCampaignState } from '../../state/campaignHooks'
import { useUI } from '../../state/ui'

const SECTIONS: { id: HeraldSection; title: string; icon: IconType }[] = [
  { id: 'threat', title: 'Today’s threats', icon: GiCrossedSwords },
  { id: 'warning', title: 'Grand Battles', icon: GiHornInternal },
  { id: 'result', title: 'Yesterday', icon: GiSwordClash },
  { id: 'world', title: 'Across the realm', icon: GiScrollQuill },
  { id: 'rumor', title: 'Rumors from the courts', icon: GiSpeaker }
]

/**
 * The Herald's dawn tidings (Ch 2): today's threats with their targets and bands, Grand Battle
 * warnings, yesterday's results (a battle the player led marked, with a link to its result and
 * replay, D-12), the world's news and rumors. In-app only (D-04): no
 * notification ever leaves the window. `bare` leaves out the panel's own heading, for the Dawn
 * tidings card that carries its own (D-47).
 */
export function Herald({ today, compact = false, bare = false }: { today: ISODate; compact?: boolean; bare?: boolean }): React.JSX.Element | null {
  const campaign = useCampaignState()
  if (!campaign) return null
  const view = heraldView(campaign, today)
  const notices = battleNotices(campaign, today)
  const led = ledYesterday(campaign, today)
  return (
    <section className={`panel herald ${compact ? 'herald--compact' : ''} ${bare ? 'herald--bare' : ''}`} aria-label="The Herald">
      {!bare && (
        <header className="panel__head">
          <h3 className="panel__title">
            <GiHornInternal aria-hidden="true" /> The Herald
          </h3>
          <span className="panel__aside">Dawn tidings</span>
        </header>
      )}
      {notices.length > 0 && (
        <ul className="herald__battles" aria-label="Grand Battles">
          {notices.map((n) => (
            <li key={n.battleId} className={`herald__battle ${n.today ? 'is-today' : ''}`}>
              <GiHornInternal aria-hidden="true" /> <span>{n.label}</span>
              <button type="button" className={`btn btn--small ${n.today ? 'btn--primary' : ''}`} onClick={() => useUI.getState().openBattle(n.battleId)}>
                {n.today ? 'Fight now' : 'Prepare'}
              </button>
            </li>
          ))}
        </ul>
      )}
      {view.hidden ? (
        <p className="muted">A fog lies over the land; the Herald has no tidings today.</p>
      ) : view.lines.length === 0 ? (
        <p className="muted">A quiet dawn. No threat is foretold.</p>
      ) : (
        SECTIONS.map(({ id, title, icon: Icon }) => {
          const lines = view.lines.filter((l) => l.section === id)
          if (lines.length === 0) return null
          return (
            <div key={id} className={`herald__section herald__section--${id}`}>
              <h4 className="herald__heading">
                <Icon aria-hidden="true" /> {title}
              </h4>
              <ul className="herald__lines">
                {lines.map((l, i) => (
                  <li key={`${l.textId}-${i}`} className="herald__line" data-text-id={l.textId}>
                    {l.text}
                    {l.led && <span className="chip-mini chip-mini--led">You led it</span>}
                  </li>
                ))}
              </ul>
              {id === 'result' && led && (
                <button type="button" className="btn btn--small btn--ghost herald__led" onClick={() => useUI.getState().openSkirmish(led.day)}>
                  <GiSwordClash aria-hidden="true" /> {led.fought === 1 ? 'The battle you led: result and replay' : `The ${led.fought} battles you led: results and replays`}
                </button>
              )}
            </div>
          )
        })
      )}
    </section>
  )
}
