import { useEffect, useMemo, useState } from 'react'
import { Audience } from '../components/diplomacy/Audience'
import { Courtships } from '../components/diplomacy/Courtships'
import { CoalitionBanners, EndgameRecord, TermsBanners, UltimatumBanners } from '../components/endgame/Endgame'
import { WeekCloseNote } from '../components/game/WeekClose'
import { RivalCourt } from '../components/diplomacy/RivalCourt'
import { RivalGuide, RivalPicker } from '../components/diplomacy/RivalGuide'
import { RIVAL_IDS, type RivalId } from '../lib/game/types'
import { rivalPanels } from '../lib/game/view/diplomacy'
import { rivalGuide } from '../lib/game/view/rivalGuide'
import { useCampaignState, useCampaignToday } from '../state/campaignHooks'
import { useUI } from '../state/ui'

type Tab = 'courts' | 'rivals'
// The Realm page's tab strip, reused.
const TABS: { id: Tab; label: string }[] = [
  { id: 'courts', label: 'The courts' },
  { id: 'rivals', label: 'How each rival works' }
]

/**
 * Diplomacy (T15, T16): the four rival courts and the courtships; above them the endgame: an
 * Ultimatum, a coalition, a rival's terms, and after the campaign ends its record. A court's
 * portrait or Audience button opens an audience with it, where its Accord and deals are. The second
 * tab explains one rival at a time (`rivalGuide`); a court's "How he works" opens it on that rival.
 */
export function DiplomacyPage(): React.JSX.Element | null {
  const campaign = useCampaignState()
  const today = useCampaignToday()
  const focus = useUI((s) => s.rivalFocus)
  const [audience, setAudience] = useState<RivalId | null>(focus?.rival ?? null)
  const [tab, setTab] = useState<Tab>('courts')
  const [guided, setGuided] = useState<RivalId>(RIVAL_IDS[0])
  const panels = useMemo(() => (campaign ? rivalPanels(campaign) : []), [campaign])
  const guide = useMemo(() => (campaign ? rivalGuide(campaign, guided) : null), [campaign, guided])
  const audiencePanel = panels.find((p) => p.rival === audience)
  const guidedPanel = panels.find((p) => p.rival === guided)

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
      <div className="realm-tabs" role="tablist" aria-label="Diplomacy">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`realm-tab ${tab === t.id ? 'is-on' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'courts' && (
        <>
          <div className="courts">
            {panels.map((p) => (
              <RivalCourt
                key={p.rival}
                panel={p}
                onAudience={() => setAudience(p.rival)}
                onGuide={() => {
                  setGuided(p.rival)
                  setTab('rivals')
                }}
              />
            ))}
          </div>
          <Courtships campaign={campaign} today={today} />
        </>
      )}
      {tab === 'rivals' && guide && guidedPanel && (
        <>
          <RivalPicker panels={panels} chosen={guided} onChoose={setGuided} />
          <RivalGuide panel={guidedPanel} guide={guide} onAudience={() => setAudience(guided)} />
        </>
      )}
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
