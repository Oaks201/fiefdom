import type { WeightUnit } from './types'

const nf = new Intl.NumberFormat('en-US')

export function formatNumber(n: number): string {
  return nf.format(Math.round(n))
}

/** 10000 → "10k", 2500 → "2.5k" */
export function formatCompact(n: number): string {
  if (Math.abs(n) >= 1000) {
    const k = n / 1000
    return `${Number.isInteger(k) ? k : k.toFixed(1).replace(/\.0$/, '')}k`
  }
  return String(Math.round(n))
}

export function formatWeight(w: number, unit: WeightUnit): string {
  return `${w.toFixed(1)} ${unit}`
}

/** Signed with a true minus sign: "−1.4", "+0.6", "±0" */
export function formatSigned(n: number, digits = 1): string {
  if (n === 0) return '±0'
  const s = Math.abs(n).toFixed(digits)
  return n < 0 ? `−${s}` : `+${s}`
}

export function formatRep(n: number): string {
  return `${n >= 0 ? '+' : '−'}${formatNumber(Math.abs(n))}`
}

/**
 * Parses what someone typed into a tally. Accepts "8432", "8,432", "8.4k", and relative
 * entries like "+1200" or "-300" (applied to `current`). Returns null when it isn't a number.
 */
export function parseTally(input: string, current: number | undefined): number | undefined | null {
  const raw = input.trim().replace(/[,\s_]/g, '').toLowerCase()
  if (raw === '') return undefined
  const m = /^([+-]?)(\d+(?:\.\d+)?|\.\d+)(k?)$/.exec(raw)
  if (!m) return null
  let value = parseFloat(m[2]) * (m[3] ? 1000 : 1)
  if (m[1] === '+') value = (current ?? 0) + value
  else if (m[1] === '-') value = (current ?? 0) - value
  return Math.max(0, Math.round(value))
}

export function parseDecimal(input: string): number {
  const raw = input.trim().replace(',', '.')
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(raw)) return NaN
  return parseFloat(raw)
}

export function parseInteger(input: string): number {
  const raw = input.trim().replace(/[,\s_]/g, '')
  if (!/^\d+$/.test(raw)) return NaN
  return parseInt(raw, 10)
}

/** "just now", "4 minutes ago", "2 hours ago", "3 days ago" */
export function formatAgo(then: number, now: number = Date.now()): string {
  const s = Math.max(0, Math.round((now - then) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return m === 1 ? 'a minute ago' : `${m} minutes ago`
  const h = Math.round(m / 60)
  if (h < 24) return h === 1 ? 'an hour ago' : `${h} hours ago`
  const d = Math.round(h / 24)
  return d === 1 ? 'a day ago' : `${d} days ago`
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}
