/**
 * The tuning report (T13 scope 7): `docs/game/sim/report.md` and the CSVs in `docs/game/sim/data/`,
 * built from the simulator's results. Pure apart from writing the files: the same results always
 * give byte-identical CSVs. The report's prose quotes the run's time, which the CSVs never hold.
 *
 * Reading conventions, stated again in the report:
 * - A median week's "80% interval" is the 10th to 90th percentile of the campaigns' own values.
 * - A share's "80% interval" is the 80% Wilson score interval.
 * - Hit or miss is judged on the greedy policy, the book's primary player (Ch 15 step 2).
 */
import fs from 'node:fs'
import path from 'node:path'
import { benchmarkContractMultiplier, benchmarkIncome } from '../src/renderer/src/lib/game/rivals'
import { RULES } from '../src/renderer/src/lib/game/rules'
import type { RunResult } from './campaign'
import { BASE, INCOME, type Lever } from './overrides'
import type { PolicyId } from './policy'
import { PROFILES, type ProfileId } from './profiles'

export interface VariantInfo {
  variant: string
  lever: Lever['id']
  label: string
  source: string
  delta: number
  /** The lever's values as the worker loaded them. */
  values: number[]
}

export interface RunMeta {
  options: { runs: number; pushRuns: number; incomeRuns: number; sweepRuns: number; weeks: number; incomeWeeks: number }
  seconds: number
  workers: number
  machine: { cpus: number; model: string; node: string; platform: string }
  variants: VariantInfo[]
}

// ── Statistics ───────────────────────────────────────────────────────────────

const Z80 = 1.2816
const PERCENT = 100
const MONTH_WEEKS = 4
const BOOK_WEEKS = 48

function quantile(values: readonly number[], p: number): number {
  if (values.length === 0) return Number.NaN
  const s = [...values].sort((a, b) => a - b)
  const at = (s.length - 1) * p
  const lo = Math.floor(at)
  const hi = Math.ceil(at)
  return s[lo] + (s[hi] - s[lo]) * (at - lo)
}

const median = (v: readonly number[]): number => quantile(v, 0.5)
const mean = (v: readonly number[]): number => (v.length === 0 ? Number.NaN : v.reduce((s, x) => s + x, 0) / v.length)
const sum = (v: readonly number[]): number => v.reduce((s, x) => s + x, 0)

/** The 80% Wilson score interval of k successes in n. */
function wilson(k: number, n: number): [number, number] {
  if (n === 0) return [Number.NaN, Number.NaN]
  const p = k / n
  const z2 = Z80 * Z80
  const centre = (p + z2 / (2 * n)) / (1 + z2 / n)
  const half = (Z80 * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n)
  return [Math.max(0, centre - half), Math.min(1, centre + half)]
}

function fmt(v: number, places = 0): string {
  return Number.isFinite(v) ? v.toFixed(places) : '–'
}
const pct = (v: number, places = 0): string => (Number.isFinite(v) ? `${(v * PERCENT).toFixed(places)}%` : '–')

// ── Selections ───────────────────────────────────────────────────────────────

function pick(results: readonly RunResult[], variant: string, profile?: ProfileId, policy?: PolicyId): RunResult[] {
  return results.filter((r) => r.variant === variant && (!profile || r.profile === profile) && (!policy || r.policy === policy))
}

function sorted(results: readonly RunResult[]): RunResult[] {
  return [...results].sort((a, b) => a.variant.localeCompare(b.variant) || a.profile.localeCompare(b.profile) || a.policy.localeCompare(b.policy) || a.seed - b.seed)
}

interface Outcome {
  n: number
  winWeeks: number[]
  won: number
  fallen: number
  fallWeeks: number[]
}

function outcome(runs: readonly RunResult[]): Outcome {
  const winWeeks = runs.flatMap((r) => (r.wonWeek !== undefined ? [r.wonWeek] : []))
  const fallWeeks = runs.flatMap((r) => (r.fallWeek !== undefined ? [r.fallWeek] : []))
  return { n: runs.length, winWeeks, won: winWeeks.length, fallen: fallWeeks.length, fallWeeks }
}

/** Grand Battles a month over the months a campaign was played. */
function battlesPerMonth(r: RunResult): number {
  return r.grandBattles.fought / Math.max(1, r.lastWeek / MONTH_WEEKS)
}

// ── Targets (Ch 15) ──────────────────────────────────────────────────────────

type Range = { lo?: number; hi?: number }

interface TargetRow {
  profile: ProfileId | 'all'
  metric: string
  target: string
  range: Range | null
  /** greedy, smarter, push */
  values: Record<PolicyId, { value: number; lo: number; hi: number; n: number }>
  kind: 'week' | 'share' | 'rate' | 'count'
}

const BOOK_TARGETS: { profile: ProfileId; winWeek: [string, Range | null]; win70: [string, Range]; loss: [string, Range] }[] = [
  { profile: 'perfect', winWeek: ['36 to 40', { lo: 36, hi: 40 }], win70: ['100%', { lo: 1 }], loss: ['0%', { hi: 0 }] },
  { profile: 'steadfast', winWeek: ['44 to 48', { lo: 44, hi: 48 }], win70: ['95% or more', { lo: 0.95 }], loss: ['under 5%', { hi: 0.05 }] },
  { profile: 'committed', winWeek: ['52 to 62', { lo: 52, hi: 62 }], win70: ['60 to 75%', { lo: 0.6, hi: 0.75 }], loss: ['20 to 35%', { lo: 0.2, hi: 0.35 }] },
  { profile: 'wavering', winWeek: ['rarely', null], win70: ['under 15%', { hi: 0.15 }], loss: ['60 to 80%', { lo: 0.6, hi: 0.8 }] },
  { profile: 'casual', winWeek: ['never', null], win70: ['0%', { hi: 0 }], loss: ['85% or more', { lo: 0.85 }] }
]

const POLICIES: PolicyId[] = ['greedy', 'smarter', 'push']

function inRange(v: number, r: Range | null): boolean | null {
  if (!r || !Number.isFinite(v)) return null
  const eps = 1e-9
  return (r.lo === undefined || v >= r.lo - eps) && (r.hi === undefined || v <= r.hi + eps)
}

function weekStat(weeks: number[]): { value: number; lo: number; hi: number; n: number } {
  return { value: median(weeks), lo: quantile(weeks, 0.1), hi: quantile(weeks, 0.9), n: weeks.length }
}

function shareStat(k: number, n: number): { value: number; lo: number; hi: number; n: number } {
  const [lo, hi] = wilson(k, n)
  return { value: n === 0 ? Number.NaN : k / n, lo, hi, n }
}

/** Relative finishing-time saving of smarter over greedy, paired by seed (both won). */
function skillValue(results: readonly RunResult[], profile: ProfileId, other: PolicyId): { value: number; lo: number; hi: number; n: number } {
  const greedy = new Map(pick(results, BASE, profile, 'greedy').map((r) => [r.seed, r]))
  const diffs: number[] = []
  for (const s of pick(results, BASE, profile, other)) {
    const g = greedy.get(s.seed)
    if (g?.wonWeek !== undefined && s.wonWeek !== undefined) diffs.push((g.wonWeek - s.wonWeek) / g.wonWeek)
  }
  return { value: median(diffs), lo: quantile(diffs, 0.1), hi: quantile(diffs, 0.9), n: diffs.length }
}

function targetRows(results: readonly RunResult[]): TargetRow[] {
  const rows: TargetRow[] = []
  const by = (profile: ProfileId, f: (runs: RunResult[]) => { value: number; lo: number; hi: number; n: number }): TargetRow['values'] =>
    Object.fromEntries(POLICIES.map((p) => [p, f(pick(results, BASE, profile, p))])) as TargetRow['values']
  for (const t of BOOK_TARGETS) {
    rows.push({ profile: t.profile, metric: 'Win, median week', target: t.winWeek[0], range: t.winWeek[1], kind: 'week', values: by(t.profile, (runs) => weekStat(outcome(runs).winWeeks)) })
    rows.push({ profile: t.profile, metric: 'Win within 70 weeks', target: t.win70[0], range: t.win70[1], kind: 'share', values: by(t.profile, (runs) => shareStat(outcome(runs).won, runs.length)) })
    rows.push({ profile: t.profile, metric: 'Loss to Ascendancy', target: t.loss[0], range: t.loss[1], kind: 'share', values: by(t.profile, (runs) => shareStat(outcome(runs).fallen, runs.length)) })
  }
  const allFalls = (runs: RunResult[]): { value: number; lo: number; hi: number; n: number } => {
    const weeks = runs.flatMap((r) => (r.fallWeek !== undefined ? [r.fallWeek] : []))
    return { value: weeks.length > 0 ? Math.min(...weeks) : Number.NaN, lo: Number.NaN, hi: Number.NaN, n: weeks.length }
  }
  rows.push({
    profile: 'all',
    metric: 'Earliest loss, any profile (week)',
    target: 'never before 36',
    range: { lo: 36 },
    kind: 'week',
    values: Object.fromEntries(POLICIES.map((p) => [p, allFalls(results.filter((r) => r.variant === BASE && r.policy === p))])) as TargetRow['values']
  })
  rows.push({
    profile: 'steadfast',
    metric: 'Grand Battles a month',
    target: '1 to 3',
    range: { lo: 1, hi: 3 },
    kind: 'rate',
    values: by('steadfast', (runs) => {
      const v = runs.map(battlesPerMonth)
      return { value: mean(v), lo: quantile(v, 0.1), hi: quantile(v, 0.9), n: v.length }
    })
  })
  rows.push({
    profile: 'steadfast',
    metric: 'Campaigns with a coalition',
    target: '80% or more',
    range: { lo: 0.8 },
    kind: 'share',
    values: by('steadfast', (runs) => shareStat(runs.filter((r) => r.coalitions.length > 0).length, runs.length))
  })
  for (const profile of ['steadfast', 'committed'] as ProfileId[]) {
    const smarter = skillValue(results, profile, 'smarter')
    rows.push({
      profile,
      metric: 'Skill value: smarter vs greedy finishing time',
      target: '10 to 20%',
      range: { lo: 0.1, hi: 0.2 },
      kind: 'share',
      // The skill value is a comparison, so the greedy column carries it.
      values: { greedy: smarter, smarter, push: skillValue(results, profile, 'push') }
    })
  }
  return rows
}

function cell(row: TargetRow, p: PolicyId): string {
  const v = row.values[p]
  if (row.kind === 'week') return v.n === 0 ? 'none' : `${fmt(v.value)}${Number.isFinite(v.lo) ? ` [${fmt(v.lo)}–${fmt(v.hi)}]` : ''}`
  if (row.kind === 'rate') return `${fmt(v.value, 2)} [${fmt(v.lo, 2)}–${fmt(v.hi, 2)}]`
  return `${pct(v.value)} [${pct(v.lo)}–${pct(v.hi)}]`
}

function verdict(row: TargetRow): string {
  const v = row.values.greedy
  if (row.range === null) {
    if (row.target === 'never') return v.n === 0 ? 'hit' : 'miss'
    return v.n === 0 ? 'hit' : 'see win share'
  }
  if (row.kind === 'week' && v.n === 0) return row.metric.startsWith('Earliest loss') ? 'hit' : 'miss (no wins)'
  const ok = inRange(v.value, row.range)
  return ok === null ? '–' : ok ? 'hit' : 'miss'
}

// ── Income check (Ch 15 table) ───────────────────────────────────────────────

const BOOK_INCOME: { profile: ProfileId; player: number; rival: number; ratio: number }[] = [
  { profile: 'steadfast', player: 19_091, rival: 16_754, ratio: 1.14 },
  { profile: 'steadfastPlateau', player: 17_939, rival: 16_754, ratio: 1.07 },
  { profile: 'committed', player: 15_467, rival: 16_754, ratio: 0.92 },
  { profile: 'wavering', player: 11_488, rival: 16_754, ratio: 0.69 }
]
const BOOK_WEEKLY = [
  { week: 4, player: 374, rival: 292 },
  { week: 40, player: 409, rival: 386 }
]
const TOLERANCE = 0.03

function incomeOver(r: RunResult, weeks: number, base: boolean): number {
  return sum((base ? r.incomeBase : r.income).slice(0, weeks))
}

// ── Sweeps ───────────────────────────────────────────────────────────────────

interface SweepCell {
  variant: string
  lever: string
  delta: number
  profile: ProfileId
  n: number
  medianWin: number
  win: number
  loss: number
}

function sweepCell(runs: RunResult[], variant: string, lever: string, delta: number, profile: ProfileId): SweepCell {
  const o = outcome(runs)
  return { variant, lever, delta, profile, n: o.n, medianWin: median(o.winWeeks), win: o.n ? o.won / o.n : Number.NaN, loss: o.n ? o.fallen / o.n : Number.NaN }
}

/** How far a value sits outside a target range, in units of `scale` (0 inside). */
function miss(v: number, r: Range | null, scale: number): number {
  if (!r || !Number.isFinite(v)) return 0
  if (r.lo !== undefined && v < r.lo) return (r.lo - v) / scale
  if (r.hi !== undefined && v > r.hi) return (v - r.hi) / scale
  return 0
}

const WEEK_SCALE = 4
const SHARE_SCALE = 0.1
/** A campaign with no wins scores its win week as the horizon. */
function distance(cells: SweepCell[], horizon: number): number {
  let d = 0
  for (const c of cells) {
    const t = BOOK_TARGETS.find((x) => x.profile === c.profile)
    if (!t) continue
    d += miss(Number.isFinite(c.medianWin) ? c.medianWin : horizon, t.winWeek[1], WEEK_SCALE) + miss(c.win, t.win70[1], SHARE_SCALE) + miss(c.loss, t.loss[1], SHARE_SCALE)
  }
  return d
}

// ── Writing ──────────────────────────────────────────────────────────────────

function csv(rows: (string | number | undefined)[][]): string {
  const esc = (v: string | number | undefined): string => {
    if (v === undefined) return ''
    const s = typeof v === 'number' ? (Number.isFinite(v) ? String(Math.round(v * 10_000) / 10_000) : '') : v
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return rows.map((r) => r.map(esc).join(',')).join('\n') + '\n'
}

function table(head: string[], rows: string[][]): string {
  return [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n')
}

const PROFILE_NAME = Object.fromEntries(PROFILES.map((p) => [p.id, p.name])) as Record<ProfileId, string>

/** Writes the report and its CSVs into `outDir`; returns the files written. */
export function writeReport(all: readonly RunResult[], meta: RunMeta, outDir: string): string[] {
  const results = sorted(all)
  const dataDir = path.join(outDir, 'data')
  fs.mkdirSync(dataDir, { recursive: true })
  const files: string[] = []
  const write = (file: string, text: string): void => {
    fs.writeFileSync(file, text)
    files.push(file)
  }
  const base = results.filter((r) => r.variant === BASE)
  const horizon = meta.options.weeks
  const md: string[] = []
  const say = (...lines: string[]): void => void md.push(...lines, '')

  // runs.csv
  write(
    path.join(dataDir, 'runs.csv'),
    csv([
      ['variant', 'profile', 'policy', 'seed', 'status', 'last_week', 'won_week', 'fall_week', 'ultimatums', 'sieges_won', 'sieges_lost', 'resolutions', 'coalitions', 'grand_fought', 'grand_won', 'border_campaign_hexes', 'first_month_assaults', 'first_month_repulsed', 'assaults', 'repulsed', 'income_48', 'income_base_48', 'benchmark_48', 'mean_rc', 'milestones', 'first_trophy_week', 'max_ascendancy_streak', 'tier_iv_dominion_weeks', 'violations'],
      ...results.map((r) => [
        r.variant,
        r.profile,
        r.policy,
        r.seed,
        r.status,
        r.lastWeek,
        r.wonWeek,
        r.fallWeek,
        r.ultimatums.length,
        r.sieges.filter((s) => s.won).length,
        r.sieges.filter((s) => !s.won).length,
        r.resolutions.map((x) => `${x.rival}:${x.how}:${x.week}`).join(' '),
        r.coalitions.length,
        r.grandBattles.fought,
        r.grandBattles.won,
        r.borderCampaignHexes,
        r.firstMonth.assaults,
        r.firstMonth.repulsed,
        r.assaults.total,
        r.assaults.repulsed,
        incomeOver(r, BOOK_WEEKS, false),
        incomeOver(r, BOOK_WEEKS, true),
        sum(r.benchmark.slice(0, BOOK_WEEKS)),
        r.q,
        r.milestones,
        r.trophyWeeks[0],
        r.maxAscendancyStreak,
        r.binds.tierIVDominionWeeks,
        r.violations.length
      ])
    ])
  )

  // targets.csv
  const targets = targetRows(results)
  write(
    path.join(dataDir, 'targets.csv'),
    csv([
      ['profile', 'metric', 'target', 'policy', 'value', 'interval_lo', 'interval_hi', 'n', 'verdict_greedy'],
      ...targets.flatMap((t) => POLICIES.map((p) => [t.profile, t.metric, t.target, p, t.values[p].value, t.values[p].lo, t.values[p].hi, t.values[p].n, verdict(t)]))
    ])
  )

  // income_by_week.csv
  const incomeRows: (string | number)[][] = [['variant', 'profile', 'policy', 'week', 'player_income_median', 'player_income_no_bonus_median', 'benchmark', 'ratio_median']]
  for (const variant of [BASE, INCOME]) {
    for (const p of PROFILES) {
      const runs = pick(results, variant, p.id, 'greedy')
      if (runs.length === 0) continue
      const weeks = Math.max(...runs.map((r) => r.income.length))
      for (let w = 0; w < weeks; w++) {
        const live = runs.filter((r) => r.income.length > w)
        const bench = live[0]?.benchmark[w] ?? Number.NaN
        incomeRows.push([variant, p.id, 'greedy', w + 1, median(live.map((r) => r.income[w])), median(live.map((r) => r.incomeBase[w])), bench, median(live.map((r) => r.incomeBase[w] / r.benchmark[w]))])
      }
    }
  }
  write(path.join(dataDir, 'income_by_week.csv'), csv(incomeRows))

  // hexes_by_month.csv
  const hexRows: (string | number)[][] = [['profile', 'policy', 'month', 'owner', 'median_hexes', 'campaigns']]
  for (const p of PROFILES) {
    for (const policy of POLICIES) {
      const runs = pick(results, BASE, p.id, policy)
      if (runs.length === 0) continue
      const months = Math.ceil(horizon / MONTH_WEEKS)
      for (let m = 0; m < months; m++) {
        for (const owner of ['player', 'orc', 'goblin', 'dwarf', 'archmage']) {
          // A campaign that ended keeps its last holdings for the months after.
          const v = runs.map((r) => r.hexes[owner][Math.min(m, r.hexes[owner].length - 1)])
          hexRows.push([p.id, policy, m + 1, owner, median(v), runs.length])
        }
      }
    }
  }
  write(path.join(dataDir, 'hexes_by_month.csv'), csv(hexRows))

  // spend.csv
  const categories = [...new Set(base.flatMap((r) => Object.keys(r.spend)))].sort()
  const spendRows: (string | number)[][] = [['profile', 'policy', 'category', 'mean_per_campaign']]
  for (const p of PROFILES) for (const policy of POLICIES) {
    const runs = pick(results, BASE, p.id, policy)
    if (runs.length > 0) for (const c of categories) spendRows.push([p.id, policy, c, mean(runs.map((r) => r.spend[c] ?? 0))])
  }
  write(path.join(dataDir, 'spend.csv'), csv(spendRows))

  // resolutions.csv
  const resRows: (string | number)[][] = [['profile', 'policy', 'rival', 'how', 'share', 'median_week']]
  for (const p of PROFILES) for (const policy of POLICIES) {
    const runs = pick(results, BASE, p.id, policy)
    if (runs.length === 0) continue
    for (const rival of ['orc', 'goblin', 'dwarf', 'archmage']) {
      for (const how of ['conquered', 'abdicated', 'allied', 'unresolved']) {
        const hits = runs.map((r) => r.resolutions.find((x) => x.rival === rival)).filter((x) => (how === 'unresolved' ? x === undefined : x?.how === how))
        resRows.push([p.id, policy, rival, how, hits.length / runs.length, median(hits.flatMap((x) => (x ? [x.week] : [])))])
      }
    }
  }
  write(path.join(dataDir, 'resolutions.csv'), csv(resRows))

  // sweeps.csv
  const sweepProfiles: ProfileId[] = ['steadfast', 'committed']
  const baseCells = (profile: ProfileId): SweepCell => sweepCell(pick(results, BASE, profile, 'greedy').filter((r) => r.seed <= meta.options.sweepRuns), BASE, BASE, 0, profile)
  const cells: SweepCell[] = []
  for (const v of meta.variants) for (const profile of sweepProfiles) cells.push(sweepCell(pick(results, v.variant, profile, 'greedy'), v.variant, v.lever, v.delta, profile))
  write(
    path.join(dataDir, 'sweeps.csv'),
    csv([
      ['lever', 'delta_percent', 'values', 'profile', 'campaigns', 'median_win_week', 'win_share', 'loss_share'],
      ...sweepProfiles.map((p) => baseCells(p)).map((c) => [BASE, 0, '', c.profile, c.n, c.medianWin, c.win, c.loss]),
      ...cells.map((c) => [c.lever, c.delta, (meta.variants.find((v) => v.variant === c.variant)?.values ?? []).join('/'), c.profile, c.n, c.medianWin, c.win, c.loss])
    ])
  )

  // ── report.md ──────────────────────────────────────────────────────────────
  const count = (variant: string): number => results.filter((r) => r.variant === variant).length
  const sweepCount = results.filter((r) => r.variant !== BASE && r.variant !== INCOME).length
  say('# Simulator tuning report (T13)')
  say(
    '*Generated by `npm run sim` (`sim/report.ts`); do not edit by hand. Per D-02 this report only proposes: no value in `rules.ts` changed. Every number below comes from campaigns settled day by day through the real game modules (`foundCampaign`, `settle` and the player actions), against synthetic ledgers.*'
  )
  say('## The run')
  say(
    `- **Campaigns:** ${results.length} in all. Base rules: ${count(BASE)} (${meta.options.runs} per profile for the greedy and smarter policies, ${meta.options.pushRuns} per profile for the push policy, ${meta.options.weeks} weeks). Income check: ${count(INCOME)} (${meta.options.incomeRuns} per profile, ${meta.options.incomeWeeks} weeks). Sweeps: ${sweepCount} (${meta.options.sweepRuns} per profile per step).`,
    `- **Time:** ${Math.floor(meta.seconds / 60)} min ${meta.seconds % 60} s on ${meta.workers} worker threads (${meta.machine.cpus} × ${meta.machine.model}, Node ${meta.machine.node}, ${meta.machine.platform}).`,
    '- **Seeds:** 1 to N for every group, so a sweep step and the base run play the same ledgers and draws (paired comparisons).',
    '- **Campaigns stop at their end**: the Fall or the victory. The Reign after a victory decides no target, so it is not simulated; hexes after the end count as held at the end.',
    '- **Reading the intervals:** for a median week, the 80% interval is the 10th to 90th percentile of the campaigns themselves; for a share, it is the 80% Wilson interval. Hit or miss is judged on the greedy policy.'
  )
  say('### The players')
  say(
    table(
      ['Profile', 'Duties kept', 'Week vs step pool', 'Food logged', 'Rough weeks', 'Weight trend', 'Measured mean RC (greedy)'],
      PROFILES.map((p) => [
        p.name,
        pct(p.duties),
        pct(p.steps),
        pct(p.food),
        p.roughEvery ? `1 in ${p.roughEvery}` : 'none',
        `${p.lbPerWeek} lb/wk${p.plateauFromWeek ? `, 0 from week ${p.plateauFromWeek}` : ''}`,
        pct(mean(pick(results, BASE, p.id, 'greedy').map((r) => r.q)), 1)
      ])
    )
  )
  say(
    '- **Greedy** (Ch 15 step 2): each week it buys the cheapest tier, castle tier or Crossing stage it can, again and again; courts every village whose Offer meets its resistance at today’s Trust; seals the longest contract unlocked; uses the Armory (Wings from a fixed list, Elites, the Sworn, the dearest item each company can carry). Each day it assaults the adjacent hex with the best Dominion per garrison point that its best-matched companies can beat at yesterday’s Valor; with none, it challenges a Gate or capital whose rival’s army band is short of Overwhelming; it fights Grand Battles with the Marshal’s choices but without his −0.1 Readiness, and spends Respite on rough days.',
    '- **Smarter:** greedy, plus Truces when a rival’s raids are winning and before a Siege, bending the knee once, fortifying contested hexes, an Accord with the most respectful rival once one opens (it lets the contract slot empty for it), the coalition buy-out, and courting a rival’s last two villages.',
    '- **Push** (not in the book; added because it decides so much): greedy, plus Ch 6’s repeated push. With nothing it can take today, it assaults the best hex that the week’s repulses (25% of each Assault off the garrison until the close) could wear down by the week’s last day.'
  )

  // Invariants
  const broken = results.filter((r) => r.violations.length > 0)
  say('## Invariants (every campaign)')
  say(
    `Checked in all ${results.length} campaigns: no loss before week 36 (44 at Grace III); rings 0 to 2 never change owner; settling a sample of six days again, at the same instant and with the clock set back a week, changes nothing (Test 9); every purse gain has a behavior, battle or land source; no Momentum above the target pace (and none above half while too fast).`
  )
  if (broken.length === 0) say('**Zero violations.**')
  else {
    say(`**${broken.length} campaigns broke an invariant.** Each can be reproduced from its variant, profile, policy and seed:`)
    say(table(['Variant', 'Profile', 'Policy', 'Seed', 'First violations'], broken.slice(0, 40).map((r) => [r.variant, r.profile, r.policy, String(r.seed), r.violations.slice(0, 3).join('; ')])))
  }

  // Targets
  say('## The Ch 15 targets')
  say(
    table(
      ['Profile', 'Measure', 'Target', 'Greedy [80%]', 'Verdict', 'Smarter [80%]', 'Push [80%]'],
      targets.map((t) => [t.profile === 'all' ? 'All' : PROFILE_NAME[t.profile], t.metric, t.target, cell(t, 'greedy'), verdict(t), cell(t, 'smarter'), cell(t, 'push')])
    )
  )
  say('*The skill-value rows compare each policy with greedy on the same seeds (both won), as the share of greedy’s finishing week saved; the greedy column shows smarter’s saving.*')
  const plateau = outcome(pick(results, BASE, 'steadfastPlateau', 'greedy'))
  say(
    `The book sets no target for the long plateau; greedy measured a median win in week ${fmt(median(plateau.winWeeks))}, ${pct(plateau.won / Math.max(1, plateau.n))} won within ${horizon} weeks and ${pct(plateau.fallen / Math.max(1, plateau.n))} fell.`
  )

  // Income check
  say('## The income check (Ch 15 table)')
  say(
    `Behavior income only over the first ${meta.options.incomeWeeks} weeks, under the book's conditions: the \`income\` rules variant switches off tithes, spoils and the Merchant Hall and Statue bonuses, and any item bonus still in force is divided out of each posting. The rival side is the hidden benchmark's BI at Grace 0, which is what the book's 16,754 is. Greedy policy. The player's figure adds up each week's median over the campaigns still running that week, so a campaign that fell early doesn't pull the total down.`
  )
  const benchmarkWeeks = [...results].sort((a, b) => b.benchmark.length - a.benchmark.length)[0]?.benchmark ?? []
  const rival48 = sum(benchmarkWeeks.slice(0, BOOK_WEEKS))
  const weeklyMedian = (runs: RunResult[], w: number): number => median(runs.filter((r) => r.incomeBase.length > w).map((r) => r.incomeBase[w]))
  const incomeTable: string[][] = []
  for (const b of BOOK_INCOME) {
    const runs = pick(results, INCOME, b.profile, 'greedy')
    const player = sum(Array.from({ length: BOOK_WEEKS }, (_, w) => weeklyMedian(runs, w)))
    const dev = player / b.player - 1
    const devR = rival48 / b.rival - 1
    incomeTable.push([
      PROFILE_NAME[b.profile],
      `${fmt(player)} (book ${b.player.toLocaleString('en-US')})`,
      pct(dev, 1),
      `${fmt(rival48)} (book ${b.rival.toLocaleString('en-US')})`,
      pct(devR, 1),
      `${fmt(player / rival48, 2)} (book ${b.ratio})`,
      `${runs.filter((r) => r.incomeBase.length >= BOOK_WEEKS).length} of ${runs.length}`,
      Math.abs(dev) <= TOLERANCE && Math.abs(devR) <= TOLERANCE ? 'within ±3%' : 'outside ±3%'
    ])
  }
  say(table(['Profile', 'Player, 48 weeks', 'vs book', 'Rival (benchmark)', 'vs book', 'Ratio', 'Campaigns lasting 48 weeks', 'Check'], incomeTable))
  const stead = pick(results, INCOME, 'steadfast', 'greedy')
  say(table(['Steadfast week', 'Player (median)', 'Book', 'Benchmark', 'Book'], BOOK_WEEKLY.map((w) => [String(w.week), fmt(weeklyMedian(stead, w.week - 1)), String(w.player), fmt(benchmarkWeeks[w.week - 1] ?? Number.NaN), String(w.rival)])))

  say('### Where the gap comes from')
  say(
    "The book's player figures are the benchmark formula itself (Ch 12's BI) with `b` set to the player's consistency, full Momentum and the benchmark's contract schedule: L = 1.4 (7-day contracts) from week 3, 1.7 (14-day) from week 10 and 2.0 (30-day) from week 21. At b = 89% and L = 2.0 that formula gives the book's 409 in week 40. The table splits the 48 weeks by term, the book's (worked out with the engine's own `benchmarkIncome`) against the mean measured over the campaigns that lasted 48 weeks, so the term that differs most is the formula responsible. Flawless weeks are measured but the book's estimate has no term for them."
  )
  const bookTerms = (b: number): Record<string, number> => {
    const weekly = RULES.reputation.weekly
    let daily = 0
    let stepsCal = 0
    let contract = 0
    for (let w = 1; w <= BOOK_WEEKS; w++) {
      const without = benchmarkIncome(b, 0)
      stepsCal += (weekly.steps + weekly.calories) * b
      daily += without - (weekly.steps + weekly.calories) * b - weekly.momentum
      contract += benchmarkIncome(b, benchmarkContractMultiplier(w)) - without
    }
    return { daily, stepsCal, contract }
  }
  const groups: [string, string[]][] = [
    ['Duties, perfect days, streak', ['duties', 'perfectDay', 'streak']],
    ['Steps and calories', ['steps', 'calories']],
    ['Flawless weeks', ['flawless']],
    ['Momentum', ['momentum']],
    ['Contracts', ['contract']]
  ]
  const termRows: string[][] = []
  for (const b of BOOK_INCOME) {
    const profile = PROFILES.find((p) => p.id === b.profile)
    const lasted = pick(results, INCOME, b.profile, 'greedy').filter((r) => r.incomeBase.length >= BOOK_WEEKS)
    if (!profile || lasted.length === 0) continue
    const book = bookTerms(profile.bookScore)
    const bookMomentum = b.player - book.daily - book.stepsCal - book.contract
    const bookOf: Record<string, number> = { 'Duties, perfect days, streak': book.daily, 'Steps and calories': book.stepsCal, 'Flawless weeks': 0, Momentum: bookMomentum, Contracts: book.contract }
    for (const [name, keys] of groups) {
      const measured = mean(lasted.map((r) => sum(keys.map((k) => r.incomeBySource[k] ?? 0))))
      termRows.push([PROFILE_NAME[b.profile], name, fmt(bookOf[name]), fmt(measured), fmt(measured - bookOf[name])])
    }
  }
  say(table(['Profile', 'Term', 'Book (48 weeks)', 'Measured (mean)', 'Difference'], termRows))
  say("*The book's Momentum is what is left of its total once the other terms are taken out (full Momentum is 60 a week, so 2,880 over 48 weeks).*")
  const termWeeks = (days: number, runs: RunResult[]): string => {
    const weeks = runs.map((r) => r.firstTerm[days]).filter((w): w is number => w !== undefined)
    return `${fmt(median(weeks))} (${pct(weeks.length / Math.max(1, runs.length))} ever)`
  }
  say(
    table(
      ['Profile (income variant)', 'First 7-day contract (book: week 3)', 'First 14-day (book: week 10)', 'First 30-day (book: week 21)'],
      BOOK_INCOME.map((b) => {
        const runs = pick(results, INCOME, b.profile, 'greedy')
        return [PROFILE_NAME[b.profile], termWeeks(7, runs), termWeeks(14, runs), termWeeks(30, runs)]
      })
    )
  )
  say('`data/income_by_week.csv` has every week for every profile, with and without the bonuses, beside the benchmark.')

  // Other measures
  say('## The campaign, measured')
  say('### How each rival was resolved (greedy)')
  const resolutionTable: string[][] = []
  for (const p of ['perfect', 'steadfast', 'committed', 'wavering', 'casual'] as ProfileId[]) {
    const runs = pick(results, BASE, p, 'greedy')
    for (const rival of ['orc', 'goblin', 'dwarf', 'archmage']) {
      const got = runs.map((r) => r.resolutions.find((x) => x.rival === rival))
      const share = (how: string): string => pct(got.filter((x) => x?.how === how).length / Math.max(1, runs.length))
      resolutionTable.push([PROFILE_NAME[p], rival, share('conquered'), share('abdicated'), share('allied'), pct(got.filter((x) => !x).length / Math.max(1, runs.length)), fmt(median(got.flatMap((x) => (x ? [x.week] : []))))])
    }
  }
  say(table(['Profile', 'Rival', 'Conquered', 'Abdicated', 'Allied', 'Unresolved', 'Median week'], resolutionTable))
  say('Smarter and push are in `data/resolutions.csv`.')

  say('### Hexes held by month (greedy, median)')
  const months = [1, 2, 3, 4, 6, 8, 10, 12, 14, 16, 18]
  const hexTable: string[][] = []
  for (const p of ['steadfast', 'committed', 'casual'] as ProfileId[]) {
    const runs = pick(results, BASE, p, 'greedy')
    for (const owner of ['player', 'orc', 'goblin', 'dwarf', 'archmage']) {
      hexTable.push([PROFILE_NAME[p], owner, ...months.map((m) => fmt(median(runs.map((r) => r.hexes[owner][Math.min(m - 1, r.hexes[owner].length - 1)]))))])
    }
  }
  say(table(['Profile', 'Holder', ...months.map((m) => `M${m}`)], hexTable))
  say('Every profile and policy, month by month, is in `data/hexes_by_month.csv`.')

  say('### Border Campaigns, the first month, Grand Battles and Ascendancy (greedy)')
  const measureRows: string[][] = []
  for (const p of PROFILES) {
    const runs = pick(results, BASE, p.id, 'greedy')
    if (runs.length === 0) continue
    const bc = runs.map((r) => r.borderCampaignHexes)
    const fmA = sum(runs.map((r) => r.firstMonth.assaults))
    const fmR = sum(runs.map((r) => r.firstMonth.repulsed))
    const fought = sum(runs.map((r) => r.grandBattles.fought))
    const lost = sum(runs.map((r) => r.binds.grandLost))
    measureRows.push([
      p.name,
      `${fmt(median(bc))} [${fmt(quantile(bc, 0.1))}–${fmt(quantile(bc, 0.9))}]`,
      `${pct(fmR / Math.max(1, fmA))} of ${fmt(fmA / runs.length, 1)}`,
      `${fmt(mean(runs.map((r) => r.grandBattles.fought)), 1)} (${pct(lost / Math.max(1, fought))} lost)`,
      pct(runs.filter((r) => r.warnings.length > 0).length / runs.length),
      pct(runs.filter((r) => r.maxAscendancyStreak > 0).length / runs.length),
      pct(runs.filter((r) => r.ultimatums.length > 0).length / runs.length),
      `${sum(runs.map((r) => r.sieges.filter((s) => s.won).length))} won, ${sum(runs.map((r) => r.sieges.filter((s) => !s.won).length))} lost`
    ])
  }
  say(
    table(
      ['Profile', 'Border Campaign hexes a campaign (book 2 to 6)', 'First-month assaults repulsed (target under 15%) of a campaign’s', 'Grand Battles a campaign', 'Herald warned (1.3×)', 'Ascendancy streak began', 'Ultimatum', 'Sieges'],
      measureRows
    )
  )

  say('### Grand Battles by trigger (greedy, per campaign)')
  const triggers = [...new Set(base.flatMap((r) => Object.keys(r.grandBattles.byTrigger)))].sort()
  say(
    table(
      ['Profile', ...triggers],
      PROFILES.map((p) => {
        const runs = pick(results, BASE, p.id, 'greedy')
        return [p.name, ...triggers.map((t) => fmt(mean(runs.map((r) => r.grandBattles.byTrigger[t] ?? 0)), 2))]
      })
    )
  )

  say('### The income ratio by week (greedy, base rules, bonuses divided out)')
  const ratioWeeks = [1, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 56, 64, 70]
  say(
    table(
      ['Profile', ...ratioWeeks.map((w) => `W${w}`)],
      PROFILES.map((p) => {
        const runs = pick(results, BASE, p.id, 'greedy')
        return [p.name, ...ratioWeeks.map((w) => fmt(median(runs.filter((r) => r.incomeBase.length >= w).map((r) => r.incomeBase[w - 1] / r.benchmark[w - 1])), 2))]
      })
    )
  )
  say('*Campaigns that already ended drop out of later weeks.*')

  say('### Where the purse goes (greedy, mean per campaign)')
  say(
    table(
      ['Profile', ...categories],
      PROFILES.map((p) => {
        const runs = pick(results, BASE, p.id, 'greedy')
        return [p.name, ...categories.map((c) => fmt(mean(runs.map((r) => r.spend[c] ?? 0))))]
      })
    )
  )

  say('### How often each lever binds (greedy)')
  const bindRows: string[][] = []
  for (const p of ['steadfast', 'committed', 'wavering'] as ProfileId[]) {
    const runs = pick(results, BASE, p, 'greedy')
    const weeksBehind = runs.map((r) => r.incomeBase.slice(0, BOOK_WEEKS).filter((v, i) => v < r.benchmark[i]).length / Math.min(BOOK_WEEKS, r.incomeBase.length || 1))
    const contracts = sum(runs.map((r) => r.binds.contracts))
    const fought = sum(runs.map((r) => r.grandBattles.fought))
    bindRows.push([
      PROFILE_NAME[p],
      pct(mean(weeksBehind)),
      pct(sum(runs.map((r) => r.binds.zeroPayContracts)) / Math.max(1, contracts)),
      pct(sum(runs.map((r) => r.binds.grandLost)) / Math.max(1, fought)),
      `${pct(runs.filter((r) => r.binds.tierIVDominionWeeks > 0).length / runs.length)} (${fmt(mean(runs.map((r) => r.binds.tierIVDominionWeeks)), 1)} weeks)`,
      pct(runs.filter((r) => r.maxAscendancyStreak > 0).length / runs.length),
      pct(sum(runs.map((r) => r.assaults.repulsed)) / Math.max(1, sum(runs.map((r) => r.assaults.total))))
    ])
  }
  say(
    table(
      ['Profile', 'b: weeks behind the benchmark (first 48)', 'Payout start: contracts paying nothing', 'Host share: Grand Battles lost', 'Tier IV Dominion: campaigns held back by it', 'Ascendancy ratio: campaigns at or above it after week 36', 'Garrisons (A-17): assaults repulsed'],
      bindRows
    )
  )
  say('*The army cost and the rivals’ starting state (A-18) have no direct witness in a campaign; the sweeps below show what they do.*')

  const trophies = base.filter((r) => r.policy === 'greedy' && r.profile === 'steadfast').map((r) => r.trophyWeeks[0]).filter((w): w is number => w !== undefined)
  say(`**Trophies (A-156):** a Steadfast greedy player's first trophy item arrives in week ${fmt(median(trophies))} (median; 80% interval ${fmt(quantile(trophies, 0.1))}–${fmt(quantile(trophies, 0.9))}).`)

  // Sweeps
  say('## Sensitivity sweeps (greedy)')
  say(
    `Each lever alone at −20%, −10%, +10% and +20% of its value, ${meta.options.sweepRuns} campaigns per profile per step, on the base run's first ${meta.options.sweepRuns} seeds. The 0 column is the base run on the same seeds. Each cell: median win week · win share · loss share.`
  )
  for (const lever of [...new Set(meta.variants.map((v) => v.lever))]) {
    const info = meta.variants.filter((v) => v.lever === lever)
    say(`### ${info[0].label} (${info[0].source})`)
    const steps = [...info].sort((a, b) => a.delta - b.delta)
    const head = ['Profile', ...steps.filter((s) => s.delta < 0).map((s) => `${s.delta}% (${s.values.join('/')})`), '0', ...steps.filter((s) => s.delta > 0).map((s) => `+${s.delta}% (${s.values.join('/')})`)]
    const rows = sweepProfiles.map((profile) => {
      const c = (s: VariantInfo): string => {
        const x = cells.find((y) => y.variant === s.variant && y.profile === profile) as SweepCell
        return `${fmt(x.medianWin)} · ${pct(x.win)} · ${pct(x.loss)}`
      }
      const b = baseCells(profile)
      return [PROFILE_NAME[profile], ...steps.filter((s) => s.delta < 0).map(c), `${fmt(b.medianWin)} · ${pct(b.win)} · ${pct(b.loss)}`, ...steps.filter((s) => s.delta > 0).map(c)]
    })
    say(table(head, rows))
  }

  // Proposals
  say('## Proposed changes, ranked')
  const baseDistance = distance(sweepProfiles.map(baseCells), horizon)
  const ranked = meta.variants
    .map((v) => {
      const vc = sweepProfiles.map((p) => cells.find((c) => c.variant === v.variant && c.profile === p) as SweepCell)
      return { v, vc, gain: baseDistance - distance(vc, horizon) }
    })
    .filter((x) => x.gain > 0)
    .sort((a, b) => b.gain - a.gain || a.v.variant.localeCompare(b.v.variant))
  say(
    `Each step of the sweeps is scored by how far Steadfast's and Committed's results sit outside their Ch 15 ranges (win week in units of 4 weeks, shares in units of 10 points), and ranked by how much closer it brings them than the base rules (base distance ${fmt(baseDistance, 2)}). They are one-lever-at-a-time suggestions for the owner (D-02), not a combined plan; the levers interact.`
  )
  if (ranked.length === 0) say('No single step moves the targets closer than the base rules.')
  else {
    const describe = (x: SweepCell, b: SweepCell): string =>
      `${PROFILE_NAME[x.profile]} win week ${fmt(b.medianWin)} → ${fmt(x.medianWin)}, win ${pct(b.win)} → ${pct(x.win)}, loss ${pct(b.loss)} → ${pct(x.loss)}`
    say(
      ranked
        .slice(0, 10)
        .map((x, i) => `${i + 1}. **${x.v.label}: ${x.v.delta > 0 ? 'raise' : 'lower'} it ${Math.abs(x.v.delta)}%** (to ${x.v.values.join(' / ')}). ${x.vc.map((c) => describe(c, baseCells(c.profile))).join('; ')}. Distance ${fmt(baseDistance, 2)} → ${fmt(baseDistance - x.gain, 2)}.`)
        .join('\n')
    )
  }

  // Owner's decisions
  say("## The owner's decision list")
  const misses = targets.filter((t) => verdict(t).startsWith('miss'))
  const decisions = [
    `**The targets.** ${misses.length} of ${targets.length} target rows miss on the greedy policy: ${misses.map((t) => `${t.profile === 'all' ? 'all' : PROFILE_NAME[t.profile]} ${t.metric.toLowerCase()}`).join('; ') || 'none'}. Decide which to accept and which to tune toward.`,
    '**The ranked proposals above:** approve, change or reject each (D-02: no value changes until you do).',
    '**The repeated push.** Compare the push column with greedy: it is the biggest single choice a player makes. Decide whether repulse wear (25% of the Assault until the week closes, `RULES.land.repulseWear`) should stay as strong, and whether Weary (−20% the next day) should also stop a company pushing on consecutive days.',
    '**The income check.** Where a row is outside ±3%, decide whether the book’s estimate or the engine’s formula is right (see the hand-off notes in `docs/game/tasks/T13-simulator.md`).',
    '**A-143 (open since T09):** whether a defection needs the rival to hold none of its villages, or only none of its original ones.',
    '**A-156:** whether daily mythic victories should give trophies this early (the trophy line above), or only the record.'
  ]
  say(decisions.map((d, i) => `${i + 1}. ${d}`).join('\n'))

  write(path.join(outDir, 'report.md'), md.join('\n').replace(/\n{3,}/g, '\n\n'))
  return files
}
