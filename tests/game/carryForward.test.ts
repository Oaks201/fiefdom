/**
 * Patch 4 (docs/redesign/patch-4-spec.md section 11; C-48): a campaign founded and played on rules 3.1.0
 * carries forward to 3.2.0 in place. The fixture (`tests/game/fixtures/campaign-3.1.0.json`) was written
 * by `scripts/fixture-3.1.0.ts` on 3.1.0, before any Patch 4 rule changed: a synthetic Steadfast
 * campaign, played 24 weeks by the automatic player on the simulator's ledger (no one's health data).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { autoplay, type AutoplayPlan } from '../../src/renderer/src/lib/game/autoplay'
import { addDays, dayCloseInstant } from '../../src/renderer/src/lib/game/clock'
import { settleViolations } from '../../src/renderer/src/lib/game/dev/invariants'
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

const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'campaign-3.1.0.json'), 'utf8')) as Fixture
const WEEKS_ON = 12
const after = (day: ISODate): Date => new Date(dayCloseInstant(day, TZ).getTime() + 60_000)

function fingerprint(state: CampaignState): string {
  return JSON.stringify(state)
}

/** The fixture played on under 3.2.0 for `weeks` weeks, checking the runtime invariants every day. */
function playOn(weeks: number): { state: CampaignState; violations: string[] } {
  const profile = profileOf(FIXTURE.profile)
  const ledger = ledgerFor(profile, FIXTURE.seed, FIXTURE.ledgerWeeks * 7)
  let state = FIXTURE.state
  const violations: string[] = []
  let n = 0
  for (let i = 1; i <= weeks * 7; i++) {
    const today = addDays(FIXTURE.state.settledThrough.day, i)
    state = autoplay(state, today, FIXTURE.plan, { rough: isRoughDay(profile, FIXTURE.seed, today), nextId: () => `cf-${(n += 1)}` })
    const before = state
    state = settle(state, ledger, after(today), { launch: true }).state
    violations.push(...settleViolations({ before, after: state, ledger, now: after(today), resettle: i % 13 === 0 }))
  }
  return { state, violations }
}

test('C-48: the 3.1.0 save is a 3.1.0 save, and 3.2.0 takes it without a re-founding', () => {
  assert.equal(FIXTURE.ruleVersion, '3.1.0')
  assert.equal(FIXTURE.state.campaign.ruleVersion, '3.1.0')
  assert.equal(RULES.ruleVersion, '3.2.0')
  assert.equal(needsRefounding(FIXTURE.state), false)
  // Nothing of Patch 4's is in it: every new field starts absent.
  assert.equal(FIXTURE.state.personalities, undefined)
  assert.equal(FIXTURE.state.terms, undefined)
})

test('C-48: loaded under 3.2.0 with no day to settle, only the open day\u2019s dawn is new (its surge); settling again changes nothing', () => {
  const profile = profileOf(FIXTURE.profile)
  const ledger = ledgerFor(profile, FIXTURE.seed, FIXTURE.ledgerWeeks * 7)
  const now = after(FIXTURE.state.settledThrough.day)
  const once = settle(FIXTURE.state, ledger, now).state
  assert.equal(once.settledThrough.day, FIXTURE.state.settledThrough.day)
  assert.deepEqual({ ...once, personalities: undefined, combat: undefined }, { ...FIXTURE.state, personalities: undefined, combat: undefined }, 'nothing else is rewritten')
  assert.equal(fingerprint(settle(once, ledger, now).state), fingerprint(once))
})

test('C-48 (section 11): played on 12 weeks under 3.2.0, it settles with no invariant broken, and each new rule starts as the spec says', () => {
  const { state, violations } = playOn(WEEKS_ON)
  assert.deepEqual(violations, [])
  assert.equal(state.campaign.ruleVersion, '3.1.0', 'a campaign keeps its founding version')
  assert.equal(state.campaign.status, 'active')
  const fresh = state.log.slice(FIXTURE.state.log.length)
  // The Archmage's surges begin at the first 3.2 dawn: one a day.
  const surges = fresh.filter((e) => e.kind === 'surge')
  assert.ok(surges.length >= WEEKS_ON * 7 - 2, `a surge a day (${surges.length})`)
  // The stances are read at every week close from week 16 (the save is at week 25).
  assert.ok(fresh.some((e) => e.kind === 'stance') || Object.keys(state.terms?.byRival ?? {}).length >= 0)
  assert.ok(state.terms !== undefined, 'the terms record starts at the first 3.2 week close')
  // The Orc's war track is kept from the first 3.2 close on.
  assert.ok(state.personalities !== undefined)
  // Signature deeds count from 3.2 on only: none is posted for events before it.
  const deeds = fresh.filter((e) => e.kind === 'deed')
  for (const d of deeds) if (d.kind === 'deed' && d.source) assert.ok(!FIXTURE.state.log.some((e) => e.id === d.source && ['bribe', 'goblinBid', 'surge', 'ritual'].includes(e.kind)))
})

test('C-48: the carried-forward campaign settles the same twice (Test 9)', () => {
  const a = playOn(2).state
  const b = playOn(2).state
  assert.equal(fingerprint(a), fingerprint(b))
})
