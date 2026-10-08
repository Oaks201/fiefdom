import { useEffect, useMemo, useState } from 'react'
import { Courtships } from '../components/diplomacy/Courtships'
import { DealsList } from '../components/diplomacy/DealsList'
import { RivalCourt } from '../components/diplomacy/RivalCourt'
import type { RivalId } from '../lib/game/types'
import { rivalPanels } from '../lib/game/view/diplomacy'
import { useCampaignState, useCampaignToday } from '../state/campaignHooks'
import { useUI } from '../state/ui'

/**
 * Diplomacy (T15): the four rival courts, the deals the chosen court will strike, and the
 * courtships. The endgame (Accords, coalitions, the Ultimatum) joins in T16.
 */
export function DiplomacyPage(): React.JSX.Element | null {
  const campaign = useCampaignState()
  const today = useCampaignToday()
  const focus = useUI((s) => s.rivalFocus)
  const [rival, setRival] = useState<RivalId>(focus?.rival ?? 'orc')
  const panels = useMemo(() => (campaign ? rivalPanels(campaign) : []), [campaign])

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
      </header>
      <div className="courts">
        {panels.map((p) => (
          <RivalCourt key={p.rival} panel={p} selected={p.rival === rival} onSelect={() => setRival(p.rival)} />
        ))}
      </div>
      <div className="diplomacy-cols">
        <DealsList campaign={campaign} today={today} rival={rival} highlight={focus?.rival === rival ? focus.hexId : undefined} />
        <Courtships campaign={campaign} today={today} />
      </div>
    </div>
  )
}
