import { GiCastle, GiCrossedSwords, GiKneeling, GiScrollUnfurled, GiShakingHands, GiThreeFriends } from 'react-icons/gi'
import { sfx } from '../../audio'
import { formatShort } from '../../lib/dates'
import { makeDeal } from '../../lib/game/land'
import type { CampaignState, ISODate, RivalId } from '../../lib/game/types'
import { accordPanel, coalitionBanners, endgameView, ultimatumBanners } from '../../lib/game/view/endgame'
import { amount } from '../../lib/game/view/refusals'
import { rivalName } from '../../lib/game/view/shell'
import { bendTheKnee, sealAccord } from '../../lib/game/world'
import { useCampaign } from '../../state/campaign'
import { newId } from '../../state/hooks'
import { toast } from '../../state/toasts'
import { useUI } from '../../state/ui'
import { HoldButton } from '../HoldButton'
import { GameArt } from '../game/GameArt'

/**
 * The Ultimatum (Ch 14 rules 3, 4, 7; Ch 16 "Fear of losing"): calm and unmistakable. When the
 * Siege comes, what lifts it, the price of bending the knee (once a campaign), and the way to
 * prepare. No Power or ratio the player can't see.
 */
export function UltimatumBanners({ campaign, today }: { campaign: CampaignState; today: ISODate }): React.JSX.Element | null {
  const act = useCampaign((s) => s.act)
  const banners = ultimatumBanners(campaign, today)
  if (banners.length === 0) return null
  return (
    <>
      {banners.map((u) => (
        <section key={u.battleId} className="ultimatum" aria-label={`Ultimatum from ${u.names}`}>
          <GiCastle className="ultimatum__icon" aria-hidden="true" />
          <div className="ultimatum__body">
            <h3 className="ultimatum__title">
              The Siege of the Crown in {u.daysLeft === 1 ? '1 day' : `${u.daysLeft} days`}, on {formatShort(u.siegeOn)}
            </h3>
            <p data-text-id={u.textId}>{u.text}</p>
            <p className="ultimatum__lifts">{u.lifts}</p>
            <div className="ultimatum__actions">
              <button type="button" className="btn" onClick={() => useUI.getState().openBattle(u.battleId)}>
                <GiCrossedSwords aria-hidden="true" /> Prepare for the Siege
              </button>
              {u.canBend ? (
                <HoldButton
                  className="btn btn--ghost"
                  onComplete={() => {
                    if (act((s) => bendTheKnee(s, u.rival, today))) {
                      sfx('wanting')
                      toast('The knee is bent. The Siege waits four more weeks.', 'info')
                    }
                  }}
                  aria-label={`Hold to bend the knee for ${amount(u.bendPrice)}`}
                >
                  <GiKneeling aria-hidden="true" /> Hold to bend the knee: {amount(u.bendPrice)}, the Siege 4 weeks later
                </HoldButton>
              ) : (
                <span className="muted">The knee has been bent once already this campaign.</span>
              )}
            </div>
          </div>
        </section>
      ))}
    </>
  )
}

/** A coalition standing (Ch 13): who, until when, its Offensive, and paying a member to walk away. */
export function CoalitionBanners({ campaign, today }: { campaign: CampaignState; today: ISODate }): React.JSX.Element | null {
  const act = useCampaign((s) => s.act)
  const banners = coalitionBanners(campaign, today)
  if (banners.length === 0) return null
  return (
    <>
      {banners.map((c) => (
        <section key={c.members.join('-')} className="coalition-banner" aria-label={`Coalition of ${c.names}`}>
          <GiThreeFriends className="coalition-banner__icon" aria-hidden="true" />
          <div>
            <p className="coalition-banner__text" data-text-id={c.textId}>
              {c.text}
            </p>
            {c.offensiveOn && <p className="coalition-banner__offensive">Their Coalition Offensive strikes on {formatShort(c.offensiveOn)}.</p>}
            <ul className="coalition-banner__buyouts">
              {c.buyouts.map((d) => (
                <li key={d.rival}>
                  {d.available ? (
                    <button
                      type="button"
                      className="btn btn--small"
                      onClick={() => {
                        if (act((s) => makeDeal(s, d.rival, { kind: 'buyout' }, today))) {
                          sfx('coin')
                          toast(`The coalition is broken.`, 'success')
                        }
                      }}
                    >
                      Pay {rivalName(d.rival)} {amount(d.price)} to walk away
                    </button>
                  ) : (
                    <span className="muted" data-text-id={d.reason?.textId}>
                      Buy-out: {d.reason?.text}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}
    </>
  )
}

/** Proposing an Accord (Ch 14, D-01): it takes the contract slot for 30 days and pays both. */
export function AccordPanel({ campaign, today, rival }: { campaign: CampaignState; today: ISODate; rival: RivalId }): React.JSX.Element {
  const act = useCampaign((s) => s.act)
  const view = accordPanel(campaign, rival, today)
  return (
    <section className="panel accord" aria-label={`An Accord with ${view.name}`}>
      <header className="panel__head">
        <h3 className="panel__title">
          <GiShakingHands aria-hidden="true" /> An Accord with {view.name}
        </h3>
        <span className="panel__aside">
          Respect {Math.floor(view.respect)} · talks at {view.threshold}
        </span>
      </header>
      <p>
        A {view.days}-day Accord is the one running contract while it lasts, and pays like one. At its end Respect rises with how well its terms were kept: at today’s Realm Consistency, about{' '}
        <strong>+{amount(view.expectedGain)}</strong>
        {view.wouldSign ? ', enough to sign it and make an ally.' : '. At 100 it is signed and the rival allied.'}
      </p>
      {view.open ? (
        <HoldButton
          className="btn btn--primary"
          onComplete={() => {
            if (act((s) => sealAccord(s, rival, { id: newId() }, today))) {
              sfx('seal')
              toast(`The Accord with ${view.name} is sealed. It begins at the next dawn.`, 'success')
            }
          }}
          aria-label={`Hold to propose an Accord to ${view.name}`}
        >
          <GiScrollUnfurled aria-hidden="true" /> Hold to propose an Accord
        </HoldButton>
      ) : (
        <p className="accord__why">{view.reason?.label}</p>
      )}
    </section>
  )
}

/** Victory and the Reign, or the Fall (Ch 14, Ch 16 "Shame"): the same plain record either way. */
export function EndgameRecord({ campaign }: { campaign: CampaignState }): React.JSX.Element | null {
  const view = endgameView(campaign)
  if (!view) return null
  return (
    <section className={`panel endgame endgame--${view.status}`} aria-label={view.status === 'won' ? 'Victory' : 'The Fall'}>
      <GameArt slot={view.slot} owner="player" width={220} label={view.status === 'won' ? 'Victory' : 'The Fall'} />
      <div>
        <h3 className="endgame__title" data-text-id={view.textId}>
          {view.text}
        </h3>
        <ul className="endgame__record">
          {view.record.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <ul className="endgame__rivals">
          {view.rivals.map((r) => (
            <li key={r.rival}>
              {r.name}: {r.fate}
            </li>
          ))}
        </ul>
        {view.reign && (
          <p className="endgame__reign" data-text-id={view.reign.textId}>
            {view.reign.text}
          </p>
        )}
      </div>
    </section>
  )
}
