/**
 * Sizing daily skirmishes (D-12): how large an enemy the Marshal's play beats on the battle map,
 * against what the day-close formula beats, over the fights real campaigns bring.
 *
 *   npx tsx sim/skirmish-calibrate.ts sample [--seeds 3] [--every 3]
 *       Plays greedy campaigns (Steadfast, Committed, Wavering) and, every few days, takes each of
 *       the day's fights at that day's final Valor. For each fight it finds by bisection the largest
 *       enemy (as a multiple of the threat's strength) the Marshal still beats, and the largest he
 *       routs; and whether the formula wins or routs. It then picks, for each number of companies
 *       fielded, the multiple that makes the Marshal win as often as the formula: the proposed
 *       `RULES.skirmish.hostScale`. Nothing in rules.ts changes.
 *
 *   npx tsx sim/skirmish-calibrate.ts compare [--seeds 12]
 *       Whole campaigns with the rules as they stand: the greedy player against the same player
 *       who also leads every day's fights with the Marshal's play (`skirmish` policy).
 *
 * Pure apart from the console: the same options always print the same numbers.
 */
import { foundCampaign } from '../src/renderer/src/lib/game/campaign'
import { addDays, dayCloseInstant } from '../src/renderer/src/lib/game/clock'
import { assaultValue, companyMatch, defenseValue, foeOfThreat, garrisonType } from '../src/renderer/src/lib/game/combat'
import { realmEffects } from '../src/renderer/src/lib/game/effects'
import { fieldResult, isOver, marshalPlay, playRoundOn, startField } from '../src/renderer/src/lib/game/grand/field'
import { RULES } from '../src/renderer/src/lib/game/rules'
import { settle } from '../src/renderer/src/lib/game/settle'
import { fightSetup, matchupOf, todaysFights, type FightPlan } from '../src/renderer/src/lib/game/skirmish'
import type { CampaignState, Effects, HexState, ISODate } from '../src/renderer/src/lib/game/types'
import { liveValor } from '../src/renderer/src/lib/game/view/chronicle'
import { runCampaign, type RunResult } from './campaign'
import { FOUNDED_AT, START, TZ, isRoughDay, ledgerFor } from './ledgerGen'
import { act } from './policy'
import { JOURNEY, profileOf, type ProfileId } from './profiles'

const PROFILES: ProfileId[] = ['steadfast', 'committed', 'wavering']
const WEEKS = 70
const HI = 8
const STEPS = 12

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? Number(process.argv[i + 1]) : fallback
}

const after = (d: ISODate): Date => new Date(dayCloseInstant(d, TZ).getTime() + 60_000)

interface Sample {
  profile: ProfileId
  week: number
  n: number
  side: FightPlan['side']
  enemy: string
  formulaWin: boolean
  formulaRout: boolean
  /** The largest enemy multiple the Marshal beats, and routs. */
  edgeWin: number
  edgeRout: number
}

/** The Marshal's result for `plan` with the enemy at `scale` × its strength. */
function marshalResult(state: CampaignState, plan: FightPlan, valor: number, day: ISODate, effects: Effects, scale: number): 'rout' | 'victory' | 'defeat' {
  let f = startField(fightSetup(state, plan, valor, day, effects, scale).setup)
  while (!isOver(f)) f = playRoundOn(f, marshalPlay(f)).field
  return fieldResult(f)
}

/** The largest scale in [0, HI] at which `ok` holds, by bisection (the result only worsens as the enemy grows). */
function edge(ok: (scale: number) => boolean): number {
  if (ok(HI)) return HI
  let lo = 0
  let hi = HI
  for (let i = 0; i < STEPS; i++) {
    const mid = (lo + hi) / 2
    if (ok(mid)) lo = mid
    else hi = mid
  }
  return lo
}

/** What the day-close formula does with the same fight at the same Valor. */
function formula(state: CampaignState, plan: FightPlan, valor: number, effects: Effects): { win: boolean; rout: boolean } {
  const hex = state.hexes.find((h) => h.id === plan.hexId) as HexState
  const foe = plan.side === 'defense' ? foeOfThreat(plan.threat ?? 'beasts') : garrisonType(hex).foe
  const strikes = plan.companies.map((c) => c.power * companyMatch(c, matchupOf(plan), foe))
  const common = { strikes, armsBonus: effects.armsBonus.value, rallyFloor: effects.rallyFloor.value, valor }
  const value = plan.side === 'defense' ? defenseValue({ ...common, walls: plan.walls, fortification: 0 }).defense : assaultValue(common)
  return { win: value >= plan.strength, rout: value >= RULES.combat.spoils.routAt * plan.strength }
}

function sample(seeds: number, every: number): Sample[] {
  const out: Sample[] = []
  for (const profileId of PROFILES) {
    for (let s = 0; s < seeds; s++) {
      const seed = 11 + s * 12
      const profile = profileOf(profileId)
      const ledger = ledgerFor(profile, seed, WEEKS * 7)
      const charter = { stepPool: JOURNEY.stepPool, calorieLimit: JOURNEY.calorieLimit, duties: [...JOURNEY.duties] }
      let state = settle(foundCampaign({ startWeight: JOURNEY.startLb, goalWeight: JOURNEY.goalLb, charter, timeZone: TZ, seed, ledger }, FOUNDED_AT), ledger, after(addDays(START, -1)), { launch: true }).state
      let n = 0
      const nextId = (): string => `cal-${(n += 1)}`
      for (let i = 0; i < WEEKS * 7; i++) {
        const today = addDays(START, i)
        state = act(state, today, { policy: 'greedy', rough: isRoughDay(profile, seed, today), nextId })
        if (i % every === 0) {
          const effects = realmEffects(state)
          const valor = liveValor(state, ledger, today)
          for (const plan of todaysFights(state, today, effects)) {
            const f = formula(state, plan, valor, effects)
            out.push({
              profile: profileId,
              week: Math.floor(i / 7) + 1,
              n: plan.companies.length,
              side: plan.side,
              enemy: plan.enemy.kind,
              formulaWin: f.win,
              formulaRout: f.rout,
              edgeWin: edge((x) => marshalResult(state, plan, valor, today, effects, x) !== 'defeat'),
              edgeRout: edge((x) => marshalResult(state, plan, valor, today, effects, x) === 'rout')
            })
          }
        }
        state = settle(state, ledger, after(today)).state
        if (state.campaign.status !== 'active') break
      }
      console.error(`sampled ${profileId} seed ${seed}: ${out.length} fights so far`)
    }
  }
  return out
}

/** The scale at which the Marshal wins as often as the formula: the (1 − p) quantile of the win edges. */
function matchScale(rows: readonly Sample[]): number {
  const p = rows.filter((r) => r.formulaWin).length / rows.length
  const edges = rows.map((r) => r.edgeWin).sort((a, b) => a - b)
  const k = Math.min(edges.length - 1, Math.max(0, Math.round((1 - p) * edges.length)))
  return edges[k]
}

const pct = (x: number): string => `${Math.round(x * 100)}%`

function report(rows: readonly Sample[]): void {
  const counts = [...new Set(rows.map((r) => r.n))].sort((a, b) => a - b)
  const table: Record<number, number> = {}
  console.log('\nBy companies fielded (n): fights, formula win and rout, proposed scale, and at it the Marshal\'s win and rout and agreement with the formula')
  for (const n of counts) {
    const at = rows.filter((r) => r.n === n)
    const scale = matchScale(at)
    table[n] = scale
    const win = at.filter((r) => scale <= r.edgeWin).length / at.length
    const rout = at.filter((r) => scale <= r.edgeRout).length / at.length
    const agree = at.filter((r) => (scale <= r.edgeWin) === r.formulaWin).length / at.length
    console.log(`  n=${n}: ${at.length} fights | formula win ${pct(at.filter((r) => r.formulaWin).length / at.length)}, rout ${pct(at.filter((r) => r.formulaRout).length / at.length)} | scale ${scale.toFixed(2)} | Marshal win ${pct(win)}, rout ${pct(rout)} | same result ${pct(agree)}`)
  }
  const scaleFor = (n: number): number => table[n] ?? table[Math.max(...counts.filter((c) => c <= n), counts[0])]
  console.log('\nAt those scales, by side and enemy: formula win vs Marshal win, and the multiple of those scales at which the Marshal would win as often as the formula')
  for (const side of ['defense', 'assault'] as const) {
    for (const enemy of [...new Set(rows.map((r) => r.enemy))]) {
      const at = rows.filter((r) => r.side === side && r.enemy === enemy)
      if (at.length === 0) continue
      const marshal = at.filter((r) => scaleFor(r.n) <= r.edgeWin).length / at.length
      const multiple = matchScale(at.map((r) => ({ ...r, edgeWin: r.edgeWin / scaleFor(r.n) })))
      console.log(`  ${side} vs ${enemy}: ${at.length} fights | formula ${pct(at.filter((r) => r.formulaWin).length / at.length)} | Marshal ${pct(marshal)} | to match: ×${multiple.toFixed(2)}`)
    }
  }
  console.log(`\nProposed hostScale (1 to 6 companies): [${[1, 2, 3, 4, 5, 6].map((n) => scaleFor(n).toFixed(2)).join(', ')}]`)
}

function compare(seeds: number): void {
  const summary = (runs: readonly RunResult[]): string => {
    const won = runs.filter((r) => r.wonWeek !== undefined)
    const fell = runs.filter((r) => r.fallWeek !== undefined)
    const mean = (xs: number[]): string => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : '—')
    const earlyFall = fell.filter((r) => (r.fallWeek ?? 0) < 36).length
    const lastHexes = runs.map((r) => r.hexes.player.at(-1) ?? 0)
    return `won ${pct(won.length / runs.length)} (mean week ${mean(won.map((r) => r.wonWeek as number))}), fell ${pct(fell.length / runs.length)} (before week 36: ${earlyFall}), hexes at the end ${mean(lastHexes)}, violations ${runs.reduce((s, r) => s + r.violations.length, 0)}`
  }
  for (const profile of PROFILES) {
    for (const policy of ['greedy', 'skirmish'] as const) {
      const runs = Array.from({ length: seeds }, (_, s) => runCampaign({ seed: 11 + s * 12, profile, policy, weeks: WEEKS, variant: 'base' }))
      console.log(`${profile} ${policy.padEnd(8)}: ${summary(runs)}`)
    }
  }
}

const mode = process.argv[2]
if (mode === 'sample') report(sample(arg('seeds', 3), arg('every', 3)))
else if (mode === 'compare') compare(arg('seeds', 12))
else console.error('Usage: npx tsx sim/skirmish-calibrate.ts sample|compare [--seeds n] [--every d]')
