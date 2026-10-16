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
import { RIVAL_IDS, type DeedKind } from '../src/renderer/src/lib/game/types'
import type { RunOptions, RunResult } from './campaign'
import { G05_WEEK, LABEL, SIEGE_DAYS_CAP, type Measures } from './measure'
import type { PolicyId } from './policy'
import type { ProfileId } from './profiles'

/** The campaigns the targets need. */
export function targetPlan(seeds: number, weeks: number): RunOptions[] {
  const runs: RunOptions[] = []
  const add = (profile: ProfileId, policy: PolicyId, n: number): void => {
    for (let seed = 1; seed <= n; seed++) runs.push({ seed, profile, policy, weeks, variant: 'base' })
  }
  for (const p of ['perfect', 'steadfast', 'committed', 'wavering'] as ProfileId[]) add(p, 'greedy', seeds)
  const half = Math.max(1, Math.round(seeds / 2))
  for (const r of RIVAL_IDS) add('steadfast', `paths:${r}`, half)
  add('steadfast', 'paths:orc+goblin', half)
  add('steadfast', 'paths:dwarf+archmage', half)
  add('steadfast', 'paths:orc+goblin+dwarf', half)
  add('steadfast', 'paths:all', seeds)
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
  const steadfast = of('steadfast', 'greedy')
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
  rows.push(row('G-07', 'Every mix can win (Patch 2 half: no stalls on one path)', 'One-path players with all four buildings at Tier III by week 26; with hexes held rising every month to week 40', `${pct(tierIII)}; ${pct(rising)}`, tierIII >= 0.9 && rising >= 0.9))

  // G-08
  const mid = steadfast.flatMap((r) => r.measures.weeks.filter((w) => w.week >= 13 && w.week <= 36).map((w) => w.doubtDefenses))
  const lostIn = (test: (v: number) => boolean): number => mean(steadfast.flatMap((r) => r.measures.weeks.filter((w) => test(w.valor)).map((w) => w.lost)))
  const bad = lostIn((v) => v < BAD_VALOR)
  const good = lostIn((v) => v > GOOD_VALOR)
  const lostShare = sumOf(steadfast, (w) => w.lost) / Math.max(1, sumOf(steadfast, (w) => w.gained))
  rows.push(row('G-08', 'Defending matters', 'Mid-game defenses a week banded Matched or worse (mean); land lost a week in bad vs good weeks; land lost ÷ gained', `${f1(mean(mid))}; ${f2(bad)} vs ${f2(good)}; ${pct(lostShare)}`, mean(mid) >= 2 && bad >= 2 * good && lostShare <= 0.25))

  // G-09: fallbacks come in Patch 3's stage 4; until then, the wins they will be counted against.
  // G-09: fallbacks after non-rout assault wins, and the next day's target changed by them.
  const nonRoutWins = steadfast.reduce((s, r) => s + r.measures.assaultWins.nonRout, 0)
  const fell = steadfast.reduce((s, r) => ({ posted: s.posted + r.measures.fallbacks.posted, dawns: s.dawns + r.measures.fallbacks.dawns, changed: s.changed + r.measures.fallbacks.changed }), { posted: 0, dawns: 0, changed: 0 })
  const fellShare = fell.posted / Math.max(1, nonRoutWins)
  const changedShare = fell.changed / Math.max(1, fell.dawns)
  rows.push(row('G-09', 'Routed enemies change choices', "Non-rout assault wins followed by a fallback; dawns after a fallback whose target differs from the one chosen without it", `${pct(fellShare)}; ${pct(changedShare)}`, fellShare >= 0.6 && changedShare >= 0.2))
  rows.push(row('G-10', 'The rivals fight differently', 'March rules (Patch 4)', 'not yet built', null))

  // G-11
  const wonWeeks = (p: ProfileId): number[] => of(p, 'greedy').flatMap((r) => (r.wonWeek !== undefined ? [r.wonWeek] : []))
  const winShare = (p: ProfileId): number => wonWeeks(p).length / Math.max(1, of(p, 'greedy').length)
  rows.push(row('G-11', 'Campaign length (Patch 5)', 'Median victory week and win share: Perfect; Steadfast; Committed', `${median(wonWeeks('perfect'))} (${pct(winShare('perfect'))}); ${median(wonWeeks('steadfast'))} (${pct(winShare('steadfast'))}); ${median(wonWeeks('committed'))} (${pct(winShare('committed'))})`, null))

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
  return rows
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

/** The Renown mix (P2-13; Patch 3's deeds, D-25): each deed's share of the Renown posted, for Steadfast and the one-path players. */
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
    `Generated by \`npm run sim -- --targets\` (\`sim/targets.ts\`); do not edit by hand. ${results.length} campaigns: Perfect, Steadfast, Committed and Wavering with the greedy player (${meta.seeds} seeds each), and Steadfast steered along one path (each rival), two (Orc and Goblin; Dwarf and Archmage), three, and all four (${meta.weeks}-week horizon; ${meta.seconds} s). The targets are \`docs/redesign/blueprint.md\` section 7; "Steadfast" is its greedy player, and the focused player follows one rival's path. G-01 and G-03 are counted as \`docs/redesign/patch-3-spec.md\` C-27 rules: a Breach day (a repulse that left its target within the next day's reach) is player-view meaningful, and a target is a hex that falls within ${RULES.autoplay.siegeHorizon} assault days; the strict readings are given beside them.`,
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
  const steadfast = results.filter((r) => r.profile === 'steadfast' && r.policy === 'greedy')
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
  lines.push('', ...siegeLines(steadfast), '', ...deedLines(results), '')
  fs.mkdirSync(outDir, { recursive: true })
  const file = path.join(outDir, `targets-${RULES.ruleVersion}.md`)
  fs.writeFileSync(file, lines.join('\n'))
  return file
}
