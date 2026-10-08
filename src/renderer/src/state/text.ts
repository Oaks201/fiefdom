/**
 * The story text in the renderer (book Ch 17 "Writing", A-46): every narrative line comes from the
 * catalog through `t(id, facts)`, its written `final` once someone has written it (and, for the
 * Healer, approved it), otherwise its plain-fact placeholder. Components call `useText()`.
 */
import { t, TEXT_SOURCES, type TextFacts } from '../lib/game/text'

export type Translate = (id: string, facts?: TextFacts) => string

/** The catalog's `t`. The catalog is fixed at build time, so this never re-renders anything. */
export function useText(): Translate {
  return t
}

export interface TextFileProgress {
  file: string
  written: number
  placeholder: number
}

/** Per catalog file, how many slots have their final text and how many still show the placeholder (the dev overlay). */
export function textProgress(): TextFileProgress[] {
  return Object.entries(TEXT_SOURCES).map(([file, entries]) => {
    const all = Object.entries(entries)
    const written = all.filter(([id, e]) => e.final !== null && (!id.startsWith('healer.') || e.approved === true)).length
    return { file, written, placeholder: all.length - written }
  })
}
