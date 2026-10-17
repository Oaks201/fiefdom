import { useEffect, useMemo, useState } from 'react'
import { Audience } from '../components/diplomacy/Audience'
import { Courtships } from '../components/diplomacy/Courtships'
import { AccordPanel, CoalitionBanners, EndgameRecord, TermsBanners, UltimatumBanners } from '../components/endgame/Endgame'
import { DealsList } from '../components/diplomacy/DealsList'
import { WeekCloseNote } from '../components/game/WeekClose'
import { RivalCourt } from '../components/diplomacy/RivalCourt'
import type { RivalId } from '../lib/game/types'
import { rivalPanels } from '../lib/game/view/diplomacy'
import { useCampaignState, useCampaignToday } from '../state/campaignHooks'
import { useUI } from '../state/ui'

/**
 * Diplomacy (T15, T16): the four rival courts, the Accord and the deals the chosen court will
 * strike, and the courtships; above them the endgame: an Ultimatum, a coalition, and after the
 * campaign ends its record. Picking a court also opens an audience with it.
 */
export function DiplomacyPage(): React.JSX.Element | null {
  const campaign = useCampaignState()
  const today = useCampaignToday()
  const focus = useUI((s) => s.rivalFocus)
  const [rival, setRival] = useState<RivalId>(focus?.rival ?? 'orc')
  const [audience, setAudience] = useState<RivalId | null>(null)
  const panels = useMemo(() => (campaign ? rivalPanels(campaign) : []), [campaign])
  const audiencePanel = panels.find((p) => p.rival === audience)

  // Arriving from the hex panel's "buy": show that court, with the hex picked out.
  useEffect(() => {
    if (focus) setRival(focus.rival)
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
          <RivalCourt
            key={p.rival}
            panel={p}
            selected={p.rival === rival}
            onSelect={() => {
              setRival(p.rival)
              setAudience(p.rival)
            }}
          />
        ))}
      </div>
      <div className="diplomacy-cols">
        <div className="diplomacy-court">
          {campaign.rivals[rival].status === 'active' && <AccordPanel campaign={campaign} today={today} rival={rival} />}
          <DealsList campaign={campaign} today={today} rival={rival} highlight={focus?.rival === rival ? focus.hexId : undefined} />
        </div>
        <Courtships campaign={campaign} today={today} />
      </div>
      {audiencePanel && <Audience key={audiencePanel.rival} campaign={campaign} today={today} panel={audiencePanel} onClose={() => setAudience(null)} />}
    </div>
  )
}
