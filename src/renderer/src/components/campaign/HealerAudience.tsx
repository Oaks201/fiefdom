import { useMemo, useState } from 'react'
import { GiHealthPotion, GiScrollUnfurled } from 'react-icons/gi'
import { formatWeekdayShort } from '../../lib/dates'
import { formatRep } from '../../lib/format'
import type { CampaignState, ISODate } from '../../lib/game/types'
import { healerAudience, type HealerQuestion, type HealerRequestView } from '../../lib/game/view/healer'
import { weighIns } from '../../lib/ledger'
import { toLb } from '../../lib/game/weight'
import type { Ledger } from '../../lib/types'
import { getPlayerPortrait } from '../../state/art'
import { useLedgerData } from '../../state/hooks'
import { GameArt, OWNER_COLORS } from '../game/GameArt'
import { PlayerPortrait } from '../game/PlayerPortrait'
import { Modal } from '../Modal'

/** Twice the portraits' 128-pixel drawing, as the rulers' Audience draws them. */
const PORTRAIT_WIDTH = 256

/** Remedy's color on the stage: the apothecary's green-black. */
const HEALER_COLOR = '#2f5d55'

/** How a request stands so far, in plain terms: "5 of 6 days", "72% of 80%". */
export function requestSoFar(r: HealerRequestView): string {
  if (r.paid) return 'Met and paid.'
  const so = r.unit === 'days' ? `${r.soFar} of ${r.target} days so far` : `${r.soFar}% of the pool so far, of ${r.target}%`
  return r.met ? `${so}: met, paid at today’s close.` : `${so}.`
}

/** The rule beside her request, plainly: what meeting it pays, and that missing it costs nothing. */
export function requestRule(r: HealerRequestView): string {
  const respite = r.toRespite === 1 ? 'this one banks a Respite day' : `${r.toRespite} more met bank a Respite day`
  return `Met by the week’s close: ${formatRep(r.reward)} at the close of the day it is met, and ${respite}. Missed: nothing is lost.`
}

/**
 * Her request as a card (H3): her ask, how the week stands so far, and its rule. On the Chronicle and in her
 * Audience.
 */
export function HealerRequestCard({ request }: { request: HealerRequestView }): React.JSX.Element {
  return (
    <section className={`panel healer-request${request.met ? ' is-met' : ''}`} aria-label="Remedy’s request">
      <header className="panel__head">
        <h3 className="panel__title">
          <GiScrollUnfurled aria-hidden="true" /> Remedy’s request
        </h3>
        <span className="panel__aside">Until {formatWeekdayShort(request.until)}</span>
      </header>
      {request.lastMissed && (
        <p className="muted healer-request__last" data-text-id={request.lastMissed.textId}>
          {request.lastMissed.text}
        </p>
      )}
      <p className="healer-request__ask" data-text-id={request.ask.textId}>
        {request.ask.text}
      </p>
      <p className={`healer-request__so-far${request.met ? ' is-kept' : ''}`}>{requestSoFar(request)}</p>
      {request.metWords && (
        <p className="healer-card" data-text-id={request.metWords.textId}>
          <GiHealthPotion aria-hidden="true" /> {request.metWords.text}
        </p>
      )}
      <p className="muted healer-request__rule">{requestRule(request)}</p>
    </section>
  )
}

/** The player's weigh-ins in lb, from the ledger (live). */
function weighInsLb(ledger: Ledger): { date: ISODate; weight: number }[] {
  return weighIns(ledger).map((w) => ({ date: w.date, weight: toLb(w.weight, ledger.settings.unit) }))
}

/**
 * An Audience with Remedy (Patch 9, D-68, D-76, H4): the player's portrait facing hers, her opening (this
 * week's report), her request, and her answers to the questions the player may put to her, each from the
 * rules in plain facts. Talking pays nothing. The close button and Escape (Modal) return to the page.
 */
export function HealerAudience({ campaign, today, onClose }: { campaign: CampaignState; today: ISODate; onClose(): void }): React.JSX.Element {
  const ledger = useLedgerData()
  const profile = ledger.profile
  const view = useMemo(() => healerAudience(campaign, ledger, weighInsLb(ledger), today), [campaign, ledger, today])
  const [asked, setAsked] = useState<HealerQuestion | null>(null)
  const playerName = profile ? `${profile.title} ${profile.name}`.trim() : 'A New Noble'
  const colors = { ['--court' as string]: HEALER_COLOR, ['--player' as string]: OWNER_COLORS.player.fill }
  return (
    <Modal open onClose={onClose} className="audience audience--healer" title="An audience with Remedy" labelledBy="healer-audience-title">
      <div className="audience__stage" style={colors}>
        <figure className="audience__side audience__side--player">
          <div className="audience__frame">
            <PlayerPortrait choice={getPlayerPortrait(campaign)} width={PORTRAIT_WIDTH} name={playerName} className="audience__player-art" />
          </div>
          <figcaption className="audience__name">{playerName}</figcaption>
        </figure>
        <blockquote className="audience__speech" aria-live="polite">
          <p className="audience__greeting" data-text-id={view.opening.textId}>
            {view.opening.text}
          </p>
          {view.request && !asked && (
            <p className="audience__ask" data-text-id={view.request.ask.textId}>
              {view.request.ask.text}
            </p>
          )}
          {asked && (
            <p className="audience__reply">
              {asked.answer
                .filter((a) => a.textId !== view.opening.textId)
                .map((a) => a.text)
                .join(' ') || view.opening.text}
            </p>
          )}
        </blockquote>
        <figure className="audience__side audience__side--rival">
          <div className="audience__frame">
            <GameArt slot="portrait.healer" width={PORTRAIT_WIDTH} label="Remedy" title="Remedy, the Healer" />
          </div>
          <figcaption className="audience__name">Remedy</figcaption>
        </figure>
      </div>
      <nav className="audience__questions" aria-label="Ask Remedy">
        {view.questions.map((q) => (
          <button key={q.id} type="button" className={`btn btn--small ${asked?.id === q.id ? 'is-on' : 'btn--ghost'}`} onClick={() => setAsked(q)}>
            {q.label}
          </button>
        ))}
      </nav>
      {view.request && <HealerRequestCard request={view.request} />}
      <p className="muted audience__request-rule">Speaking with Remedy pays nothing and costs nothing.</p>
    </Modal>
  )
}
