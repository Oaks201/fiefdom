import { useEffect, useMemo } from 'react'
import { GiArcheryTarget, GiCrossedSwords, GiPlayButton, GiReturnArrow, GiShield } from 'react-icons/gi'
import { ReplayBoard, RoundLog } from '../components/battle/BattleParts'
import { FieldGrid } from '../components/battle/FieldGrid'
import { RoundBoard } from '../components/battle/RoundBoard'
import { formatShort } from '../lib/dates'
import type { RoundPlay } from '../lib/game/grand/field'
import { beginFight, playFightRound, type SkirmishAction } from '../lib/game/skirmish'
import type { CampaignState } from '../lib/game/types'
import { skirmishFieldView, skirmishReplayView, type RoundView } from '../lib/game/view/battle'
import { amount, skirmishRefusalLabel } from '../lib/game/view/refusals'
import { percent } from '../lib/game/view/shell'
import { fightIntro, fightResult, skirmishDayView, type FightResult, type FightStatus, type SkirmishDayView } from '../lib/game/view/skirmish'
import { useCampaign } from '../state/campaign'
import { useCampaignState } from '../state/campaignHooks'
import { useText } from '../state/text'
import { useUI } from '../state/ui'

const STATUS_WORDS: Record<FightStatus, string> = { waiting: 'To fight', underway: 'Under way', rout: 'A Rout', victory: 'Victory', defeat: 'Defeat', left: 'Left to the close' }
const RESULT_WORDS: Record<FightResult['result'], string> = { rout: 'a Rout', victory: 'victory', defeat: 'defeat' }

/** A skirmish action with its refusal in plain words, for the campaign store's notice. */
function worded(r: SkirmishAction): SkirmishAction {
  return r.ok ? r : { ...r, reason: skirmishRefusalLabel(r.reason) }
}

/** The fight after `fightId` still to play, if any. */
function laterFight(day: SkirmishDayView, fightId: string): string | null {
  const at = day.fights.findIndex((f) => f.id === fightId)
  return day.fights.slice(at + 1).find((f) => f.status === 'waiting' || f.status === 'underway')?.id ?? null
}

/**
 * The day's skirmishes (D-12): a route over the pages like the Grand Battle's. The day's fights in
 * the close's order beside the one at hand: its opening (who, where, the enemy as the Herald knows
 * it), its rounds on the field, then its result and replay. Desktop only: below 1024 px a notice
 * asks for a wider window instead of the field.
 */
export function SkirmishPage(): React.JSX.Element | null {
  const campaign = useCampaignState()
  const route = useUI((s) => s.skirmish)
  const day = campaign && route ? skirmishDayView(campaign, route.day) : null
  const current = day && route ? ((route.fight && day.fights.some((f) => f.id === route.fight) ? route.fight : null) ?? day.next ?? day.fights[0]?.id ?? null) : null
  // Opened at "the next fight", the page holds on to it, so its result shows when it ends.
  useEffect(() => {
    if (route && route.fight === null && current) useUI.getState().openSkirmish(route.day, current)
  }, [route, current])
  if (!campaign || !route) return null
  const back = (
    <button type="button" className="btn btn--small btn--ghost battle-page__back" onClick={() => useUI.getState().closeSkirmish()}>
      <GiReturnArrow aria-hidden="true" /> Back
    </button>
  )
  if (!day) {
    return (
      <div className="game-page battle-page">
        {back}
        <p className="muted">No battles were begun that day.</p>
      </div>
    )
  }
  return (
    <div className="game-page battle-page skirmish-page">
      <header className="page-head battle-page__head">
        {back}
        <h1 className="page-title">
          <GiCrossedSwords aria-hidden="true" /> {day.open ? 'Today’s battles' : `The battles of ${formatShort(day.day)}`}
        </h1>
        <p className="page-sub">
          {formatShort(day.day)} · Valor locked at {percent(day.valor)}% · {day.rounds} rounds each
        </p>
      </header>
      <p className="battle-narrow banner banner--urgent">The battle field needs a wider window: widen it to at least 1024 pixels to see it.</p>
      <div className="battle-wide">
        <div className="skirmish">
          <FightRoll day={day} current={current} />
          <div className="skirmish__stage">{current && <FightStage key={current} campaign={campaign} day={day} fightId={current} replay={route.replay} />}</div>
        </div>
      </div>
    </div>
  )
}

/** The day's fights in the close's order, each with where it stands; and "let the Marshal handle the rest". */
function FightRoll({ day, current }: { day: SkirmishDayView; current: string | null }): React.JSX.Element {
  return (
    <aside className="skirmish__roll" aria-label="The day’s fights, in the close’s order">
      <ol>
        {day.fights.map((f, i) => (
          <li key={f.id}>
            <button
              type="button"
              className={`skirmish__fight is-${f.status} ${f.id === current ? 'is-on' : ''}`}
              aria-current={f.id === current ? 'step' : undefined}
              onClick={() => useUI.getState().openSkirmish(day.day, f.id)}
            >
              <span className="skirmish__num">{i + 1}</span>
              <span className="skirmish__label">
                {f.side === 'assault' ? <GiArcheryTarget aria-hidden="true" /> : <GiShield aria-hidden="true" />} {f.label}
              </span>
              <span className={`skirmish__status skirmish__status--${f.status}`}>{STATUS_WORDS[f.status]}</span>
            </button>
          </li>
        ))}
      </ol>
      {day.open && day.next && (
        <div className="skirmish__rest">
          <button type="button" className="btn btn--small btn--ghost" onClick={() => useUI.getState().closeSkirmish()}>
            Let the Marshal handle the rest
          </button>
          <p className="muted">A battle you haven’t opened is fought at the day’s close as usual; one you opened is finished there by the Marshal.</p>
        </div>
      )}
    </aside>
  )
}

/** The fight at hand: its opening, its rounds, or its result and replay. */
function FightStage({ campaign, day, fightId, replay }: { campaign: CampaignState; day: SkirmishDayView; fightId: string; replay: boolean }): React.JSX.Element | null {
  const result = useMemo(() => fightResult(campaign, day.day, fightId), [campaign, day.day, fightId])
  const row = day.fights.find((f) => f.id === fightId)
  if (!row) return null
  if (result) {
    if (replay) return <ReplayBoard view={skirmishReplayView(campaign, day.day, fightId)} onBack={() => useUI.getState().openSkirmish(day.day, fightId, false)} />
    return <ResultCard campaign={campaign} day={day} result={result} />
  }
  if (!day.open) return <p className="muted">Left to the close: it was fought there as usual.</p>
  if (row.status === 'underway') return <LiveFight campaign={campaign} day={day} fightId={fightId} label={row.label} />
  return <Opening campaign={campaign} day={day} fightId={fightId} />
}

/** Before a fight is opened: who comes, where, how strong as far as the Herald knows, and who meets it. */
function Opening({ campaign, day, fightId }: { campaign: CampaignState; day: SkirmishDayView; fightId: string }): React.JSX.Element | null {
  const act = useCampaign((s) => s.act)
  const intro = fightIntro(campaign, day.day, fightId)
  const field = skirmishFieldView(campaign, day.day, fightId)
  if (!intro) return null
  const begin = (): void => {
    if (act((s) => worded(beginFight(s, day.day, fightId)))) useUI.getState().openSkirmish(day.day, fightId)
  }
  const skip = (): void => {
    const later = laterFight(day, fightId)
    if (later) useUI.getState().openSkirmish(day.day, later)
    else useUI.getState().closeSkirmish()
  }
  return (
    <div className="skirmish-opening">
      <section className="panel skirmish-opening__card">
        <h3 className="skirmish__title">{intro.label}</h3>
        <dl className="skirmish-opening__facts">
          <dt>The enemy</dt>
          <dd>{intro.enemy.map((e) => (e.count > 1 ? `${e.count} × ${e.name}` : e.name)).join(', ')}</dd>
          <dt>Strength</dt>
          <dd>{intro.strength}</dd>
          <dt>Your companies</dt>
          <dd>{intro.yours.join(', ')}</dd>
          <dt>Readiness</dt>
          <dd>{amount(intro.readiness)}, from your locked Valor</dd>
        </dl>
        <p className="muted">
          {intro.rounds} rounds on the field. Once you open it, the Marshal finishes it at the day’s close if you don’t; leave it unopened and the close fights it as usual.
        </p>
        <div className="skirmish-opening__actions">
          <button type="button" className="btn btn--primary" onClick={begin}>
            <GiCrossedSwords aria-hidden="true" /> Fight this battle
          </button>
          <button type="button" className="btn btn--ghost" onClick={skip}>
            Leave it to the close
          </button>
        </div>
      </section>
      {field && <FieldGrid units={field.units} lanes={[]} />}
    </div>
  )
}

/** A fight under way: the shared round board, each round played with `playFightRound`. */
function LiveFight({ campaign, day, fightId, label }: { campaign: CampaignState; day: SkirmishDayView; fightId: string; label: string }): React.JSX.Element | null {
  const act = useCampaign((s) => s.act)
  const view = skirmishFieldView(campaign, day.day, fightId)
  if (!view) return null
  const play = (p: RoundPlay): RoundView | null => {
    if (!act((s) => worded(playFightRound(s, day.day, fightId, p)))) return null
    const next = useCampaign.getState().campaign
    return next ? (skirmishFieldView(next, day.day, fightId)?.log.at(-1) ?? null) : null
  }
  return (
    <div className="skirmish-live">
      <h3 className="skirmish__title">{label}</h3>
      <RoundBoard view={view} play={play} />
      <p className="muted">Leave now and the Marshal finishes this battle at the day’s close.</p>
    </div>
  )
}

/** A finished fight: its result, the report the close posts for it (or will), and its replay. */
function ResultCard({ campaign, day, result }: { campaign: CampaignState; day: SkirmishDayView; result: FightResult }): React.JSX.Element {
  const text = useText()
  const field = skirmishFieldView(campaign, day.day, result.id)
  const next = day.open ? laterFight(day, result.id) : null
  return (
    <div className="battle-result">
      <section className={`panel battle-result__card ${result.won ? 'is-won' : 'is-lost'}`}>
        <div>
          <h3 className="battle-result__title">
            {result.label}: {RESULT_WORDS[result.result]}
          </h3>
          {result.report && (
            <p className="skirmish-result__report" data-text-id={result.report.textId}>
              {text(result.report.textId, result.report.facts)}
            </p>
          )}
          {result.marshal && <p className="muted">You opened it and left it; the Marshal finished it at the day’s close.</p>}
          {result.weary.length > 0 && <p>Weary from the day’s close: {result.weary.join(', ')}.</p>}
          <p className="muted">{result.posted ? 'Posted at the day’s close.' : 'This posts at the day’s close, with the rest of the day’s battles.'}</p>
          <div className="battle-result__actions">
            <button type="button" className="btn" onClick={() => useUI.getState().openSkirmish(day.day, result.id, true)}>
              <GiPlayButton aria-hidden="true" /> Watch the replay
            </button>
            {next ? (
              <button type="button" className="btn btn--primary" onClick={() => useUI.getState().openSkirmish(day.day, next)}>
                <GiCrossedSwords aria-hidden="true" /> Next battle
              </button>
            ) : (
              <button type="button" className="btn btn--ghost" onClick={() => useUI.getState().closeSkirmish()}>
                <GiReturnArrow aria-hidden="true" /> Done
              </button>
            )}
          </div>
        </div>
      </section>
      {field && <FieldGrid units={field.units} lanes={[]} />}
      {field && <RoundLog log={field.log} />}
    </div>
  )
}
