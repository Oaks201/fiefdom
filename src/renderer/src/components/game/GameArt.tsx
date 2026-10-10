import { useEffect, useState } from 'react'
import type { Owner } from '../../lib/game/types'
import { artUrl, useArt } from '../../state/art'

/** Ch 17's banner colors, one per owner. */
export const OWNER_COLORS: Record<Owner, { fill: string; edge: string; text: string }> = {
  player: { fill: '#b8322a', edge: '#e2b24a', text: '#fff3d6' },
  orc: { fill: '#7d1414', edge: '#3a0808', text: '#ffe6dc' },
  goblin: { fill: '#c79a2a', edge: '#6b4e0c', text: '#2a1a05' },
  dwarf: { fill: '#9c6430', edge: '#4a2c12', text: '#fff0dc' },
  archmage: { fill: '#6b3fa0', edge: '#2e1650', text: '#f3e8ff' },
  neutral: { fill: '#8a7a66', edge: '#4d4234', text: '#fbf4e6' }
}

/** Placeholder fills for the map's terrain and overlays (Ch 17's hex set), until the art exists. */
const TERRAIN_TONES: Record<string, string> = {
  'hex.castle': '#a8a090',
  'hex.building': '#bba882',
  'hex.wild': '#86a058',
  'hex.den': '#5e7c40',
  'hex.village': '#dcc07a',
  'hex.road': '#ab9a7e',
  'hex.gate': '#948b7c',
  'hex.lairMouth': '#62526a',
  'hex.capital': '#8e7c69',
  'hex.realm': '#9d8d77',
  'hex.lair': '#4b3e54',
  'hex.battlefield': '#8d6c4f',
  'hex.ruins': '#7c756b'
}

const OVERLAY_TONES: Record<string, { fill: string; opacity: number }> = {
  'hex.overlay.contested': { fill: '#e0761f', opacity: 0.38 },
  'hex.overlay.scorched': { fill: '#1d140e', opacity: 0.55 }
}

/** Where a slot sits inside an SVG (the map): drawn as SVG there, in the parent's units. */
export interface SvgPlace {
  x: number
  y: number
  width: number
  height: number
}

interface GameArtProps {
  /** The slot id in the manifest (`hex.village`, `rival.orc.calm`, `item.whetstones`, …). */
  slot: string
  /** The slot drawn instead while `slot` has no file: a regional variant's shared tile (`hex.den` for `hex.wilds.dwarf.near`). */
  orSlot?: string
  /** Draw inside an SVG at this box instead of as an HTML element. A hex placeholder there is a plain terrain fill. */
  place?: SvgPlace
  /** The owner whose banner color a placeholder takes. */
  owner?: Owner
  /** What the placeholder's letters stand for; defaults to the slot's last part. */
  label?: string
  /** Rendered width in px; the height follows the slot's size. */
  width?: number
  className?: string
  title?: string
  /** Preserve an existing interface ornament when this optional slot has no usable file. */
  fallback?: React.JSX.Element
}

type Look = 'hex' | 'token' | 'banner' | 'card'

function lookOf(slot: string): Look {
  if (slot.startsWith('hex.')) return 'hex'
  if (slot.startsWith('banner.')) return 'banner'
  if (slot.endsWith('.token') || slot.startsWith('item.') || slot.startsWith('ui.icon.') || slot === 'ui.seal') return 'token'
  return 'card'
}

/** Up to two capital letters from a name like "wolfRiders" or "the Matriarch". */
function initials(text: string): string {
  const words = text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[\s._-]+/)
    .filter((w) => w && !/^(the|of|and)$/i.test(w))
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2)).toUpperCase()
}

/** Default placeholder sizes when the manifest hasn't loaded yet (width, height). */
const DEFAULT_SIZE: Record<Look, [number, number]> = { hex: [222, 256], token: [128, 128], banner: [256, 512], card: [512, 512] }

/**
 * Draws an art slot: its file when the manifest lists one, otherwise a placeholder (a hex in the
 * owner's banner color, a lettered token, a banner, or initials on a parchment card). A missing
 * file, or one that fails to load, falls back to the placeholder and never throws.
 */
export function GameArt({ slot: wanted, orSlot, owner = 'neutral', label, width, className, title, place, fallback }: GameArtProps): React.JSX.Element {
  const slot = useArt((s) => (orSlot && !s.slots[wanted]?.file ? orSlot : wanted))
  const entry = useArt((s) => s.slots[slot])
  const load = useArt((s) => s.load)
  const revision = useArt((s) => s.revision)
  const [broken, setBroken] = useState<string | null>(null)
  useEffect(load, [load])

  const look = lookOf(slot)
  const [w, h] = entry?.size ?? DEFAULT_SIZE[look]
  const shownWidth = width ?? w
  const shownHeight = Math.round((shownWidth * h) / w)
  const url = artUrl(entry, revision)
  const classes = `game-art game-art--${look} ${className ?? ''}`

  if (place) {
    if (url && broken !== url) {
      return <image className={classes} href={url} x={place.x} y={place.y} width={place.width} height={place.height} preserveAspectRatio="xMidYMid meet" data-slot={slot} onError={() => setBroken(url)} />
    }
    const hexPoints = `${w / 2},0 ${w},${h / 4} ${w},${(3 * h) / 4} ${w / 2},${h} 0,${(3 * h) / 4} 0,${h / 4}`
    const overlay = OVERLAY_TONES[slot]
    if (look === 'hex') {
      return (
        <svg className={`${classes} game-art--placeholder-svg`} x={place.x} y={place.y} width={place.width} height={place.height} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" data-slot={slot}>
          <polygon points={hexPoints} fill={overlay?.fill ?? TERRAIN_TONES[slot] ?? OWNER_COLORS[owner].fill} fillOpacity={overlay?.opacity ?? 1} />
        </svg>
      )
    }
  }

  if (url && broken !== url) {
    return <img className={classes} src={url} width={shownWidth} height={shownHeight} alt={title ?? ''} title={title} data-slot={slot} onError={() => setBroken(url)} draggable={false} />
  }

  if (fallback) return fallback

  const color = OWNER_COLORS[owner]
  const letters = initials(label ?? slot.split('.').filter((p) => !/^\d+$/.test(p) && p !== 'token' && p !== 'portrait').pop() ?? slot)
  return (
    <svg
      className={`${classes} game-art--placeholder`}
      {...(place ? { x: place.x, y: place.y, width: place.width, height: place.height } : { width: shownWidth, height: shownHeight })}
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={title ?? label ?? slot}
      data-slot={slot}
    >
      {title && <title>{title}</title>}
      {look === 'hex' && (
        <>
          <polygon points={`${w / 2},2 ${w - 2},${h / 4} ${w - 2},${(3 * h) / 4} ${w / 2},${h - 2} 2,${(3 * h) / 4} 2,${h / 4}`} fill={color.fill} stroke={color.edge} strokeWidth="6" />
          <text x={w / 2} y={h / 2} textAnchor="middle" dominantBaseline="central" fontSize={w / 4} fill={color.text} fontFamily="Cinzel, serif" fontWeight="700">
            {letters}
          </text>
        </>
      )}
      {look === 'token' && (
        <>
          <circle cx={w / 2} cy={h / 2} r={Math.min(w, h) / 2 - 4} fill={color.fill} stroke={color.edge} strokeWidth="6" />
          <text x={w / 2} y={h / 2} textAnchor="middle" dominantBaseline="central" fontSize={Math.min(w, h) / 2.6} fill={color.text} fontFamily="Cinzel, serif" fontWeight="700">
            {letters}
          </text>
        </>
      )}
      {look === 'banner' && (
        <>
          <path d={`M4,4 H${w - 4} V${h - 4} L${w / 2},${h * 0.82} L4,${h - 4} Z`} fill={color.fill} stroke={color.edge} strokeWidth="8" />
          <text x={w / 2} y={h * 0.4} textAnchor="middle" dominantBaseline="central" fontSize={w / 3} fill={color.text} fontFamily="Cinzel, serif" fontWeight="700">
            {letters}
          </text>
        </>
      )}
      {look === 'card' && (
        <>
          <rect x="3" y="3" width={w - 6} height={h - 6} rx={Math.min(w, h) / 24} fill="#ecdcb4" stroke={color.fill} strokeWidth="6" />
          <rect x={w * 0.06} y={h * 0.06} width={w * 0.88} height={h * 0.88} rx={Math.min(w, h) / 32} fill="none" stroke={color.edge} strokeOpacity="0.35" strokeWidth="3" strokeDasharray="10 8" />
          <text x={w / 2} y={h / 2} textAnchor="middle" dominantBaseline="central" fontSize={Math.min(w, h) / 3.2} fill={color.fill} fontFamily="Cinzel, serif" fontWeight="700">
            {letters}
          </text>
        </>
      )}
    </svg>
  )
}
