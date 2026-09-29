import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  addDays,
  diffDays,
  daysInRange,
  formatLong,
  formatRange,
  isISODate,
  ordinal,
  startOfWeek,
  weekday
} from '../src/renderer/src/lib/dates'

test('addDays crosses months, years and DST changes', () => {
  assert.equal(addDays('2026-09-28', 7), '2026-10-05')
  assert.equal(addDays('2026-12-31', 1), '2027-01-01')
  assert.equal(addDays('2026-03-08', 1), '2026-03-09') // US DST starts
  assert.equal(addDays('2026-11-01', 1), '2026-11-02') // US DST ends
  assert.equal(addDays('2024-02-28', 1), '2024-02-29')
  assert.equal(addDays('2026-10-05', -7), '2026-09-28')
})

test('diffDays and ranges', () => {
  assert.equal(diffDays('2026-09-28', '2026-10-04'), 6)
  assert.equal(diffDays('2026-10-04', '2026-09-28'), -6)
  assert.equal(diffDays('2026-03-01', '2026-04-01'), 31)
  assert.deepEqual(daysInRange('2026-09-29', '2026-10-01'), ['2026-09-29', '2026-09-30', '2026-10-01'])
})

test('weekdays and week starts', () => {
  assert.equal(weekday('2026-09-28'), 1) // Monday
  assert.equal(startOfWeek('2026-10-04', 1), '2026-09-28') // Sunday → previous Monday
  assert.equal(startOfWeek('2026-09-28', 1), '2026-09-28')
  assert.equal(startOfWeek('2026-09-30', 0), '2026-09-27')
})

test('validation and formatting', () => {
  assert.ok(isISODate('2026-02-28'))
  assert.ok(!isISODate('2026-02-30'))
  assert.ok(!isISODate('2026-2-3'))
  assert.equal(ordinal(1), '1st')
  assert.equal(ordinal(12), '12th')
  assert.equal(ordinal(22), '22nd')
  assert.equal(ordinal(23), '23rd')
  assert.equal(formatLong('2026-09-28', '2026-09-28'), 'Monday, the 28th of September')
  assert.equal(formatLong('2025-12-25', '2026-09-28'), 'Thursday, the 25th of December, 2025')
  assert.equal(formatRange('2026-09-21', '2026-09-27'), 'Sep 21 – 27, 2026')
  assert.equal(formatRange('2026-09-28', '2026-10-04'), 'Sep 28 – Oct 4, 2026')
  assert.equal(formatRange('2026-12-28', '2027-01-03'), 'Dec 28, 2026 – Jan 3, 2027')
})
