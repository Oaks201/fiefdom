/**
 * Patch 4 (docs/redesign/patch-4-spec.md section 11; C-48), Patch 5 (docs/redesign/patch-5-spec.md
 * section 6; C-50) and Patch 6 (docs/redesign/patch-6-spec.md section 7; C-94): a campaign founded and
 * played on rules 3.1.0, 3.2.0 or 3.3.0 carries forward to 3.4.0 in place. Each fixture
 * (`tests/game/fixtures/campaign-<version>.json`) was written by its script in `scripts/` on its own
 * rules, before the next patch changed any: a synthetic Steadfast campaign played by the automatic player
 * on the simulator's ledger (no one's health data). As the app does when it loads one, a save from before
 * the bend is first migrated once to the bent map (D-38); the 3.3.0 save was founded on it.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { autoplay, type AutoplayPlan } from '../../src/renderer/src/lib/game/autoplay'
import { addDays, dayCloseInstant } from '../../src/renderer/src/lib/game/clock'
import { settleViolations } from '../../src/renderer/src/lib/game/dev/invariants'
import { migrateCampaign, migrationsOf } from '../../src/renderer/src/lib/game/migrate'
import { needsRefounding } from '../../src/renderer/src/lib/game/refound'
import { RULES } from '../../src/renderer/src/lib/game/rules'
import { settle } from '../../src/renderer/src/lib/game/settle'
import type { CampaignState, ISODate } from '../../src/renderer/src/lib/game/types'
import { TZ, isRoughDay, ledgerFor } from '../../sim/ledgerGen'
import { profileOf, type ProfileId } from '../../sim/profiles'

interface Fixture {
  ruleVersion: string
  seed: number
  profile: ProfileId
  ledgerWeeks: number
  playedWeeks: number
  plan: AutoplayPlan
  state: CampaignState
}

const load = (version: string): Fixture => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', `campaign-${version}.json`), 'utf8')) as Fixture
const FIXTURES = { '3.1.0': load('3.1.0'), '3.2.0': load('3.2.0') }
const V310 = FIXTURES['3.1.0']
const V330 = load('3.3.0')
const WEEKS_ON = 12
const after = (day: ISODate): Date => new Date(dayCloseInstant(day, TZ).getTime() + 60_000)

function fingerprint(state: CampaignState): string {
  return JSON.stringify(state)
}

/** The fixture as the app loads it under the current rules: migrated once to the bent map if it is older than the bend (D-38). */
function loaded(f: Fixture): CampaignState {
  return migrateCampaign(f.state).state
}

/** The fixture loaded and played on under the current rules for `weeks` weeks, checking the runtime invariants every day. */
function playOn(f: Fixture, weeks: number): { state: CampaignState; violations: string[] } {
  const profile = profileOf(f.profile)
  const ledger = ledgerFor(profile, f.seed, f.ledgerWeeks * 7)
  let state = loaded(f)
  const violations: string[] = []
  let n = 0
  for (let i = 1; i <= weeks * 7; i++) {
    const today = addDays(f.state.settledThrough.day, i)
    state = autoplay(state, today, f.plan, { rough: isRoughDay(profile, f.seed, today), nextId: () => `cf-${(n += 1)}` })
    const before = state
    state = settle(state, ledger, after(today), { launch: true }).state
    violations.push(...settleViolations({ before, after: state, ledger, now: after(today), resettle: i % 13 === 0 }))
  }
  return { state, violations }
}

test('C-48, C-50, C-94: the 3.1.0 and 3.2.0 saves are what they say, and 3.4.0 takes each without a re-founding, migrating it once', () => {
  assert.equal(RULES.ruleVersion, '3.4.0')
  for (const [version, f] of Object.entries(FIXTURES)) {
    assert.equal(f.ruleVersion, version)
    assert.equal(f.state.campaign.ruleVersion, version)
    assert.equal(needsRefounding(f.state), false)
    assert.deepEqual(migrationsOf(f.state), [], 'D-38: a save from before the bend has had no migration')
    const { state, applied } = migrateCampaign(f.state)
    assert.deepEqual(applied, ['bentMarches'])
    assert.equal(state.campaign.ruleVersion, version, 'a campaign keeps its founding version')
    assert.deepEqual(migrateCampaign(state).applied, [], 'and never again')
  }
  // Nothing of Patch 4's is in the 3.1.0 save: every field it added starts absent.
  assert.equal(V310.state.personalities, undefined)
  assert.equal(V310.state.terms, undefined)
})

test('C-48: loaded with no day to settle, only the open day’s dawn is new (its surge); settling again changes nothing', () => {
  const profile = profileOf(V310.profile)
  const ledger = ledgerFor(profile, V310.seed, V310.ledgerWeeks * 7)
  const now = after(V310.state.settledThrough.day)
  const start = loaded(V310)
  const once = settle(start, ledger, now).state
  assert.equal(once.settledThrough.day, start.settledThrough.day)
  assert.deepEqual({ ...once, personalities: undefined, combat: undefined }, { ...start, personalities: undefined, combat: undefined }, 'nothing else is rewritten')
  assert.equal(fingerprint(settle(once, ledger, now).state), fingerprint(once))
})

test('C-48 (section 11): the 3.1.0 save played on 12 weeks settles with no invariant broken, and each Patch 4 rule starts as its spec says', () => {
  const { state, violations } = playOn(V310, WEEKS_ON)
  assert.deepEqual(violations, [])
  assert.equal(state.campaign.ruleVersion, '3.1.0', 'a campaign keeps its founding version')
  assert.equal(state.campaign.status, 'active')
  const fresh = state.log.slice(V310.state.log.length)
  // The Archmage's surges begin at the first 3.2 dawn: one a day.
  const surges = fresh.filter((e) => e.kind === 'surge')
  assert.ok(surges.length >= WEEKS_ON * 7 - 2, `a surge a day (${surges.length})`)
  assert.ok(state.terms !== undefined, 'the terms record starts at the first 3.2 week close')
  assert.ok(state.personalities !== undefined)
  // Signature deeds count from 3.2 on only: none is posted for events before it.
  const deeds = fresh.filter((e) => e.kind === 'deed')
  for (const d of deeds) if (d.kind === 'deed' && d.source) assert.ok(!V310.state.log.some((e) => e.id === d.source && ['bribe', 'goblinBid', 'surge', 'ritual'].includes(e.kind)))
})

test('C-50: the 3.2.0 save played on 12 weeks under 3.4.0 settles with no invariant broken', () => {
  const f = FIXTURES['3.2.0']
  const { state, violations } = playOn(f, WEEKS_ON)
  assert.deepEqual(violations, [])
  assert.equal(state.campaign.ruleVersion, '3.2.0')
  assert.ok(state.settledThrough.week >= f.state.settledThrough.week + WEEKS_ON - 1)
})

test('C-48: the carried-forward campaign settles the same twice (Test 9)', () => {
  const a = playOn(V310, 2).state
  const b = playOn(V310, 2).state
  assert.equal(fingerprint(a), fingerprint(b))
})

test('C-94: the 3.3.0 save is what it says, and 3.4.0 takes it as it is: no re-founding, no migration, 12 weeks with no invariant broken', () => {
  assert.equal(V330.ruleVersion, '3.3.0')
  assert.equal(V330.state.campaign.ruleVersion, '3.3.0')
  assert.equal(needsRefounding(V330.state), false)
  assert.deepEqual(migrationsOf(V330.state), ['bentMarches'], 'founded on the bent map')
  assert.deepEqual(migrateCampaign(V330.state).applied, [], 'nothing to migrate')
  const { state, violations } = playOn(V330, WEEKS_ON)
  assert.deepEqual(violations, [])
  assert.equal(state.campaign.ruleVersion, '3.3.0', 'a campaign keeps its founding version')
  assert.ok(state.settledThrough.week >= V330.state.settledThrough.week + WEEKS_ON - 1)
})

test('D-48, D-49: on its first night under 3.4.0 the 3.3.0 save reads every standing from Respect by each rival’s own lines; days already settled are never settled again', () => {
  const profile = profileOf(V330.profile)
  const ledger = ledgerFor(profile, V330.seed, V330.ledgerWeeks * 7)
  // As 3.3.0 read them: the Goblin and the Archmage at 45 in Tension (its Peace at 50), the Orc at −20 in Tension (its War at −25).
  const base = loaded(V330)
  const at = (s: CampaignState, r: 'orc' | 'goblin' | 'archmage', respect: number): CampaignState => ({ ...s, rivals: { ...s.rivals, [r]: { ...s.rivals[r], respect, disposition: { ...s.rivals[r].disposition, player: 'tension' } } } })
  const start = at(at(at(base, 'goblin', 45), 'archmage', 45), 'orc', -20)
  const night = addDays(start.settledThrough.day, 1)
  const result = settle(start, ledger, after(night))
  const s = result.state
  assert.equal(s.rivals.goblin.disposition.player, 'peace', 'the Goblin comes to Peace at 40')
  assert.equal(s.rivals.archmage.disposition.player, 'peace', 'the Archmage comes to Peace at 40')
  assert.equal(s.rivals.orc.disposition.player, 'war', 'the Orc goes to War at −15')
  const posted = result.events.filter((e) => e.kind === 'disposition' && e.day === night).map((e) => (e.kind === 'disposition' ? `${e.rival}:${e.to}` : ''))
  for (const want of ['goblin:peace', 'archmage:peace', 'orc:war']) assert.ok(posted.includes(want), `${want} posted (${posted.join(', ')})`)
  assert.equal(result.events.filter((e) => e.day < night).length, 0, 'no day already settled is settled again')
})
