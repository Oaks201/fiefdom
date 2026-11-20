import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { GiOak } from 'react-icons/gi'
import { sfx } from '../../audio'
import { SFX_NAMES, type SfxName } from '../../audio/sfx'
import { rankLine } from '../../lib/game/view/audience'
import { rivalName } from '../../lib/game/view/shell'
import { useMoments } from '../../state/moments'
import { useText } from '../../state/text'
import { useUI } from '../../state/ui'
import { RULER_LINES } from '../diplomacy/rulerLines'
import { GameArt } from './GameArt'
import { PlayerPortrait } from './PlayerPortrait'

/** How wide the player's portrait is drawn on the standing card. */
const PORTRAIT_WIDTH = 360

/** How wide a ruler's portrait is drawn on a path rank's card (L2). */
const RULER_WIDTH = 320

/**
 * The full-screen painted card for the big moments (Ch 17): Milestones, Grand Battle results,
 * coalitions, victory and the Fall. It shows the head of the moment queue; its art and words are
 * slots, so it runs on placeholders until the owner adds them. The standing card shows the
 * player's new portrait instead. Patch 10 stage 4 (L2): a path rank's card shows the ruler of that path, and his
 * word on the rank once Rich has approved it (a development build shows the draft).
 */
export function BigMomentCard(): React.JSX.Element | null {
  const moment = useMoments((s) => s.queue[0])
  const dismiss = useMoments((s) => s.dismiss)
  const text = useText()

  useEffect(() => {
    if (!moment) return
    if (moment.sound && (SFX_NAMES as readonly string[]).includes(moment.sound)) sfx(moment.sound as SfxName)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault()
        dismiss()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [moment, dismiss])

  if (!moment) return null
  const said = moment.ruler ? rankLine(moment.ruler.rival, moment.ruler.rank, RULER_LINES) : undefined
  return createPortal(
    <div className="moment modal-backdrop" role="dialog" aria-modal="true" aria-label={text(moment.titleId, moment.facts)}>
      <div className="moment__card">
        {moment.portrait ? (
          <PlayerPortrait choice={moment.portrait} width={PORTRAIT_WIDTH} name={text(moment.titleId, moment.facts)} className="moment__portrait" />
        ) : moment.ruler ? (
          <GameArt slot={moment.slot} owner={moment.ruler.rival} className="moment__portrait" width={RULER_WIDTH} label={rivalName(moment.ruler.rival)} />
        ) : (
          <GameArt slot={moment.slot} owner="player" className="moment__art" width={960} />
        )}
        <div className="moment__words">
          <h2 className="moment__title">{text(moment.titleId, moment.facts)}</h2>
          {moment.inset && (
            <span className="moment__inset">
              <GameArt slot={moment.inset.slot} width={96} label={moment.inset.label} title={moment.inset.label} fallback={<GiOak className="moment__inset-icon" aria-hidden="true" />} />
            </span>
          )}
          {moment.bodyId && <p className="moment__body">{text(moment.bodyId, moment.facts)}</p>}
          {moment.ruler && said && (
            <blockquote className="moment__quote">
              <q>{said}</q> <cite>{rivalName(moment.ruler.rival)}</cite>
            </blockquote>
          )}
          {moment.lines && moment.lines.length > 0 && (
            <ul className="moment__lines">
              {moment.lines.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          )}
          <div className="moment__actions">
            {moment.action && (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  useUI.getState().openBattle(moment.action?.battleId ?? '', true)
                  dismiss()
                }}
              >
                {moment.action.label}
              </button>
            )}
            <button type="button" className="btn btn--primary" onClick={dismiss} data-autofocus>
              Continue
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
