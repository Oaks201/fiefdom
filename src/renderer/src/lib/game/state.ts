/**
 * Small pure helpers that several systems share for reading and changing the campaign state:
 * the open day, patching a hex or a rival, Respect, coalitions in force, hexes changing hands, and
 * posting events to the log. They hold no rule of their own beyond what their comments cite; they
 * exist so that combat, land, the rivals and settlement don't each keep a copy.
 */
import { addDays } from './clock'
import { RULES, base } from './rules'
import type { CampaignState, Emit, GameEvent, GameEventKind, HexState, ISODate, RivalId, RivalState } from './types'

// ── Reading ──────────────────────────────────────────────────────────────────

/** The day the player acts on: the open day, the one after the last settled day. */
export function openDayOf(state: CampaignState): ISODate {
  return addDays(state.settledThrough.day, 1)
}

export function hexOf(state: CampaignState, id: string): HexState | undefined {
  return state.hexes.find((h) => h.id === id)
}

/** Whether `rival` belongs to a coalition in force on `day` (one without an end lasts until it is broken). */
export function inCoalition(state: CampaignState, rival: RivalId, day: ISODate): boolean {
  return state.coalitions.some((c) => c.members.includes(rival) && (c.until === undefined || day <= c.until))
}

/** Whether `a` and `b` are partners in a coalition in force on `day`. */
export function coalitionPartners(state: CampaignState, a: RivalId, b: RivalId, day: ISODate): boolean {
  return state.coalitions.some((c) => c.members.includes(a) && c.members.includes(b) && (c.until === undefined || day <= c.until))
}

// ── Changing ─────────────────────────────────────────────────────────────────

export function replaceHex(state: CampaignState, hex: HexState): CampaignState {
  return { ...state, hexes: state.hexes.map((h) => (h.id === hex.id ? hex : h)) }
}

export function patchRival(state: CampaignState, rival: RivalId, patch: Partial<RivalState>): CampaignState {
  return { ...state, rivals: { ...state.rivals, [rival]: { ...state.rivals[rival], ...patch } } }
}

/** Changes a rival's Respect toward the player by `change`, clamped to 0–100, and posts the change (Ch 12). */
export function adjustRespect(state: CampaignState, rival: RivalId, change: number, reason: string, emit: Emit): CampaignState {
  const before = state.rivals[rival].respect
  const after = Math.min(RULES.respect.max, Math.max(RULES.respect.min, before + change))
  if (after === before) return state
  emit('respect', { rival, change: after - before, reason })
  return patchRival(state, rival, { respect: after })
}

// ── Hexes changing hands (Ch 6, A-22, A-136) ─────────────────────────────────

/** The hex back to plain holding: no longer contested or scorched. */
export function heldHex(hex: HexState): HexState {
  const out: HexState = { ...hex, status: 'held' }
  delete out.statusUntil
  return out
}

/**
 * A hex that comes to the player: ungarrisoned and unfortified. A village that defected or was
 * bought is at full loyalty, 15 × ring; one conquered (or reclaimed, A-139) is at half and Settles
 * for 4 weeks from `day` (A-22).
 */
export function toPlayer(hex: HexState, day: ISODate, settling: boolean): HexState {
  const out: HexState = { ...heldHex(hex), owner: 'player', garrison: 0, garrisonDamage: 0, fortification: 0 }
  delete out.mythic
  if (hex.village) {
    const full = RULES.influence.loyalty.neutralPerRing * hex.ring
    out.village = settling
      ? { loyalty: RULES.land.villageLoyalty.afterConquestShare * full, settlingUntil: addDays(day, RULES.land.settling.weeks * RULES.clock.daysPerWeek) }
      : { loyalty: full }
  }
  return out
}

/** A hex that passes to a rival: its garrison (A-17), a village's loyalty 30 × ring, no fortification (A-136). */
export function toRival(hex: HexState, rival: RivalId): HexState {
  const out: HexState = { ...heldHex(hex), owner: rival, garrison: base(hex.ring) * RULES.land.rivalGarrisonMult[rival], garrisonDamage: 0, fortification: 0 }
  if (hex.village) out.village = { loyalty: RULES.influence.loyalty.rivalPerRing * hex.ring }
  return out
}

// ── The log ──────────────────────────────────────────────────────────────────

/**
 * Collects events while something runs and hands them to `state.log` in order, with the next
 * sequential ids (`ev-N`). Settlement keeps one per call; a player action keeps one per action.
 */
export class EventBuffer {
  /** Every event flushed so far, in order. */
  readonly all: GameEvent[] = []
  private pending: { day: ISODate; kind: GameEventKind; payload: object }[] = []

  /** An `Emit` that dates its events `day`. */
  emitter(day: ISODate): Emit {
    return (kind, payload) => {
      this.pending.push({ day, kind, payload })
    }
  }

  /** Appends what was emitted since the last flush to the state's log. */
  flush(state: CampaignState): CampaignState {
    if (this.pending.length === 0) return state
    const logged = state.log.length
    const events = this.pending.map(({ day, kind, payload }, i) => ({ id: `ev-${logged + i + 1}`, day, kind, ...payload }) as GameEvent)
    this.pending = []
    this.all.push(...events)
    return { ...state, log: [...state.log, ...events] }
  }
}
