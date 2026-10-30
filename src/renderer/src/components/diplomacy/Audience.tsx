import { useMemo, useState } from 'react'
import type { CampaignState, ISODate } from '../../lib/game/types'
import { dealAcceptLine, greetingFor, lineTiers, refusalLine, withDrafts, type DealLineKind } from '../../lib/game/view/audience'
import { audienceQuestions, audienceTopic, prizedSoFar, type AudienceQuestion } from '../../lib/game/view/audienceTalk'
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
 * Patch 8 (D-62): the lines the Audience reads. A development build lays Claude's drafts beside Rich's
 * lines so they can be read in the game; a release build reads Rich's file alone (`undefined` here
 * lets every function use it), so no draft shows until he approves it.
 */
const LINES: unknown = import.meta.env.DEV ? withDrafts() : undefined

/** What the ruler said last in answer to the player: a question, a deal struck or one he turned down. */
interface Reply {
  text: string
  /** The rule beside his words, in plain terms. */
  rule?: string
}

/**
 * An audience with one rival court, opened from its card on the Diplomacy page: the player's
 * portrait facing the ruler's, and between them what he says (Patch 8, D-62): a greeting for his
 * Respect tier that changes by the day (A1), a word on the freshest thing that concerns him (A2), and
 * his answer to whatever the player last asked or offered (A3, A4). Below them the questions the
 * player may put to him, then that court's Accord (none for the Orc, who signs none) and its offers,
 * with `highlight` picking out a hex. The close button and Escape (Modal) return to the page.
 */
export function Audience({ campaign, today, panel, highlight, onClose }: { campaign: CampaignState; today: ISODate; panel: RivalPanel; highlight?: string; onClose(): void }): React.JSX.Element {
  const rival = panel.rival
  const ledger = useLedgerData()
  const profile = ledger.profile
  const [reply, setReply] = useState<Reply | null>(null)
  const [asked, setAsked] = useState<string | null>(null)
  const [devRespect, setDevRespect] = useState<number | null>(null) // TEMPORARY: the dev Respect override
  const greeting = greetingFor(campaign, rival, devRespect ?? panel.respect, today, LINES)
  const habit = useMemo(() => prizedSoFar(campaign, rival, ledger, today), [campaign, rival, ledger, today])
  const topic = useMemo(() => audienceTopic(campaign, rival, today, LINES, habit), [campaign, rival, today, habit])
  const questions = useMemo(() => audienceQuestions(campaign, rival, today, LINES, topic?.id), [campaign, rival, today, topic])
  const playerName = profile ? `${profile.title} ${profile.name}`.trim() : 'A New Noble'
  const colors = { ['--court' as string]: OWNER_COLORS[rival].fill, ['--player' as string]: OWNER_COLORS.player.fill }

  const ask = (q: AudienceQuestion): void => {
    setAsked(q.id)
    setReply({ text: q.answer, ...(q.rule ? { rule: q.rule } : {}) })
  }
  const answered = (kind: DealLineKind): void => {
    setAsked(null)
    setReply({ text: dealAcceptLine(rival, kind, LINES).text })
  }

  return (
    <Modal open onClose={onClose} className={`audience audience--${rival}`} title={`An audience with ${panel.ruler}`} labelledBy="audience-title">
      <div className="audience__stage" style={colors}>
        <figure className="audience__side audience__side--player">
          <div className="audience__frame">
            <PlayerPortrait choice={getPlayerPortrait(campaign)} width={PORTRAIT_WIDTH} name={playerName} className="audience__player-art" />
          </div>
          <figcaption className="audience__name">{playerName}</figcaption>
        </figure>
        <blockquote className={`audience__speech ${greeting.missing ? 'is-missing' : ''}`} aria-live="polite" data-line={String(greeting.tier ?? '')}>
          <p className="audience__greeting">{greeting.text}</p>
          {topic && (
            <p className="audience__topic" data-topic={topic.id}>
              {topic.text}
            </p>
          )}
          {reply && (
            <p className="audience__reply">
              {reply.text}
              {reply.rule && <span className="audience__rule">{reply.rule}</span>}
            </p>
          )}
        </blockquote>
        <figure className="audience__side audience__side--rival">
          <div className="audience__frame">
            <GameArt slot={panel.portrait} owner={rival} width={PORTRAIT_WIDTH} label={panel.ruler} title={`${panel.ruler}, ${panel.mood}`} />
          </div>
          <figcaption className="audience__name">{panel.ruler}</figcaption>
        </figure>
      </div>
      {questions.length > 0 && (
        <nav className="audience__questions" aria-label={`Ask ${panel.ruler}`}>
          {questions.map((q) => (
            <button key={q.id} type="button" className={`btn btn--small ${asked === q.id ? 'is-on' : 'btn--ghost'}`} onClick={() => ask(q)}>
              {q.label}
            </button>
          ))}
        </nav>
      )}
      {import.meta.env.DEV && (
        // TEMPORARY: the dev Respect override
        <AudienceDebug
          real={panel.respect}
          value={devRespect}
          tiers={lineTiers()}
          onChange={(next) => {
            setDevRespect(next)
            setReply(null)
          }}
        />
      )}
      <div className="audience__options" style={colors}>
        <AccordPanel campaign={campaign} today={today} rival={rival} onSealed={() => answered('accord')} />
        <DealsList
          campaign={campaign}
          today={today}
          rival={rival}
          highlight={highlight}
          onStruck={(d) => answered(d.kind as DealLineKind)}
          onRefused={(d) => {
            setAsked(null)
            const words = d.reason ? refusalLine(rival, d.reason.code, LINES) : undefined
            setReply({ text: words?.text ?? d.reason?.text ?? '', ...(words && d.reason ? { rule: d.reason.text } : {}) })
          }}
        />
      </div>
    </Modal>
  )
}
