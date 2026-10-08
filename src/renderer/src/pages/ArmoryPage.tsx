import { useMemo } from 'react'
import { Elites, Equipment, ItemShop, Wings } from '../components/armory/ArmoryParts'
import { GameArt } from '../components/game/GameArt'
import { armoryView } from '../lib/game/view/armory'
import { useCampaignState, useCampaignToday } from '../state/campaignHooks'

/**
 * The Armory (T16; Ch 9, Appendix C): items by rank, each company's slots, the Wings, the Elites
 * and the Sworn. Its doors open with the first Milestone; a locked part names only the Milestone
 * that opens it.
 */
export function ArmoryPage(): React.JSX.Element | null {
  const campaign = useCampaignState()
  const today = useCampaignToday()
  const view = useMemo(() => (campaign && today ? armoryView(campaign, today) : null), [campaign, today])
  if (!campaign || !today || !view) return null
  return (
    <div className="game-page armory-page">
      <header className="page-head">
        <h1 className="page-title">The Armory</h1>
        <p className="page-sub">Arms and companies for the realm, opened by the Milestones of the journey.</p>
      </header>
      {!view.open ? (
        <div className="armory-closed">
          <GameArt slot="ui.parchment" owner="player" width={260} label="Armory" />
          <p>The Armory’s doors open with Milestone {view.opensAt}.</p>
        </div>
      ) : (
        <div className="armory">
          <ItemShop view={view} today={today} />
          <Equipment view={view} today={today} />
          <Wings view={view} today={today} />
          <Elites view={view} today={today} />
        </div>
      )}
    </div>
  )
}
