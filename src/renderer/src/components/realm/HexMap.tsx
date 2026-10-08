import { memo, useMemo, useRef } from 'react'
import type { IconType } from 'react-icons'
import {
  GiArcheryTarget,
  GiCrossedSwords,
  GiCrown,
  GiDragonHead,
  GiFlame,
  GiHornInternal,
  GiQuill,
  GiShield,
  GiTorch,
  GiVillage
} from 'react-icons/gi'
import { create } from 'zustand'
import type { CampaignState, ISODate, Owner } from '../../lib/game/types'
import { HEX_WIDTH, hexLayout, mapView, ownerName, type MapHex } from '../../lib/game/view/realm'
import { rivalName } from '../../lib/game/view/shell'
import { GameArt, OWNER_COLORS } from '../game/GameArt'

/** The hex under the pointer, apart from the map so that hovering never re-renders the hexes. */
const useMapHover = create<{ id: string | null; x: number; y: number }>(() => ({ id: null, x: 0, y: 0 }))

const HALF_W = HEX_WIDTH / 2
/** A pointy-top hex of side `s`, centered on 0,0. */
function hexPoints(s: number): string {
  const w = (HEX_WIDTH / 2) * s
  return `0,${-s} ${w},${-s / 2} ${w},${s / 2} 0,${s} ${-w},${s / 2} ${-w},${-s / 2}`
}
const OUTLINE = hexPoints(1)
const BORDER = hexPoints(0.86)
const TERRAIN = { x: -HALF_W, y: -1, width: HEX_WIDTH, height: 2 }

const BAND_COLORS: Record<string, string> = { weaker: '#2f7440', matched: '#c9962e', stronger: '#d06a1e', overwhelming: '#8b1e1a' }

function Mark({ icon: Icon, x, y, size = 0.56, color }: { icon: IconType; x: number; y: number; size?: number; color: string }): React.JSX.Element {
  return (
    <g className="hex__mark">
      <circle cx={x} cy={y} r={size * 0.62} fill="#fbf2dc" stroke={color} strokeWidth={0.05} />
      <Icon x={x - size / 2} y={y - size / 2} size={size} color={color} aria-hidden="true" />
    </g>
  )
}

const THREAT_WORDS: Record<string, string> = { beasts: 'beasts', mythic: 'a mythic', raid: 'raid', conquest: 'conquest attempt' }

/** One hex: terrain, its owner's border, status overlays and the day's marks. Re-renders only when its own facts change. */
const HexCell = memo(
  function HexCell({ hex, selected }: { hex: MapHex; sig: string; selected: boolean }): React.JSX.Element {
    const color = OWNER_COLORS[hex.owner]
    const unowned = hex.kind === 'battlefield' || hex.kind === 'lair'
    const threat = hex.threats?.[0]
    return (
      <g className={`hex hex--${hex.kind} hex--${hex.owner}${selected ? ' is-selected' : ''}`} transform={`translate(${hex.x} ${hex.y})`} data-hex={hex.id}>
        <GameArt slot={hex.slot} owner={hex.owner} place={TERRAIN} className="hex__terrain" />
        {hex.status === 'contested' && <GameArt slot="hex.overlay.contested" place={TERRAIN} />}
        {hex.status === 'scorched' && <GameArt slot="hex.overlay.scorched" place={TERRAIN} />}
        {!unowned && (
          <polygon
            className="hex__border"
            points={BORDER}
            fill="none"
            stroke={hex.owner === 'neutral' ? 'rgba(77,66,52,0.45)' : color.fill}
            strokeWidth={hex.owner === 'neutral' ? 0.04 : 0.15}
            strokeDasharray={hex.owner === 'neutral' ? '0.12 0.08' : undefined}
          />
        )}
        <polygon className="hex__edge" points={OUTLINE} fill="none" />
        <polygon className="hex__hover" points={OUTLINE} />
        {hex.kind === 'capital' && <Mark icon={GiCrown} x={0} y={-0.1} size={0.7} color={color.edge} />}
        {hex.mythic && <Mark icon={GiDragonHead} x={0} y={-0.1} size={0.62} color="#4b3e54" />}
        {hex.village && hex.kind !== 'capital' && <Mark icon={GiVillage} x={-0.42} y={-0.4} size={0.44} color="#6b4e0c" />}
        {hex.fortification > 0 && (
          <g className="hex__fort">
            <Mark icon={GiShield} x={0.42} y={-0.4} size={0.44} color="#4d4234" />
            <text x={0.42} y={-0.04} textAnchor="middle" className="hex__num">
              {hex.fortification}
            </text>
          </g>
        )}
        {hex.status === 'contested' && <Mark icon={GiTorch} x={0} y={0.35} size={0.5} color="#b8501a" />}
        {hex.status === 'scorched' && <Mark icon={GiFlame} x={0} y={0.35} size={0.5} color="#3a2a1c" />}
        {hex.daysLeft !== undefined && (
          <text x={0.38} y={0.62} textAnchor="middle" className="hex__days">
            {hex.daysLeft}d
          </text>
        )}
        {threat && <Mark icon={GiCrossedSwords} x={-0.42} y={0.38} size={0.46} color={threat.band ? BAND_COLORS[threat.band] : '#8b1e1a'} />}
        {hex.target && <Mark icon={GiArcheryTarget} x={0.42} y={0.38} size={0.46} color="#b8322a" />}
        {hex.courting && <Mark icon={GiQuill} x={0} y={-0.62} size={0.4} color="#2d57a6" />}
        {hex.battle && <Mark icon={GiHornInternal} x={0} y={0.05} size={0.56} color="#d98424" />}
        {hex.front && (
          <g className={`hex__front hex__front--${hex.front.state}`}>
            <rect x={-0.42} y={-0.26} width={0.84} height={0.52} rx={0.26} fill={hex.front.favors ? OWNER_COLORS[hex.front.favors].fill : '#6b5a46'} stroke="#fbf2dc" strokeWidth={0.05} />
            <text x={0} y={0.14} textAnchor="middle" className="hex__track" fill={hex.front.favors ? OWNER_COLORS[hex.front.favors].text : '#fbf2dc'}>
              {hex.front.track > 0 ? `+${hex.front.track}` : hex.front.track === 0 ? '0' : `−${-hex.front.track}`}
            </text>
            {hex.front.state === 'war' && <GiCrossedSwords x={-0.2} y={-0.75} size={0.4} color="#8b1e1a" aria-hidden="true" />}
          </g>
        )}
      </g>
    )
  },
  (a, b) => a.sig === b.sig && a.selected === b.selected
)

/** The label shown while hovering a hex (its own component, so the map itself never re-renders on hover). */
function HexTooltip({ hexes }: { hexes: Map<string, MapHex> }): React.JSX.Element | null {
  const { id, x, y } = useMapHover()
  const hex = id ? hexes.get(id) : undefined
  if (!hex) return null
  const parts = [`Hex ${hex.label}`, hex.kind === 'battlefield' ? `${hex.front?.front ?? ''} front`.trim() : ownerName(hex.owner)]
  if (hex.village) parts.push('village')
  if (hex.status !== 'held') parts.push(`${hex.status}${hex.daysLeft !== undefined ? `, ${hex.daysLeft}d` : ''}`)
  if (hex.threats?.length) parts.push(hex.threats.map((t) => `${t.rival ? `${rivalName(t.rival)} ` : ''}${THREAT_WORDS[t.kind]}${t.band ? ` (${t.band})` : ''}`).join(', '))
  if (hex.front) parts.push(`${hex.front.state}, track ${hex.front.track}`)
  return (
    <div className="hexmap__tip" style={{ left: x, top: y }} role="tooltip">
      {parts.join(' · ')}
    </div>
  )
}

export interface HexMapProps {
  campaign: CampaignState
  today: ISODate
  selected: string | null
  onSelect(id: string): void
}

/**
 * The realm map (Ch 3, Ch 17): 127 pointy-top hexes on a tilted, painted board. Each hex draws its
 * terrain through `<GameArt>`, a thick border in its owner's banner color, villages, fortification,
 * contested torches and scorched ground with days left, today's threats, the assault target, open
 * courtships, Grand Battles and the Rim fronts' war tracks. One pointer handler serves the whole
 * map; hover lives in its own store, so moving across the map re-renders only the tooltip.
 */
export function HexMap({ campaign, today, selected, onSelect }: HexMapProps): React.JSX.Element {
  const wrap = useRef<HTMLDivElement>(null)
  const layout = useMemo(() => hexLayout(campaign.hexes), [campaign.hexes])
  const cells = useMemo(() => mapView(campaign, today).map((hex) => ({ hex, sig: JSON.stringify(hex) })), [campaign, today])
  const byId = useMemo(() => new Map(cells.map((c) => [c.hex.id, c.hex])), [cells])

  const hexAt = (target: EventTarget | null): string | null => (target instanceof Element ? (target.closest('[data-hex]')?.getAttribute('data-hex') ?? null) : null)

  const onOver = (e: React.MouseEvent): void => {
    const id = hexAt(e.target)
    if (id === useMapHover.getState().id) return
    if (!id || !wrap.current) {
      useMapHover.setState({ id: null })
      return
    }
    const box = (e.target as Element).closest('[data-hex]')?.getBoundingClientRect()
    const outer = wrap.current.getBoundingClientRect()
    useMapHover.setState({ id, x: (box ? box.left + box.width / 2 : e.clientX) - outer.left, y: (box ? box.top : e.clientY) - outer.top })
  }

  return (
    <div className="hexmap" ref={wrap} onMouseLeave={() => useMapHover.setState({ id: null })}>
      <div className="hexmap__board">
        <svg
          className="hexmap__svg"
          viewBox={`${layout.minX} ${layout.minY} ${layout.width} ${layout.height}`}
          role="img"
          aria-label="The realm map"
          onMouseOver={onOver}
          onClick={(e) => {
            const id = hexAt(e.target)
            if (id) onSelect(id)
          }}
        >
          {cells.map(({ hex, sig }) => (
            <HexCell key={hex.id} hex={hex} sig={sig} selected={hex.id === selected} />
          ))}
          {selected && byId.get(selected) && <polygon className="hexmap__selected" points={OUTLINE} transform={`translate(${byId.get(selected)?.x} ${byId.get(selected)?.y})`} />}
        </svg>
      </div>
      <HexTooltip hexes={byId} />
    </div>
  )
}

/** The map's key: banner colors and what each mark means. */
export function MapLegend(): React.JSX.Element {
  const owners: Owner[] = ['player', 'orc', 'goblin', 'dwarf', 'archmage', 'neutral']
  const marks: { icon: IconType; label: string }[] = [
    { icon: GiVillage, label: 'Village' },
    { icon: GiShield, label: 'Fortified' },
    { icon: GiCrossedSwords, label: 'Threat today' },
    { icon: GiArcheryTarget, label: 'Assault target' },
    { icon: GiTorch, label: 'Contested' },
    { icon: GiFlame, label: 'Scorched' },
    { icon: GiQuill, label: 'Courting' },
    { icon: GiHornInternal, label: 'Grand Battle' }
  ]
  return (
    <div className="hexmap__legend" aria-label="Map key">
      <ul className="hexmap__owners">
        {owners.map((o) => (
          <li key={o}>
            <span className="hexmap__swatch" style={{ background: OWNER_COLORS[o].fill, borderColor: OWNER_COLORS[o].edge }} />
            {o === 'player' ? 'You' : o === 'neutral' ? 'Unaligned' : rivalName(o)}
          </li>
        ))}
      </ul>
      <ul className="hexmap__marks">
        {marks.map(({ icon: Icon, label }) => (
          <li key={label}>
            <Icon aria-hidden="true" /> {label}
          </li>
        ))}
      </ul>
    </div>
  )
}
