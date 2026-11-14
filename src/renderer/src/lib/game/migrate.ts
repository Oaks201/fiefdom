/**
 * Patch 5 (D-38; spec section 6.2, C-51 to C-55): the one-time migrations of an older save, run as it
 * loads. Each is recorded in `campaign.migrations`, since `campaign.ruleVersion` stays the founding
 * version and can't say whether one has run; a save that has it already is left alone, so running this
 * twice changes nothing. A save that needs a re-founding (`needsRefounding`) is never migrated.
 *
 * - **bentMarches** (D-37): the marches bend, so every hex the bend moves has a new id. One structural pass
 *   (C-52) renames, anywhere in the save, every string that is exactly a moved hex's straight-layout id,
 *   every object key that is one, and every `:`-separated part of a string that is one (purse sources,
 *   fallback ids, skirmish fight ids, terms gifts); a hex record also takes its new coordinates. Nothing
 *   else changes: the hexes keep their order (C-55), owners, garrisons and names. Hex ids hold a comma, so
 *   nothing else in a save can be mistaken for one. The store keeps the old file before it writes the
 *   migrated one (C-53).
 * - **wallsStanding** (Patch 10, D-80, K2): rules 3.15.0 read a wall the player raises as a deed in the
 *   Dwarf's craft, from the `fortified` event raising it posts. Walls raised before then left no event, so
 *   each wall level standing on a hex the player holds is posted once, dated the open day and marked
 *   `standing`; the chronicle pays it at the next close as it pays any other. A hex the player takes loses
 *   its walls (`toPlayer`), so every level standing is one the player raised. Nothing else changes.
 */
import { bentIds, parseHexId } from './map'
import { needsRefounding } from './refound'
import { EventBuffer, openDayOf } from './state'
import type { CampaignState, MigrationId } from './types'

/** The migrations `state` has had. */
export function migrationsOf(state: Pick<CampaignState, 'campaign'>): readonly MigrationId[] {
  return state.campaign.migrations ?? []
}

/** Every migration `state` still needs, applied in order; `applied` lists them (none: the same state). */
export function migrateCampaign(state: CampaignState): { state: CampaignState; applied: MigrationId[] } {
  if (needsRefounding(state)) return { state, applied: [] }
  const done = new Set(migrationsOf(state))
  let next = state
  const applied: MigrationId[] = []
  if (!done.has('bentMarches')) {
    next = bendMarches(next)
    applied.push('bentMarches')
  }
  if (!done.has('wallsStanding')) {
    next = creditStandingWalls(next)
    applied.push('wallsStanding')
  }
  if (applied.length === 0) return { state, applied }
  return { state: { ...next, campaign: { ...next.campaign, migrations: [...migrationsOf(state), ...applied] } }, applied }
}

/** D-80 (K2): a `fortified` event for every wall level standing on the player's hexes, in map order, dated the open day. */
function creditStandingWalls(state: CampaignState): CampaignState {
  const events = new EventBuffer()
  const emit = events.emitter(openDayOf(state))
  for (const h of state.hexes) {
    if (h.owner !== 'player') continue
    for (let level = 1; level <= h.fortification; level++) emit('fortified', { hexId: h.id, level, standing: true })
  }
  return events.flush(state)
}

/** D-37: every moved hex id in the save renamed to its bent id, and every hex record placed there. */
function bendMarches(state: CampaignState): CampaignState {
  const renamed = renameHexIds(state, bentIds()) as CampaignState
  return {
    ...renamed,
    hexes: renamed.hexes.map((h) => {
      const { q, r } = parseHexId(h.id)
      return q === h.q && r === h.r ? h : { ...h, q, r }
    })
  }
}

/** C-52: `value` with every string, object key and `:`-separated part that is a key of `moved` renamed. Never changes `value`. */
export function renameHexIds(value: unknown, moved: ReadonlyMap<string, string>): unknown {
  if (typeof value === 'string') return renameString(value, moved)
  if (Array.isArray(value)) return value.map((v) => renameHexIds(v, moved))
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[renameString(k, moved)] = renameHexIds(v, moved)
    return out
  }
  return value
}

function renameString(s: string, moved: ReadonlyMap<string, string>): string {
  const whole = moved.get(s)
  if (whole !== undefined) return whole
  if (!s.includes(':')) return s
  let changed = false
  const parts = s.split(':').map((p) => {
    const to = moved.get(p)
    if (to === undefined) return p
    changed = true
    return to
  })
  return changed ? parts.join(':') : s
}
