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
  const deep = WAX[color][3]
  const classes = ['wax-seal', stamp ? 'wax-seal--stamp' : '', className ?? ''].filter(Boolean).join(' ')

  const emblem = (dx: number, dy: number, fill: string): React.JSX.Element | null => {
    if (Icon) return <Icon x={30 + dx} y={30 + dy} size={40} color={fill} />
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
      <path d={d} transform="translate(2 3.5)" fill="rgba(20,8,2,.55)" filter="url(#seal-shadow)" />
      <path d={d} fill={`url(#wax-${color})`} />
      <path d={d} fill="none" stroke="rgba(255,255,255,.16)" strokeWidth="0.8" />
      <circle cx="50" cy="50" r="31.5" fill="none" stroke="rgba(255,255,255,.22)" strokeWidth="1.4" />
      <circle cx="50" cy="50" r="30" fill={`url(#wax-${color}-pressed)`} />
      <circle cx="50" cy="50" r="30" fill="none" stroke="rgba(0,0,0,.4)" strokeWidth="2" />
      {emblem(-0.9, -0.9, 'rgba(0,0,0,.5)')}
      {emblem(0.9, 0.9, 'rgba(255,255,255,.3)')}
      {emblem(0, 0, deep)}
      <ellipse cx="38" cy="30" rx="24" ry="16" fill="url(#wax-gloss)" />
    </svg>
  )
})

/** An empty ring pressed into the paper where a seal will go. */
export function SealSocket({ size = 64, className }: { size?: number; className?: string }): React.JSX.Element {
  return (
    <svg className={`seal-socket ${className ?? ''}`} width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="40" fill="rgba(110,70,30,.08)" stroke="rgba(90,55,20,.45)" strokeWidth="2" strokeDasharray="5 5" />
    </svg>
  )
}
