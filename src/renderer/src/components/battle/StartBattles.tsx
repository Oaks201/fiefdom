import { useMemo } from 'react'
import { GiCrossedSwords } from 'react-icons/gi'
import { startSkirmishes } from '../../lib/game/skirmish'
import type { CampaignState, ISODate } from '../../lib/game/types'
import { skirmishRefusalLabel } from '../../lib/game/view/refusals'
import { percent } from '../../lib/game/view/shell'
import { skirmishButton } from '../../lib/game/view/skirmish'
import { useCampaign } from '../../state/campaign'
import { useUI } from '../../state/ui'

/**
 * "Start today's battles" (D-12), on the Chronicle's Valor panel and in the day's orders: locks
 * today's Valor so far and the day's orders, and opens the skirmish screen. Once begun it reopens
 * the screen. Shown only on the campaign's open day, when there is a battle to lead.
 */
export function StartBattles({ campaign, today, valor }: { campaign: CampaignState; today: ISODate; valor: number }): React.JSX.Element | null {
  const act = useCampaign((s) => s.act)
  const view = useMemo(() => skirmishButton(campaign, valor, today), [campaign, valor, today])
  if (!view.show) return null

  const open = (): void => useUI.getState().openSkirmish(today)
  const start = (): void => {
    const done = act((s) => {
      const r = startSkirmishes(s, today, valor)
      return r.ok ? r : { ...r, reason: skirmishRefusalLabel(r.reason) }
    })
    if (done) open()
  }

  const allFought = view.started && view.fought === view.count
  const label = !view.started
    ? `Start today’s battles${view.count !== undefined ? ` (${view.count})` : ''}`
    : allFought
      ? 'Review today’s battles'
      : `Resume today’s battles (${view.fought} of ${view.count} fought)`
  return (
    <div className="start-battles">
      <button type="button" className={`btn ${view.started ? '' : 'btn--primary'}`} onClick={view.started ? open : start}>
        <GiCrossedSwords aria-hidden="true" /> {label}
      </button>
      <p className="muted start-battles__note">
        {view.started
          ? `Your Valor is locked at ${percent(view.valor)}% for today’s fights, and today’s orders hold until the day’s close.`
          : `Your Valor (${percent(view.valor)}%) locks for today’s fights, and today’s orders hold from then on.`}
      </p>
    </div>
  )
}
