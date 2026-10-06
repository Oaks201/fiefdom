// The machine's own zone must not matter: these tests run in Tokyo while the campaign is in New York.
import './support/tokyo-tz'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  addDays,
  campaignWeek,
  closedDaysSince,
  dayCloseInstant,
  daysInWeek1,
  diffDays,
  isWeekCloseDay,
  nextDawnDay,
  openDay,
  weekOf,
  weekdayOf
} from '../../src/renderer/src/lib/game/clock'

const NY = 'America/New_York'

/** 'YYYY-MM-DD hh:mm' on the wall in `tz`. */
function wallClock(at: Date, tz: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value])
  )
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`
}

test('the test process really runs in Tokyo', () => {
  assert.equal(new Date('2026-10-06T00:00:00Z').getHours(), 9)
})

test('A-01: before 04:00 the open day is still yesterday; from 04:00 it is today', () => {
  // 2026-10-06 is in EDT (UTC−4).
  assert.equal(openDay(new Date('2026-10-06T06:00:00Z'), NY), '2026-10-05') // 02:00 local
  assert.equal(openDay(new Date('2026-10-06T07:59:59.999Z'), NY), '2026-10-05') // 03:59:59.999 local
  assert.equal(openDay(new Date('2026-10-06T08:00:00Z'), NY), '2026-10-06') // 04:00 local
  assert.equal(openDay(new Date('2026-10-07T03:59:00Z'), NY), '2026-10-06') // 23:59 local
})

test('Ch 2 rule 1: a campaign or contract sealed today starts at the next dawn', () => {
  assert.equal(nextDawnDay(new Date('2026-10-06T16:00:00Z'), NY), '2026-10-07') // noon local
  assert.equal(nextDawnDay(new Date('2026-10-06T06:00:00Z'), NY), '2026-10-06') // 02:00 local: dawn is hours away
})

test('dayCloseInstant: 2026-03-07 closes at 2026-03-08 04:00 EDT, the night DST starts', () => {
  assert.equal(dayCloseInstant('2026-03-07', NY).toISOString(), '2026-03-08T08:00:00.000Z')
  assert.equal(dayCloseInstant('2026-03-06', NY).toISOString(), '2026-03-07T09:00:00.000Z') // 04:00 EST
})

test('dayCloseInstant: the night DST ends, 2026-10-31 closes at 2026-11-01 04:00 EST', () => {
  assert.equal(dayCloseInstant('2026-10-31', NY).toISOString(), '2026-11-01T09:00:00.000Z')
  assert.equal(dayCloseInstant('2026-10-30', NY).toISOString(), '2026-10-31T08:00:00.000Z') // 04:00 EDT
})

test('closedDaysSince 2026-10-28 at 2026-11-03 09:00 local is exactly Oct 29 to Nov 2, across the DST change', () => {
  const now = new Date('2026-11-03T14:00:00Z') // 09:00 EST
  assert.deepEqual(closedDaysSince('2026-10-28', now, NY), [
    '2026-10-29',
    '2026-10-30',
    '2026-10-31',
    '2026-11-01',
    '2026-11-02'
  ])
  // Just before Nov 2 closes, Nov 2 is still open.
  assert.deepEqual(closedDaysSince('2026-10-28', new Date('2026-11-03T08:59:59Z'), NY).at(-1), '2026-11-01')
  // Nothing to settle when everything is settled.
  assert.deepEqual(closedDaysSince('2026-11-02', now, NY), [])
  assert.deepEqual(closedDaysSince('2026-11-05', now, NY), [])
})

test('A-01, A-03: every day closes once, at 04:00 local, in zones with odd offsets and DST', () => {
  for (const tz of [NY, 'Europe/London', 'Australia/Sydney', 'Australia/Lord_Howe', 'Asia/Kathmandu', 'Pacific/Chatham', 'UTC']) {
    let previous = 0
    for (let day = '2025-12-25'; day <= '2027-01-05'; day = addDays(day, 1)) {
      const close = dayCloseInstant(day, tz)
      assert.ok(close.getTime() > previous, `${tz} ${day} closes after the day before`)
      previous = close.getTime()
      assert.equal(wallClock(close, tz), `${addDays(day, 1)} 04:00`, `${tz} ${day}`)
      assert.equal(openDay(close, tz), addDays(day, 1), `${tz} ${day} closed at its close instant`)
      assert.equal(openDay(new Date(close.getTime() - 1), tz), day, `${tz} ${day} open just before`)
    }
  }
})

test('A-03: an unknown time zone is refused', () => {
  assert.throws(() => openDay(new Date('2026-10-06T08:00:00Z'), 'Mars/Olympus_Mons'), RangeError)
})

test('A-04: starting Thu 2026-10-08 with Monday weeks, week 1 is Oct 8 to 11 and week 2 starts Oct 12', () => {
  for (const day of ['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']) {
    assert.equal(campaignWeek('2026-10-08', day, 1), 1, day)
  }
  assert.equal(campaignWeek('2026-10-08', '2026-10-12', 1), 2)
  assert.equal(campaignWeek('2026-10-08', '2026-10-18', 1), 2)
  assert.equal(campaignWeek('2026-10-08', '2026-10-19', 1), 3)
  assert.equal(campaignWeek('2026-10-08', '2027-10-07', 1), 53)
  assert.equal(campaignWeek('2026-10-08', '2026-10-07', 1), 0)
  assert.equal(daysInWeek1('2026-10-08', 1), 4)
})

test('A-04: week 1 is a full week when the campaign starts on weekStartsOn', () => {
  assert.equal(daysInWeek1('2026-10-12', 1), 7) // a Monday
  assert.equal(daysInWeek1('2026-10-11', 1), 1) // a Sunday: closes the same night
  assert.equal(daysInWeek1('2026-10-11', 0), 7) // a Sunday, with Sunday weeks
  assert.equal(campaignWeek('2026-10-11', '2026-10-12', 1), 2)
})

test('weekOf and isWeekCloseDay follow settings.weekStartsOn', () => {
  assert.equal(weekOf('2026-10-08', 1), '2026-10-05')
  assert.equal(weekOf('2026-10-08', 0), '2026-10-04')
  assert.equal(weekOf('2026-10-05', 1), '2026-10-05')
  assert.equal(isWeekCloseDay('2026-10-11', 1), true) // Sunday closes a Monday week
  assert.equal(isWeekCloseDay('2026-10-10', 1), false)
  assert.equal(isWeekCloseDay('2026-10-10', 0), true) // Saturday closes a Sunday week
  assert.equal(isWeekCloseDay('2026-11-01', 1), true) // the DST change doesn't matter
})

test('calendar arithmetic ignores the machine zone and DST', () => {
  assert.equal(addDays('2026-03-07', 1), '2026-03-08')
  assert.equal(addDays('2026-11-01', 1), '2026-11-02')
  assert.equal(addDays('2026-12-31', 1), '2027-01-01')
  assert.equal(addDays('2024-02-28', 1), '2024-02-29')
  assert.equal(addDays('2026-10-05', -7), '2026-09-28')
  assert.equal(diffDays('2026-03-01', '2026-04-01'), 31)
  assert.equal(diffDays('2026-11-03', '2026-10-28'), -6)
  assert.equal(weekdayOf('2026-10-08'), 4) // Thursday
  assert.equal(weekdayOf('2026-10-10'), 6) // Saturday, the siege day
})
