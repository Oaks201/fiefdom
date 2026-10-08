import { useEffect, useMemo, useState } from 'react'
import { GiNextButton, GiPauseButton, GiPlayButton, GiPreviousButton, GiReturnArrow } from 'react-icons/gi'
import type { CampaignState, Lane } from '../../lib/game/types'
import { fieldView, replayView, resultView, type RoundView } from '../../lib/game/view/battle'
import { factor } from '../../lib/game/view/refusals'
import { useText } from '../../state/text'
import { useUI } from '../../state/ui'
import { GameArt } from '../game/GameArt'
import { FieldGrid, type FieldUnit, type Float } from './FieldGrid'

const PERCENT = 100

/** Each side's remaining health as a share of its start. */
export function Shares({ shares }: { shares: { player: number; enemy: number } }): React.JSX.Element {
  return (
    <div className="shares" aria-label="Remaining health">
      <span className="shares__side">
        Yours <span className="shares__bar shares__bar--player" style={{ ['--fill' as string]: shares.player }} /> {Math.round(shares.player * PERCENT)}%
      </span>
      <span className="shares__side">
        Theirs <span className="shares__bar shares__bar--enemy" style={{ ['--fill' as string]: shares.enemy }} /> {Math.round(shares.enemy * PERCENT)}%
      </span>
    </div>
  )
}

/** The running round log: the Order, the swap and every hit. */
export function RoundLog({ log }: { log: RoundView[] }): React.JSX.Element | null {
  if (log.length === 0) return null
  return (
    <section className="round-log" aria-label="Round log">
      <h4>The rounds</h4>
      <ol>
        {[...log].reverse().map((r) => (
          <li key={r.round}>
            <strong>Round {r.round}</strong>
            {r.order ? ` · ${r.order}${r.target ? ` at ${r.target}` : ''}` : ' · no Order'}
            {r.swap ? ' · a swap' : ''}
            <ul>
              {r.lines.map((l, i) => (
                <li key={i}>
                  {l.from} → {l.to}: {factor(l.amount)}
                  {l.note ? ` (${l.note})` : ''}
                  {l.dealt !== undefined && Math.abs(l.dealt - l.amount) > 1e-9 ? `, dealt ${factor(l.dealt)}` : ''}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** A fought battle's result (Ch 11 "Outcomes"): won, Rout or lost, and what followed. */
export function BattleResult({ campaign, battleId }: { campaign: CampaignState; battleId: string }): React.JSX.Element | null {
  const text = useText()
  const view = resultView(campaign, battleId)
  const field = fieldView(campaign, battleId)
  if (!view) return null
  return (
    <div className="battle-result">
      <section className={`panel battle-result__card ${view.won ? 'is-won' : 'is-lost'}`}>
        <GameArt slot={view.slot} owner="player" width={220} label={view.won ? 'Victory' : 'Defeat'} />
        <div>
          <h3 className="battle-result__title" data-text-id={view.titleId}>
            {text(view.titleId, view.facts)}
          </h3>
          <p className="muted">
            {view.result === 'rout' ? 'A Rout.' : view.result === 'victory' ? 'A victory.' : 'A defeat.'} Remaining health: yours {Math.round(view.shares.player * PERCENT)}%, theirs {Math.round(view.shares.enemy * PERCENT)}%.
            {view.marshal ? ' The Marshal fought it at the day’s close.' : ''}
          </p>
          {view.lines.length > 0 && (
            <ul className="battle-result__lines">
              {view.lines.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          )}
          <div className="battle-result__actions">
            <button type="button" className="btn" onClick={() => useUI.getState().openBattle(battleId, true)}>
              <GiPlayButton aria-hidden="true" /> Watch the replay
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => useUI.getState().closeBattle()}>
              <GiReturnArrow aria-hidden="true" /> Back to the realm
            </button>
          </div>
        </div>
      </section>
      {field && <FieldGrid units={field.units} lanes={[]} />}
      {field && <RoundLog log={field.log} />}
    </div>
  )
}

const SPEEDS = [1, 2, 4] as const
const FRAME_MS = 1_800

/** Replays a stored battle from its log (Ch 11 rule 4) at 1×, 2× or 4×, or step by step. */
export function Replay({ campaign, battleId }: { campaign: CampaignState; battleId: string }): React.JSX.Element | null {
  const view = useMemo(() => replayView(campaign, battleId), [campaign, battleId])
  const [frame, setFrame] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1)
  const last = (view?.frames.length ?? 1) - 1

  useEffect(() => {
    if (!playing || frame >= last) return
    const id = setTimeout(() => setFrame((f) => Math.min(last, f + 1)), FRAME_MS / speed)
    return () => clearTimeout(id)
  }, [playing, frame, last, speed])

  if (!view) return null
  const shown = view.frames[frame]
  const units: FieldUnit[] = view.units.map((u) => ({ ...u, hp: shown.hp[u.id] ?? 0, routed: shown.round > 0 && !(u.id in shown.slots), ...(shown.slots[u.id] ? { slot: shown.slots[u.id] } : {}) }))
  const floats: Float[] = (shown.played?.lines ?? []).map((l, i) => ({ key: `${frame}-${i}`, unitId: l.toId, amount: l.amount }))
  const next = view.frames[frame + 1]?.played
  const lanes = (['left', 'center', 'right'] as Lane[]).map((lane) => ({ lane, ...(next?.intents[lane] ? { intent: next.intents[lane] } : {}) }))
  return (
    <div className="replay">
      <div className="replay__controls">
        <button type="button" className="btn btn--small btn--ghost" onClick={() => setFrame((f) => Math.max(0, f - 1))} disabled={frame === 0} aria-label="Step back">
          <GiPreviousButton aria-hidden="true" />
        </button>
        <button type="button" className="btn btn--small" onClick={() => (frame >= last ? (setFrame(0), setPlaying(true)) : setPlaying(!playing))}>
          {playing && frame < last ? <GiPauseButton aria-hidden="true" /> : <GiPlayButton aria-hidden="true" />} {frame >= last ? 'Again' : playing ? 'Pause' : 'Play'}
        </button>
        <button type="button" className="btn btn--small btn--ghost" onClick={() => setFrame((f) => Math.min(last, f + 1))} disabled={frame >= last} aria-label="Step forward">
          <GiNextButton aria-hidden="true" />
        </button>
        <span className="replay__speeds" role="radiogroup" aria-label="Speed">
          {SPEEDS.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={speed === s} className={`chip ${speed === s ? 'is-on' : ''}`} onClick={() => setSpeed(s)}>
              {s}×
            </button>
          ))}
        </span>
        <span className="replay__where">{frame === 0 ? 'The field as the battle began' : `After round ${frame} of ${last}`}</span>
        <button type="button" className="btn btn--small btn--ghost replay__back" onClick={() => useUI.getState().openBattle(battleId, false)}>
          The result
        </button>
      </div>
      <FieldGrid units={units} lanes={lanes} floats={floats} />
      {shown.played && <RoundLog log={[shown.played]} />}
    </div>
  )
}
