import { useState } from 'react'
import { GiArcheryTarget, GiCastle, GiHornInternal, GiQuill, GiShakingHands, GiShield, GiTreasureMap } from 'react-icons/gi'
import { sfx } from '../../audio'
import { formatShort } from '../../lib/dates'
import { formatNumber } from '../../lib/format'
import { setOrders } from '../../lib/game/combat'
import { challenge } from '../../lib/game/grand'
import { fortify, reclaim } from '../../lib/game/land'
import type { BuildingId, CampaignState, ISODate, RivalId } from '../../lib/game/types'
import { withTarget } from '../../lib/game/view/orders'
import { buildingName, hexPanel, suggestedBid, trustNow, type HexAction, type HexPanel as HexPanelView } from '../../lib/game/view/realm'
import { amount } from '../../lib/game/view/refusals'
import { rivalName } from '../../lib/game/view/shell'
import { useCampaign } from '../../state/campaign'
import { toast } from '../../state/toasts'
import { useUI } from '../../state/ui'
import { BidForm } from '../diplomacy/BidForm'

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

const THREATS: Record<string, string> = { beasts: 'Beasts', mythic: 'A mythic', raid: 'Raid', conquest: 'Conquest attempt' }

const ACTION_TITLES: Record<HexAction['kind'], string> = {
  assault: 'Assault',
  challenge: 'Grand Battle',
  court: 'Court the village',
  buy: 'Buy the hex',
  fortify: 'Fortify',
  reclaim: 'Reclaim'
}

function kindName(view: HexPanelView): string {
  if (view.kind === 'between' && view.ring === 1) return 'Hearth wilds'
  if (view.kind === 'between') return view.village ? 'Village' : 'Beast den'
  if (view.kind === 'road' && view.village) return 'Village on the road'
  return KIND_NAMES[view.kind] ?? view.kind
}

/**
 * The hex panel (T15): who holds the hex and what it is, its Dominion, the garrison an assault
 * must beat, a village's loyalty, fortification and status, and every action the engine allows
 * here today with its cost, or the engine's own reason why not.
 */
export function HexPanel({ campaign, today, hexId, onClose }: { campaign: CampaignState; today: ISODate; hexId: string; onClose(): void }): React.JSX.Element | null {
  const view = hexPanel(campaign, hexId, today)
  const [bidding, setBidding] = useState(false)
  if (!view) return null
  const dominion = Object.entries(view.dominion) as [BuildingId, number][]
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
        <span className={`owner-badge owner-badge--${view.owner}`}>{view.ownerName}</span> {kindName(view)}, ring {view.ring}
      </p>
      <dl className="facts">
        {dominion.length > 0 && (
          <div>
            <dt>Dominion when held</dt>
            <dd>{dominion.map(([b, v]) => `${buildingName(b)} +${v}`).join(', ')}</dd>
          </div>
        )}
        {view.garrison !== undefined && view.owner !== 'player' && (
          <div>
            <dt>Garrison</dt>
            <dd title="What an assault must beat today, fortification and this week’s wear counted">{amount(view.garrison)}</dd>
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
              <ActionButton action={a} view={view} campaign={campaign} today={today} onCourt={() => setBidding(!bidding)} />
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
            </li>
          ))}
        </ul>
      )}
      {view.actions.length === 0 && <p className="muted">Nothing to do here today.</p>}
    </section>
  )
}

function ActionButton({ action: a, view, campaign, today, onCourt }: { action: HexAction; view: HexPanelView; campaign: CampaignState; today: ISODate; onCourt(): void }): React.JSX.Element {
  const act = useCampaign((s) => s.act)
  const apply = useCampaign((s) => s.apply)
  const cost = a.cost !== undefined ? ` · ${amount(a.cost)}` : ''
  const label = `${ACTION_TITLES[a.kind]}${cost}`
  switch (a.kind) {
    case 'assault': {
      const orders = campaign.orders.find((o) => o.date === today) ?? null
      return (
        <button
          type="button"
          className="btn btn--small"
          disabled={!a.available || view.target}
          onClick={() => {
            apply((s) => setOrders(s, withTarget(orders, today, view.id)).state)
            sfx('stamp')
            toast(`${view.label} is today’s assault target. Send companies in the orders.`, 'success')
          }}
        >
          <GiArcheryTarget aria-hidden="true" /> {view.target ? 'Today’s target' : 'Set as assault target'}
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
  }
}
