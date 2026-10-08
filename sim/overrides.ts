/**
 * Rule overrides for the simulator (T13 scope 5), without editing `rules.ts`. `RULES` is a deep-frozen
 * constant read everywhere, so each variant runs in its own worker thread, and that worker is served
 * a `rules.ts` that applies the override to the table just before `deepFreeze`. The file on disk
 * never changes: the patch is made to the module's code as it is compiled, in memory.
 *
 * tsx loads this repo's TypeScript as CommonJS, so the hook wraps `Module.prototype._compile` (where
 * tsx hands over each transformed file) rather than an ESM `module.register` loader, which `require`
 * never consults. `installOverride` must run before anything imports `rules.ts`; `checkOverride`
 * then confirms the loaded `RULES` really carries the variant, so a hook that missed fails loudly.
 *
 * A variant is `base`, `income` (the Ch 15 income check's conditions) or `<lever>:<percent>`, such as
 * `hostShare:+10`. A lever scales its values by 1 + percent / 100.
 */
import Module from 'node:module'

/** The tuning table as the patch sees it: plain, unfrozen data. */
type Table = any

export interface Lever {
  id: string
  /** As the report names it. */
  label: string
  /** Where it comes from: the Ch 15 levers table, or a decision. */
  source: string
  /** Scales the lever's values in the table by `mult`. */
  apply(table: Table, mult: number): void
  /** The lever's value(s) in a loaded table, for the report and the hook check. */
  read(rules: Table): number[]
}

const roundTo = (value: number, places: number): number => Math.round(value * 10 ** places) / 10 ** places

/** Every Ch 15 lever, plus A-17 and A-18 (T13 scope 7). */
export const LEVERS: readonly Lever[] = [
  {
    id: 'benchmarkB',
    label: 'Benchmark consistency b by phase (72 / 78 / 82 / 86%)',
    source: 'Ch 15',
    apply: (t, m) => t.rivals.benchmark.phases.forEach((p: { b: number }) => (p.b = Math.min(1, roundTo(p.b * m, 4)))),
    read: (r) => r.rivals.benchmark.phases.map((p: { b: number }) => p.b)
  },
  {
    id: 'armyCostPerPower',
    label: 'Army cost per power (the 10 in 10 × (1 + AV/150))',
    source: 'Ch 15',
    apply: (t, m) => (t.rivals.armyCost.perPower = roundTo(t.rivals.armyCost.perPower * m, 4)),
    read: (r) => [r.rivals.armyCost.perPower]
  },
  {
    id: 'armyCostScale',
    label: 'Army cost scale (the 150 in 10 × (1 + AV/150))',
    source: 'Ch 15',
    apply: (t, m) => (t.rivals.armyCost.armyScale = roundTo(t.rivals.armyCost.armyScale * m, 4)),
    read: (r) => [r.rivals.armyCost.armyScale]
  },
  {
    id: 'ascendancyRatio',
    label: 'Ascendancy ratio (1.5×, 1.6× at Grace I+)',
    source: 'Ch 15',
    apply: (t, m) => {
      t.defeat.ascendancy.powerRatio = roundTo(t.defeat.ascendancy.powerRatio * m, 4)
      t.defeat.ascendancy.powerRatioGraceI = roundTo(t.defeat.ascendancy.powerRatioGraceI * m, 4)
    },
    read: (r) => [r.defeat.ascendancy.powerRatio, r.defeat.ascendancy.powerRatioGraceI]
  },
  {
    id: 'hostShare',
    label: 'Host share of AV (60%; coalitions 50%, the Siege 70%)',
    source: 'Ch 15',
    apply: (t, m) => {
      const h = t.grandBattles.hostShare
      for (const k of Object.keys(h)) h[k] = roundTo(h[k] * m, 4)
    },
    read: (r) => [r.grandBattles.hostShare.rival, r.grandBattles.hostShare.coalition, r.grandBattles.hostShare.siege]
  },
  {
    id: 'payoutStart',
    label: 'Payout curve start (40%; the span is 1 − start, so f(100%) stays 1)',
    source: 'Ch 15',
    apply: (t, m) => {
      const c = t.contracts.payoutCurve
      c.start = roundTo(c.start * m, 4)
      c.span = roundTo(1 - c.start, 4)
    },
    read: (r) => [r.contracts.payoutCurve.start, r.contracts.payoutCurve.span]
  },
  {
    id: 'tierIVDominion',
    label: 'Tier IV Dominion (68; Tier V moves with it, since it needs at least IV’s)',
    source: 'Ch 15',
    apply: (t, m) => {
      const d = t.buildings.tierDominion
      d[3] = Math.round(d[3] * m)
      d[4] = Math.round(d[4] * m)
    },
    read: (r) => [r.buildings.tierDominion[3], r.buildings.tierDominion[4]]
  },
  {
    id: 'garrisonMult',
    label: 'Rival garrison multipliers (Orc 1.0, Goblin 0.9, Dwarf 1.3, Archmage 1.1)',
    source: 'A-17',
    apply: (t, m) => {
      const g = t.land.rivalGarrisonMult
      for (const k of Object.keys(g)) g[k] = roundTo(g[k] * m, 4)
    },
    read: (r) => Object.values(r.land.rivalGarrisonMult) as number[]
  },
  {
    id: 'rivalStart',
    label: 'Rival starting treasury and army (150 and about 40 power)',
    source: 'A-18',
    apply: (t, m) => {
      t.rivals.start.treasury = Math.round(t.rivals.start.treasury * m)
      t.rivals.start.armyPower = Math.round(t.rivals.start.armyPower * m)
    },
    read: (r) => [r.rivals.start.treasury, r.rivals.start.armyPower]
  }
]

/** The sweep's steps (T13 scope 7). */
export const DELTAS = [-20, -10, 10, 20] as const

/**
 * The Ch 15 income check's conditions: behavior income only, so no tithes, spoils or reputation
 * bonus. Item bonuses live in the codex, which this hook doesn't reach; the run divides them out.
 */
function incomeCheck(t: Table): void {
  t.reputation.weekly.tithePerRing = 0
  t.reputation.merchantHallBonus = t.reputation.merchantHallBonus.map(() => 0)
  t.milestones.boons.statueReputation = 0
  t.combat.spoils.winPerRing = 0
  t.combat.spoils.routPerRing = 0
  t.grandBattles.outcomes.incursionWin.spoilsPerRing = 0
  t.grandBattles.outcomes.coalitionWin.spoilsPerRing = 0
  t.grandBattles.outcomes.mythicHuntWin.reputation = 0
}

export const BASE = 'base'
export const INCOME = 'income'

export function variantOf(lever: string, delta: number): string {
  return `${lever}:${delta > 0 ? '+' : ''}${delta}`
}

/** A variant's lever and step, or null for `base` and `income`. */
export function parseVariant(variant: string): { lever: Lever; delta: number } | null {
  if (variant === BASE || variant === INCOME) return null
  const [id, step] = variant.split(':')
  const lever = LEVERS.find((l) => l.id === id)
  const delta = Number(step)
  if (!lever || !Number.isFinite(delta)) throw new Error(`Unknown rules variant "${variant}"`)
  return { lever, delta }
}

/** What a variant does to the table. */
export function patchOf(variant: string): (table: Table) => Table {
  if (variant === BASE) return (t) => t
  if (variant === INCOME) return (t) => (incomeCheck(t), t)
  const { lever, delta } = parseVariant(variant) as { lever: Lever; delta: number }
  return (t) => (lever.apply(t, 1 + delta / 100), t)
}

const HOOK = '__fiefdomSimRules'
const RULES_FILE = ['lib', 'game', 'rules.ts'].join('/')
const TARGET = 'deepFreeze(RULES_TABLE)'
const PATCHED = `deepFreeze(globalThis.${HOOK}(RULES_TABLE))`

/** What the hook did, for `checkOverride`: the lever's values before and after it ran. */
let applied: { before: number[]; after: number[] } | null = null

/** Serves this thread a `rules.ts` that applies `variant`. Call it before anything imports the rules. */
export function installOverride(variant: string): void {
  if (variant === BASE) return
  const patch = patchOf(variant)
  const lever = parseVariant(variant)?.lever
  ;(globalThis as Record<string, unknown>)[HOOK] = (table: Table): Table => {
    const before = lever ? lever.read(table) : []
    patch(table)
    applied = { before, after: lever ? lever.read(table) : [] }
    return table
  }
  const proto = Module.prototype as unknown as { _compile(content: string, filename: string): unknown }
  const compile = proto._compile
  proto._compile = function (content: string, filename: string): unknown {
    if (filename.split('\\').join('/').endsWith(RULES_FILE)) {
      if (!content.includes(TARGET)) throw new Error(`rules.ts no longer builds RULES with ${TARGET}; update sim/overrides.ts`)
      content = content.replace(TARGET, PATCHED)
    }
    return compile.call(this, content, filename)
  }
}

/**
 * Throws unless the loaded `rules` carry `variant`: the hook ran on this thread's `rules.ts`, and the
 * lever's values in `RULES` are the patched ones. Returns the lever's values (none for base).
 */
export function checkOverride(variant: string, rules: Table): number[] {
  if (variant === BASE) return []
  if (!applied) throw new Error(`The rules hook for ${variant} never ran: rules.ts was loaded before installOverride, or not through require`)
  if (variant === INCOME) {
    if (rules.reputation.weekly.tithePerRing !== 0 || rules.combat.spoils.winPerRing !== 0) throw new Error('The income check’s overrides did not reach RULES')
    return []
  }
  const lever = (parseVariant(variant) as { lever: Lever }).lever
  const loaded = lever.read(rules)
  if (JSON.stringify(loaded) !== JSON.stringify(applied.after)) throw new Error(`RULES has ${lever.id} = ${loaded.join('/')}, not the patched ${applied.after.join('/')}`)
  return loaded
}
