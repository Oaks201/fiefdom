/**
 * Development only (A-09; T15 gap 3): prepared campaign states for checking screens by hand,
 * reached from the DEV panel (and `window.fiefdomDev.scenario(id)` for scripts). Only the
 * DevTimeTravel panel imports this, and production builds never contain that panel, so no player
 * can reach these.
 *
 * Each scenario changes the open campaign directly, the way a few weeks of play might have, and
 * the app saves the result. Purse changes post with a `dev:scenario:<id>` source, so they are easy
 * to tell apart from earned reputation.
 */
import { combatOf } from '../combat'
import { addDays } from '../clock'
import { balance, post } from '../economy'
import { dominionOf, hexIndex, touches } from '../map'
import { refreshRoster } from '../roster'
import { base } from '../rules'
import { hexOf, patchRival, replaceHex, toPlayer } from '../state'
import { BUILDING_IDS, type BuildingId, type BuildingTier, type CampaignState, type HexState, type ISODate } from '../types'

export interface DevScenario {
  id: string
  title: string
  /** What it sets up, and the manual check it is for. */
  detail: string
  apply(state: CampaignState, today: ISODate): CampaignState
}

const BARRACKS_DOMINION = 8 // rules-ok: dev scenario, the Barracks Tier II threshold
const BARRACKS_PURSE = 160 // rules-ok: dev scenario, enough for Tier II (150)
const ARMY_PURSE = 300 // rules-ok: dev scenario
const TRADE_RESPECT = 25 // rules-ok: dev scenario, the Goblin trades from 25
const TRADE_PURSE = 600 // rules-ok: dev scenario, a ring-5 village from the Goblin costs 450
const COURT_PURSE = 300 // rules-ok: dev scenario
const RICH_PURSE = 1_000 // rules-ok: dev scenario
const MARCHES = 4 // rules-ok: dev scenario, ring 4 touches the rivals' Marches
const WILDWOOD = 3 // rules-ok: dev scenario, conquest attempts strike ring 3 and beyond
const SCORCH_DAYS = 3 // rules-ok: dev scenario, a lost defense scorches for 3 days (Ch 10)

/** Sets the purse to exactly `amount`, with a dev source. */
function withPurse(state: CampaignState, amount: number, today: ISODate, id: string): CampaignState {
  const diff = amount - balance(state.purse)
  if (diff === 0) return state
  return { ...state, purse: post(state.purse, { date: today, kind: diff > 0 ? 'earn' : 'adjust', amount: diff, source: `dev:scenario:${id}` }) }
}

/** Gives the player `hexId` as a defection would (full loyalty, no settling). */
function grant(state: CampaignState, hexId: string, today: ISODate): CampaignState {
  const hex = hexOf(state, hexId)
  return hex && hex.owner !== 'player' ? replaceHex(state, toPlayer(hex, today, false)) : state
}

/** The road hexes of `building` from ring 2 out to `ring`, in order: a path out from the building. */
function road(state: CampaignState, building: BuildingId, ring: number): HexState[] {
  return state.hexes.filter((h) => h.kind === 'road' && h.road === building && h.ring >= 2 && h.ring <= ring).sort((a, b) => a.ring - b.ring)
}

function claimRoad(state: CampaignState, building: BuildingId, ring: number, today: ISODate): CampaignState {
  return road(state, building, ring).reduce((s, h) => grant(s, h.id, today), state)
}

/** Neutral hexes touching the player's land, smallest Dominion for `building` first, until it reaches `target`. */
function growDominion(input: CampaignState, building: BuildingId, target: number, today: ISODate): CampaignState {
  let state = input
  const have = (): number => state.hexes.filter((h) => h.owner === 'player').reduce((s, h) => s + (dominionOf(h)[building] ?? 0), 0)
  for (let guard = 0; guard < state.hexes.length && have() < target; guard++) {
    const byId = hexIndex(state.hexes)
    const need = target - have()
    const options = state.hexes
      .filter((h) => h.owner === 'neutral' && !h.village && (dominionOf(h)[building] ?? 0) > 0 && touches(byId, h.id, 'player'))
      .map((h) => ({ h, gives: dominionOf(h)[building] ?? 0 }))
      .sort((a, b) => Number(b.gives <= need) - Number(a.gives <= need) || b.gives - a.gives)
    if (options.length === 0) break
    state = grant(state, options[0].h.id, today)
  }
  return state
}

export const DEV_SCENARIOS: readonly DevScenario[] = [
  {
    id: 'barracksII',
    title: '160 reputation, Dominion 8 on the Barracks',
    detail: 'Buy Barracks Tier II and see Militia become Men-at-Arms in the roster.',
    apply: (state, today) => withPurse(growDominion(state, 'barracks', BARRACKS_DOMINION, today), BARRACKS_PURSE, today, 'barracksII')
  },
  {
    id: 'armyReady',
    title: 'Every building at Tier II, Castle II, 300 reputation',
    detail: 'An army that can take a beast den next door: set the assault, advance a day, see the hex and the spoils.',
    apply: (state, today) =>
      withPurse(
        refreshRoster({ ...state, castleTier: Math.max(state.castleTier, 2) as CampaignState['castleTier'], buildings: Object.fromEntries(BUILDING_IDS.map((b) => [b, Math.max(state.buildings[b], 2)])) as Record<BuildingId, BuildingTier> }),
        Math.max(balance(state.purse), ARMY_PURSE),
        today,
        'armyReady'
      )
  },
  {
    id: 'contestedScorched',
    title: 'A contested and a scorched hex',
    detail: 'The Barracks road out to ring 3; the Orc at War contests the ring-3 hex until tomorrow; the ring-2 hex is scorched for 3 days.',
    apply: (input, today) => {
      let state = patchRival(claimRoad(input, 'barracks', WILDWOOD, today), 'orc', { disposition: { ...input.rivals.orc.disposition, player: 'war' } })
      const [scorched, contested] = road(state, 'barracks', WILDWOOD).map((h) => hexOf(state, h.id) as HexState)
      state = replaceHex(state, { ...scorched, status: 'scorched', statusUntil: addDays(today, SCORCH_DAYS - 1) })
      state = replaceHex(state, { ...contested, status: 'contested', statusUntil: addDays(today, 1) })
      const combat = combatOf(state)
      const entry = { hexId: contested.id, rival: 'orc' as const, strength: base(contested.ring), since: addDays(today, -1), until: addDays(today, 1) }
      return { ...state, combat: { ...combat, contested: [...combat.contested.filter((c) => c.hexId !== contested.id), entry] } }
    }
  },
  {
    id: 'goblinTrade',
    title: 'Goblin Respect 25, land touching its March, 600 reputation',
    detail: 'Buy one of the Goblin’s March hexes from the Diplomacy page (or the hex panel).',
    apply: (input, today) => {
      const state = claimRoad(input, 'merchantHall', MARCHES, today)
      const goblin = state.rivals.goblin
      return withPurse(patchRival(state, 'goblin', { respect: Math.max(goblin.respect, TRADE_RESPECT), disposition: { ...goblin.disposition, player: 'tension' } }), TRADE_PURSE, today, 'goblinTrade')
    }
  },
  {
    id: 'courtship',
    title: 'A neutral village beside your land, 300 reputation',
    detail: 'Court it, then advance to the week close and see it defect.',
    apply: (input, today) => {
      let state = input
      const courtable = (): boolean => {
        const byId = hexIndex(state.hexes)
        return state.hexes.some((h) => h.village && h.owner === 'neutral' && touches(byId, h.id, 'player'))
      }
      for (const b of BUILDING_IDS) {
        if (courtable()) break
        state = claimRoad(state, b, WILDWOOD, today)
      }
      return withPurse(state, Math.max(balance(state.purse), COURT_PURSE), today, 'courtship')
    }
  },
  {
    id: 'rich',
    title: '+1,000 reputation',
    detail: 'Enough to try every purchase.',
    apply: (state, today) => withPurse(state, balance(state.purse) + RICH_PURSE, today, 'rich')
  }
]

/** Applies scenario `id` to the campaign, or returns null when there is no such scenario. */
export function applyScenario(state: CampaignState, id: string, today: ISODate): CampaignState | null {
  const scenario = DEV_SCENARIOS.find((s) => s.id === id)
  return scenario ? scenario.apply(state, today) : null
}
