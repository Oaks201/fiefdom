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
import { RIVAL_IDS } from '../src/renderer/src/lib/game/types'
import type { RunOptions, RunResult } from './campaign'
import { LABEL, type Measures } from './measure'
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
const PLAYER_VIEW = LABEL.land | LABEL.grand | LABEL.build | LABEL.choice
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

  // G-01
  const meaningful = steadfast.flatMap((r) => weeksOf(r.measures).map((w) => count(w, PLAYER_VIEW)))
  const withAuto = steadfast.flatMap((r) => weeksOf(r.measures).map((w) => count(w, PLAYER_VIEW | LABEL.doubt)))
  const g01Mean = mean(meaningful)
  const g01Share = meaningful.filter((v) => v >= 5).length / meaningful.length
  rows.push(row('G-01', 'Something meaningful on 5+ days a week', 'Player-view meaningful days a week (mean; weeks with 5+); incl. auto battles', `${f1(g01Mean)}; ${pct(g01Share)} (${f1(mean(withAuto))})`, g01Mean >= 5 && g01Share >= 0.7))

  // G-02
  const quiet = steadfast.map((r) => longestRun(r.measures.days, (d) => (d & ANYTHING) === 0))
  const noLandWeeks = steadfast.map((r) => {
    const days = r.measures.days.slice(0, Math.max(0, r.measures.days.length - LAST_MONTH_DAYS))
    const weeks: boolean[] = []
    for (let i = 0; i < days.length; i += WEEK) weeks.push(count(days.slice(i, i + WEEK), LABEL.land) === 0)
    return longestRun(weeks.map((w) => (w ? 1 : 0)), (d) => d === 1)
  })
  rows.push(row('G-02', 'No dead stretches', 'Longest run of days with nothing (median; worst); longest run of weeks with no land before the last month (worst)', `${median(quiet)}; ${max(quiet)}; ${max(noLandWeeks)} weeks`, median(quiet) <= 4 && max(quiet) <= 7 && max(noLandWeeks) < 2))

  // G-03
  const noReach = steadfast.flatMap((r) => weeksOf(r.measures).map((w) => count(w, LABEL.noReach)))
  rows.push(row('G-03', 'A target every day', 'Days a week with no hex in reach (mean)', f1(mean(noReach)), mean(noReach) <= 1))

  // G-04
  const net = steadfast.flatMap((r) => {
    const w = r.measures.weeks.filter((x) => x.week >= 5 && x.week <= 52)
    return w.length > 1 ? [(w[w.length - 1].held - w[0].held) / (w.length - 1)] : []
  })
  const landDays = steadfast.flatMap((r) => weeksOf(r.measures).map((w) => count(w, LABEL.land)))
  rows.push(row('G-04', 'Land every week', 'Net hexes a week, weeks 5–52 (median); days a week land changes hands (mean)', `${f2(median(net))}; ${f1(mean(landDays))}`, median(net) >= 3 && median(net) <= 4 && mean(landDays) >= 3))

  // G-05
  // The rival marches (a lair's wedge is all taken but for its Mouth, by design), at victory or else the horizon.
  const minUnheld = steadfast.map((r) => Math.min(...Object.entries(r.measures.unheld).filter(([k]) => (RIVAL_IDS as readonly string[]).includes(k)).map(([, v]) => v)))
  const wins = steadfast.filter((r) => r.wonWeek !== undefined).length
  const perfectAll = of('perfect', 'greedy').map((r) => r.measures.weeks.find((w) => w.claimableHeld >= ALL_HELD * w.claimable)?.week ?? Number.POSITIVE_INFINITY)
  rows.push(row('G-05', 'The map lasts', `At Steadfast's end (victory in ${wins} of ${steadfast.length}, else the horizon), the least-held rival march's unheld share (median); Perfect's first week holding (nearly) every claimable hex (earliest)`, `${pct(median(minUnheld))}; week ${Number.isFinite(Math.min(...perfectAll)) ? Math.min(...perfectAll) : 'never'}`, median(minUnheld) >= 0.1 && Math.min(...perfectAll) >= 52))

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

  rows.push(row('G-09', 'Routed enemies change choices', 'Fallbacks (Patch 3)', 'not yet built', null))
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

/** Writes the targets report; returns the file written. */
export function writeTargets(results: readonly RunResult[], meta: { seeds: number; weeks: number; seconds: number }, outDir: string): string {
  const rows = targetRows(results)
  const verdict = (p: boolean | null): string => (p === null ? '—' : p ? 'met' : 'missed')
  const lines = [
    `# The blueprint's targets, rules ${RULES.ruleVersion}`,
    '',
    `Generated by \`npm run sim -- --targets\` (\`sim/targets.ts\`); do not edit by hand. ${results.length} campaigns: Perfect, Steadfast, Committed and Wavering with the greedy player (${meta.seeds} seeds each), and Steadfast steered along one path (each rival), two (Orc and Goblin; Dwarf and Archmage), three, and all four (${meta.weeks}-week horizon; ${meta.seconds} s). The targets are \`docs/redesign/blueprint.md\` section 7; "Steadfast" is its greedy player, and the focused player follows one rival's path.`,
    '',
    '| # | Target | Measure | Value | Verdict |',
    '| --- | --- | --- | --- | --- |',
    ...rows.map((r) => `| ${r.id} | ${r.target} | ${r.measure} | ${r.value} | ${verdict(r.pass)} |`),
    '',
    '## Steadfast, by month',
    '',
    '| Month | Meaningful days a week | No hex in reach | Land days | Net hexes | Held (median) |',
    '| --- | --- | --- | --- | --- | --- |'
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
    lines.push(`| ${m + 1} | ${f1(perWeek(PLAYER_VIEW))} | ${f1(perWeek(LABEL.noReach))} | ${f1(perWeek(LABEL.land))} | ${f1(mean(held.map((h, i) => (h - before[i]) / MONTH)))} | ${median(held)} |`)
  }
  lines.push('')
  fs.mkdirSync(outDir, { recursive: true })
  const file = path.join(outDir, `targets-${RULES.ruleVersion}.md`)
  fs.writeFileSync(file, lines.join('\n'))
  return file
}
