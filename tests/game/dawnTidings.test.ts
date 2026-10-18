/**
 * Patch 6 (D-47; spec section 3): when the Dawn tidings card shows. Once per campaign day, never over
 * another card, off by the Settings switch; a failing store shows it and throws nothing (C-78, C-79).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dawnTidingsDue, useDawnTidings, type DawnTidingsCheck } from '../../src/renderer/src/state/dawnTidings'

const DAY = '2026-11-05'
const base: DawnTidingsCheck = { openDay: DAY, seen: null, on: true, playable: true, blocked: false }

test('C-78: the card is due once per campaign day, until it is dismissed for that day', () => {
  assert.equal(dawnTidingsDue(base), true)
  assert.equal(dawnTidingsDue({ ...base, seen: '2026-11-04' }), true, 'dismissed yesterday: due today')
  assert.equal(dawnTidingsDue({ ...base, seen: DAY }), false, 'dismissed today: not again')
})

test('C-78: never over another card or dialog, never without a playable campaign, never when switched off', () => {
  assert.equal(dawnTidingsDue({ ...base, blocked: true }), false)
  assert.equal(dawnTidingsDue({ ...base, playable: false }), false)
  assert.equal(dawnTidingsDue({ ...base, openDay: null }), false)
  assert.equal(dawnTidingsDue({ ...base, on: false }), false)
})

test('C-79: with no browser storage the card still shows, and dismissing it holds for the session without throwing', () => {
  // Tests run without localStorage: every read and write fails and is caught.
  assert.equal(typeof (globalThis as { localStorage?: unknown }).localStorage, 'undefined')
  const store = useDawnTidings.getState()
  assert.equal(store.seen, null)
  assert.equal(store.on, true)
  assert.doesNotThrow(() => useDawnTidings.getState().dismiss(DAY))
  assert.equal(useDawnTidings.getState().seen, DAY)
  assert.doesNotThrow(() => useDawnTidings.getState().setOn(false))
  assert.equal(useDawnTidings.getState().on, false)
  useDawnTidings.getState().setOn(true)
})
