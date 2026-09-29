import { GiCheckMark } from 'react-icons/gi'
import { WaxSeal } from './WaxSeal'

/** A small ring that fills as the day's goals are met; a perfect day earns a tiny gold seal. */
export function ProgressRing({ met, total, perfect, size = 30 }: { met: number; total: number; perfect: boolean; size?: number }): React.JSX.Element {
  if (perfect) return <WaxSeal color="gold" icon={GiCheckMark} size={size + 4} seed={met * 7 + total} className="ring-seal" />
  const r = 15
  const c = 2 * Math.PI * r
  const frac = total > 0 ? met / total : 0
  return (
    <svg className="ring" width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
      <circle cx="18" cy="18" r={r} className="ring__track" />
      {frac > 0 && <circle cx="18" cy="18" r={r} className="ring__fill" strokeDasharray={`${c * frac} ${c}`} transform="rotate(-90 18 18)" />}
    </svg>
  )
}
