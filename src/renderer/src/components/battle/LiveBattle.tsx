import { playRound } from '../../lib/game/grand'
import type { RoundPlay } from '../../lib/game/grand/field'
import type { CampaignState, ISODate } from '../../lib/game/types'
import { fieldView, type FieldView, type RoundView } from '../../lib/game/view/battle'
import { momentsFor } from '../../lib/game/view/endgame'
import { useCampaign } from '../../state/campaign'
import { useMoments } from '../../state/moments'
import { RoundBoard } from './RoundBoard'

/**
 * A Grand Battle in progress (Ch 11 "A round"): the shared round board, each round played with
 * `playRound`, and any big moment the battle's end raises. Desktop only (the page shows a notice
 * below 1024 px).
 */
export function LiveBattle({ campaign, today, battleId }: { campaign: CampaignState; today: ISODate; battleId: string }): React.JSX.Element | null {
  const act = useCampaign((s) => s.act)
  const view = fieldView(campaign, battleId)
  if (!view) return null

  const play = (p: RoundPlay): RoundView | null => {
    const before = useCampaign.getState().campaign?.log.length ?? 0
    if (!act((s) => playRound(s, battleId, p, today))) return null
    const next = useCampaign.getState().campaign
    if (!next) return null
    useMoments.getState().showAll(momentsFor(next, next.log.slice(before)))
    return fieldView(next, battleId)?.log.at(-1) ?? null
  }

  return <RoundBoard view={view} play={play} />
}

export type { FieldView }
