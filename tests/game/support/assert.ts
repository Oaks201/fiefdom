import assert from 'node:assert/strict'

/** Asserts that `actual` is within `tolerance` of `expected` (floating-point results, and the book's "±0.01"). */
export function near(actual: number, expected: number, tolerance = 1e-9): void {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`)
}
