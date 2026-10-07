/**
 * Dev-only: prints a map as ASCII rows for review (T03). Not used by any screen.
 *
 * One row per `r`, top to bottom, each indented by half a hex per row so the rows interleave as
 * pointy-topped hexes do. Each hex shows its owner's initial: P player, O orc, G goblin,
 * D dwarf, A archmage, `.` neutral. Villages are lowercase (`v` for a neutral village), Lair
 * Mouths `M`, lairs `~` and battlefields `#`.
 */
import { MAP_RADIUS } from '../map'
import type { HexState, Owner } from '../types'

const INITIAL: Record<Owner, string> = { player: 'P', orc: 'O', goblin: 'G', dwarf: 'D', archmage: 'A', neutral: '.' }

export const MAP_ASCII_LEGEND =
  'P player · O orc · G goblin · D dwarf · A archmage · . neutral · lowercase = village (v neutral) · M Lair Mouth · ~ lair · # battlefield'

function cell(hex: HexState): string {
  if (hex.kind === 'battlefield') return '#'
  if (hex.kind === 'lair') return '~'
  if (hex.kind === 'lairMouth') return 'M'
  if (hex.village) return hex.owner === 'neutral' ? 'v' : INITIAL[hex.owner].toLowerCase()
  return INITIAL[hex.owner]
}

export function mapAscii(hexes: readonly HexState[]): string {
  const byId = new Map(hexes.map((h) => [h.id, h]))
  const rows: string[] = []
  for (let r = -MAP_RADIUS; r <= MAP_RADIUS; r++) {
    const cells: string[] = []
    for (let q = Math.max(-MAP_RADIUS, -MAP_RADIUS - r); q <= Math.min(MAP_RADIUS, MAP_RADIUS - r); q++) {
      const hex = byId.get(`${q + 0},${r + 0}`)
      cells.push(hex ? cell(hex) : '?')
    }
    rows.push(' '.repeat(Math.abs(r)) + cells.join(' '))
  }
  return rows.join('\n')
}
