import { memo, useEffect, useMemo, useRef } from 'react'
import type { IconType } from 'react-icons'
import {
  GiArcheryTarget,
  GiCrossedSwords,
  GiCrown,
  GiDragonHead,
  GiExpand,
  GiFlame,
  GiHornInternal,
  GiQuill,
  GiShield,
  GiTorch,
  GiVillage
} from 'react-icons/gi'
import { create } from 'zustand'
import type { CampaignState, ISODate, Owner } from '../../lib/game/types'
import {
  HEX_WIDTH,
  clampMapZoom,
  hexLayout,
  mapView,
  mapViewBox,
  ownerName,
  panMap,
  tiltedBoard,
  wholeMap,
  zoomMapAt,
  type FramePoint,
  type MapBox,
  type MapHex,
  type MapZoom
} from '../../lib/game/view/realm'
import { rivalName } from '../../lib/game/view/shell'
import { GameArt, OWNER_COLORS } from '../game/GameArt'

/** The hex under the pointer, apart from the map so that hovering never re-renders the hexes. */
const useMapHover = create<{ id: string | null; x: number; y: number }>(() => ({ id: null, x: 0, y: 0 }))

/** The map's zoom, kept for the session so the Realm reopens where the player left it (null: the whole realm). */
const useMapZoom = create<{ view: MapZoom | null }>(() => ({ view: null }))

const MAX_ZOOM = 4
/** One press of + or −. */
const ZOOM_STEP = 1.4
/** Wheel zoom per pixel scrolled: one notch of a mouse wheel (100 px) zooms about 14%. */
const WHEEL_RATE = 0.0015
/** How far (px) a press moves before it is a drag rather than a click. */
const DRAG_SLOP = 4
/** The hover label's height (px): it sits at least this far below the frame's top, so it stays on the board. */
const TIP_ROOM = 34
/** The tabletop tilt (T15): the map leans back 18° about its top edge, seen from twice its height away. */
const TILT = (18 * Math.PI) / 180
const DISTANCE = 2
/** Room around the tilted realm, in hex sides. */
const MARGIN = 0.4

/** The zoom in force: the stored one, fitted to this map. */
function currentZoom(box: MapBox): MapZoom {
  const view = useMapZoom.getState().view
  return view ? clampMapZoom(view, box, MAX_ZOOM) : wholeMap(box)
}

/** Where a viewport point falls on the map's frame, as fractions of its width and height. */
function framePoint(svg: SVGSVGElement, clientX: number, clientY: number): FramePoint {
  const r = svg.getBoundingClientRect()
  return { fx: (clientX - r.left) / r.width, fy: (clientY - r.top) / r.height }
}

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

/**
 * One hex: terrain, its owner's border, status overlays and the day's marks, set on the tilted
 * board by `place`. Re-renders only when its own facts change.
 */
const HexCell = memo(
  function HexCell({ hex, place, selected }: { hex: MapHex; sig: string; place: string; selected: boolean }): React.JSX.Element {
    const color = OWNER_COLORS[hex.owner]
    const unowned = hex.kind === 'battlefield' || hex.kind === 'lair'
    const threat = hex.threats?.[0]
    return (
      <g className={`hex hex--${hex.kind} hex--${hex.owner}${selected ? ' is-selected' : ''}`} transform={place} data-hex={hex.id}>
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
        <polygon className="hex__hit" points={OUTLINE} />
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
  (a, b) => a.sig === b.sig && a.place === b.place && a.selected === b.selected
)

/** The hovered hex's outline, drawn over every hex (its own component, so the map itself never re-renders on hover). */
function HoverOutline({ places }: { places: Map<string, string> }): React.JSX.Element | null {
  const id = useMapHover((s) => s.id)
  const place = id ? places.get(id) : undefined
  return place ? <polygon className="hexmap__hover" points={OUTLINE} transform={place} /> : null
}

/** The label shown while hovering a hex (its own component, so the map itself never re-renders on hover). */
function HexTooltip({ hexes }: { hexes: Map<string, MapHex> }): React.JSX.Element | null {
  const { id, x, y } = useMapHover()
  const hex = id ? hexes.get(id) : undefined
  if (!hex) return null
  const parts = [hex.label, hex.kind === 'battlefield' ? `${hex.front?.front ?? ''} front`.trim() : ownerName(hex.owner)]
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
 * courtships, Grand Battles and the Rim fronts' war tracks. One set of pointer handlers serves the
 * whole map, and only each hex's own outline takes the pointer, so the hex under it is the hex
 * hovered and chosen. Hover lives in its own store, so moving across the map re-renders only the
 * outline and the tooltip. The map zooms inside a frame that keeps its size: the wheel zooms toward
 * the pointer, + and − toward the middle, and a drag pans while zoomed in.
 */
export function HexMap({ campaign, today, selected, onSelect }: HexMapProps): React.JSX.Element {
  const wrap = useRef<HTMLDivElement>(null)
  const board = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  /** The press in progress: where it began and, once it moves far enough, the zoom its drag pans from. */
  const press = useRef<{ pointer: number; x: number; y: number; from: FramePoint; start: MapZoom; dragging: boolean } | null>(null)
  /** The last press was a drag, so the click that ends it chooses nothing. */
  const dragged = useRef(false)
  const layout = useMemo(() => hexLayout(campaign.hexes), [campaign.hexes])
  /** Each hex's place on the tilted board, and the board's extent: what the zoom frames. */
  const { places, box } = useMemo(() => {
    const tilted = tiltedBoard(layout.points, layout, TILT, DISTANCE, MARGIN)
    return { places: new Map(layout.points.map((p) => [p.id, `matrix(${tilted.place(p.x, p.y).join(' ')})`])), box: tilted.box }
  }, [layout])
  const cells = useMemo(() => mapView(campaign, today).map((hex) => ({ hex, sig: JSON.stringify(hex) })), [campaign, today])
  const byId = useMemo(() => new Map(cells.map((c) => [c.hex.id, c.hex])), [cells])
  const stored = useMapZoom((s) => s.view)
  const view = stored ? clampMapZoom(stored, box, MAX_ZOOM) : wholeMap(box)
  const shown = mapViewBox(view, box)

  const hexAt = (target: EventTarget | null): string | null => (target instanceof Element ? (target.closest('[data-hex]')?.getAttribute('data-hex') ?? null) : null)

  /** The frame point under a viewport point (the middle until the map has mounted). */
  const at = (clientX: number, clientY: number): FramePoint => (svg.current ? framePoint(svg.current, clientX, clientY) : { fx: 0.5, fy: 0.5 })

  /** Hovers the hex `target` belongs to, or none, with its label above it and inside the frame. */
  const hover = (target: Element | null): void => {
    const cell = target && board.current?.contains(target) ? target.closest('[data-hex]') : null
    const id = cell?.getAttribute('data-hex') ?? null
    if (id === useMapHover.getState().id) return
    if (!cell || !id || !wrap.current || !board.current) {
      useMapHover.setState({ id: null })
      return
    }
    const rect = cell.getBoundingClientRect()
    const frame = board.current.getBoundingClientRect()
    const outer = wrap.current.getBoundingClientRect()
    useMapHover.setState({ id, x: Math.min(frame.right, Math.max(frame.left, rect.left + rect.width / 2)) - outer.left, y: Math.max(frame.top + TIP_ROOM, rect.top) - outer.top })
  }

  // The wheel zooms toward the pointer. At the limit it leaves the event alone, so the page scrolls.
  // (A native listener: React's wheel handlers are passive and can't keep the page still. `at` and
  // `hover` read only refs, so the first render's copies serve.)
  useEffect(() => {
    const el = board.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      const now = currentZoom(box)
      const next = zoomMapAt(now, Math.exp(-e.deltaY * WHEEL_RATE), at(e.clientX, e.clientY), box, MAX_ZOOM)
      if (next.zoom === now.zoom) return
      e.preventDefault()
      useMapZoom.setState({ view: next })
      useMapHover.setState({ id: null })
      requestAnimationFrame(() => hover(document.elementFromPoint(e.clientX, e.clientY)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [box])

  const onPointerDown = (e: React.PointerEvent): void => {
    dragged.current = false
    if (e.button === 0) press.current = { pointer: e.pointerId, x: e.clientX, y: e.clientY, from: at(e.clientX, e.clientY), start: view, dragging: false }
  }

  const onPointerMove = (e: React.PointerEvent): void => {
    const p = press.current
    if (p?.pointer === e.pointerId && p.start.zoom > 1) {
      if (!p.dragging && Math.hypot(e.clientX - p.x, e.clientY - p.y) >= DRAG_SLOP) {
        p.dragging = true
        board.current?.setPointerCapture(e.pointerId)
        board.current?.classList.add('is-panning')
        useMapHover.setState({ id: null })
      }
      if (p.dragging) {
        useMapZoom.setState({ view: panMap(p.start, p.from, at(e.clientX, e.clientY), box, MAX_ZOOM) })
        return
      }
    }
    hover(e.target as Element)
  }

  const endPress = (e: React.PointerEvent): void => {
    const p = press.current
    if (p?.pointer !== e.pointerId) return
    press.current = null
    if (!p.dragging) return
    dragged.current = true
    board.current?.classList.remove('is-panning')
    hover(document.elementFromPoint(e.clientX, e.clientY))
  }

  const zoomBy = (factor: number): void => useMapZoom.setState({ view: zoomMapAt(view, factor, { fx: 0.5, fy: 0.5 }, box, MAX_ZOOM) })

  return (
    <div className="hexmap" ref={wrap}>
      <div
        className={`hexmap__board${view.zoom > 1 ? ' is-zoomed' : ''}`}
        ref={board}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPress}
        onPointerCancel={endPress}
        onPointerLeave={() => useMapHover.setState({ id: null })}
        onClick={(e) => {
          const id = dragged.current ? null : hexAt(e.target)
          if (id) onSelect(id)
        }}
      >
        <svg
          ref={svg}
          className="hexmap__svg"
          viewBox={`${shown.x} ${shown.y} ${shown.width} ${shown.height}`}
          style={{ aspectRatio: `${box.width} / ${box.height}` }}
          role="img"
          aria-label="The realm map"
        >
          {cells.map(({ hex, sig }) => (
            <HexCell key={hex.id} hex={hex} sig={sig} place={places.get(hex.id) ?? ''} selected={hex.id === selected} />
          ))}
          <HoverOutline places={places} />
          {selected && places.has(selected) && <polygon className="hexmap__selected" points={OUTLINE} transform={places.get(selected)} />}
        </svg>
      </div>
      <div className="hexmap__zoom" role="group" aria-label="Zoom the map">
        <button type="button" className="btn btn--icon" onClick={() => zoomBy(ZOOM_STEP)} disabled={view.zoom >= MAX_ZOOM} aria-label="Zoom in" title="Zoom in (or scroll up over the map)">
          +
        </button>
        <button type="button" className="btn btn--icon" onClick={() => zoomBy(1 / ZOOM_STEP)} disabled={view.zoom <= 1} aria-label="Zoom out" title="Zoom out (or scroll down over the map)">
          −
        </button>
        <button type="button" className="btn btn--icon" onClick={() => useMapZoom.setState({ view: null })} disabled={view.zoom <= 1} aria-label="Show the whole realm" title="Show the whole realm">
          <GiExpand aria-hidden="true" />
        </button>
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
