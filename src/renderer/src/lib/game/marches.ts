/**
 * Neglected marches harden (R-03, R-06, D-19). While the player pushes one rival, the others
 * prepare: each rival march has a preparation level, raised a level at a week close when the player
 * didn't push that march that week and lowered a level when they did, from 0 to
 * `RULES.marches.preparation.max`. Every hex of the march the player doesn't hold has its garrison
 * × (1 + `perLevel` × level), read when an assault is weighed, so a lower level relaxes it again
 * and nothing is rewritten. A seam reads the level of the march ruling it that day (P2-06); lair
 * wedges never harden (no rival prepares there).
 *
 * A march is pushed in a week (C-09) if the player took a hex in it, assaulted one there (a repulse
 * counts) or placed a courtship on a village there. Preparation is what focus elsewhere gives a
 * rival (R-03), so a week in which the player pushed no march at all raises none: a stalled realm is
 * not punished for stalling. Nor does a week close that falls while the player has been away 14 or
 * more days (A-10, X-17: absence never costs anything).
 */
import { diffDays, weekOf } from './clock'
import { hexIndex, isLairMarch, rulingMarch } from './map'
import { RULES } from './rules'
import { RIVAL_IDS, type CampaignState, type Emit, type HexState, type ISODate, type MarchesState, type RivalId } from './types'

const P = RULES.marches.preparation

function zeros(): Record<RivalId, number> {
  return Object.fromEntries(RIVAL_IDS.map((r) => [r, 0])) as Record<RivalId, number>
}

export function emptyMarches(): MarchesState {
  return { preparation: zeros(), quietWeeks: zeros() }
}

export function marchesOf(state: CampaignState): MarchesState {
  return state.marches ?? emptyMarches()
}

/** The rival march whose rules apply to `hex` on `day`, or undefined (the heartland, a lair's day). */
function rivalMarchOn(state: CampaignState, hex: Pick<HexState, 'id' | 'march' | 'seam'>, day: ISODate): RivalId | undefined {
  const march = rulingMarch(state.campaign.seed, hex, day)
  return march && !isLairMarch(march) ? march : undefined
}

/** The preparation level that applies to `hex` on `day`: its march's, unless the player holds it. */
export function preparationOf(state: CampaignState, hex: Pick<HexState, 'id' | 'march' | 'seam' | 'owner'>, day: ISODate): number {
  if (hex.owner === 'player') return 0
  const march = rivalMarchOn(state, hex, day)
  return march ? marchesOf(state).preparation[march] : 0
}

/** The multiple on `hex`'s garrison on `day` from its march's preparation (1 when none applies). */
export function preparationMult(state: CampaignState, hex: Pick<HexState, 'id' | 'march' | 'seam' | 'owner'>, day: ISODate): number {
  return 1 + P.perLevel * preparationOf(state, hex, day)
}

/** The rival marches the player pushed between `from` and `to`, both included (C-09). */
export function pushedMarches(state: CampaignState, from: ISODate, to: ISODate): Set<RivalId> {
  const byId = hexIndex(state.hexes)
  const out = new Set<RivalId>()
  const mark = (hexId: string | undefined, day: ISODate): void => {
    const hex = hexId ? byId.get(hexId) : undefined
    const march = hex ? rivalMarchOn(state, hex, day) : undefined
    if (march) out.add(march)
  }
  for (const e of state.log) {
    if (e.day < from || e.day > to) continue
    if (e.kind === 'assault') mark(e.hexId, e.day)
    else if (e.kind === 'hexTransfer' && e.to === 'player') mark(e.hexId, e.day)
  }
  for (const p of state.purse.events) {
    if (p.date < from || p.date > to || p.kind !== 'spend' || !p.source.startsWith('courtship:')) continue
    mark(p.source.slice('courtship:'.length), p.date)
  }
  return out
}

/** At a week close: each rival march's level up after a quiet week, down after a pushed one. */
export function prepareMarches(state: CampaignState, day: ISODate, emit: Emit): CampaignState {
  const before = marchesOf(state)
  const pushed = pushedMarches(state, weekOf(day, state.campaign.weekStartsOn), day)
  const last = state.settlement.lastLaunch
  const away = last !== undefined && diffDays(last, day) >= RULES.clock.absenceDays
  const rise = !away && pushed.size > 0
  const preparation = { ...before.preparation }
  const quietWeeks = { ...before.quietWeeks }
  for (const r of RIVAL_IDS) {
    const from = preparation[r]
    if (pushed.has(r)) {
      preparation[r] = Math.max(0, from - 1)
      quietWeeks[r] = 0
    } else {
      quietWeeks[r] += 1
      if (rise) preparation[r] = Math.min(P.max, from + 1)
    }
    if (preparation[r] !== from) emit('preparation', { march: r, from, to: preparation[r] })
  }
  return { ...state, marches: { preparation, quietWeeks } }
}
