import type { IconType } from 'react-icons'
import { GiCrossedSwords, GiHornInternal, GiScrollQuill, GiSwordClash, GiSpeaker } from 'react-icons/gi'
import type { ISODate } from '../../lib/game/types'
import { heraldView, type HeraldSection } from '../../lib/game/view/shell'
import { useCampaignState } from '../../state/campaignHooks'

const SECTIONS: { id: HeraldSection; title: string; icon: IconType }[] = [
  { id: 'threat', title: 'Today’s threats', icon: GiCrossedSwords },
  { id: 'warning', title: 'Grand Battles', icon: GiHornInternal },
  { id: 'result', title: 'Yesterday', icon: GiSwordClash },
  { id: 'world', title: 'Across the realm', icon: GiScrollQuill },
  { id: 'rumor', title: 'Rumors from the courts', icon: GiSpeaker }
]

/**
 * The Herald's dawn tidings (Ch 2): today's threats with their targets and bands, Grand Battle
 * warnings, yesterday's results, the world's news and rumors. In-app only (D-04): no
 * notification ever leaves the window.
 */
export function Herald({ today, compact = false }: { today: ISODate; compact?: boolean }): React.JSX.Element | null {
  const campaign = useCampaignState()
  if (!campaign) return null
  const view = heraldView(campaign, today)
  return (
    <section className={`panel herald ${compact ? 'herald--compact' : ''}`} aria-label="The Herald">
      <header className="panel__head">
        <h3 className="panel__title">
          <GiHornInternal aria-hidden="true" /> The Herald
        </h3>
        <span className="panel__aside">Dawn tidings</span>
      </header>
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
                  </li>
                ))}
              </ul>
            </div>
          )
        })
      )}
    </section>
  )
}
