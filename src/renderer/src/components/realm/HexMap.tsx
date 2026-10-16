import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { IconType } from 'react-icons'
import {
  GiArcheryTarget,
  GiCastle,
  GiCrossedSwords,
  GiCrown,
  GiDragonHead,
  GiExpand,
  GiFlame,
  GiHornInternal,
  GiQuill,
  GiReturnArrow,
  GiShield,
  GiSiegeTower,
  GiStoneTower,
  GiTorch,
  GiVillage
} from 'react-icons/gi'
import { create } from 'zustand'
import { MARCH_IDS, type CampaignState, type ISODate, type MarchId, type Owner } from '../../lib/game/types'
import {
  HEX_WIDTH,
  clampMapZoom,
  hexLayout,
  mapDecor,
  mapView,
  mapViewBox,
  marchName,
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

/** The hex under the pointer, apart from the map so that hovering never re-renders the hexes: its middle and its top and bottom edges, within the map's box. */
const useMapHover = create<{ id: string | null; x: number; top: number; bottom: number }>(() => ({ id: null, x: 0, top: 0, bottom: 0 }))

/** The map's zoom, kept for the session so the Realm reopens where the player left it (null: the whole realm). */
const useMapZoom = create<{ view: MapZoom | null }>(() => ({ view: null }))

const MAX_ZOOM = 4
/** One press of + or −. */
const ZOOM_STEP = 1.4
/**
 * Below this zoom the map is the realm view: each hex a flat color by who holds it, unclaimed land
 * tinted by its march, the marches named, and no art or marks. One press of + (or two or three wheel
 * notches) shows the full map again.
 */
const REALM_VIEW_BELOW = 1.35
/** Wheel zoom per pixel scrolled: one notch of a mouse wheel (100 px) zooms about 14%. */
const WHEEL_RATE = 0.0015
/** How far (px) a press moves before it is a drag rather than a click. */
const DRAG_SLOP = 4
/** The hover label's gap from its hex, and the least room it keeps from the map's edges (px). */
const TIP_GAP = 6
const TIP_EDGE = 4
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

/** The realm view's ground: unclaimed heartland, and the empty board around the realm. */
const PARCHMENT = '#e8dcbc'
const BOARD = '#7a5a36'
/** The lair wedges' own tints in the realm view (their land is never anyone's). */
const LAIR_TINTS: Record<string, string> = { thornwild: '#7d8f5a', wyrmfells: '#6c8095' }

/** `a` blended toward `b` by `t` (0 to 1), as #rrggbb. */
function mix(a: string, b: string, t: number): string {
  const ch = (hex: string, i: number): number => parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16)
  return `#${[0, 1, 2].map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t).toString(16).padStart(2, '0')).join('')}`
}

/** A hex's flat color in the realm view: its holder's banner, or for unclaimed land a pale tint of its march. */
function realmColor(hex: MapHex): string {
  if (hex.decor) return BOARD
  if (hex.owner !== 'neutral') return OWNER_COLORS[hex.owner].fill
  if (!hex.march) return PARCHMENT
  const base = LAIR_TINTS[hex.march] ?? OWNER_COLORS[hex.march as Owner]?.fill ?? OWNER_COLORS.neutral.fill
  return mix(base, PARCHMENT, LAIR_TINTS[hex.march] ? 0.35 : 0.62)
}

/** One hex in the realm view: a flat color, a faint edge, and only the castle and capitals marked. */
function RealmCell({ hex }: { hex: MapHex }): React.JSX.Element {
  return (
    <>
      <polygon points={OUTLINE} fill={realmColor(hex)} fillOpacity={hex.decor ? 0.35 : 1} stroke="rgba(40, 28, 18, 0.28)" strokeWidth={0.04} />
      {hex.kind === 'capital' && <Mark icon={GiCrown} x={0} y={0} size={0.8} color={OWNER_COLORS[hex.owner].edge} />}
      {hex.kind === 'castle' && <Mark icon={GiCastle} x={0} y={0} size={0.8} color={OWNER_COLORS.player.fill} />}
    </>
  )
}

function Mark({ icon: Icon, x, y, size = 0.56, color }: { icon: IconType; x: number; y: number; size?: number; color: string }): React.JSX.Element {
  return (
    <g className="hex__mark">
      <circle cx={x} cy={y} r={size * 0.62} fill="#fbf2dc" stroke={color} strokeWidth={0.05} />
      <Icon x={x - size / 2} y={y - size / 2} size={size} color={color} aria-hidden="true" />
    </g>
  )
}

const THREAT_WORDS: Record<string, string> = { beasts: 'beasts', mythic: 'a mythic', raid: 'raid', conquest: 'conquest attempt', counterattack: 'counterattack' }

/** The siege bar's place and size on a hex (hex sides): between the lower marks and the lower point, clear of the selection outline. */
const SIEGE_BAR = { x: -0.24, y: 0.61, width: 0.48, height: 0.15 }
const SIEGE_COLOR = '#b8322a'
const SIEGE_FILL = '#ee4a35'

/** A siege's progress above the hex's lower point (D-22): how much of the garrison it wears is worn away. */
function SiegeBar({ progress }: { progress: number }): React.JSX.Element {
  const b = SIEGE_BAR
  return (
    <g className="hex__siege">
      <rect x={b.x} y={b.y} width={b.width} height={b.height} rx={b.height / 2} fill="rgba(40, 28, 18, 0.8)" stroke="#fbf2dc" strokeWidth={0.035} />
      <rect x={b.x} y={b.y} width={Math.max(b.height, b.width * progress)} height={b.height} rx={b.height / 2} fill={SIEGE_FILL} />
    </g>
  )
}

/**
 * One hex: terrain, its owner's border, status overlays and the day's marks, set on the tilted
 * board by `place`. Re-renders only when its own facts change.
 */
const HexCell = memo(
  function HexCell({ hex, place, selected, realm }: { hex: MapHex; sig: string; place: string; selected: boolean; realm: boolean }): React.JSX.Element {
    const color = OWNER_COLORS[hex.owner]
    const unowned = hex.kind === 'battlefield' || hex.kind === 'lair'
    const threat = hex.threats?.[0]
    if (realm) {
      return (
        <g className={`hex hex--realm${hex.decor ? ' hex--decor' : ''}${selected ? ' is-selected' : ''}`} transform={place} data-hex={hex.decor ? undefined : hex.id}>
          <RealmCell hex={hex} />
          {!hex.decor && <polygon className="hex__hit" points={OUTLINE} />}
        </g>
      )
    }
    return (
      <g className={`hex hex--${hex.kind} hex--${hex.owner}${hex.decor ? ' hex--decor' : ''}${selected ? ' is-selected' : ''}`} transform={place} data-hex={hex.decor ? undefined : hex.id}>
        <GameArt slot={hex.regionSlot ?? hex.slot} orSlot={hex.slot} owner={hex.owner} place={TERRAIN} className="hex__terrain" />
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
        {!hex.decor && <polygon className="hex__hit" points={OUTLINE} />}
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
        {hex.target && <Mark icon={hex.siege?.standing ? GiSiegeTower : GiArcheryTarget} x={0.42} y={0.38} size={0.46} color={SIEGE_COLOR} />}
        {hex.courting && <Mark icon={GiQuill} x={0} y={-0.62} size={0.4} color="#2d57a6" />}
        {hex.fallback && <Mark icon={GiReturnArrow} x={0} y={0.3} size={0.4} color="#7a2e14" />}
        {hex.stronghold && <Mark icon={GiStoneTower} x={0} y={-0.6} size={0.46} color={hex.owner === 'player' ? OWNER_COLORS.player.edge : '#4d4234'} />}
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
        {hex.siege && hex.siege.progress > 0 && <SiegeBar progress={hex.siege.progress} />}
      </g>
    )
  },
  (a, b) => a.sig === b.sig && a.place === b.place && a.selected === b.selected && a.realm === b.realm
)

/** The marches' names across their land, drawn over the realm view. */
function MarchLabels({ labels }: { labels: { march: string; x: number; y: number; scale: number }[] }): React.JSX.Element {
  return (
    <g className="hexmap__labels" aria-hidden="true">
      {labels.map((l) => (
        <text key={l.march} x={l.x} y={l.y} textAnchor="middle" dominantBaseline="middle" fontSize={0.95 * l.scale} className="hexmap__label">
          {marchName(l.march as MarchId)}
        </text>
      ))}
    </g>
  )
}

/** The hovered hex's outline, drawn over every hex (its own component, so the map itself never re-renders on hover). */
function HoverOutline({ places }: { places: Map<string, string> }): React.JSX.Element | null {
  const id = useMapHover((s) => s.id)
  const place = id ? places.get(id) : undefined
  return place ? <polygon className="hexmap__hover" points={OUTLINE} transform={place} /> : null
}

/**
 * The label shown while hovering a hex (its own component, so the map itself never re-renders on
 * hover): the hex's name, who holds it and where, then its conditions, wrapped to the box. It is
 * measured before it paints and kept inside the map: above the hex if there is room, else below,
 * and shifted in from the sides.
 */
function HexTooltip({ hexes }: { hexes: Map<string, MapHex> }): React.JSX.Element | null {
  const { id, x, top, bottom } = useMapHover()
  const tip = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = tip.current
    const box = el?.offsetParent as HTMLElement | null
    if (!el || !box) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    const above = top - h - TIP_GAP
    const below = bottom + TIP_GAP
    el.style.left = `${Math.max(TIP_EDGE, Math.min(x - w / 2, box.clientWidth - w - TIP_EDGE))}px`
    el.style.top = `${above >= TIP_EDGE ? above : below + h <= box.clientHeight - TIP_EDGE ? below : TIP_EDGE}px`
  })
  const hex = id ? hexes.get(id) : undefined
  if (!hex) return null
  const where = [ownerName(hex.owner)]
  if (hex.march) where.push(`${marchName(hex.march)}, depth ${hex.depth}`)
  if (hex.ruling) where.push(`seam: ${marchName(hex.ruling)} today`)
  const parts: string[] = []
  if (hex.preparation) parts.push(`preparation ${hex.preparation}`)
  if (hex.stronghold) parts.push('stronghold')
  if (hex.fallback) parts.push(`fallen back here: +${Math.round(hex.fallback.strength)}, ${hex.fallback.daysLeft}d`)
  if (hex.barredBy) parts.push(`barred by ${hex.barredBy}`)
  if (hex.siege) parts.push(`${hex.siege.standing ? 'under siege, ' : ''}${Math.round(hex.siege.progress * 100)}% worn`)
  if (hex.village) parts.push('village')
  if (hex.status !== 'held') parts.push(`${hex.status}${hex.daysLeft !== undefined ? `, ${hex.daysLeft}d` : ''}`)
  if (hex.threats?.length) parts.push(hex.threats.map((t) => `${t.rival ? `${rivalName(t.rival)} ` : ''}${THREAT_WORDS[t.kind]}${t.band ? ` (${t.band})` : ''}`).join(', '))
  if (hex.front) parts.push(`${hex.front.state}, track ${hex.front.track}`)
  return (
    <div className="hexmap__tip" ref={tip} role="tooltip">
      <strong className="hexmap__tip-name">{hex.label}</strong>
      <span className="hexmap__tip-line">{where.join(' · ')}</span>
      {parts.length > 0 && <span className="hexmap__tip-line">{parts.join(' · ')}</span>}
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
 * The realm map (Ch 3, Ch 17, D-16): the heartland, the four rival marches and the two lair wedges on
 * a tilted, painted board, with the empty board around them drawn as battlefields. Each hex draws its
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
  const decor = useMemo(() => mapDecor(campaign), [campaign])
  const layout = useMemo(() => hexLayout([...decor, ...campaign.hexes]), [decor, campaign.hexes])
  /** Each hex's place on the tilted board, the board's extent (what the zoom frames), and where each march is named in the realm view. */
  const { places, box, labels } = useMemo(() => {
    const tilted = tiltedBoard(layout.points, layout, TILT, DISTANCE, MARGIN)
    const at = new Map(layout.points.map((p) => [p.id, p]))
    const labels = MARCH_IDS.flatMap((march) => {
      const pts = campaign.hexes.filter((h) => h.march === march && !h.seam).flatMap((h) => at.get(h.id) ?? [])
      if (pts.length === 0) return []
      const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length
      const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length
      const [x, y] = tilted.project(cx, cy)
      return [{ march, x, y, scale: tilted.place(cx, cy)[0] }]
    })
    return { places: new Map(layout.points.map((p) => [p.id, `matrix(${tilted.place(p.x, p.y).join(' ')})`])), box: tilted.box, labels }
  }, [layout, campaign.hexes])
  const cells = useMemo(() => [...decor, ...mapView(campaign, today)].map((hex) => ({ hex, sig: JSON.stringify(hex) })), [decor, campaign, today])
  const byId = useMemo(() => new Map(cells.map((c) => [c.hex.id, c.hex])), [cells])
  const stored = useMapZoom((s) => s.view)
  const view = stored ? clampMapZoom(stored, box, MAX_ZOOM) : wholeMap(box)
  const shown = mapViewBox(view, box)
  const realm = view.zoom < REALM_VIEW_BELOW

  const hexAt = (target: EventTarget | null): string | null => (target instanceof Element ? (target.closest('[data-hex]')?.getAttribute('data-hex') ?? null) : null)

  /** The frame point under a viewport point (the middle until the map has mounted). */
  const at = (clientX: number, clientY: number): FramePoint => (svg.current ? framePoint(svg.current, clientX, clientY) : { fx: 0.5, fy: 0.5 })

  /** Hovers the hex `target` belongs to, or none: where it sits in the map's box, for its label. */
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
    const x = Math.min(frame.right, Math.max(frame.left, rect.left + rect.width / 2)) - outer.left
    useMapHover.setState({ id, x, top: Math.max(frame.top, rect.top) - outer.top, bottom: Math.min(frame.bottom, rect.bottom) - outer.top })
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
            <HexCell key={hex.id} hex={hex} sig={sig} place={places.get(hex.id) ?? ''} selected={hex.id === selected} realm={realm} />
          ))}
          {realm && <MarchLabels labels={labels} />}
          <HoverOutline places={places} />
          {selected && places.has(selected) && <polygon className="hexmap__selected" points={OUTLINE} transform={places.get(selected)} />}
        </svg>
      </div>
      {realm && <div className="hexmap__mode">Realm view · zoom in for the details</div>}
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
    { icon: GiSiegeTower, label: 'Under siege (the bar: how worn)' },
    { icon: GiStoneTower, label: 'Stronghold (bars its march beyond)' },
    { icon: GiReturnArrow, label: 'A beaten garrison fell back here' },
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
