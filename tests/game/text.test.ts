import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CODEX, codexUnits, requiredTextIds } from '../../src/renderer/src/lib/game/codex'
import {
  HEALER_CHECK_INS,
  RIVAL_MOMENTS,
  TEXT_SOURCES,
  hasText,
  makeT,
  placeholders,
  t,
  textIds,
  validateCatalog,
  type TextEntry
} from '../../src/renderer/src/lib/game/text'

test('the catalog is well formed', () => {
  assert.deepEqual(validateCatalog(), [])
})

test('Ch 17: Healer check-ins, one per Ch 16 guardrail (13), all unapproved', () => {
  const ids = textIds('healer')
  assert.equal(ids.length, 13)
  assert.deepEqual(ids, HEALER_CHECK_INS.map((id) => `healer.${id}`))
  for (const entry of Object.values(TEXT_SOURCES['healer.json'])) assert.equal(entry.approved, false)
})

test('Ch 17: 10 Milestone unlocks', () => {
  assert.deepEqual(textIds('milestones'), Array.from({ length: 10 }, (_, i) => `milestones.m${i + 1}`))
})

test('Ch 17: rival voice lines, 4 rivals × 12 moments', () => {
  assert.equal(RIVAL_MOMENTS.length, 12)
  assert.equal(textIds('rivals').length, 48)
  for (const rival of ['orc', 'goblin', 'dwarf', 'archmage']) {
    assert.deepEqual(textIds(`rivals.${rival}`), RIVAL_MOMENTS.map((m) => `rivals.${rival}.${m}`))
  }
})

test('Ch 17: an event card (title and body) per world event, 14', () => {
  assert.equal(textIds('events').length, 28)
  for (const e of CODEX.events) {
    assert.ok(hasText(`events.${e.id}.title`), e.id)
    assert.ok(hasText(`events.${e.id}.body`), e.id)
  }
})

test('Ch 17: 3 coalition announcements and 4 endings', () => {
  assert.deepEqual(textIds('coalitions'), ['coalitions.firstFall', 'coalitions.lastAlliance', 'coalitions.risingCrown'])
  assert.deepEqual(textIds('endings'), ['endings.ultimatum', 'endings.siege', 'endings.victory', 'endings.fall'])
})

test('Ch 17: a name and a body for each of the 6 Crossings', () => {
  assert.equal(textIds('crossings').length, 12)
  for (const x of CODEX.crossings) {
    assert.ok(hasText(`crossings.${x.id}.name`), x.id)
    assert.ok(hasText(`crossings.${x.id}.body`), x.id)
  }
})

test('Ch 17: one description per Appendix C unit and item', () => {
  const units = codexUnits()
  assert.equal(textIds('units').length, units.length)
  for (const u of units) assert.ok(hasText(`units.${u.id}`), u.id)
  assert.equal(textIds('items').length, 23)
  for (const i of CODEX.items) assert.ok(hasText(`items.${i.id}`), i.id)
})

test('Ch 17: about 20 daily battle report templates', () => {
  assert.equal(textIds('battle').length, 20)
})

test('every slot the codex needs exists', () => {
  assert.deepEqual(requiredTextIds().filter((id) => !hasText(id)), [])
})

test('A3: on a clean checkout every slot is a placeholder, and t() shows its template', () => {
  for (const file of Object.values(TEXT_SOURCES)) {
    for (const [id, entry] of Object.entries(file)) {
      assert.equal(entry.final, null, id)
      assert.equal(t(id), entry.template, id)
    }
  }
})

test('t() returns the template, filled with facts, when final is null', () => {
  assert.equal(t('rivals.orc.surrenderHex', { hex: '3-4' }), 'Orc: hex 3-4 ceded to you.')
  assert.equal(
    t('battle.raid.victory', { rival: 'Ugrak', hex: '3-4', spoils: 12 }),
    'Ugrak raid on hex 3-4: held. Spoils 12.'
  )
})

test('t() leaves a placeholder visible when its fact is missing', () => {
  assert.equal(t('rivals.orc.surrenderHex'), 'Orc: hex {hex} ceded to you.')
})

test('t() returns final when someone has written it', () => {
  const entries = new Map<string, TextEntry>([['units.militia', { template: 'Template {x}.', final: 'Final {x}.' }]])
  assert.equal(makeT(entries)('units.militia', { x: 1 }), 'Final 1.')
})

test('Ch 17: a Healer final is ignored until approved is true', () => {
  const draft = { template: 'Template.', final: 'Written line.', approved: false }
  assert.equal(makeT(new Map([['healer.tooFast', draft]]))('healer.tooFast'), 'Template.')
  assert.equal(makeT(new Map([['healer.tooFast', { ...draft, approved: true }]]))('healer.tooFast'), 'Written line.')
})

test('t() returns [missing:<id>] for an unknown id', () => {
  assert.equal(t('rivals.orc.sings'), '[missing:rivals.orc.sings]')
  assert.equal(t(''), '[missing:]')
})

test('placeholders lists the facts a text uses', () => {
  assert.deepEqual(placeholders('{rival} raid on hex {hex}: lost {hex}.'), ['rival', 'hex'])
})

test('validateCatalog catches a bad entry', () => {
  const sources = { ...TEXT_SOURCES, 'units.json': { 'items.oops': { template: '', final: 3 as never } } }
  const errors = validateCatalog(sources)
  assert.ok(errors.some((e) => e.includes('id must start with "units."')))
  assert.ok(errors.some((e) => e.includes('needs a template')))
  assert.ok(errors.some((e) => e.includes('final must be a string or null')))
  const healer = { 'healer.json': { 'healer.x': { template: 'x', final: null } } }
  assert.ok(validateCatalog(healer).some((e) => e.includes('need "approved"')))
})
