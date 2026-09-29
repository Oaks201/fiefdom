import { create } from 'zustand'

/** Little "+4" numbers that drift up from wherever reputation was just earned. */
export interface FloatText {
  id: number
  text: string
  x: number
  y: number
  tone: 'gain' | 'loss' | 'neutral'
}

interface FloatState {
  floats: FloatText[]
}

let nextId = 1

export const useFloats = create<FloatState>(() => ({ floats: [] }))

export function emitFloat(text: string, from: Element | { x: number; y: number }, tone: FloatText['tone'] = 'gain'): void {
  let x: number
  let y: number
  if (from instanceof Element) {
    const r = from.getBoundingClientRect()
    x = r.left + r.width / 2
    y = r.top + r.height / 2
  } else {
    x = from.x
    y = from.y
  }
  const id = nextId++
  useFloats.setState((s) => ({ floats: [...s.floats, { id, text, x, y, tone }] }))
  setTimeout(() => useFloats.setState((s) => ({ floats: s.floats.filter((f) => f.id !== id) })), 1400)
}
