import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { sfx } from '../../audio'
import { SFX_NAMES, type SfxName } from '../../audio/sfx'
import { useMoments } from '../../state/moments'
import { useText } from '../../state/text'
import { GameArt } from './GameArt'

/**
 * The full-screen painted card for the big moments (Ch 17): Milestones, Grand Battle results,
 * coalitions, victory and the Fall. It shows the head of the moment queue; its art and words are
 * slots, so it runs on placeholders until the owner adds them.
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
  return createPortal(
    <div className="moment modal-backdrop" role="dialog" aria-modal="true" aria-label={text(moment.titleId, moment.facts)}>
      <div className="moment__card">
        <GameArt slot={moment.slot} owner="player" className="moment__art" width={960} />
        <div className="moment__words">
          <h2 className="moment__title">{text(moment.titleId, moment.facts)}</h2>
          {moment.bodyId && <p className="moment__body">{text(moment.bodyId, moment.facts)}</p>}
          <button type="button" className="btn btn--primary" onClick={dismiss} data-autofocus>
            Continue
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
