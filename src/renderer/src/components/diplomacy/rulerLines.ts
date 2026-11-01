import { rulerLines } from '../../lib/game/view/audience'

/**
 * Patch 8 (D-62): the rulers' lines the Audience and the Herald read. A development build lays Claude's drafts
 * beside Rich's lines so they can be read in the game; a release build reads Rich's file alone.
 */
export const RULER_LINES: unknown = rulerLines(import.meta.env.DEV)
