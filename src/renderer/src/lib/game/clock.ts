/**
 * Campaign time. Real time enters the game only here, and only as a `now: Date` parameter.
 *
 * A campaign day is a ledger calendar date (A-01). Day D is open from 04:00 on D to 04:00 on
 * D+1 in the campaign time zone; at 04:00 on D+1 it closes and can be settled. A week closes at
 * 04:00 on `weekStartsOn`, which closes the last day of the calendar week (A-04).
 *
 * Every function works for any IANA zone through `Intl.DateTimeFormat`, whatever the machine's
 * own zone, and is safe across daylight-saving changes: day arithmetic runs on calendar dates in
 * UTC, and wall-clock times are read in the campaign zone.
 */
import { RULES } from './rules'
import type { ISODate, WeekStartsOn } from './types'

const SECOND_MS = 1_000 // rules-ok: milliseconds in a second
const HOUR_MS = 3_600_000 // rules-ok: milliseconds in an hour
const DAY_MS = 86_400_000 // rules-ok: milliseconds in a day
const ISO_DATE_LENGTH = 10 // rules-ok: characters in 'YYYY-MM-DD'

// ── Calendar dates, independent of any time zone ─────────────────────────────

function utcOf(day: ISODate): number {
  const [y, m, d] = day.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function isoOfUtc(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, ISO_DATE_LENGTH)
}

/** The day `n` days after `day` (before it when negative). */
export function addDays(day: ISODate, n: number): ISODate {
  return isoOfUtc(utcOf(day) + n * DAY_MS)
}

/** Whole days from `a` to `b`, positive when `b` is later. */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((utcOf(b) - utcOf(a)) / DAY_MS)
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(day: ISODate): number {
  return new Date(utcOf(day)).getUTCDay()
}

// ── Wall-clock time in a zone ────────────────────────────────────────────────

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz)
  if (!f) {
    // Throws a RangeError for an unknown zone, which is what we want.
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric'
    })
    formatters.set(tz, f)
  }
  return f
}

interface Wall {
  y: number
  m: number
  d: number
  h: number
  /** The wall-clock reading, to the second, encoded as if it were a UTC instant. */
  ms: number
}

/** What a clock on the wall in `tz` reads at the instant `ms`. */
function wallAt(ms: number, tz: string): Wall {
  const parts: Record<string, number> = {}
  for (const p of formatter(tz).formatToParts(new Date(ms))) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value)
  }
  const { year: y, month: m, day: d, hour: h, minute, second } = parts
  return { y, m, d, h, ms: Date.UTC(y, m - 1, d, h, minute, second) }
}

/** The zone's offset from UTC at the instant `ms`. */
function offsetAt(ms: number, tz: string): number {
  return wallAt(ms, tz).ms - Math.floor(ms / SECOND_MS) * SECOND_MS
}

/**
 * The first instant at which the wall clock in `tz` reads `hour`:00 on `day`. When that reading
 * happens twice (clocks going back) it is the earlier one; when it never happens (clocks going
 * forward over it) it is the moment the clocks jump past it.
 */
function instantOfWall(day: ISODate, hour: number, tz: string): number {
  const wall = utcOf(day) + hour * HOUR_MS
  const before = wall - offsetAt(wall - DAY_MS, tz)
  const after = wall - offsetAt(wall + DAY_MS, tz)
  const exact = [before, after].filter((t) => wallAt(t, tz).ms === wall).sort((a, b) => a - b)
  if (exact.length > 0) return exact[0]
  // A gap: search for the first second whose wall reading is at or past the target.
  let lo = Math.min(before, after)
  let hi = Math.max(before, after)
  while (hi - lo > SECOND_MS) {
    const mid = lo + Math.floor((hi - lo) / SECOND_MS / 2) * SECOND_MS // rules-ok: halving
    if (wallAt(mid, tz).ms >= wall) hi = mid
    else lo = mid
  }
  return hi
}

// ── Campaign days ────────────────────────────────────────────────────────────

/** The campaign day still open at `now`: before 04:00 local it is yesterday's date. */
export function openDay(now: Date, tz: string): ISODate {
  const w = wallAt(now.getTime(), tz)
  const today = isoOfUtc(Date.UTC(w.y, w.m - 1, w.d))
  return w.h < RULES.clock.dayCloseHour ? addDays(today, -1) : today
}

/** The day that begins at the next dawn: where a campaign or a sealed contract starts (Ch 2 rule 1). */
export function nextDawnDay(now: Date, tz: string): ISODate {
  return addDays(openDay(now, tz), 1)
}

/** The instant `day` closes: 04:00 on the next date in `tz`. */
export function dayCloseInstant(day: ISODate, tz: string): Date {
  return new Date(instantOfWall(addDays(day, 1), RULES.clock.dayCloseHour, tz))
}

/** Every day after `lastSettled` that has closed by `now`, oldest first. */
export function closedDaysSince(lastSettled: ISODate, now: Date, tz: string): ISODate[] {
  const open = openDay(now, tz)
  const days: ISODate[] = []
  for (let d = addDays(lastSettled, 1); d < open; d = addDays(d, 1)) days.push(d)
  return days
}

// ── Weeks ────────────────────────────────────────────────────────────────────

/** The first day of the calendar week that holds `day`. */
export function weekOf(day: ISODate, weekStartsOn: WeekStartsOn): ISODate {
  const offset = (weekdayOf(day) - weekStartsOn + RULES.clock.daysPerWeek) % RULES.clock.daysPerWeek
  return addDays(day, -offset)
}

/** True when `day` is the last day of its week, so its close is also a week close. */
export function isWeekCloseDay(day: ISODate, weekStartsOn: WeekStartsOn): boolean {
  return weekOf(addDays(day, 1), weekStartsOn) === addDays(day, 1)
}

/**
 * Campaign week N = 1 + the number of week closes since the campaign started (A-04). Week 1
 * runs from `startDay` to the first week close and may be partial. Days before the start are
 * week 0.
 */
export function campaignWeek(startDay: ISODate, day: ISODate, weekStartsOn: WeekStartsOn): number {
  if (day < startDay) return 0
  return 1 + diffDays(weekOf(startDay, weekStartsOn), weekOf(day, weekStartsOn)) / RULES.clock.daysPerWeek
}

/** How many days campaign week 1 has (A-04): from the start to the end of its calendar week. */
export function daysInWeek1(startDay: ISODate, weekStartsOn: WeekStartsOn): number {
  return RULES.clock.daysPerWeek - diffDays(weekOf(startDay, weekStartsOn), startDay)
}
