/**
 * Builders for the Grand Battle and Armory tests: a field set up by hand (for the worked exchange
 * and effect checks), battles announced on a founded realm, and rival armies of a chosen size.
 */
import assert from 'node:assert/strict'
import { announceGrandBattle, playRound, type GrandRequest } from '../../../src/renderer/src/lib/game/grand'
import { fieldView } from '../../../src/renderer/src/lib/game/view/battle'
import { startField } from '../../../src/renderer/src/lib/game/grand/field'
import type { BattleSetup, CampaignState, Company, Emit, FieldUnit, GameEventKind, GameEventMap, GrandBattle, RivalId } from '../../../src/renderer/src/lib/game/types'

export type Posted = { kind: GameEventKind } & Record<string, unknown>

/** An emitter that collects what it posts. */
export function collector(): { emit: Emit; events: Posted[]; of<K extends GameEventKind>(kind: K): GameEventMap[K][] } {
  const events: Posted[] = []
  return {
    emit: (kind, payload) => void events.push({ kind, ...payload }),
    events,
    of: <K extends GameEventKind>(kind: K) => events.filter((e) => e.kind === kind).map(({ kind: _k, ...p }) => p) as unknown as GameEventMap[K][]
  }
}

/** A field set up by hand: the given units, Readiness `readiness`, and `deck` dealt `offer` a round. */
export function setupOf(units: FieldUnit[], over: Partial<BattleSetup> = {}): BattleSetup {
  return { readiness: 1, marshal: false, units, deck: [], offer: 3, hire: { power: 9, name: 'Sellswords' }, orderStages: {}, ...over }
}

export function fieldOf(units: FieldUnit[], over: Partial<BattleSetup> = {}): ReturnType<typeof startField> {
  return startField(setupOf(units, over))
}

/** A player company on the field: health 4 × p unless given. */
export function mine(id: string, power: number, slot: FieldUnit['slot'], over: Partial<FieldUnit> = {}): FieldUnit {
  return { id, side: 'player', name: id, power, health: 4 * power, tags: ['steel'], reach: 'melee', slot, ...over }
}

/** An enemy company on the field: `<foe>:<unit>:<n>`, health 4 × p unless given. */
export function theirs(foe: RivalId | 'mythic', unit: string, power: number, slot: FieldUnit['slot'], over: Partial<FieldUnit> = {}): FieldUnit {
  return { id: `${foe}:${unit}:1`, side: 'enemy', name: unit, power, health: 4 * power, tags: [], reach: 'melee', slot, foe, unit, ...over }
}

/** Sets a rival's army to companies of the given powers (its AV is their sum). */
export function withArmy(state: CampaignState, rival: RivalId, powers: number[]): CampaignState {
  const companies: Company[] = powers.map((power, i) => ({ id: `${rival}:levy:${i + 1}`, name: 'levy', source: 'host', power, tags: [], reach: 'melee', items: [] }))
  return { ...state, rivals: { ...state.rivals, [rival]: { ...state.rivals[rival], companies } } }
}

/** Announces a battle and returns it, failing the test when refused. */
export function announced(state: CampaignState, r: GrandRequest): { state: CampaignState; battle: GrandBattle; events: Posted[] } {
  const c = collector()
  const done = announceGrandBattle(state, r, c.emit)
  if (!done.ok || !done.battle) throw new Error(`Refused: ${done.reason}`)
  return { state: done.state, battle: done.battle, events: c.events }
}

export const SEVEN_FULL = [1, 1, 1, 1, 1, 1, 1]

/** Plays a begun battle to its end by hand: each round the first Order offered that can be played, at its first target. Health after each round, the Orders offered and played. */
export function playOut(input: CampaignState, id: string, today: string): { state: CampaignState; hp: Record<string, number>[]; offered: string[][]; played: string[] } {
  let state = input
  const hp: Record<string, number>[] = []
  const offered: string[][] = []
  const played: string[] = []
  for (let guard = 0; guard < 8; guard++) {
    const view = fieldView(state, id)
    if (!view || view.over) break
    offered.push(view.offered.map((o) => o.id))
    // The first card that can be played: one with no target to choose, or with one to aim at.
    const card = view.offered.find((o) => o.targets.length > 0)
    const play = card ? { order: card.id, ...(Object.keys(card.targets[0].target).length > 0 ? { target: card.targets[0].target } : {}) } : {}
    const done = playRound(state, id, play, today)
    assert.ok(done.ok, String(done.reason))
    state = done.state
    if (card) played.push(card.id)
    hp.push(Object.fromEntries((fieldView(state, id)?.units ?? []).map((u) => [u.id, u.hp])))
  }
  return { state, hp, offered, played }
}
