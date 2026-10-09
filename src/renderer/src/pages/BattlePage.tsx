import { GiCrossedSwords, GiReturnArrow } from 'react-icons/gi'
import { BattleResult, Replay } from '../components/battle/BattleParts'
import { LiveBattle } from '../components/battle/LiveBattle'
import { Preparation } from '../components/battle/Preparation'
import { formatShort } from '../lib/dates'
import { hexName } from '../lib/game/map'
import { triggerName } from '../lib/game/view/battle'
import { useCampaignState, useCampaignToday } from '../state/campaignHooks'
import { useUI } from '../state/ui'

/**
 * The Grand Battle screen (T16, Ch 11): a route over the pages, not a tab. Preparation during the
 * warning, the battle on its day, then the result and its replay. Desktop only: below 1024 px a
 * notice asks for a wider window instead of the field.
 */
export function BattlePage(): React.JSX.Element | null {
  const campaign = useCampaignState()
  const today = useCampaignToday()
  const route = useUI((s) => s.battle)
  if (!campaign || !today || !route) return null
  const battle = campaign.grandBattles.find((b) => b.id === route.id)
  const back = (
    <button type="button" className="btn btn--small btn--ghost battle-page__back" onClick={() => useUI.getState().closeBattle()}>
      <GiReturnArrow aria-hidden="true" /> Back
    </button>
  )
  if (!battle) {
    return (
      <div className="game-page battle-page">
        {back}
        <p className="muted">That battle is no longer on the roll.</p>
      </div>
    )
  }
  return (
    <div className="game-page battle-page">
      <header className="page-head battle-page__head">
        {back}
        <h1 className="page-title">
          <GiCrossedSwords aria-hidden="true" /> {triggerName(battle)}
        </h1>
        <p className="page-sub">
          At {hexName(battle.hexId)}, {formatShort(battle.battleDate)}
          {battle.result !== undefined ? ' · fought' : battle.setup ? ' · under way' : ''}
        </p>
      </header>
      <p className="battle-narrow banner banner--urgent">The Grand Battle needs a wider window: widen it to at least 1024 pixels to see the field.</p>
      <div className="battle-wide">
        {battle.result !== undefined ? (
          route.replay ? (
            <Replay campaign={campaign} battleId={battle.id} />
          ) : (
            <BattleResult campaign={campaign} battleId={battle.id} />
          )
        ) : battle.setup ? (
          <LiveBattle campaign={campaign} today={today} battleId={battle.id} />
        ) : (
          <Preparation campaign={campaign} today={today} battleId={battle.id} />
        )}
      </div>
    </div>
  )
}
