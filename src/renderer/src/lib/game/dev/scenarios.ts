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
import { realmEffects } from '../effects'
import { announceGrandBattle, type GrandRequest } from '../grand'
import { dominionOf, hexIndex, touches } from '../map'
import { refreshRoster } from '../roster'
import { RULES, base } from '../rules'
import { EventBuffer, hexOf, patchRival, replaceHex, toPlayer } from '../state'
import { BUILDING_IDS, RIVAL_IDS, type BuildingId, type BuildingTier, type CampaignState, type Company, type FieldUnit, type GrandBattle, type HexState, type ISODate } from '../types'

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
// The Ch 11 worked exchange (E-03): Knights (21) and Crossbowmen (9) against a charging Brute (20).
const E03 = { knights: 21, crossbowmen: 9, brute: 20, health: 4 } // rules-ok: dev scenario, the book's worked example
const WEAK_HOST = [4] // rules-ok: dev scenario, a Siege the realm wins
const STRONG_HOST = [60, 60, 60, 60, 60, 60] // rules-ok: dev scenario, a Siege the realm loses

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

/** Raises buildings to at least these tiers and refreshes the roster. */
function atLeast(state: CampaignState, tiers: Partial<Record<BuildingId, number>>): CampaignState {
  const buildings = { ...state.buildings }
  for (const [b, t] of Object.entries(tiers) as [BuildingId, number][]) buildings[b] = Math.max(buildings[b], t) as BuildingTier
  return refreshRoster({ ...state, buildings })
}

/** Announces a Grand Battle as the engine would, posting its events; `onDay` moves it to that day, `enemy` replaces its host. */
function announce(state: CampaignState, r: GrandRequest, today: ISODate, onDay?: ISODate, enemy?: Company[]): CampaignState {
  const events = new EventBuffer()
  const done = announceGrandBattle(state, r, events.emitter(today))
  let next = events.flush(done.state)
  if (done.ok && done.battle && (onDay || enemy)) {
    const id = done.battle.id
    next = { ...next, grandBattles: next.grandBattles.map((b) => (b.id === id ? { ...b, ...(onDay ? { battleDate: onDay } : {}), ...(enemy ? { enemy } : {}) } : b)) }
  }
  return next
}

/** A host of plain Brutes of the given powers, from `rival`'s line (dev only). */
function hostOf(rival: (typeof RIVAL_IDS)[number], powers: readonly number[]): Company[] {
  return powers.map((power, i) => ({ id: `${rival}:brutes:${i + 1}`, name: 'Brutes', source: 'host', power, tags: [], reach: 'melee', items: [] }))
}

function castleHex(state: CampaignState): HexState {
  return state.hexes.find((h) => h.kind === 'castle') as HexState
}

/** The player's outermost hex beyond the castle (the castle when there is none). */
function borderHex(state: CampaignState): HexState {
  return state.hexes.filter((h) => h.owner === 'player' && h.kind !== 'castle').sort((a, b) => b.ring - a.ring)[0] ?? castleHex(state)
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
  },
  {
    id: 'workedExchange',
    title: 'The Ch 11 worked exchange (E-03), today',
    detail: 'Knights and Crossbowmen against a charging Brute at Readiness 1.0. Play Shieldwall: after round 1 the Brute stands at 40.25 and the Knights at 69.',
    apply: (input, today) => {
      const state = atLeast(input, { barracks: 4, foundry: 2 }) // rules-ok: dev scenario, Knights and Crossbowmen
      const units: FieldUnit[] = [
        { id: 'barracks', side: 'player', name: 'Knights', power: E03.knights, health: E03.health * E03.knights, tags: ['steel'], reach: 'melee', slot: 'center:front' },
        { id: 'foundry', side: 'player', name: 'Crossbowmen', power: E03.crossbowmen, health: E03.health * E03.crossbowmen, tags: ['engine'], reach: 'ranged', slot: 'center:rear' },
        { id: 'orc:brutes:1', side: 'enemy', name: 'Brutes', power: E03.brute, health: E03.health * E03.brute, tags: [], reach: 'melee', slot: 'center:front', foe: 'orc', unit: 'brutes' }
      ]
      const rest = realmEffects(state).orders.map((o) => o.id).filter((id) => id !== 'shieldwall')
      const battle: GrandBattle = {
        id: `gb-${state.grandBattles.length + 1}`,
        trigger: 'warhost',
        hexId: borderHex(state).id,
        announcedOn: addDays(today, -2), // rules-ok: dev scenario, announced two days ago
        battleDate: today,
        enemy: hostOf('orc', [E03.brute]),
        rival: 'orc',
        formation: { 'center:front': 'barracks', 'center:rear': 'foundry' },
        setup: { readiness: 1, marshal: false, units, deck: ['shieldwall', ...rest], offer: RULES.grandBattles.ordersOffered, hire: { power: E03.crossbowmen, name: 'Sellswords' }, orderStages: {} },
        log: []
      }
      return { ...state, grandBattles: [...state.grandBattles, battle] }
    }
  },
  {
    id: 'incursion',
    title: 'An Orc Incursion, in 2 days',
    detail: 'Leave it unfought: at its day’s close the Marshal fights it, and the next launch shows the result with its replay.',
    apply: (state, today) => announce(state, { trigger: 'incursion', hexId: borderHex(state).id, announcedOn: today, rival: 'orc' }, today)
  },
  {
    id: 'mythicHunt',
    title: 'A Mythic Hunt at a Lair Mouth, today',
    detail: 'Fight it by hand from the Herald’s “Fight now”.',
    apply: (state, today) => {
      const mouth = state.hexes.find((h) => h.kind === 'lairMouth' && h.owner !== 'player') as HexState
      return announce(atLeast(state, { mageTower: 2, foundry: 2 }), { trigger: 'mythicHunt', hexId: mouth.id, announcedOn: today }, today, today)
    }
  },
  {
    id: 'risingCrown',
    title: 'The Rising Crown: Orc and Goblin ally against you',
    detail: 'A coalition forms today: its card, and the banner on the Diplomacy page.',
    apply: (input, today) => {
      const members = ['orc', 'goblin'] as const
      let state = input
      for (const r of members) state = patchRival(state, r, { disposition: { ...state.rivals[r].disposition, player: 'war' } })
      const until = addDays(today, RULES.world.coalitions.risingCrown.weeks * RULES.clock.daysPerWeek - 1)
      state = { ...state, coalitions: [...state.coalitions, { members: [...members], trigger: 'risingCrown', until, warChest: 0, formedOn: today }] }
      const events = new EventBuffer()
      events.emitter(today)('coalition', { members: [...members], trigger: 'risingCrown', stage: 'formed' })
      return events.flush(state)
    }
  },
  {
    id: 'ultimatum',
    title: 'An Ultimatum from the Orc: the Siege in 14 days',
    detail: 'The calm banner on Diplomacy, its countdown, and bending the knee once (a second try is refused).',
    apply: (input, today) => {
      const state = announce(input, { trigger: 'siege', hexId: castleHex(input).id, announcedOn: today, rival: 'orc' }, today)
      const siege = state.grandBattles.filter((b) => b.trigger === 'siege').at(-1) as GrandBattle
      const events = new EventBuffer()
      events.emitter(today)('ascendancy', { rival: 'orc', stage: 'ultimatum', until: siege.battleDate })
      return events.flush(patchRival(state, 'orc', { ultimatumUntil: siege.battleDate }))
    }
  },
  {
    id: 'siegeWin',
    title: 'The Siege of the Crown today, against a small host',
    detail: 'Win it and the Orc is Humbled.',
    apply: (state, today) => announce(state, { trigger: 'siege', hexId: castleHex(state).id, announcedOn: today, rival: 'orc' }, today, today, hostOf('orc', WEAK_HOST))
  },
  {
    id: 'siegeLose',
    title: 'The Siege of the Crown today, against an overwhelming host',
    detail: 'Lose it and the realm falls: the Fall screen, told plainly.',
    apply: (state, today) => announce(state, { trigger: 'siege', hexId: castleHex(state).id, announcedOn: today, rival: 'orc' }, today, today, hostOf('orc', STRONG_HOST))
  },
  {
    id: 'victory',
    title: 'Every rival resolved: victory',
    detail: 'The victory card and record, then the Reign goes on.',
    apply: (input, today) => {
      let state: CampaignState = { ...input, castleTier: 5, campaign: { ...input.campaign, status: 'won' } } // rules-ok: dev scenario, the High Throne
      const events = new EventBuffer()
      const emit = events.emitter(today)
      const how = ['conquered', 'abdicated', 'allied', 'conquered'] as const
      RIVAL_IDS.forEach((r, i) => {
        if (state.rivals[r].status !== 'active') return
        state = patchRival(state, r, { status: how[i], resolvedOn: today })
        emit('rivalResolved', { rival: r, how: how[i] })
      })
      emit('campaignEnd', { outcome: 'won' })
      return events.flush(state)
    }
  }
]

/** Applies scenario `id` to the campaign, or returns null when there is no such scenario. */
export function applyScenario(state: CampaignState, id: string, today: ISODate): CampaignState | null {
  const scenario = DEV_SCENARIOS.find((s) => s.id === id)
  return scenario ? scenario.apply(state, today) : null
}
