/**
 * The simulated players (T13; Ch 15 "How to simulate" step 2), as plans for the game's automatic
 * player (`lib/game/autoplay.ts`, Patch 2): the simulator and the re-founding's catch-up player are
 * one module, so every simulator run also tests the catch-up.
 *
 * - **greedy**: buy the cheapest tier, castle tier or Crossing stage, court every village whose Offer
 *   meets its resistance, seal the longest contract, use the Armory; each day assault the hex in
 *   reach with the best Dominion per garrison point, else challenge a Gate or capital.
 * - **smarter**: greedy, plus Truces, bending the knee, Accords, coalition buy-outs and defections.
 * - **push**: greedy, plus Ch 6's repeated push when nothing is in reach.
 * - **skirmish** (D-12): greedy, pressing "Start battle" each day and fighting with the Marshal's play.
 * - **paths:<rivals>** (Patch 2, blueprint section 7): greedy, steered along the named rivals' paths,
 *   shared evenly (`paths:orc` is the focused player; `paths:orc+goblin` two halfway;
 *   `paths:orc+goblin+dwarf` three a third each; `paths:all` all four evenly).
 */
import { autoplay, GREEDY, type AutoplayPlan } from '../src/renderer/src/lib/game/autoplay'
import { RIVAL_IDS, type CampaignState, type ISODate, type RivalId } from '../src/renderer/src/lib/game/types'

export type PolicyId = 'greedy' | 'smarter' | 'push' | 'skirmish' | `paths:${string}`

export interface PolicyDay {
  policy: PolicyId
  /** Today falls in one of the profile's rough weeks: spend Respite on it. */
  rough: boolean
  /** A counter for contract ids, kept by the caller. */
  nextId(): string
  /** The day's Valor once its inputs are in (the `skirmish` player fights at it). */
  valor?: number
}

/** The rivals a `paths:` policy follows. */
export function policyPaths(policy: PolicyId): RivalId[] | null {
  if (!policy.startsWith('paths:')) return null
  const named = policy.slice('paths:'.length)
  if (named === 'all') return [...RIVAL_IDS]
  const rivals = named.split('+')
  for (const r of rivals) if (!(RIVAL_IDS as readonly string[]).includes(r)) throw new Error(`No rival "${r}" in policy ${policy}`)
  return rivals as RivalId[]
}

/** The automatic player's plan for a simulator policy. */
export function planOf(policy: PolicyId): AutoplayPlan {
  if (policy === 'smarter') return { ...GREEDY, smarter: true }
  if (policy === 'push') return { ...GREEDY, push: true }
  if (policy === 'skirmish') return { ...GREEDY, skirmish: true }
  const paths = policyPaths(policy)
  return paths ? { ...GREEDY, paths } : GREEDY
}

/** Everything the player does on the open day `today`, before it closes. */
export function act(input: CampaignState, today: ISODate, day: PolicyDay): CampaignState {
  return autoplay(input, today, planOf(day.policy), { rough: day.rough, nextId: day.nextId, ...(day.valor !== undefined ? { valor: day.valor } : {}) })
}
