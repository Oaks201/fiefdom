import { useMemo } from 'react'
import { GiAnticlockwiseRotation, GiCrossedSwords } from 'react-icons/gi'
import { startSkirmishes, undoStartSkirmishes } from '../../lib/game/skirmish'
import type { CampaignState, ISODate } from '../../lib/game/types'
import { skirmishRefusalLabel } from '../../lib/game/view/refusals'
import { percent } from '../../lib/game/view/shell'
import { skirmishButton } from '../../lib/game/view/skirmish'
import { useCampaign } from '../../state/campaign'
import { toast } from '../../state/toasts'
import { useUI } from '../../state/ui'

/**
 * "Start today's battles" (D-12), on the Chronicle's Valor panel and in the day's orders: locks
 * today's Valor so far and the day's orders, and opens the skirmish screen. Once begun it reopens
 * the screen, and until a battle is opened "Undo start" takes it back (D-36). Shown only on the
 * campaign's open day, when there is a battle to lead.
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
  const note = view.started
    ? `Your Valor is locked at ${percent(view.valor)}% for today’s fights, and today’s orders hold until the day’s close.${view.undoable ? ' Until you open a battle, Undo start unlocks them.' : ''}`
    : `Your Valor (${percent(view.valor)}%) locks for today’s fights, and today’s orders hold from then on.${view.veiled ? ' Under the Veil of Fog this can’t be undone.' : ' You can undo it until you open a battle.'}`
  return (
    <div className="start-battles">
      <div className="start-battles__actions">
        <button type="button" className={`btn ${view.started ? '' : 'btn--primary'}`} onClick={view.started ? open : start}>
          <GiCrossedSwords aria-hidden="true" /> {label}
        </button>
        {view.undoable && <UndoStart today={today} />}
      </div>
      <p className="muted start-battles__note">{note}</p>
    </div>
  )
}

/** "Undo start" (D-36): takes back today's start while no battle is opened; the Valor and orders unlock. */
export function UndoStart({ today, small = false }: { today: ISODate; small?: boolean }): React.JSX.Element {
  const act = useCampaign((s) => s.act)
  const undo = (): void => {
    const done = act((s) => {
      const r = undoStartSkirmishes(s, today)
      return r.ok ? r : { ...r, reason: skirmishRefusalLabel(r.reason) }
    })
    if (!done) return
    useUI.getState().closeSkirmish()
    toast('Start undone: your Valor and today’s orders are unlocked.', 'info')
  }
  return (
    <button type="button" className={`btn btn--ghost${small ? ' btn--small' : ''}`} onClick={undo}>
      <GiAnticlockwiseRotation aria-hidden="true" /> Undo start
    </button>
  )
}
