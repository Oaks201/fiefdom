/**
 * The blueprint's targets for Patches 2 to 5 (`docs/redesign/blueprint.md` section 7), measured
 * from the simulator's day labels and week standings (`measure.ts`). `npm run sim -- --targets`
 * plays the campaigns below and writes `docs/game/sim/targets-<ruleVersion>.md`.
 *
 * Steadfast means the Steadfast profile with the greedy player; the focused player follows one
 * rival's path (`paths:<rival>`), and the path-mix players two halfway, three a third each, or all
 * four evenly. Every series runs from week 2 to the campaign's end (its victory, or the horizon).
 */
import fs from 'node:fs'
import path from 'node:path'
import { RULES } from '../src/renderer/src/lib/game/rules'
import { RIVAL_IDS, type DeedKind, type RivalId } from '../src/renderer/src/lib/game/types'
import type { RunOptions, RunResult } from './campaign'
import { G05_WEEK, LABEL, SIEGE_DAYS_CAP, SURGE_FROM_WEEK, TERMS_FROM_WEEK, type MarchMeasure, type Measures } from './measure'
import type { PolicyId } from './policy'
import type { ProfileId } from './profiles'

/** Patch 5 (P5-01, G-11): the smarter players' horizon, past G-11's week 76. The greedy players keep the run's own, so G-01 to G-10 still compare. */
export const LONG_WEEKS = 90
/** Patch 5 (C-72): G-08 is judged on this many Steadfast greedy seeds (they share their bad weeks across versions); the rest of the targets read the run's own. */
export const G08_SEEDS = 100
/** The run's usual horizon: shorter runs (a quick look) keep every player on it. */
const USUAL_WEEKS = 70
/** Patch 5 (G-07 in full): the smarter player steered along one path, two halfway, three a third each, or all four. */
const MIXES: readonly { label: string; policies: readonly PolicyId[] }[] = [
  { label: 'one path', policies: RIVAL_IDS.map((r): PolicyId => `smarter+paths:${r}`) },
  { label: 'two halfway', policies: ['smarter+paths:orc+goblin', 'smarter+paths:dwarf+archmage'] },
  { label: 'three a third', policies: ['smarter+paths:orc+goblin+dwarf'] },
  { label: 'all four', policies: ['smarter+paths:all'] }
]
/** Patch 5 (P5-01, R-17): G-11's windows for the smarter player's median victory week, and Committed's share won by week 76. */
const G11 = { perfect: [50, 56], steadfast: [58, 64], committed: [64, 72], by: 76, share: 0.6 } as const
/** Patch 5 (C-71, R-18): G-19's ceiling on Steadfast falls by week 76. */
const G19_FALLS = 0.05
/** Patch 5 (G-21): behavior income over the benchmark's, weeks 1 to 60, by profile; and behavior's least share of reputation earned (a third, T-08 and D-44: the spec's half counted tithes and spoils as unearned). */
const G21 = { weeks: 60, steadfast: [1, 1.2], committed: [0.8, 1], waveringBelow: 0.75, behaviorShare: 1 / 3 } as const

/** The campaigns the targets need. */
export function targetPlan(seeds: number, weeks: number): RunOptions[] {
  const runs: RunOptions[] = []
  const add = (profile: ProfileId, policy: PolicyId, n: number, horizon = weeks, from = 1): void => {
    for (let seed = from; seed <= n; seed++) runs.push({ seed, profile, policy, weeks: horizon, variant: 'base' })
  }
  for (const p of ['perfect', 'steadfast', 'committed', 'wavering'] as ProfileId[]) add(p, 'greedy', seeds)
  // Patch 5 (C-72): G-08's further seeds.
  add('steadfast', 'greedy', G08_SEEDS, weeks, seeds + 1)
  const half = Math.max(1, Math.round(seeds / 2))
  for (const r of RIVAL_IDS) add('steadfast', `paths:${r}`, half)
  add('steadfast', 'paths:orc+goblin', half)
  add('steadfast', 'paths:dwarf+archmage', half)
  add('steadfast', 'paths:orc+goblin+dwarf', half)
  add('steadfast', 'paths:all', seeds)
  // Patch 4 (G-18, C-47) and Patch 5 (G-11, G-19, G-07 in full): the smarter player, unsteered for every
  // profile and steered along each mix of paths, to a horizon past G-11's week 76.
  const long = weeks < USUAL_WEEKS ? weeks : Math.max(weeks, LONG_WEEKS)
  for (const p of ['perfect', 'steadfast', 'committed', 'wavering'] as ProfileId[]) add(p, 'smarter', seeds, long)
  for (const mix of MIXES) for (const policy of mix.policies) add('steadfast', policy, half, long)
  return runs
}

const WEEK = RULES.clock.daysPerWeek
const MONTH = RULES.grandBattles.monthWeeks
/** G-01's player-view days (Patch 3, C-27): the blueprint's Land, Grand, Build and Choice, and a siege's Breach. */
const PLAYER_VIEW = LABEL.land | LABEL.grand | LABEL.build | LABEL.choice | LABEL.breach
/** The strict reading, without Breach, reported beside the verdict. */
const PLAYER_VIEW_STRICT = LABEL.land | LABEL.grand | LABEL.build | LABEL.choice
const ANYTHING = LABEL.land | LABEL.grand | LABEL.build | LABEL.doubt
const BAD_VALOR = 0.6
const GOOD_VALOR = 0.85
const WEEK26 = 26
const WEEK40 = 40
const LAST_MONTH_DAYS = 28
const ALL_HELD = 0.98

const median = (v: readonly number[]): number => {
  if (v.length === 0) return Number.NaN
  const s = [...v].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const mean = (v: readonly number[]): number => (v.length === 0 ? Number.NaN : v.reduce((s, x) => s + x, 0) / v.length)
const max = (v: readonly number[]): number => (v.length === 0 ? Number.NaN : Math.max(...v))
const f1 = (v: number): string => (Number.isFinite(v) ? v.toFixed(1) : '–')
const f2 = (v: number): string => (Number.isFinite(v) ? v.toFixed(2) : '–')
const pct = (v: number): string => (Number.isFinite(v) ? `${Math.round(v * 100)}%` : '–')

/** Each week's days (week 2 to the end), as label masks. */
function weeksOf(m: Measures): number[][] {
  const out: number[][] = []
  for (let i = 0; i < m.days.length; i += WEEK) out.push(m.days.slice(i, i + WEEK))
  return out.slice(1)
}

function count(days: readonly number[], mask: number): number {
  return days.filter((d) => (d & mask) !== 0).length
}

function longestRun(days: readonly number[], test: (d: number) => boolean): number {
  let best = 0
  let run = 0
  for (const d of days) {
    run = test(d) ? run + 1 : 0
    best = Math.max(best, run)
  }
  return best
}

interface Row {
  id: string
  target: string
  measure: string
  value: string
  pass: boolean | null
}

function row(id: string, target: string, measure: string, value: string, pass: boolean | null): Row {
  return { id, target, measure, value, pass }
}

/** The G-01 to G-17 rows from the results. */
export function targetRows(results: readonly RunResult[]): Row[] {
  const of = (profile: ProfileId, policy: PolicyId): RunResult[] => results.filter((r) => r.profile === profile && r.policy === policy)
  // Patch 5 (C-72): G-08 reads every Steadfast greedy seed; the other targets the run's own (those Perfect has).
  const perfectSeeds = of('perfect', 'greedy').map((r) => r.seed)
  const mainSeeds = perfectSeeds.length > 0 ? Math.max(...perfectSeeds) : Number.POSITIVE_INFINITY
  const steadfastAll = of('steadfast', 'greedy')
  const steadfast = steadfastAll.filter((r) => r.seed <= mainSeeds)
  const rows: Row[] = []

  // G-01 (C-27: a Breach counts; the strict reading without it is reported beside the verdict)
  const perWeek = (mask: number): number[] => steadfast.flatMap((r) => weeksOf(r.measures).map((w) => count(w, mask)))
  const meaningful = perWeek(PLAYER_VIEW)
  const strict = perWeek(PLAYER_VIEW_STRICT)
  const withAuto = perWeek(PLAYER_VIEW | LABEL.doubt)
  const share5 = (v: readonly number[]): number => v.filter((x) => x >= 5).length / v.length
  const g01Mean = mean(meaningful)
  const g01Share = share5(meaningful)
  rows.push(row('G-01', 'Something meaningful on 5+ days a week', 'Player-view meaningful days a week, a Breach counted (mean; weeks with 5+); strict, without Breach; incl. auto battles', `${f1(g01Mean)}; ${pct(g01Share)} (strict ${f1(mean(strict))}; ${pct(share5(strict))}; incl. auto battles ${f1(mean(withAuto))})`, g01Mean >= 5 && g01Share >= 0.7))

  // G-02
  const quiet = steadfast.map((r) => longestRun(r.measures.days, (d) => (d & ANYTHING) === 0))
  const noLandWeeks = steadfast.map((r) => {
    const days = r.measures.days.slice(0, Math.max(0, r.measures.days.length - LAST_MONTH_DAYS))
    const weeks: boolean[] = []
    for (let i = 0; i < days.length; i += WEEK) weeks.push(count(days.slice(i, i + WEEK), LABEL.land) === 0)
    return longestRun(weeks.map((w) => (w ? 1 : 0)), (d) => d === 1)
  })
  rows.push(row('G-02', 'No dead stretches', 'Longest run of days with nothing (median; worst); longest run of weeks with no land before the last month (worst)', `${median(quiet)}; ${max(quiet)}; ${max(noLandWeeks)} weeks`, median(quiet) <= 4 && max(quiet) <= 7 && max(noLandWeeks) < 2))

  // G-03 (C-27: a target is a hex that falls within the siege horizon; the strict "falls today" beside it)
  const noTarget = perWeek(LABEL.noTarget)
  const noReach = perWeek(LABEL.noReach)
  rows.push(row('G-03', 'A target every day', `Days a week with no hex that falls within ${RULES.autoplay.siegeHorizon} assault days (mean); strict, with no hex that falls today`, `${f1(mean(noTarget))} (strict ${f1(mean(noReach))})`, mean(noTarget) <= 1))

  // G-04
  const net = steadfast.flatMap((r) => {
    const w = r.measures.weeks.filter((x) => x.week >= 5 && x.week <= 52)
    return w.length > 1 ? [(w[w.length - 1].held - w[0].held) / (w.length - 1)] : []
  })
  const landDays = steadfast.flatMap((r) => weeksOf(r.measures).map((w) => count(w, LABEL.land)))
  rows.push(row('G-04', 'Land every week', 'Net hexes a week, weeks 5–52 (median); days a week land changes hands (mean)', `${f2(median(net))}; ${f1(mean(landDays))}`, median(net) >= 3 && median(net) <= 4 && mean(landDays) >= 3))

  // G-05
  // The rival marches (a lair's wedge is all taken but for its Mouth, by design), at victory; with no
  // victory, at week 60 until Patch 5 sets victory (T-04), the horizon's value beside it.
  const leastHeld = (unheld: Record<string, number>): number => Math.min(...Object.entries(unheld).filter(([k]) => (RIVAL_IDS as readonly string[]).includes(k)).map(([, v]) => v))
  const minUnheld = steadfast.map((r) => leastHeld(r.wonWeek === undefined && r.measures.week60Unheld ? r.measures.week60Unheld : r.measures.unheld))
  const atHorizon = steadfast.map((r) => leastHeld(r.measures.unheld))
  const wins = steadfast.filter((r) => r.wonWeek !== undefined).length
  const perfectAll = of('perfect', 'greedy').map((r) => r.measures.weeks.find((w) => w.claimableHeld >= ALL_HELD * w.claimable)?.week ?? Number.POSITIVE_INFINITY)
  rows.push(row('G-05', 'The map lasts', `At Steadfast's victory (in ${wins} of ${steadfast.length}), else week ${G05_WEEK} (T-04, until Patch 5), the least-held rival march's unheld share (median; at the end beside it); Perfect's first week holding (nearly) every claimable hex (earliest)`, `${pct(median(minUnheld))} (at the end ${pct(median(atHorizon))}); week ${Number.isFinite(Math.min(...perfectAll)) ? Math.min(...perfectAll) : 'never'}`, median(minUnheld) >= 0.1 && Math.min(...perfectAll) >= 52))

  // G-06 and G-07 (the one-path players)
  const focused = RIVAL_IDS.flatMap((r) => of('steadfast', `paths:${r}`).map((run) => ({ run, rival: r })))
  const ratios = focused.flatMap(({ run, rival }) => {
    const w = run.measures.weeks.find((x) => x.week === WEEK26)
    if (!w) return []
    const i = RIVAL_IDS.indexOf(rival)
    const others = w.paths.filter((_, k) => k !== i)
    return [w.paths[i] / Math.max(1, Math.max(...others))]
  })
  const rankV = focused.filter(({ run }) => run.measures.rankV !== undefined).length / Math.max(1, focused.length)
  rows.push(row('G-06', 'A focused path pays', "The focused path's Dominion over the next highest at week 26 (median); share reaching rank V", `${f2(median(ratios))}×; ${pct(rankV)}`, median(ratios) >= 2 && rankV >= 0.9))
  const tierIII = focused.filter(({ run }) => run.measures.weeks.find((x) => x.week === WEEK26)?.tiers.every((t) => t >= 3)).length / Math.max(1, focused.length)
  const rising = focused.filter(({ run }) => {
    const months = run.measures.weeks.filter((x) => x.week % MONTH === 0 && x.week <= WEEK40).map((x) => x.held)
    return months.every((h, i) => i === 0 || h > months[i - 1])
  }).length / Math.max(1, focused.length)
  // Patch 5 (G-07 in full): the smarter path mixes win alike, as often and as soon.
  const mixes = MIXES.map((m) => {
    const runs = m.policies.flatMap((p) => of('steadfast', p))
    const won = runs.flatMap((r) => (r.wonWeek !== undefined ? [r.wonWeek] : []))
    return { runs: runs.length, share: won.length / Math.max(1, runs.length), week: median(won) }
  })
  const full = mixes.every((m) => m.runs > 0)
  const spread = (v: number[]): number => Math.max(...v) - Math.min(...v)
  const fullPass = full && spread(mixes.map((m) => m.share)) <= 0.05 && spread(mixes.map((m) => m.week)) <= 3
  rows.push(
    row(
      'G-07',
      'Every mix can win',
      `One-path players with all four buildings at Tier III by week 26; with hexes held rising every month to week 40 (the Patch 2 half). In full (Patch 5): the smarter player along ${MIXES.map((m) => m.label).join(', ')}: win shares within 5 points, median victory weeks within 3`,
      `${pct(tierIII)}; ${pct(rising)}${full ? `; in full: won ${mixes.map((m) => pct(m.share)).join(' / ')}, median week ${mixes.map((m) => m.week).join(' / ')}` : ''}`,
      tierIII >= 0.9 && rising >= 0.9 && (!full || fullPass)
    )
  )

  // G-08 (Patch 5, C-72: judged on every Steadfast greedy seed, the run's own beside it)
  const g08 = (runs: readonly RunResult[]): { mid: number; bad: number; good: number; lostShare: number } => {
    const lostIn = (test: (v: number) => boolean): number => mean(runs.flatMap((r) => r.measures.weeks.filter((w) => test(w.valor)).map((w) => w.lost)))
    return {
      mid: mean(runs.flatMap((r) => r.measures.weeks.filter((w) => w.week >= 13 && w.week <= 36).map((w) => w.doubtDefenses))),
      bad: lostIn((v) => v < BAD_VALOR),
      good: lostIn((v) => v > GOOD_VALOR),
      lostShare: sumOf(runs, (w) => w.lost) / Math.max(1, sumOf(runs, (w) => w.gained))
    }
  }
  const g = g08(steadfastAll)
  const own = g08(steadfast)
  const beside = steadfastAll.length > steadfast.length ? ` (${f2(g.bad / g.good)}× on ${steadfastAll.length} seeds; ${f2(own.bad / own.good)}× on ${steadfast.length})` : ''
  rows.push(row('G-08', 'Defending matters', `Mid-game defenses a week banded Matched or worse (mean); land lost a week in bad vs good weeks; land lost ÷ gained (every Steadfast greedy seed, C-72)`, `${f1(g.mid)}; ${f2(g.bad)} vs ${f2(g.good)}${beside}; ${pct(g.lostShare)}`, g.mid >= 2 && g.bad >= 2 * g.good && g.lostShare <= 0.25))

  // G-09: fallbacks come in Patch 3's stage 4; until then, the wins they will be counted against.
  // G-09: fallbacks after non-rout assault wins, and the next day's target changed by them.
  const nonRoutWins = steadfast.reduce((s, r) => s + r.measures.assaultWins.nonRout, 0)
  const fell = steadfast.reduce((s, r) => ({ posted: s.posted + r.measures.fallbacks.posted, dawns: s.dawns + r.measures.fallbacks.dawns, changed: s.changed + r.measures.fallbacks.changed }), { posted: 0, dawns: 0, changed: 0 })
  const fellShare = fell.posted / Math.max(1, nonRoutWins)
  const changedShare = fell.changed / Math.max(1, fell.dawns)
  rows.push(row('G-09', 'Routed enemies change choices', "Non-rout assault wins followed by a fallback; dawns after a fallback whose target differs from the one chosen without it (that second half retired by Patch 5's P5-05, reported only)", `${pct(fellShare)}; ${pct(changedShare)}`, fellShare >= 0.6))
  // G-10 (Patch 4, spec section 2): per march, Steadfast greedy.
  const g10 = marchReadings(steadfast)
  const by = (k: keyof MarchReading): Record<RivalId, number> => Object.fromEntries(RIVAL_IDS.map((r) => [r, g10[r][k]])) as Record<RivalId, number>
  const lowest = (v: Record<RivalId, number>): RivalId => RIVAL_IDS.reduce((a, b) => (v[b] < v[a] ? b : a))
  const highest = (v: Record<RivalId, number>): RivalId => RIVAL_IDS.reduce((a, b) => (v[b] > v[a] ? b : a))
  const lostPer = by('lostPerHeld')
  const daysPer = by('daysPerTaken')
  const defPer = by('defensesPerHeld')
  const bothPer = by('bothWaysPerHeld')
  const goblinDeal = g10.goblin.dealShare
  const surgeShare = steadfast.reduce((s, r) => s + r.measures.surgeWeeks.hit, 0) / Math.max(1, steadfast.reduce((s, r) => s + r.measures.surgeWeeks.weeks, 0))
  const g10Pass = lowest(lostPer) === 'dwarf' && highest(daysPer) === 'dwarf' && highest(defPer) === 'orc' && highest(bothPer) === 'orc' && goblinDeal >= 0.4 && surgeShare >= SURGE_WEEKS_SHARE
  rows.push(
    row(
      'G-10',
      'The rivals fight differently',
      `Per march (Steadfast; the "The marches" table below): fewest hexes lost per hex held, and most assault days per hex taken (the Dwarf's); most defenses and most hexes changing hands both ways per hex held (the Orc's); the Goblin's march first taken by deal or bribe; weeks from week ${SURGE_FROM_WEEK} with a surge on a hex the player could assault`,
      `lost ${lowest(lostPer)}; days ${highest(daysPer)}; defenses ${highest(defPer)}; both ways ${highest(bothPer)}; Goblin by deal ${pct(goblinDeal)}; surge weeks ${pct(surgeShare)}`,
      g10Pass
    )
  )

  // G-11 (Patch 5, P5-01): on the smarter player; the greedy player's beside it.
  const wonWeeks = (p: ProfileId, policy: PolicyId): number[] => of(p, policy).flatMap((r) => (r.wonWeek !== undefined ? [r.wonWeek] : []))
  const winShare = (p: ProfileId, policy: PolicyId, by = Number.POSITIVE_INFINITY): number => wonWeeks(p, policy).filter((w) => w <= by).length / Math.max(1, of(p, policy).length)
  const inside = (v: number, [lo, hi]: readonly number[]): boolean => v >= lo && v <= hi
  const g11Built = (['perfect', 'steadfast', 'committed'] as ProfileId[]).every((p) => of(p, 'smarter').length > 0)
  const g11Pass = inside(median(wonWeeks('perfect', 'smarter')), G11.perfect) && inside(median(wonWeeks('steadfast', 'smarter')), G11.steadfast) && inside(median(wonWeeks('committed', 'smarter')), G11.committed) && winShare('committed', 'smarter', G11.by) >= G11.share
  rows.push(
    row(
      'G-11',
      'Campaign length (R-17)',
      `The smarter player's median victory week and win share: Perfect (${G11.perfect.join(' to ')}); Steadfast (${G11.steadfast.join(' to ')}); Committed (${G11.committed.join(' to ')}, and its share won by week ${G11.by}); the greedy players' win shares beside`,
      g11Built
        ? `${median(wonWeeks('perfect', 'smarter'))} (${pct(winShare('perfect', 'smarter'))}); ${median(wonWeeks('steadfast', 'smarter'))} (${pct(winShare('steadfast', 'smarter'))}); ${median(wonWeeks('committed', 'smarter'))} (${pct(winShare('committed', 'smarter'))}; ${pct(winShare('committed', 'smarter', G11.by))} by week ${G11.by}); greedy ${pct(winShare('perfect', 'greedy'))} / ${pct(winShare('steadfast', 'greedy'))} / ${pct(winShare('committed', 'greedy'))}`
        : `greedy: ${median(wonWeeks('perfect', 'greedy'))} (${pct(winShare('perfect', 'greedy'))}); ${median(wonWeeks('steadfast', 'greedy'))} (${pct(winShare('steadfast', 'greedy'))}); ${median(wonWeeks('committed', 'greedy'))} (${pct(winShare('committed', 'greedy'))})`,
      g11Built ? g11Pass : null
    )
  )

  // G-12
  const violations = results.reduce((s, r) => s + r.violations.length, 0)
  const early = results.filter((r) => r.fallWeek !== undefined && r.fallWeek < RULES.defeat.ascendancy.fromWeek).length
  rows.push(row('G-12', 'Guardrails and invariants', 'Invariant violations; falls before week 36 (every campaign)', `${violations}; ${early}`, violations === 0 && early === 0))

  // G-13
  const perMonth = mean(steadfast.flatMap((r) => r.grandBattles.perMonth))
  rows.push(row('G-13', 'Grand Battles', 'Steadfast Grand Battles a month (mean)', f1(perMonth), perMonth >= 1 && perMonth <= 3))

  // G-15
  const bytes = max(results.map((r) => r.measures.bytes))
  rows.push(row('G-15', 'Performance', '`campaign.json` at the end (largest); the 365-day catch-up and re-founding are timed by `scripts/campaign-perf.ts`', `${f2(bytes / 1e6)} MB`, bytes < 2e6))

  // G-16: the hardening itself, its march's preparation (1 + 5% a level), against the even player's same march.
  const even = of('steadfast', 'paths:all')
  const prepMult = (level: number): number => 1 + RULES.marches.preparation.perLevel * level
  const evenPrep = (k: number): number => mean(even.flatMap((r) => (r.measures.week26Preparation ? [prepMult(r.measures.week26Preparation[k])] : [])))
  const neglect = focused.flatMap(({ run, rival }) => {
    const w = run.measures.weeks.find((x) => x.week === WEEK26)
    const p = run.measures.week26Preparation
    if (!w || !p) return []
    const i = RIVAL_IDS.indexOf(rival)
    let least = -1
    w.paths.forEach((v, k) => {
      if (k !== i && (least < 0 || v < w.paths[least])) least = k
    })
    return [prepMult(p[least]) / evenPrep(least)]
  })
  const garrisons = focused.flatMap(({ run, rival }) => {
    const g = run.measures.week26Garrison
    const march = RIVAL_IDS.find((r) => r !== rival)
    return g && march && g[march] !== undefined ? [g[march]] : []
  })
  rows.push(row('G-16', 'Neglect costs something', "The focused player's least-pushed march at week 26: its garrisons' preparation over the even player's same march (median)", `${f2(median(neglect))}× (mean garrison not held there ${f1(median(garrisons))})`, median(neglect) >= 1.2))

  // G-17: a player who fought mostly one rival has that path highest, and it holds the most deeds.
  const story = focused.filter(({ run }) => run.measures.deeds !== undefined)
  const told = story.filter(({ run, rival }) => {
    const i = RIVAL_IDS.indexOf(rival)
    const d = run.measures.deeds as number[]
    const p = run.measures.weeks[run.measures.weeks.length - 1]?.paths ?? []
    return d.indexOf(Math.max(...d)) === i && p.indexOf(Math.max(...p)) === i
  }).length
  const all = results.filter((r) => r.measures.deeds !== undefined)
  const agree = all.filter((r) => {
    const d = r.measures.deeds as number[]
    const p = r.measures.weeks[r.measures.weeks.length - 1]?.paths ?? []
    return d.indexOf(Math.max(...d)) === p.indexOf(Math.max(...p))
  }).length
  rows.push(row('G-17', 'The path tells the story', 'One-path players whose path ends with both the most deeds and the most Dominion (every campaign: most-deeds path is the highest)', story.length > 0 ? `${pct(told / story.length)} (${pct(agree / Math.max(1, all.length))})` : 'not yet built', story.length > 0 ? told / story.length >= 0.9 : null))

  // G-18 (Patch 4, spec section 2): the smarter one-path players resolve rivals by terms; nobody offers before week 16; the smarter refuse some.
  const smarterOne = RIVAL_IDS.flatMap((r) => of('steadfast', `smarter+paths:${r}`))
  const built = results.some((r) => r.measures.terms.firstBand && Object.values(r.measures.terms.firstBand).some((b) => b.some((w) => w !== null)))
  const byTerms = smarterOne.map((r) => r.measures.terms.byTerms)
  const refused = smarterOne.map((r) => r.measures.terms.refused)
  const early16 = results.reduce((s, r) => s + r.measures.terms.before16, 0)
  rows.push(
    row(
      'G-18',
      'Terms do their job',
      `Smarter one-path players: rivals resolved by terms by the horizon (median; share with 2+); offers before week ${TERMS_FROM_WEEK} (every campaign); offers refused (median)`,
      built ? `${median(byTerms)} (${pct(byTerms.filter((v) => v >= 2).length / Math.max(1, byTerms.length))}); ${early16}; ${median(refused)}` : 'not yet built',
      built ? median(byTerms) >= 2 && early16 === 0 && median(refused) >= 1 : null
    )
  )

  // G-19 (Patch 5, R-18, C-71): Steadfast rarely falls; Committed and Wavering reported.
  const fallShare = (runs: readonly RunResult[], by = Number.POSITIVE_INFINITY): number => runs.filter((r) => r.fallWeek !== undefined && r.fallWeek <= by).length / Math.max(1, runs.length)
  const ultimatumShare = (runs: readonly RunResult[]): number => runs.filter((r) => r.ultimatums.length > 0).length / Math.max(1, runs.length)
  const steadfastBoth = [...steadfast, ...of('steadfast', 'smarter')]
  const both = (p: ProfileId): RunResult[] => [...of(p, 'greedy'), ...of(p, 'smarter')]
  rows.push(
    row(
      'G-19',
      'Defeat stays rare (R-18)',
      `Steadfast (greedy and smarter) falls by week ${G11.by} (under ${pct(G19_FALLS)}); Committed and Wavering falls (Ch 15: 20 to 35%, 60 to 80%), reported; campaigns with an Ultimatum: Steadfast; Committed; Wavering`,
      `${pct(fallShare(steadfastBoth, G11.by))}; ${pct(fallShare(both('committed')))}; ${pct(fallShare(both('wavering')))}; Ultimatums ${pct(ultimatumShare(steadfastBoth))}; ${pct(ultimatumShare(both('committed')))}; ${pct(ultimatumShare(both('wavering')))}`,
      steadfastBoth.length > 0 ? fallShare(steadfastBoth, G11.by) < G19_FALLS : null
    )
  )

  // G-20 (Patch 5): Respect moves both ways, and with it the standing.
  const ever = (r: RunResult, i: number, s: string): boolean => r.measures.weeks.some((w) => w.standing?.[i] === s)
  const smarterSteadfast = of('steadfast', 'smarter')
  const peaceful = (['goblin', 'dwarf', 'archmage'] as RivalId[]).map((rv) => RIVAL_IDS.indexOf(rv))
  const orc = RIVAL_IDS.indexOf('orc')
  const reachedPeace = smarterSteadfast.map((r) => peaceful.filter((i) => ever(r, i, 'p')).length)
  const orcAtPeace = [...smarterSteadfast, ...steadfast].filter((r) => ever(r, orc, 'p')).length
  const reachedWar = steadfast.map((r) => RIVAL_IDS.filter((_, i) => ever(r, i, 'w')).length)
  const changes = smarterSteadfast.flatMap((r) =>
    RIVAL_IDS.map((_, i) => {
      let n = 0
      let last: string | undefined
      for (const w of r.measures.weeks) {
        const s = w.standing?.[i]
        if (s === undefined || s === '-') continue
        if (last !== undefined && s !== last) n++
        last = s
      }
      return n
    })
  )
  const standings = results.some((r) => r.measures.weeks.some((w) => w.standing !== undefined))
  rows.push(
    row(
      'G-20',
      'Respect moves both ways',
      "Steadfast smarter: of the Goblin, the Dwarf and the Archmage, those reaching Peace before they are resolved (median; at least 2); campaigns with the Orc at Peace (none); Steadfast greedy: rivals reaching War (median; at least 2); each active rival's changes of standing a campaign (median; at least 1)",
      standings ? `${median(reachedPeace)}; ${orcAtPeace}; ${median(reachedWar)}; ${median(changes)}` : 'not yet built',
      standings && smarterSteadfast.length > 0 ? median(reachedPeace) >= 2 && orcAtPeace === 0 && median(reachedWar) >= 2 && median(changes) >= 1 : null
    )
  )

  // G-21 (Patch 5, X-11): behavior leads income (Pillar 1), against the benchmark as Ch 15 counts it.
  const ratio = (runs: readonly RunResult[]): number => mean(runs.filter((r) => r.incomeBase.length >= G21.weeks).map((r) => sumTo(r.incomeBase, G21.weeks) / Math.max(1, sumTo(r.benchmarkGrace, G21.weeks))))
  const behaviorShare = median(steadfast.flatMap((r) => (r.measures.income ? [r.measures.income.behavior / Math.max(1, r.measures.income.behavior + r.measures.income.tithe + r.measures.income.spoils + r.measures.income.other)] : [])))
  const rs = ratio(steadfast)
  const rc = ratio(of('committed', 'greedy'))
  const rw = ratio(of('wavering', 'greedy'))
  rows.push(
    row(
      'G-21',
      'Behavior leads income (Pillar 1)',
      `Behavior income over the benchmark's, weeks 1 to ${G21.weeks} (greedy): Steadfast (${G21.steadfast.join(' to ')}); Committed (${G21.committed.join(' to ')}); Wavering (under ${G21.waveringBelow}); Steadfast's behavior share of reputation earned (median; at least ${pct(G21.behaviorShare)})`,
      `${f2(rs)}; ${f2(rc)}; ${f2(rw)}; ${pct(behaviorShare)}`,
      Number.isFinite(rs) && Number.isFinite(rc) && Number.isFinite(rw) ? inside(rs, G21.steadfast) && inside(rc, G21.committed) && rw < G21.waveringBelow && behaviorShare >= G21.behaviorShare : null
    )
  )
  return rows
}

function sumTo(v: readonly number[], weeks: number): number {
  return v.slice(0, weeks).reduce((s, x) => s + x, 0)
}

/** G-10's share of weeks with a surge on a hex the player could assault ("at least weekly"). */
const SURGE_WEEKS_SHARE = 0.9

interface MarchReading {
  lostPerHeld: number
  daysPerTaken: number
  defensesPerHeld: number
  bothWaysPerHeld: number
  dealShare: number
  /** Mean hexes held there at the week closes (per campaign). */
  held: number
}

/** Each rival march's G-10 readings over `runs`: totals over the mean land held there. */
function marchReadings(runs: readonly RunResult[]): Record<RivalId, MarchReading> {
  const out = {} as Record<RivalId, MarchReading>
  for (const r of RIVAL_IDS) {
    const ms = runs.map((x) => x.measures.marches[r])
    const sum = (f: (m: MarchMeasure) => number): number => ms.reduce((s, m) => s + f(m), 0)
    const held = sum((m) => m.heldSum / Math.max(1, m.closes))
    out[r] = {
      lostPerHeld: sum((m) => m.lost) / Math.max(1, held),
      daysPerTaken: sum((m) => m.assaultDays) / Math.max(1, sum((m) => m.assaultTaken)),
      defensesPerHeld: sum((m) => m.defenses) / Math.max(1, held),
      bothWaysPerHeld: sum((m) => m.bothWays) / Math.max(1, held),
      dealShare: sum((m) => m.firstDeal) / Math.max(1, sum((m) => m.firstDeal + m.firstForce)),
      held: held / Math.max(1, ms.length)
    }
  }
  return out
}

/** G-10's per-march table (Steadfast greedy). */
function marchLines(steadfast: readonly RunResult[]): string[] {
  const g = marchReadings(steadfast)
  const cell = (f: (m: MarchReading) => string): string => RIVAL_IDS.map((r) => f(g[r])).join(' | ')
  return [
    '## The marches',
    '',
    "G-10's readings for Steadfast (greedy), each rival's march (a seam counts for its first march).",
    '',
    `| Measure | ${RIVAL_IDS.join(' | ')} |`,
    `| --- | ${RIVAL_IDS.map(() => '---').join(' | ')} |`,
    `| Hexes held there (mean of the week closes) | ${cell((m) => f1(m.held))} |`,
    `| Hexes lost per hex held | ${cell((m) => f2(m.lostPerHeld))} |`,
    `| Assault days per hex taken by assault | ${cell((m) => f2(m.daysPerTaken))} |`,
    `| Defenses per hex held | ${cell((m) => f2(m.defensesPerHeld))} |`,
    `| Hexes changing hands both ways per hex held | ${cell((m) => f2(m.bothWaysPerHeld))} |`,
    `| First taken by deal (courtship, trade, bribe) | ${cell((m) => pct(m.dealShare))} |`
  ]
}

/** G-18's detail: when each rival first reaches each band, the first offer, and how rivals were resolved (Steadfast smarter, and the smarter one-path players). */
function termsLines(results: readonly RunResult[]): string[] {
  const groups: { label: string; runs: RunResult[] }[] = [
    { label: 'Steadfast smarter', runs: results.filter((r) => r.profile === 'steadfast' && r.policy === 'smarter') },
    { label: 'Smarter one-path', runs: results.filter((r) => r.profile === 'steadfast' && r.policy.startsWith('smarter+paths:')) },
    { label: 'Steadfast greedy', runs: results.filter((r) => r.profile === 'steadfast' && r.policy === 'greedy') }
  ]
  const lines = ['## Terms', '', 'Median week each rival first reached a band (– if under half the campaigns did), the first terms offer, rivals resolved by kind a campaign (mean), and victory.', '', '| Group | Orc: Wary; Shaken; Ready | Goblin | Dwarf | Archmage | First offer | By terms | By Accord | Conquered | Defected | Won (median week) |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |']
  for (const { label, runs } of groups) {
    if (runs.length === 0) continue
    const band = (r: RivalId, b: number): string => {
      const weeks = runs.map((x) => x.measures.terms.firstBand[r][b]).filter((w): w is number => w !== null)
      return weeks.length * 2 >= runs.length ? String(median(weeks)) : '–'
    }
    const rival = (r: RivalId): string => [1, 2, 3].map((b) => band(r, b)).join('; ')
    const first = runs.flatMap((x) => (x.measures.terms.firstOffer !== undefined ? [x.measures.terms.firstOffer] : []))
    const kind = (how: string): string => f1(mean(runs.map((x) => x.resolutions.filter((y) => y.how === how).length)))
    const won = runs.flatMap((x) => (x.wonWeek !== undefined ? [x.wonWeek] : []))
    lines.push(`| ${label} | ${RIVAL_IDS.map(rival).join(' | ')} | ${first.length > 0 ? median(first) : '–'} | ${f1(mean(runs.map((x) => x.measures.terms.byTerms)))} | ${kind('allied')} | ${kind('conquered')} | ${kind('abdicated')} | ${won.length > 0 ? `${median(won)} (${pct(won.length / runs.length)})` : '–'} |`)
  }
  return lines
}

/** Patch 5 (G-11, G-19, G-07 in full): how long each player takes, how it ends, and when each rival is resolved. */
function lengthLines(results: readonly RunResult[]): string[] {
  const groups: { label: string; runs: RunResult[] }[] = [
    ...(['perfect', 'steadfast', 'committed', 'wavering'] as ProfileId[]).map((p) => ({ label: `${p[0].toUpperCase()}${p.slice(1)} smarter`, runs: results.filter((r) => r.profile === p && r.policy === 'smarter') })),
    ...MIXES.map((m) => ({ label: `Smarter, ${m.label}`, runs: results.filter((r) => r.profile === 'steadfast' && m.policies.includes(r.policy)) })),
    ...(['perfect', 'steadfast', 'committed', 'wavering'] as ProfileId[]).map((p) => ({ label: `${p[0].toUpperCase()}${p.slice(1)} greedy`, runs: results.filter((r) => r.profile === p && r.policy === 'greedy') }))
  ]
  const lines = ['## Length and the endgame', '', 'Median victory week [quartiles], the share won by week 76, falls, campaigns with an Ultimatum, and the median week of the first to fourth resolution, with resolutions by kind a campaign (mean).', '', '| Group | Campaigns | Won (median [quartiles]) | By week 76 | Falls | Ultimatum | Resolutions 1st–4th | Allied; abdicated; conquered |', '| --- | --- | --- | --- | --- | --- | --- | --- |']
  for (const { label, runs } of groups) {
    if (runs.length === 0) continue
    const won = runs.flatMap((r) => (r.wonWeek !== undefined ? [r.wonWeek] : [])).sort((a, b) => a - b)
    const q = (p: number): number => won[Math.min(won.length - 1, Math.floor(p * won.length))]
    const nth = [0, 1, 2, 3].map((i) => median(runs.flatMap((r) => (r.resolutions[i] ? [[...r.resolutions].sort((a, b) => a.week - b.week)[i].week] : []))))
    const kind = (how: string): string => f1(mean(runs.map((r) => r.resolutions.filter((x) => x.how === how).length)))
    lines.push(`| ${label} | ${runs.length} | ${won.length > 0 ? `${median(won)} [${q(0.25)}–${q(0.75)}] (${pct(won.length / runs.length)})` : '–'} | ${pct(won.filter((w) => w <= G11.by).length / runs.length)} | ${runs.filter((r) => r.fallWeek !== undefined).length} | ${pct(runs.filter((r) => r.ultimatums.length > 0).length / runs.length)} | ${nth.map((w) => (Number.isFinite(w) ? w : '–')).join(' / ')} | ${kind('allied')}; ${kind('abdicated')}; ${kind('conquered')} |`)
  }
  return lines
}

/** Patch 5 (G-20): each rival's Respect and standing, Steadfast smarter and greedy. */
function respectLines(results: readonly RunResult[]): string[] {
  const groups = [
    { label: 'smarter', runs: results.filter((r) => r.profile === 'steadfast' && r.policy === 'smarter') },
    { label: 'greedy', runs: results.filter((r) => r.profile === 'steadfast' && r.policy === 'greedy') }
  ].filter((g) => g.runs.length > 0 && g.runs.some((r) => r.measures.weeks.some((w) => w.standing !== undefined)))
  if (groups.length === 0) return []
  const lines = ['## Respect and standing', '', "Steadfast. Each rival's Respect at the week closes (median), his active weeks at Peace, Tension and War, the campaigns in which he reached Peace and War (with the median first week), and his Respect changes a campaign by reason (how many; their sum).", '', '| Rival | Player | Respect at weeks 8 / 16 / 26 / 40 / 52 | Peace / Tension / War | Reached Peace | Reached War |', '| --- | --- | --- | --- | --- | --- |']
  const reasons: string[] = []
  for (const [i, rival] of RIVAL_IDS.entries()) {
    for (const { label, runs } of groups) {
      const at = (week: number): string => {
        const v = runs.flatMap((r) => {
          const x = r.measures.weeks.find((w) => w.week === week)?.respect?.[i]
          return typeof x === 'number' ? [x] : []
        })
        return v.length * 2 >= runs.length ? f1(median(v)) : '–'
      }
      const counts = { p: 0, t: 0, w: 0 }
      const first = { p: [] as number[], w: [] as number[] }
      for (const r of runs) {
        for (const w of r.measures.weeks) {
          const s = w.standing?.[i]
          if (s === 'p' || s === 't' || s === 'w') counts[s]++
        }
        for (const s of ['p', 'w'] as const) {
          const w = r.measures.weeks.find((x) => x.standing?.[i] === s)
          if (w) first[s].push(w.week)
        }
      }
      const total = counts.p + counts.t + counts.w
      const reached = (s: 'p' | 'w'): string => `${first[s].length} of ${runs.length}${first[s].length > 0 ? ` (week ${median(first[s])})` : ''}`
      lines.push(`| ${rival} | ${label} | ${[8, 16, 26, 40, 52].map(at).join(' / ')} | ${pct(counts.p / Math.max(1, total))} / ${pct(counts.t / Math.max(1, total))} / ${pct(counts.w / Math.max(1, total))} | ${reached('p')} | ${reached('w')} |`)
      const by: Record<string, [number, number]> = {}
      for (const r of runs) for (const [why, [n, sum]] of Object.entries(r.measures.respectReasons?.[rival] ?? {})) by[why] = [(by[why]?.[0] ?? 0) + n / runs.length, (by[why]?.[1] ?? 0) + sum / runs.length]
      reasons.push(`| ${rival} | ${label} | ${Object.entries(by).sort((a, b) => b[1][0] - a[1][0]).map(([why, [n, sum]]) => `${why} ${f1(n)}; ${sum >= 0 ? '+' : ''}${f1(sum)}`).join(' · ')} |`)
    }
  }
  return [...lines, '', '| Rival | Player | Respect changes a campaign, by reason |', '| --- | --- | --- |', ...reasons]
}

/** Patch 5 (X-10, X-15): Grand Battles by month and by trigger, and when each world event first fires. */
function worldLines(results: readonly RunResult[]): string[] {
  const groups = [
    { label: 'Steadfast greedy', runs: results.filter((r) => r.profile === 'steadfast' && r.policy === 'greedy') },
    { label: 'Steadfast smarter', runs: results.filter((r) => r.profile === 'steadfast' && r.policy === 'smarter') }
  ].filter((g) => g.runs.length > 0)
  const lines = ['## Grand Battles and the world', '', 'Grand Battles a 4-week month (mean over the campaigns still running that month), and each trigger a campaign (mean).', '', '| Group | By month | By trigger |', '| --- | --- | --- |']
  for (const { label, runs } of groups) {
    const months = Math.max(...runs.map((r) => r.grandBattles.perMonth.length))
    const by = Array.from({ length: months }, (_, m) => f1(mean(runs.filter((r) => r.grandBattles.perMonth.length > m).map((r) => r.grandBattles.perMonth[m]))))
    const trig: Record<string, number> = {}
    for (const r of runs) for (const [t, n] of Object.entries(r.grandBattles.byTrigger)) trig[t] = (trig[t] ?? 0) + n / runs.length
    lines.push(`| ${label} | ${by.join(' ')} | ${Object.entries(trig).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${f1(n)}`).join(' · ')} |`)
  }
  lines.push('', 'Each world event, and the first coalition: the share of campaigns it fired in, and its median first week.', '', '| Group | Events |', '| --- | --- |')
  for (const { label, runs } of groups) {
    const first: Record<string, number[]> = {}
    for (const r of runs) for (const [id, w] of Object.entries(r.measures.eventWeeks ?? {})) (first[id] ??= []).push(w)
    const coalitions = runs.flatMap((r) => (r.coalitions.length > 0 ? [r.coalitions[0]] : []))
    if (coalitions.length > 0) first['a coalition'] = coalitions
    lines.push(`| ${label} | ${Object.entries(first).sort((a, b) => median(a[1]) - median(b[1])).map(([id, w]) => `${id} ${pct(w.length / runs.length)}, week ${median(w)}`).join(' · ')} |`)
  }
  return lines
}

/** Patch 5 (G-21, X-11): where reputation comes from, and behavior income against the benchmark by phase. */
function incomeLines(results: readonly RunResult[]): string[] {
  const groups = (['perfect', 'steadfast', 'committed', 'wavering'] as ProfileId[]).map((p) => ({ label: `${p[0].toUpperCase()}${p.slice(1)} greedy`, runs: results.filter((r) => r.profile === p && r.policy === 'greedy' && r.measures.income !== undefined) })).filter((g) => g.runs.length > 0)
  if (groups.length === 0) return []
  const lines = ['## Income', '', "Reputation earned by the end, by source (median shares), and behavior income over the benchmark's (as Ch 15 counts it: no tithes, spoils or bonus) by phase.", '', '| Group | Behavior | Tithes | Spoils | Other | Weeks 1–48 | 1–60 | 49–64 |', '| --- | --- | --- | --- | --- | --- | --- | --- |']
  for (const { label, runs } of groups) {
    const share = (k: 'behavior' | 'tithe' | 'spoils' | 'other'): string => pct(median(runs.map((r) => {
      const i = r.measures.income as NonNullable<Measures['income']>
      return i[k] / Math.max(1, i.behavior + i.tithe + i.spoils + i.other)
    })))
    const phase = (from: number, to: number): string => f2(mean(runs.filter((r) => r.incomeBase.length >= to).map((r) => r.incomeBase.slice(from - 1, to).reduce((s, x) => s + x, 0) / Math.max(1, r.benchmarkGrace.slice(from - 1, to).reduce((s, x) => s + x, 0)))))
    lines.push(`| ${label} | ${share('behavior')} | ${share('tithe')} | ${share('spoils')} | ${share('other')} | ${phase(1, 48)} | ${phase(1, 60)} | ${phase(49, 64)} |`)
  }
  return lines
}

function sumOf(runs: readonly RunResult[], f: (w: Measures['weeks'][number]) => number): number {
  return runs.reduce((s, r) => s + r.measures.weeks.reduce((t, w) => t + f(w), 0), 0)
}

/** Patch 3's siege measures for Steadfast (spec section 2 item 6): assault days spent on each hex taken by daily assault. */
function siegeLines(steadfast: readonly RunResult[]): string[] {
  const days = Array.from({ length: SIEGE_DAYS_CAP + 1 }, (_, d) => steadfast.reduce((s, r) => s + (r.measures.siegeDays[d] ?? 0), 0))
  const taken = days.reduce((s, v) => s + v, 0)
  const share = (from: number, to: number): string => pct(days.slice(from, to + 1).reduce((s, v) => s + v, 0) / Math.max(1, taken))
  const meanDays = days.reduce((s, v, d) => s + v * d, 0) / Math.max(1, taken)
  const wins = steadfast.reduce((s, r) => ({ rout: s.rout + r.measures.assaultWins.rout, nonRout: s.nonRout + r.measures.assaultWins.nonRout }), { rout: 0, nonRout: 0 })
  const counter = steadfast.reduce((s, r) => ({ held: s.held + r.measures.counterattacks.held, lost: s.lost + r.measures.counterattacks.lost }), { held: 0, lost: 0 })
  const fell = steadfast.reduce((s, r) => s + r.measures.fallbacks.posted, 0)
  const weeksRun = steadfast.reduce((s, r) => s + Math.max(1, r.measures.days.length / WEEK), 0)
  return [
    '## Steadfast, sieges',
    '',
    '| Measure | Value |',
    '| --- | --- |',
    `| Hexes taken by daily assault | ${taken} (${pct(wins.rout / Math.max(1, wins.rout + wins.nonRout))} by a rout) |`,
    `| Assault days spent on each: 1; 2 to 3; 4 to ${SIEGE_DAYS_CAP - 1}; ${SIEGE_DAYS_CAP} or more | ${share(1, 1)}; ${share(2, 3)}; ${share(4, SIEGE_DAYS_CAP - 1)}; ${share(SIEGE_DAYS_CAP, SIEGE_DAYS_CAP)} |`,
    `| Assault days per hex taken (mean; ${SIEGE_DAYS_CAP} or more counted as ${SIEGE_DAYS_CAP}) | ${f2(meanDays)} |`,
    `| Fallbacks a week (D-24) | ${f1(fell / weeksRun)} |`,
    `| Counterattacks a week; held; lost | ${f2((counter.held + counter.lost) / weeksRun)}; ${pct(counter.held / Math.max(1, counter.held + counter.lost))}; ${pct(counter.lost / Math.max(1, counter.held + counter.lost))} |`
  ]
}

const HEX_DEEDS: readonly DeedKind[] = ['hexTaken', 'strongholdTaken']
const BATTLE_DEEDS: readonly DeedKind[] = ['battleWon', 'heldAgainstBeasts', 'heldAgainstMythic', 'counterattackHeld', 'grandBattleWon']
/** Patch 4's signature deeds (D-34), each to its rival's path alone. */
const SIGNATURE_DEEDS: readonly DeedKind[] = ['battleLost', 'retaken', 'dealTaken', 'bargain', 'bribeBeaten', 'counterBidBeaten', 'wallsBroken', 'siegeEndured', 'siegeBroken', 'surgeWeathered', 'surgeSeized', 'ritualEndured', 'summonedDefeated']

/** The Renown mix (P2-13; Patch 3's deeds, D-25; Patch 4's signatures, D-34): each deed's share of the Renown posted, for Steadfast and the one-path players. */
export function deedLines(results: readonly RunResult[]): string[] {
  const onePath = new Set<string>(RIVAL_IDS.map((r) => `paths:${r}`))
  const groups = [
    results.filter((r) => r.profile === 'steadfast' && r.policy === 'greedy'),
    results.filter((r) => r.profile === 'steadfast' && onePath.has(r.policy))
  ].map((runs) => {
    const mix: Record<string, number> = {}
    for (const r of runs) for (const [k, v] of Object.entries(r.measures.deedMix ?? {})) mix[k] = (mix[k] ?? 0) + v
    const total = Object.values(mix).reduce((s, v) => s + v, 0)
    return { runs: runs.length, total, share: (kinds: readonly DeedKind[]): string => pct(kinds.reduce((s, k) => s + (mix[k] ?? 0), 0) / Math.max(1, total)) }
  })
  const line = (label: string, kinds: readonly DeedKind[]): string => `| ${label} | ${groups.map((g) => g.share(kinds)).join(' | ')} |`
  return [
    '## Renown by deed',
    '',
    'Each deed’s share of the Renown posted, every path summed (P2-13: hexes about 50%, battles about 30%, resolving 15 to 20%).',
    '',
    '| Deed | Steadfast | One path |',
    '| --- | --- | --- |',
    line('**Hexes**', HEX_DEEDS),
    ...HEX_DEEDS.map((k) => line(k, [k])),
    line('**Battles**', BATTLE_DEEDS),
    ...BATTLE_DEEDS.map((k) => line(k, [k])),
    line('**Resolving a rival**', ['resolved']),
    line('**Signature deeds** (D-34)', SIGNATURE_DEEDS),
    ...SIGNATURE_DEEDS.map((k) => line(k, [k])),
    `| Renown a campaign (mean) | ${groups.map((g) => f1(g.total / Math.max(1, g.runs))).join(' | ')} |`
  ]
}

/** Writes the targets report; returns the file written. */
export function writeTargets(results: readonly RunResult[], meta: { seeds: number; weeks: number; seconds: number }, outDir: string): string {
  const rows = targetRows(results)
  const verdict = (p: boolean | null): string => (p === null ? '—' : p ? 'met' : 'missed')
  const lines = [
    `# The blueprint's targets, rules ${RULES.ruleVersion}`,
    '',
    `Generated by \`npm run sim -- --targets\` (\`sim/targets.ts\`); do not edit by hand. ${results.length} campaigns: Perfect, Steadfast, Committed and Wavering with the greedy player (${meta.seeds} seeds each; Steadfast to ${G08_SEEDS} seeds for G-08 alone, C-72), Steadfast steered along one path (each rival), two (Orc and Goblin; Dwarf and Archmage), three, and all four (${meta.weeks}-week horizon); and the smarter player for every profile, and steered along each of those mixes (${meta.weeks < USUAL_WEEKS ? meta.weeks : Math.max(meta.weeks, LONG_WEEKS)}-week horizon; Patch 5, P5-01) (${meta.seconds} s). The targets are \`docs/redesign/blueprint.md\` section 7; "Steadfast" is its greedy player, and the focused player follows one rival's path. G-01 and G-03 are counted as \`docs/redesign/patch-3-spec.md\` C-27 rules: a Breach day (a repulse that left its target within the next day's reach) is player-view meaningful, and a target is a hex that falls within ${RULES.autoplay.siegeHorizon} assault days; the strict readings are given beside them.`,
    '',
    '| # | Target | Measure | Value | Verdict |',
    '| --- | --- | --- | --- | --- |',
    ...rows.map((r) => `| ${r.id} | ${r.target} | ${r.measure} | ${r.value} | ${verdict(r.pass)} |`),
    '',
    '## Steadfast, by month',
    '',
    `Days a week. Meaningful counts a Breach; strict doesn't. No target: no hex falls within ${RULES.autoplay.siegeHorizon} assault days; no reach: no hex falls today.`,
    '',
    '| Month | Meaningful | Strict | Breach | No target | No reach | Land days | Net hexes | Held (median) |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |'
  ]
  // The run's own seeds (those Perfect has); G-08's further seeds are read by G-08 alone (C-72).
  const perfectSeeds = results.filter((r) => r.profile === 'perfect' && r.policy === 'greedy').map((r) => r.seed)
  const mainSeeds = perfectSeeds.length > 0 ? Math.max(...perfectSeeds) : Number.POSITIVE_INFINITY
  const steadfast = results.filter((r) => r.profile === 'steadfast' && r.policy === 'greedy' && r.seed <= mainSeeds)
  const months = Math.ceil(max(steadfast.map((r) => r.measures.days.length)) / (WEEK * MONTH))
  for (let m = 0; m < months; m++) {
    const slice = (r: RunResult): number[] => r.measures.days.slice(m * WEEK * MONTH, (m + 1) * WEEK * MONTH)
    const alive = steadfast.filter((r) => slice(r).length === WEEK * MONTH)
    if (alive.length === 0) break
    const perWeek = (mask: number): number => mean(alive.map((r) => (count(slice(r), mask) / MONTH)))
    const held = alive.map((r) => r.measures.weeks.find((w) => w.week === (m + 1) * MONTH)?.held ?? Number.NaN)
    const before = alive.map((r) => r.measures.weeks.find((w) => w.week === m * MONTH)?.held ?? r.measures.weeks[0]?.held ?? 0)
    lines.push(`| ${m + 1} | ${f1(perWeek(PLAYER_VIEW))} | ${f1(perWeek(PLAYER_VIEW_STRICT))} | ${f1(perWeek(LABEL.breach))} | ${f1(perWeek(LABEL.noTarget))} | ${f1(perWeek(LABEL.noReach))} | ${f1(perWeek(LABEL.land))} | ${f1(mean(held.map((h, i) => (h - before[i]) / MONTH)))} | ${median(held)} |`)
  }
  lines.push('', ...siegeLines(steadfast), '', ...marchLines(steadfast), '', ...termsLines(results), '', ...deedLines(results), '', ...lengthLines(results), '', ...worldLines(results), '', ...respectLines(results), '', ...incomeLines(results), '')
  fs.mkdirSync(outDir, { recursive: true })
  const file = path.join(outDir, `targets-${RULES.ruleVersion}.md`)
  fs.writeFileSync(file, lines.join('\n'))
  return file
}
