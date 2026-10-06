/**
 * Seeded randomness (Ch 2 rule 7): every draw is a pure function of the campaign seed, the
 * campaign day and a purpose label, so reloading, resettling or reinstalling never changes a
 * result. Nothing else in `lib/game` may produce randomness.
 *
 * Labels name the purpose, for example 'threat', 'raider', 'villages:3'. Two draws with the same
 * seed, day and label are the same draw, so use distinct labels (or a `stream`) for distinct
 * decisions.
 */
import { hashSeed } from '../contracts'
import type { ISODate } from './types'

/** 2^32, to turn a 32-bit integer into a fraction in [0, 1). */
const UINT32_RANGE = 4_294_967_296 // rules-ok: 2^32, the range of a 32-bit hash

/** mulberry32's output function: spreads FNV-1a's weak low bits across the whole word. */
function mix(hash: number): number {
  let t = (hash + 0x6d2b79f5) | 0 // rules-ok: mulberry32 increment
  t = Math.imul(t ^ (t >>> 15), t | 1) // rules-ok: mulberry32 shift
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61) // rules-ok: mulberry32 shift and odd constant
  return (t ^ (t >>> 14)) >>> 0 // rules-ok: mulberry32 shift
}

/** A value in [0, 1), the same for the same seed, day and label in every process. */
export function draw(seed: number, date: ISODate, label: string): number {
  return mix(hashSeed(`${seed}|${date}|${label}`)) / UINT32_RANGE
}

// ── Shaping a uniform draw ───────────────────────────────────────────────────

function shapeRoll(u: number, lo: number, hi: number): number {
  return lo + (hi - lo) * u
}

function shapeInt(u: number, lo: number, hi: number): number {
  if (!Number.isInteger(lo) || !Number.isInteger(hi) || hi < lo) {
    throw new RangeError(`int needs whole bounds with lo ≤ hi, got ${lo} and ${hi}`)
  }
  return lo + Math.floor(u * (hi - lo + 1))
}

function shapePick<T>(u: number, list: readonly T[]): T {
  if (list.length === 0) throw new RangeError('pick needs a non-empty list')
  return list[Math.floor(u * list.length)]
}

function shapeWeighted<T>(u: number, list: readonly T[], weights: readonly number[]): T {
  if (list.length === 0 || list.length !== weights.length) {
    throw new RangeError('weighted needs a non-empty list and one weight per entry')
  }
  let total = 0
  for (const w of weights) {
    if (!(w >= 0) || !Number.isFinite(w)) throw new RangeError(`weights must be finite and ≥ 0, got ${w}`)
    total += w
  }
  if (total <= 0) throw new RangeError('weighted needs at least one positive weight')
  let target = u * total
  for (let i = 0; i < list.length; i++) {
    if (target < weights[i]) return list[i]
    target -= weights[i]
  }
  // Floating-point leftovers land on the last entry with any weight.
  for (let i = list.length - 1; i >= 0; i--) if (weights[i] > 0) return list[i]
  return list[list.length - 1]
}

// ── One-shot helpers ─────────────────────────────────────────────────────────

/** A value in [lo, hi). */
export function roll(seed: number, date: ISODate, label: string, lo: number, hi: number): number {
  return shapeRoll(draw(seed, date, label), lo, hi)
}

/** A whole number from lo to hi, both included. */
export function int(seed: number, date: ISODate, label: string, lo: number, hi: number): number {
  return shapeInt(draw(seed, date, label), lo, hi)
}

/** True with probability p. */
export function chance(seed: number, date: ISODate, label: string, p: number): boolean {
  return draw(seed, date, label) < p
}

/** One entry of a non-empty list, each equally likely. */
export function pick<T>(seed: number, date: ISODate, label: string, list: readonly T[]): T {
  return shapePick(draw(seed, date, label), list)
}

/** One entry, chosen in proportion to its weight. */
export function weighted<T>(
  seed: number,
  date: ISODate,
  label: string,
  list: readonly T[],
  weights: readonly number[]
): T {
  return shapeWeighted(draw(seed, date, label), list, weights)
}

/** A shuffled copy of the list (Fisher–Yates). */
export function shuffle<T>(seed: number, date: ISODate, label: string, list: readonly T[]): T[] {
  return stream(seed, date, label).shuffle(list)
}

// ── Streams: several draws for one purpose ───────────────────────────────────

export interface Stream {
  /** How many draws this stream has made. */
  readonly drawn: number
  next(): number
  roll(lo: number, hi: number): number
  int(lo: number, hi: number): number
  chance(p: number): boolean
  pick<T>(list: readonly T[]): T
  weighted<T>(list: readonly T[], weights: readonly number[]): T
  shuffle<T>(list: readonly T[]): T[]
}

/**
 * A sequence of draws for one purpose. Draw i is `draw(seed, date, label + '#' + i)`, so a
 * stream is as reproducible as single draws and never depends on any other label.
 */
export function stream(seed: number, date: ISODate, label: string): Stream {
  let i = 0
  const next = (): number => draw(seed, date, `${label}#${i++}`)
  return {
    get drawn() {
      return i
    },
    next,
    roll: (lo, hi) => shapeRoll(next(), lo, hi),
    int: (lo, hi) => shapeInt(next(), lo, hi),
    chance: (p) => next() < p,
    pick: (list) => shapePick(next(), list),
    weighted: (list, weights) => shapeWeighted(next(), list, weights),
    shuffle: (list) => {
      const out = list.slice()
      for (let j = out.length - 1; j > 0; j--) {
        const k = shapeInt(next(), 0, j)
        ;[out[j], out[k]] = [out[k], out[j]]
      }
      return out
    }
  }
}
