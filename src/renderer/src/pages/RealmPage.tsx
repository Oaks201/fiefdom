import { Profiler, useState, type ProfilerOnRenderCallback } from 'react'
import { Herald } from '../components/game/Herald'
import { BuildingsPanel, CrossingsPanel, RosterPanel } from '../components/realm/BuildingsPanel'
import { HexMap, MapLegend } from '../components/realm/HexMap'
import { HexPanel } from '../components/realm/HexPanel'
import { OrdersPanel } from '../components/realm/OrdersPanel'
import { useCampaignState, useCampaignToday } from '../state/campaignHooks'

type Tab = 'buildings' | 'crossings' | 'army'
const TABS: { id: Tab; label: string }[] = [
  { id: 'buildings', label: 'Buildings and castle' },
  { id: 'crossings', label: 'Crossings' },
  { id: 'army', label: 'The army' }
]

/** Development only: each commit's duration, for measuring the map's hover (T15). */
const recordCommit: ProfilerOnRenderCallback = (id, phase, actualDuration) => {
  const w = window as unknown as { __fiefdomCommits?: { id: string; phase: string; ms: number }[] }
  ;(w.__fiefdomCommits ??= []).push({ id, phase, ms: actualDuration })
}

/**
 * The Realm (T15): the war table. The hex map with the hex panel, the day's orders and the Herald
 * beside it; below, the buildings and castle, the Crossings and the army.
 */
export function RealmPage(): React.JSX.Element | null {
  const campaign = useCampaignState()
  const today = useCampaignToday()
  const [selected, setSelected] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('buildings')
  if (!campaign || !today) return null
  const page = (
    <div className="game-page realm-page">
      <header className="page-head">
        <h1 className="page-title">The Realm</h1>
        <p className="page-sub">Your lands, the rivals’ borders and the wilds between. Choose a hex to see what it holds and what can be done there.</p>
      </header>
      <div className="realm-board">
        <div className="realm-board__map">
          <HexMap campaign={campaign} today={today} selected={selected} onSelect={setSelected} />
          <MapLegend />
        </div>
        <aside className="realm-board__side">
          {selected ? (
            <HexPanel key={selected} campaign={campaign} today={today} hexId={selected} onClose={() => setSelected(null)} />
          ) : (
            <p className="panel realm-hint">Choose a hex on the map to see who holds it, its garrison and Dominion, and every action open there today.</p>
          )}
          <OrdersPanel campaign={campaign} today={today} />
        </aside>
      </div>
      <div className="realm-lower">
        <div className="realm-tabs" role="tablist" aria-label="The realm">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`realm-tab ${tab === t.id ? 'is-on' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        {tab === 'buildings' && <BuildingsPanel campaign={campaign} today={today} />}
        {tab === 'crossings' && <CrossingsPanel campaign={campaign} today={today} />}
        {tab === 'army' && <RosterPanel campaign={campaign} today={today} />}
      </div>
      <Herald today={today} compact />
    </div>
  )
  return import.meta.env.DEV ? (
    <Profiler id="realm" onRender={recordCommit}>
      {page}
    </Profiler>
  ) : (
    page
  )
}
