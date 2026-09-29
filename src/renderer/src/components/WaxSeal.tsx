import { memo, useMemo } from 'react'
import type { IconType } from 'react-icons'
import { WAX, type WaxColor } from './SvgDefs'

function mulberry32(seed: number): () => number {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** An irregular, dripped-wax outline — the same seed always gives the same shape. */
function blobPath(seed: number, radius = 44.5, points = 15, jitter = 0.09): string {
  const rand = mulberry32(seed)
  const pts: Array<[number, number]> = []
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2 + rand() * 0.18
    const r = radius * (1 - jitter + rand() * jitter * 1.6)
    pts.push([50 + Math.cos(a) * r, 50 + Math.sin(a) * r])
  }
  const f = (p: [number, number]): string => `${p[0].toFixed(2)},${p[1].toFixed(2)}`
  let d = `M${f(pts[0])}`
  for (let i = 0; i < points; i++) {
    const p0 = pts[(i - 1 + points) % points]
    const p1 = pts[i]
    const p2 = pts[(i + 1) % points]
    const p3 = pts[(i + 2) % points]
    const c1: [number, number] = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2: [number, number] = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C${f(c1)} ${f(c2)} ${f(p2)}`
  }
  return `${d}Z`
}

export interface WaxSealProps {
  color?: WaxColor
  size?: number
  seed?: number
  icon?: IconType
  letter?: string
  className?: string
  title?: string
  /** play the stamping animation when it appears */
  stamp?: boolean
}

export const WaxSeal = memo(function WaxSeal({
  color = 'crimson',
  size = 64,
  seed = 7,
  icon: Icon,
  letter,
  className,
  title,
  stamp
}: WaxSealProps) {
  const d = useMemo(() => blobPath(seed), [seed])
  const [highlight, , shadow, deep] = WAX[color]
  const classes = ['wax-seal', stamp ? 'wax-seal--stamp' : '', className ?? ''].filter(Boolean).join(' ')

  const emblem = (dx: number, dy: number, fill: string): React.JSX.Element | null => {
    if (Icon) return <Icon x={30 + dx} y={30 + dy} size={40} fill={fill} />
    if (letter)
      return (
        <text
          x={50 + dx}
          y={51 + dy}
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily="Cinzel, serif"
          fontWeight={900}
          fontSize={letter.length > 1 ? 24 : 36}
          fill={fill}
        >
          {letter}
        </text>
      )
    return null
  }

  return (
    <svg
      className={classes}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      <path d={d} transform="translate(1 4)" fill="#241006" fillOpacity="0.65" filter="url(#seal-shadow)" />
      {/* A visible lower edge gives the wax weight even at the smallest stamp size. */}
      <path d={d} transform="translate(0 2.5)" fill={shadow} stroke="#291509" strokeOpacity="0.7" strokeWidth="1.8" />
      <path d={d} fill={`url(#wax-${color})`} stroke={shadow} strokeWidth="1.3" />
      <path d={d} transform="translate(2.5 2.5) scale(.95)" fill="none" stroke="url(#wax-edge-light)" strokeWidth="1.8" />

      {/* The rounded lip and recessed face read like a hand-carved signet impression. */}
      <circle cx="50" cy="50.8" r="34" fill={shadow} fillOpacity="0.65" />
      <circle cx="50" cy="49.4" r="34" fill={`url(#wax-${color}-rim)`} />
      <circle cx="50" cy="50" r="29.8" fill={`url(#wax-${color}-pressed)`} stroke={shadow} strokeWidth="1.4" />
      <path d="M20.3 50a29.7 29.7 0 0 1 59.4 0" fill="none" stroke={shadow} strokeOpacity="0.65" strokeWidth="1.6" />
      <path d="M21.8 59a29.6 29.6 0 0 0 56.4 0" fill="none" stroke={highlight} strokeOpacity="0.5" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M22 36a32 32 0 0 1 36-17" fill="none" stroke={highlight} strokeOpacity="0.85" strokeWidth="1.8" strokeLinecap="round" />

      {/* Tiny tooling marks stay on the rim, clear of the readable emblem. */}
      <g fill={deep} fillOpacity="0.65" stroke={highlight} strokeOpacity="0.3" strokeWidth="0.6">
        <path d="m50 11 1.7 3-1.7 3-1.7-3Z" />
        <path d="m50 83 1.7 3-1.7 3-1.7-3Z" />
        <path d="m11 50 3-1.7 3 1.7-3 1.7Z" />
        <path d="m83 50 3-1.7 3 1.7-3 1.7Z" />
      </g>
      <path d="M20 25q4-5 8-6M16 34l2-4M69 79l5-4" fill="none" stroke={highlight} strokeOpacity="0.45" strokeWidth="1.7" strokeLinecap="round" />

      {emblem(0, 1.7, shadow)}
      {emblem(-0.7, -0.8, highlight)}
      {emblem(0, 0, `url(#wax-${color}-emblem)`)}
    </svg>
  )
})

/** An empty ring pressed into the paper where a seal will go. */
export function SealSocket({ size = 64, className }: { size?: number; className?: string }): React.JSX.Element {
  return (
    <svg className={`seal-socket ${className ?? ''}`} width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="51.5" r="39" fill="none" stroke="#fff0bd" strokeOpacity="0.45" strokeWidth="2" />
      <circle cx="50" cy="50" r="39" fill="url(#seal-socket-well)" stroke="#704421" strokeOpacity="0.5" strokeWidth="1.8" />
      <circle cx="50" cy="50" r="33" fill="none" stroke="#704421" strokeOpacity="0.35" strokeWidth="1" strokeDasharray="2 5" />
      <g fill="#704421" fillOpacity="0.5">
        <path d="m50 7 2.4 4.5-2.4 4.5-2.4-4.5Z" />
        <path d="m50 84 2.4 4.5-2.4 4.5-2.4-4.5Z" />
        <path d="m7 50 4.5-2.4 4.5 2.4-4.5 2.4Z" />
        <path d="m84 50 4.5-2.4 4.5 2.4-4.5 2.4Z" />
      </g>
    </svg>
  )
}
