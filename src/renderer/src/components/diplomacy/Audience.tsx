import { useState } from 'react'
import type { CampaignState, ISODate } from '../../lib/game/types'
import { acceptLine, audienceLine, lineTiers } from '../../lib/game/view/audience'
import type { RivalPanel } from '../../lib/game/view/diplomacy'
import { getPlayerPortrait } from '../../state/art'
import { useLedgerData } from '../../state/hooks'
import { AccordPanel } from '../endgame/Endgame'
import { GameArt, OWNER_COLORS } from '../game/GameArt'
import { PlayerPortrait } from '../game/PlayerPortrait'
import { Modal } from '../Modal'
import { AudienceDebug } from './AudienceDebug' // TEMPORARY: the dev Respect override
import { DealsList } from './DealsList'

/** Twice the portraits' 128-pixel drawing (their files are 4×), so the pixel art stays even. */
const PORTRAIT_WIDTH = 256

/**
 * An audience with one rival court, opened from its card on the Diplomacy page: the player's
 * portrait facing the ruler's, the ruler's line for its Respect tier (rivalLines.json), and below
 * them that court's Accord (none for the Orc, who signs none) and its deals, with `highlight` picking
 * out a hex's row. A deal struck or an Accord sealed turns the line to the rival's accept line. The
 * close button and Escape (Modal) return to the page.
 */
export function Audience({ campaign, today, panel, highlight, onClose }: { campaign: CampaignState; today: ISODate; panel: RivalPanel; highlight?: string; onClose(): void }): React.JSX.Element {
  const rival = panel.rival
  const profile = useLedgerData().profile
  const [accepted, setAccepted] = useState(false)
  const [devRespect, setDevRespect] = useState<number | null>(null) // TEMPORARY: the dev Respect override
  const tierLine = audienceLine(rival, devRespect ?? panel.respect)
  const line = accepted ? acceptLine(rival) : tierLine
  const playerName = profile ? `${profile.title} ${profile.name}`.trim() : 'A New Noble'
  const colors = { ['--court' as string]: OWNER_COLORS[rival].fill, ['--player' as string]: OWNER_COLORS.player.fill }

  return (
    <Modal open onClose={onClose} className={`audience audience--${rival}`} title={`An audience with ${panel.ruler}`} labelledBy="audience-title">
      <div className="audience__stage" style={colors}>
        <figure className="audience__side audience__side--player">
          <div className="audience__frame">
            <PlayerPortrait choice={getPlayerPortrait(campaign)} width={PORTRAIT_WIDTH} name={playerName} className="audience__player-art" />
          </div>
          <figcaption className="audience__name">{playerName}</figcaption>
        </figure>
        <blockquote className={`audience__speech ${line.missing ? 'is-missing' : ''}`} aria-live="polite" data-line={accepted ? 'accept' : String(tierLine.tier ?? '')}>
          {line.text}
        </blockquote>
        <figure className="audience__side audience__side--rival">
          <div className="audience__frame">
            <GameArt slot={panel.portrait} owner={rival} width={PORTRAIT_WIDTH} label={panel.ruler} title={`${panel.ruler}, ${panel.mood}`} />
          </div>
          <figcaption className="audience__name">{panel.ruler}</figcaption>
        </figure>
      </div>
      {import.meta.env.DEV && (
        // TEMPORARY: the dev Respect override
        <AudienceDebug
          real={panel.respect}
          value={devRespect}
          tiers={lineTiers()}
          onChange={(next) => {
            setDevRespect(next)
            setAccepted(false)
          }}
        />
      )}
      <div className="audience__options">
        <AccordPanel campaign={campaign} today={today} rival={rival} onSealed={() => setAccepted(true)} />
        <DealsList campaign={campaign} today={today} rival={rival} highlight={highlight} onStruck={() => setAccepted(true)} />
      </div>
    </Modal>
  )
}
