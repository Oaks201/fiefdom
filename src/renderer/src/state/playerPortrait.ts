/**
 * The player's portrait files and the standing card.
 *
 * Which portrait files exist is found by loading each one as an image: the owner adds them over
 * time, so there is nothing to register. The answers are kept for the session; development can
 * check again (`recheck`). The standing seen last is remembered in this app's local storage, not in
 * the save or the ledger, so a standing that grew raises "Your standing has grown" at the next
 * settlement: a launch, or a day's close.
 */
import { useEffect } from 'react'
import { create } from 'zustand'
import type { CampaignState } from '../lib/game/types'
import { pathWords, portraitUrl, resolvePortrait, standingGrew, type PortraitChoice, type ResolvedPortrait, type SeenStanding } from '../lib/game/view/playerPortrait'
import { getPlayerPortrait } from './art'
import { useMoments, type Moment } from './moments'

interface PortraitFiles {
  /** Each file checked so far: whether it loaded. */
  known: Record<string, boolean>
  /** Bumped by `recheck`, so a file added since is found (and a replaced one reloads). */
  revision: number
  check(files: readonly string[]): void
  recheck(): void
}

/** A file's URL at a revision; development adds the revision so a replaced file reloads. */
function srcOf(file: string, revision: number): string {
  return `${portraitUrl(file)}${import.meta.env.DEV && revision > 0 ? `?v=${revision}` : ''}`
}

const checking = new Set<string>()

export const usePortraitFiles = create<PortraitFiles>((set, get) => ({
  known: {},
  revision: 0,
  check(files) {
    const revision = get().revision
    for (const file of files) {
      if (file in get().known || checking.has(file)) continue
      checking.add(file)
      const img = new Image()
      const done = (ok: boolean): void => {
        checking.delete(file)
        if (get().revision === revision) set((s) => ({ known: { ...s.known, [file]: ok } }))
      }
      img.onload = () => done(true)
      img.onerror = () => done(false)
      img.src = srcOf(file, revision)
    }
  },
  recheck() {
    checking.clear()
    set((s) => ({ known: {}, revision: s.revision + 1 }))
  }
}))

/** The portrait to draw for a choice: the first file in its chain that exists, checking the chain as needed. */
export function usePlayerPortrait(choice: PortraitChoice): ResolvedPortrait & { src: string | null } {
  const known = usePortraitFiles((s) => s.known)
  const revision = usePortraitFiles((s) => s.revision)
  const check = usePortraitFiles((s) => s.check)
  const chain = choice.chain.join('|')
  useEffect(() => check(chain ? chain.split('|') : []), [check, chain, revision])
  const resolved = resolvePortrait(choice, (file) => known[file])
  return { ...resolved, src: resolved.file ? srcOf(resolved.file, revision) : null }
}

// ── The standing card ────────────────────────────────────────────────────────

const SEEN_KEY = 'fiefdom.playerStanding'

/** The standing last seen on this computer, or null. */
export function readSeenStanding(): SeenStanding | null {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    const value: unknown = raw ? JSON.parse(raw) : null
    if (typeof value !== 'object' || value === null) return null
    const { tier, key } = value as Record<string, unknown>
    return typeof tier === 'number' && typeof key === 'string' ? { tier, key } : null
  } catch {
    return null
  }
}

/** Sets (or, with null, forgets) the standing last seen. */
export function writeSeenStanding(seen: SeenStanding | null): void {
  try {
    if (seen) localStorage.setItem(SEEN_KEY, JSON.stringify(seen))
    else localStorage.removeItem(SEEN_KEY)
  } catch {
    // Storage is unavailable: the card simply won't be raised.
  }
}

/** The standing card: "Your standing has grown", the tier and path in plain facts, and the new portrait. */
export function standingMoment(choice: PortraitChoice): Moment {
  return {
    id: `standing:${choice.key}`,
    slot: 'player.portrait',
    titleId: 'herald.standing.grown',
    bodyId: 'herald.standing.grownBody',
    facts: { tier: choice.tier, path: pathWords(choice.path) },
    sound: 'milestone',
    portrait: choice
  }
}

/** After a settlement: raises the standing card when the standing grew since it was last seen, then remembers it. A first look only remembers. */
export function noticeStanding(campaign: CampaignState): void {
  const choice = getPlayerPortrait(campaign)
  const next = { tier: choice.tier, key: choice.key }
  const seen = readSeenStanding()
  if (standingGrew(seen, next)) useMoments.getState().show(standingMoment(choice))
  if (!seen || seen.tier !== next.tier || seen.key !== next.key) writeSeenStanding(next)
}
