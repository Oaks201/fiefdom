/**
 * The text catalog (Ch 17 "Writing", A-46). Narrative strings live in
 * `src/renderer/src/data/text/*.json`, keyed by id. Each slot has a plain-fact `template` with
 * `{placeholders}` and a `final` that people write later (task A3). Interface labels stay in
 * components; only narrative slots live here. Code never invents the words.
 */
import healerJson from '../../data/text/healer.json'
import milestonesJson from '../../data/text/milestones.json'
import rivalsJson from '../../data/text/rivals.json'
import eventsJson from '../../data/text/events.json'
import coalitionsJson from '../../data/text/coalitions.json'
import endingsJson from '../../data/text/endings.json'
import crossingsJson from '../../data/text/crossings.json'
import unitsJson from '../../data/text/units.json'
import itemsJson from '../../data/text/items.json'
import battleReportsJson from '../../data/text/battle-reports.json'
import heraldJson from '../../data/text/herald.json'

export interface TextEntry {
  /** A plain statement of facts, with `{name}` placeholders. Never flavor (A-46). */
  template: string
  /** The written line, or null until someone writes it. */
  final: string | null
  /** Healer entries only: `final` is shown only once the owner approves it (Ch 17). */
  approved?: boolean
}

/** The facts a slot's placeholders are filled from. */
export type TextFacts = Record<string, string | number>

/** Each catalog file and the id prefix its entries use. */
export const TEXT_FILES = {
  'healer.json': 'healer',
  'milestones.json': 'milestones',
  'rivals.json': 'rivals',
  'events.json': 'events',
  'coalitions.json': 'coalitions',
  'endings.json': 'endings',
  'crossings.json': 'crossings',
  'units.json': 'units',
  'items.json': 'items',
  'battle-reports.json': 'battle',
  'herald.json': 'herald'
} as const

export type TextFile = keyof typeof TEXT_FILES

/** The moments each rival has a voice line for (Ch 17: about 12 per rival). */
export const RIVAL_MOMENTS = [
  'greeting',
  'warning',
  'raid',
  'defeatInBattle',
  'victoryInBattle',
  'surrenderHex',
  'defection',
  'dealStruck',
  'accordOffered',
  'allied',
  'ultimatum',
  'fall'
] as const

export type RivalMoment = (typeof RIVAL_MOMENTS)[number]

/** One Healer check-in per Ch 16 guardrail, in the order of that chapter's table. */
export const HEALER_CHECK_INS = [
  'crashDieting',
  'tooFast',
  'plateau',
  'regain',
  'unsafeGoal',
  'overtraining',
  'illnessAndTravel',
  'fearOfLosing',
  'comingBack',
  'shame',
  'compulsiveChecking',
  'payingOrRushing',
  'privacy'
] as const

export type HealerCheckIn = (typeof HEALER_CHECK_INS)[number]

/** The raw catalog files, by file name. */
export const TEXT_SOURCES: Record<TextFile, Record<string, TextEntry>> = {
  'healer.json': healerJson,
  'milestones.json': milestonesJson,
  'rivals.json': rivalsJson,
  'events.json': eventsJson,
  'coalitions.json': coalitionsJson,
  'endings.json': endingsJson,
  'crossings.json': crossingsJson,
  'units.json': unitsJson,
  'items.json': itemsJson,
  'battle-reports.json': battleReportsJson,
  'herald.json': heraldJson
}

const CATALOG: ReadonlyMap<string, TextEntry> = new Map(
  Object.values(TEXT_SOURCES).flatMap((file) => Object.entries(file))
)

const PLACEHOLDER = /\{(\w+)\}/g

/** The placeholder names a text uses, in order of first use. */
export function placeholders(text: string): string[] {
  return [...new Set(Array.from(text.matchAll(PLACEHOLDER), (m) => m[1]))]
}

function fill(text: string, facts: TextFacts): string {
  return text.replace(PLACEHOLDER, (whole, name: string) => (name in facts ? String(facts[name]) : whole))
}

/**
 * Builds a `t` over a set of catalog entries; the game's own `t` below uses the whole catalog.
 *
 * `t(id, facts)` gives the text for slot `id`, filled with `facts`. It uses `final` when someone
 * has written it (a Healer entry only once `approved` is true), otherwise the template.
 * Placeholders without a fact are left as `{name}`, so a missing fact is visible. An unknown id
 * gives `[missing:<id>]`.
 */
export function makeT(entries: ReadonlyMap<string, TextEntry>): (id: string, facts?: TextFacts) => string {
  return (id, facts = {}) => {
    const entry = entries.get(id)
    if (!entry) return `[missing:${id}]`
    const usable = entry.final !== null && (entry.approved === undefined || entry.approved === true)
    return fill(usable ? (entry.final as string) : entry.template, facts)
  }
}

export const t = makeT(CATALOG)

export function hasText(id: string): boolean {
  return CATALOG.has(id)
}

/** Every slot id, optionally only those under a prefix such as 'rivals.orc'. */
export function textIds(prefix?: string): string[] {
  const ids = [...CATALOG.keys()]
  return prefix === undefined ? ids : ids.filter((id) => id === prefix || id.startsWith(`${prefix}.`))
}

/**
 * Checks the catalog's shape: ids are unique and carry their file's prefix, every entry has a
 * non-empty template and a string-or-null final, and Healer entries say whether they're approved.
 */
export function validateCatalog(sources: Record<string, Record<string, TextEntry>> = TEXT_SOURCES): string[] {
  const errors: string[] = []
  const seen = new Map<string, string>()
  for (const [file, entries] of Object.entries(sources)) {
    const prefix = TEXT_FILES[file as TextFile]
    if (prefix === undefined) errors.push(`${file}: not a known catalog file`)
    for (const [id, entry] of Object.entries(entries)) {
      const at = `${file} ${id}`
      if (seen.has(id)) errors.push(`${at}: duplicate id (also in ${seen.get(id)})`)
      seen.set(id, file)
      if (prefix !== undefined && !id.startsWith(`${prefix}.`)) errors.push(`${at}: id must start with "${prefix}."`)
      if (typeof entry?.template !== 'string' || entry.template.trim() === '') errors.push(`${at}: needs a template`)
      if (entry?.final !== null && typeof entry?.final !== 'string') errors.push(`${at}: final must be a string or null`)
      const healer = prefix === 'healer'
      if (healer && typeof entry?.approved !== 'boolean') errors.push(`${at}: Healer entries need "approved"`)
      if (!healer && entry?.approved !== undefined) errors.push(`${at}: only Healer entries carry "approved"`)
    }
  }
  return errors
}
