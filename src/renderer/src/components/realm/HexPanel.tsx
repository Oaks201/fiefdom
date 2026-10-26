import { useState } from 'react'
import { GiCastle, GiCoins, GiCrystalBall, GiHornInternal, GiQuill, GiScales, GiShakingHands, GiShield, GiSiegeTower, GiTreasureMap } from 'react-icons/gi'
import { sfx } from '../../audio'
import { formatShort } from '../../lib/dates'
import { formatNumber } from '../../lib/format'
import { laySiege } from '../../lib/game/combat'
import { acceptBuyBack, bribe } from '../../lib/game/goblin'
import { challenge } from '../../lib/game/grand'
import { fortify, reclaim } from '../../lib/game/land'
import { bendSurge } from '../../lib/game/surges'
import { keepVillage } from '../../lib/game/world/events'
import { RULES } from '../../lib/game/rules'
import type { CampaignState, ISODate, RivalId } from '../../lib/game/types'
import { hexPanel, marchName, suggestedBid, trustNow, type HexAction, type HexPanel as HexPanelView } from '../../lib/game/view/realm'
import { amount } from '../../lib/game/view/refusals'
import { SURGE_WORDS, realmConsistencyNow, rivalName } from '../../lib/game/view/shell'
import { useCampaign } from '../../state/campaign'
import { toast } from '../../state/toasts'
import { useUI } from '../../state/ui'
import { BidForm } from '../diplomacy/BidForm'
import { HoldForm } from '../diplomacy/HoldForm'
import { HelpLink } from '../game/HelpLink'

const KIND_NAMES: Record<string, string> = {
  castle: 'The castle',
  building: 'A building',
  road: 'Road',
  between: 'Wilds',
  gate: 'Gate',
  lairMouth: 'Lair Mouth',
  capital: 'Capital',
  realm: 'Rival realm',
  lair: 'Lair',
  battlefield: 'Battlefield'
}

const THREATS: Record<string, string> = { beasts: 'Beasts', mythic: 'A mythic', raid: 'Raid', conquest: 'Conquest attempt', counterattack: 'Counterattack', surge: 'A surge of wild magic' }

/** Each rival's march rules in a line (D-27; How to play, The rivals' marches). */
const RULES_OF: Record<RivalId, string> = {
  orc: 'The Orc’s: a garrison beaten here strikes back at once, and his war track eases or hardens the march',
  goblin: 'The Goblin’s: its garrisons take bribes, and he bids for your villages',
  dwarf: 'The Dwarf’s: walls on the wilds, slow-fading siege wear, nothing lost back to the wilds',
  archmage: 'The Archmage’s: a surge of wild magic each day'
}

const GREED: Record<string, string> = { fair: 'Fair', dear: 'Dear', gouging: 'Gouging' }

const ACTION_TITLES: Record<HexAction['kind'], string> = {
  assault: 'Lay siege',
  challenge: 'Grand Battle',
  court: 'Court the village',
  buy: 'Buy the hex',
  fortify: 'Fortify',
  reclaim: 'Reclaim',
  bribe: 'Bribe the garrison',
  hold: 'Hold against his bid',
  sellBack: 'Sell it back',
  keep: 'Keep the village',
  bend: 'Bend tomorrow’s swell'
}

function kindName(view: HexPanelView): string {
  if (view.kind === 'between' && view.ring === 1) return 'Hearth wilds'
  if (view.kind === 'between') return view.village ? 'Village' : 'Beast den'
  if (view.kind === 'road' && view.village) return 'Village on the road'
  return KIND_NAMES[view.kind] ?? view.kind
}

/**
 * The hex panel (T15): who holds the hex and what it is, its march and depth (a seam's ruling march
 * today), what it adds to each path, the garrison an assault must beat, its march's preparation, a
 * village's loyalty, fortification and status, and every action the engine allows here today with
 * its cost, or the engine's own reason why not.
 */
export function HexPanel({ campaign, today, hexId, onClose }: { campaign: CampaignState; today: ISODate; hexId: string; onClose(): void }): React.JSX.Element | null {
  const view = hexPanel(campaign, hexId, today)
  const [bidding, setBidding] = useState(false)
  const [holding, setHolding] = useState(false)
  if (!view) return null
  const paths = (Object.entries(view.paths) as [RivalId, number][]).filter(([, v]) => v > 0)
  return (
    <section className="panel hex-panel" aria-label={view.label}>
      <header className="panel__head">
        <h3 className="panel__title">
          <GiTreasureMap aria-hidden="true" /> {view.label}
        </h3>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close the hex panel" title="Close">
          ×
        </button>
      </header>
      <p className="hex-panel__what">
        <span className={`owner-badge owner-badge--${view.owner}`}>{view.ownerName}</span> {kindName(view)}, {view.march ? `${marchName(view.march)}, depth ${view.depth}` : 'the heartland'} · band {view.band}
      </p>
      <dl className="facts">
        {view.seam && view.march && (
          <div>
            <dt>Seam</dt>
            <dd title="A seam counts half for each side; each dawn decides whose march rules it">
              {marchName(view.march)} and {marchName(view.seam)}; today {view.ruling ? marchName(view.ruling) : marchName(view.march)}
            </dd>
          </div>
        )}
        {paths.length > 0 && (
          <div>
            <dt>Holdings when held</dt>
            <dd>{paths.map(([r, v]) => `${rivalName(r)}’s path +${amount(v)}`).join(', ')}</dd>
          </div>
        )}
        {view.preparation !== undefined && (
          <div>
            <dt>Preparation</dt>
            <dd title="A march left alone prepares: its garrisons grow each quiet week">Level {view.preparation}</dd>
          </div>
        )}
        {view.rule && (
          <div>
            <dt>Rules</dt>
            <dd title="Each rival’s march plays by his own rules; see How to play, The rivals’ marches">{RULES_OF[view.rule]}</dd>
          </div>
        )}
        {view.surge && (
          <div>
            <dt>Surge</dt>
            <dd title="The Archmage’s wild magic: one surge a day in his march">
              {[view.surge.today ? `today ${SURGE_WORDS[view.surge.today]}` : '', view.surge.tomorrow ? `tomorrow ${SURGE_WORDS[view.surge.tomorrow]} (foreseen)` : ''].filter(Boolean).join('; ')}
            </dd>
          </div>
        )}
        {view.greed && (
          <div>
            <dt>His prices</dt>
            <dd title="The Goblin’s greed: it rises when you take his march by force, and eases in a quiet week">{GREED[view.greed]}</dd>
          </div>
        )}
        {view.goblinBid && (
          <div>
            <dt>The Goblin bids</dt>
            <dd title="At the week close his offer meets the village’s loyalty plus your hold × Trust; his offer is not known">
              {view.goblinBid.sways ? 'As it stands, it goes to him at the week close' : 'As it stands, it holds'}
              {view.goblinBid.hold > 0 ? ` · you have held it with ${amount(view.goblinBid.hold)}` : ''}
            </dd>
          </div>
        )}
        {view.buyBack && (
          <div>
            <dt>Buy-back</dt>
            <dd>
              {rivalName('goblin')} offers {amount(view.buyBack.price)} for it, until {formatShort(view.buyBack.until)}
            </dd>
          </div>
        )}
        {view.restless && (
          <div>
            <dt>Restless</dt>
            <dd title="Given up by the Dwarf: it may rise; settle it when it does">Until {formatShort(view.restless)}</dd>
          </div>
        )}
        {view.uprising && (
          <div>
            <dt>Rising</dt>
            <dd>
              Keep it for {amount(view.uprising.price)} by {formatShort(view.uprising.until)}
            </dd>
          </div>
        )}
        {view.garrison !== undefined && view.owner !== 'player' && (
          <div>
            <dt>Garrison</dt>
            <dd title="What an assault must beat today, fortification, preparation and siege wear counted">{amount(view.garrison)}</dd>
          </div>
        )}
        {view.stronghold && (
          <div>
            <dt>Stronghold</dt>
            <dd title={`Its garrison counts ${RULES.sieges.stronghold.garrisonMult}× while it stands; take it by siege or in a Grand Battle`}>
              {view.owner === 'player' ? 'Yours: the march beyond is open' : 'While it stands, no assault reaches deeper into its march'}
            </dd>
          </div>
        )}
        {view.fallback && (
          <div>
            <dt>Fallen back</dt>
            <dd title="A garrison beaten without a rout falls back beside the hex it lost, no shallower, and may strike back at it">
              +{amount(view.fallback.strength)} from {view.fallback.from.map((f) => f.label).join(', ')}; {view.fallback.daysLeft === 1 ? 'today only' : `${view.fallback.daysLeft} days left`}
            </dd>
          </div>
        )}
        {view.barredBy && (
          <div>
            <dt>Barred</dt>
            <dd>By {view.barredBy.label}, still standing</dd>
          </div>
        )}
        {view.siege && (
          <div>
            <dt>Siege</dt>
            <dd title="Each repulse wears a quarter of the Assault off the garrison; the wear stays until the hex falls, easing a little each day it is left alone">
              {view.siege.standing ? 'Under siege: ' : ''}
              {Math.round(view.siege.progress * 100)}% worn
            </dd>
          </div>
        )}
        {view.flank !== undefined && view.flank > 1 && (
          <div>
            <dt>Flanked</dt>
            <dd title="Each hex of yours beside it beyond the first adds to today’s Assault on it">+{Math.round((view.flank - 1) * 100)}% Assault</dd>
          </div>
        )}
        {view.reach && (
          <div>
            <dt>Reach</dt>
            <dd className={view.reach.kind === 'beyond' ? 'is-beyond-reach' : undefined}>
              {view.reach.text} <HelpLink section="defending" label="How reach works" />
            </dd>
          </div>
        )}
        {view.village && (
          <div>
            <dt>Village loyalty</dt>
            <dd>
              {amount(view.village.loyalty)}
              {view.owner !== 'player' && view.village.resistance !== view.village.loyalty ? ` (resists ${amount(view.village.resistance)})` : ''}
              {view.village.settlingUntil ? ` · settling until ${formatShort(view.village.settlingUntil)}` : ''}
            </dd>
          </div>
        )}
        <div>
          <dt>Fortification</dt>
          <dd>{view.fortification > 0 ? `Level ${view.fortification}` : 'None'}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            {view.status === 'held' ? 'Held' : view.status === 'contested' ? 'Contested' : 'Scorched'}
            {view.statusUntil && view.status !== 'held' ? ` through ${formatShort(view.statusUntil)}` : ''}
            {view.contest ? ` by ${rivalName(view.contest.rival)}` : ''}
          </dd>
        </div>
        {view.threats.length > 0 && (
          <div>
            <dt>Today</dt>
            <dd>{view.threats.map((t) => `${THREATS[t.kind]}${t.rival ? ` (${rivalName(t.rival)})` : ''}${t.band ? `, ${t.band}` : ''}`).join('; ')}</dd>
          </div>
        )}
        {view.courting && (
          <div>
            <dt>Your bid</dt>
            <dd>
              {formatNumber(view.courting.bid)}, placed {formatShort(view.courting.placedOn)}
            </dd>
          </div>
        )}
      </dl>
      {view.actions.length > 0 && (
        <ul className="hex-actions">
          {view.actions.map((a) => (
            <li key={a.kind} className={`hex-action ${a.available ? 'is-open' : 'is-shut'}`}>
              <ActionButton action={a} view={view} today={today} onCourt={() => setBidding(!bidding)} onHold={() => setHolding(!holding)} />
              {!a.available && a.reason && <p className="hex-action__why">{a.reason.label}</p>}
              {a.kind === 'court' && bidding && a.available && (
                <BidForm
                  campaign={campaign}
                  today={today}
                  hexId={view.id}
                  suggested={suggestedBid(campaign, campaign.hexes.find((h) => h.id === view.id)!)}
                  resistance={view.village?.resistance ?? 0}
                  trust={trustNow(campaign)}
                  onDone={() => setBidding(false)}
                />
              )}
              {a.kind === 'hold' && holding && a.available && <HoldForm campaign={campaign} today={today} hexId={view.id} trust={trustNow(campaign)} onDone={() => setHolding(false)} />}
            </li>
          ))}
        </ul>
      )}
      {view.actions.length === 0 && <p className="muted">Nothing to do here today.</p>}
    </section>
  )
}

function ActionButton({ action: a, view, today, onCourt, onHold }: { action: HexAction; view: HexPanelView; today: ISODate; onCourt(): void; onHold(): void }): React.JSX.Element {
  const act = useCampaign((s) => s.act)
  const apply = useCampaign((s) => s.apply)
  const cost = a.cost !== undefined ? ` · ${amount(a.cost)}` : ''
  const label = `${ACTION_TITLES[a.kind]}${cost}`
  switch (a.kind) {
    case 'assault': {
      const standing = view.siege?.standing === true
      return (
        <button
          type="button"
          className="btn btn--small"
          disabled={!a.available || standing}
          title="The Marshal sends the companies best matched to it, today and every day without orders of your own, until it falls"
          onClick={() => {
            apply((s) => laySiege(s, view.id, today).state)
            sfx('stamp')
            toast(`${view.label} is under siege: the Marshal presses it each day until it falls.`, 'success')
          }}
        >
          <GiSiegeTower aria-hidden="true" /> {standing ? 'Under siege' : label}
        </button>
      )
    }
    case 'challenge':
      return (
        <button
          type="button"
          className="btn btn--small"
          disabled={!a.available}
          onClick={() => {
            if (act((s) => challenge(s, view.id, today))) {
              sfx('strike')
              toast(`A Grand Battle is announced at ${view.label}.`, 'success')
            }
          }}
        >
          <GiHornInternal aria-hidden="true" /> Call a Grand Battle
        </button>
      )
    case 'court':
      return (
        <button type="button" className="btn btn--small" disabled={!a.available} onClick={onCourt}>
          <GiQuill aria-hidden="true" /> {label}
        </button>
      )
    case 'buy':
      return (
        <button type="button" className="btn btn--small" disabled={!a.available} onClick={() => useUI.getState().goDiplomacy(view.owner as RivalId, view.id)}>
          <GiShakingHands aria-hidden="true" /> {label} from {rivalName(view.owner as RivalId)}
        </button>
      )
    case 'fortify':
      return (
        <button
          type="button"
          className="btn btn--small"
          disabled={!a.available}
          onClick={() => {
            if (act((s) => fortify(s, view.id, today))) {
              sfx('coin')
              toast(`${view.label} is fortified to level ${view.fortification + 1}.`, 'success')
            }
          }}
        >
          <GiShield aria-hidden="true" /> {label}
        </button>
      )
    case 'reclaim':
      return (
        <button
          type="button"
          className="btn btn--small"
          disabled={!a.available}
          onClick={() => {
            if (act((s) => reclaim(s, view.id, today))) {
              sfx('coin')
              toast(`${view.label} is yours again.`, 'success')
            }
          }}
        >
          <GiCastle aria-hidden="true" /> {label}
        </button>
      )
    case 'bribe':
      return (
        <button
          type="button"
          className="btn btn--small"
          disabled={!a.available}
          title="The garrison takes the price and walks away: the hex is yours at once, with no battle"
          onClick={() => {
            if (act((s) => bribe(s, view.id, realmConsistencyNow(s), today))) {
              sfx('coin')
              toast(`${view.label} is yours: its garrison took the price and left.`, 'success')
            }
          }}
        >
          <GiCoins aria-hidden="true" /> {label}
        </button>
      )
    case 'hold':
      return (
        <button type="button" className="btn btn--small" disabled={!a.available} onClick={onHold}>
          <GiShield aria-hidden="true" /> {label}
        </button>
      )
    case 'sellBack':
      return (
        <button
          type="button"
          className="btn btn--small"
          disabled={!a.available}
          onClick={() => {
            if (act((s) => acceptBuyBack(s, view.id, today))) {
              sfx('coin')
              toast(`${view.label} is sold back to ${rivalName('goblin')}.`, 'info')
            }
          }}
        >
          <GiScales aria-hidden="true" /> {ACTION_TITLES[a.kind]}{a.cost !== undefined ? ` for ${amount(a.cost)}` : ''}
        </button>
      )
    case 'keep':
      return (
        <button
          type="button"
          className="btn btn--small"
          disabled={!a.available}
          onClick={() => {
            if (act((s) => keepVillage(s, view.id, today))) {
              sfx('coin')
              toast(`${view.label} is settled.`, 'success')
            }
          }}
        >
          <GiShield aria-hidden="true" /> {label}
        </button>
      )
    case 'bend':
      return (
        <button
          type="button"
          className="btn btn--small"
          disabled={!a.available}
          title="Once a week: tomorrow’s swell here becomes an ebb"
          onClick={() => {
            if (act((s) => bendSurge(s, today))) {
              sfx('stamp')
              toast(`Tomorrow’s surge at ${view.label} is bent: an ebb, not a swell.`, 'success')
            }
          }}
        >
          <GiCrystalBall aria-hidden="true" /> {label}
        </button>
      )
  }
}
