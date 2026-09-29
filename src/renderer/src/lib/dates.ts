/**
 * Calendar dates are stored as local 'YYYY-MM-DD' strings. They sort correctly as strings,
 * survive JSON untouched, and never drift across time zones or daylight-saving changes.
 */
export type ISODate = string

const DAY_MS = 86_400_000

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
]
export const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3))

const pad = (n: number): string => String(n).padStart(2, '0')

export function toISO(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Parses to local noon, which keeps day arithmetic clear of DST edges. */
export function fromISO(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d, 12, 0, 0, 0)
}

export function isISODate(value: unknown): value is ISODate {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  return toISO(fromISO(value)) === value
}

export function todayISO(now: Date = new Date()): ISODate {
  return toISO(now)
}

export function addDays(iso: ISODate, n: number): ISODate {
  const d = fromISO(iso)
  d.setDate(d.getDate() + n)
  return toISO(d)
}

/** Whole days from `a` to `b` (positive when b is later). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / DAY_MS)
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(iso: ISODate): number {
  return fromISO(iso).getDay()
}

export function startOfWeek(iso: ISODate, weekStartsOn: 0 | 1 = 1): ISODate {
  const offset = (weekday(iso) - weekStartsOn + 7) % 7
  return addDays(iso, -offset)
}

export function daysInRange(start: ISODate, endInclusive: ISODate): ISODate[] {
  const out: ISODate[] = []
  for (let d = start; d <= endInclusive; d = addDays(d, 1)) out.push(d)
  return out
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a < b ? a : b
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a > b ? a : b
}

export function ordinal(n: number): string {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}

export function parts(iso: ISODate): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number)
  return { y, m: m - 1, d }
}

/** "Monday, the 28th of September" (the year is added when it isn't the current one). */
export function formatLong(iso: ISODate, today: ISODate = todayISO()): string {
  const { y, m, d } = parts(iso)
  const year = y !== parts(today).y ? `, ${y}` : ''
  return `${WEEKDAYS[weekday(iso)]}, the ${ordinal(d)} of ${MONTHS[m]}${year}`
}

/** "Sep 28" */
export function formatShort(iso: ISODate): string {
  const { m, d } = parts(iso)
  return `${MONTHS_SHORT[m]} ${d}`
}

/** "Mon, Sep 28" */
export function formatWeekdayShort(iso: ISODate): string {
  return `${WEEKDAYS_SHORT[weekday(iso)]}, ${formatShort(iso)}`
}

/** "Sep 21 – 27, 2026", "Sep 28 – Oct 4, 2026", "Dec 28, 2026 – Jan 3, 2027" */
export function formatRange(a: ISODate, b: ISODate): string {
  const pa = parts(a)
  const pb = parts(b)
  if (pa.y !== pb.y) return `${formatShort(a)}, ${pa.y} – ${formatShort(b)}, ${pb.y}`
  if (pa.m !== pb.m) return `${formatShort(a)} – ${formatShort(b)}, ${pb.y}`
  return `${formatShort(a)} – ${pb.d}, ${pb.y}`
}

/** "the 28th day of September, 2026" — for sealed documents. */
export function formatDocumentDate(iso: ISODate): string {
  const { y, m, d } = parts(iso)
  return `the ${ordinal(d)} day of ${MONTHS[m]}, ${y}`
}

export function formatRelativeDay(iso: ISODate, today: ISODate): string | null {
  const diff = diffDays(today, iso)
  if (diff === 0) return 'Today'
  if (diff === -1) return 'Yesterday'
  if (diff === 1) return 'Tomorrow'
  return null
}
