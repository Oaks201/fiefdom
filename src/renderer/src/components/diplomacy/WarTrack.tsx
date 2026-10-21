import type { CSSProperties } from 'react'
import type { WarTrack } from '../../lib/game/view/diplomacy'
import { OWNER_COLORS } from '../game/GameArt'

/**
 * A war track drawn as a tug of war (a Rim front, or the Orc's war on you): the ruler on the left, the
 * other side on the right, a notch for each step from −max to +max, and the marker with a fill from the
 * middle leaning toward whoever is winning, in his colors. The end the marker has reached is lit.
 */
export function WarTrackBar({ tug }: { tug: WarTrack }): React.JSX.Element {
  const { left, right, lean, max } = tug
  const at = (s: number): number => ((max - s) / (2 * max)) * 100 // a step's place along the bar, in percent: +max at the left end
  const ahead = lean > 0 ? left : lean < 0 ? right : null
  const colors = {
    ['--left' as string]: OWNER_COLORS[left.owner].fill,
    ['--right' as string]: OWNER_COLORS[right.owner].fill,
    ['--lead' as string]: ahead ? OWNER_COLORS[ahead.owner].fill : 'var(--ink-3)'
  } as CSSProperties
  const steps = Array.from({ length: 2 * max - 1 }, (_, i) => max - 1 - i) // the inner notches; the bar's ends are the outer two
  return (
    <div className="tug" style={colors}>
      <span className={`tug__side tug__side--left ${lean >= max ? 'is-end' : ''}`}>{left.name}</span>
      <div className="tug__bar" role="meter" aria-valuemin={-max} aria-valuemax={max} aria-valuenow={lean} aria-label={`${left.name} against ${right.name}: ${tug.leader}`}>
        <span className="tug__end tug__end--left" />
        <span className="tug__end tug__end--right" />
        <span className="tug__fill" style={{ left: `${Math.min(at(lean), 50)}%`, width: `${Math.abs(at(lean) - 50)}%` }} />
        {steps.map((s) => (
          <span key={s} className={`tug__step ${s === 0 ? 'is-middle' : ''}`} style={{ left: `${at(s)}%` }} />
        ))}
        <span className="tug__marker" style={{ left: `${at(lean)}%` }} />
      </div>
      <span className={`tug__side tug__side--right ${lean <= -max ? 'is-end' : ''}`}>{right.name}</span>
    </div>
  )
}
