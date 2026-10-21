import { useEffect, useMemo, useState } from 'react'
import { Audience } from '../components/diplomacy/Audience'
import { Courtships } from '../components/diplomacy/Courtships'
import { CoalitionBanners, EndgameRecord, TermsBanners, UltimatumBanners } from '../components/endgame/Endgame'
import { WeekCloseNote } from '../components/game/WeekClose'
import { RivalCourt } from '../components/diplomacy/RivalCourt'
import type { RivalId } from '../lib/game/types'
import { rivalPanels } from '../lib/game/view/diplomacy'
import { useCampaignState, useCampaignToday } from '../state/campaignHooks'
import { useUI } from '../state/ui'

/**
 * Diplomacy (T15, T16): the four rival courts and the courtships; above them the endgame: an
 * Ultimatum, a coalition, a rival's terms, and after the campaign ends its record. A court's
 * portrait or Audience button opens an audience with it, where its Accord and deals are.
 */
export function DiplomacyPage(): React.JSX.Element | null {
  const campaign = useCampaignState()
  const today = useCampaignToday()
  const focus = useUI((s) => s.rivalFocus)
  const [audience, setAudience] = useState<RivalId | null>(focus?.rival ?? null)
  const panels = useMemo(() => (campaign ? rivalPanels(campaign) : []), [campaign])
  const audiencePanel = panels.find((p) => p.rival === audience)

  // Arriving from the hex panel's "Buy": an audience with that court, the hex picked out in its deals.
  useEffect(() => {
    if (focus) setAudience(focus.rival)
  }, [focus])
  useEffect(() => () => useUI.getState().setRivalFocus(null), [])

  if (!campaign || !today) return null
  return (
    <div className="game-page diplomacy-page">
      <header className="page-head">
        <h1 className="page-title">Diplomacy</h1>
        <p className="page-sub">The four rival courts: who they are, how they regard you, what they will deal on, and the villages you court.</p>
        <WeekCloseNote weekStartsOn={campaign.campaign.weekStartsOn} today={today} className="page-week" />
      </header>
      <EndgameRecord campaign={campaign} />
      <UltimatumBanners campaign={campaign} today={today} />
      <CoalitionBanners campaign={campaign} today={today} />
      <TermsBanners campaign={campaign} today={today} />
      <div className="courts">
        {panels.map((p) => (
          <RivalCourt key={p.rival} panel={p} onAudience={() => setAudience(p.rival)} />
        ))}
      </div>
      <Courtships campaign={campaign} today={today} />
      {audiencePanel && (
        <Audience
          key={audiencePanel.rival}
          campaign={campaign}
          today={today}
          panel={audiencePanel}
          highlight={focus?.rival === audiencePanel.rival ? focus.hexId : undefined}
          onClose={() => {
            setAudience(null)
            useUI.getState().setRivalFocus(null)
          }}
        />
      )}
    </div>
  )
}
