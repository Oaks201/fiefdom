import { useMemo, useState } from 'react'
import { GiScrollUnfurled } from 'react-icons/gi'
import { sfx } from '../../audio'
import { answerRequest } from '../../lib/game/requests'
import type { CampaignState, ISODate } from '../../lib/game/types'
import { dealAcceptLine, greetingFor, lineTiers, refusalLine, type DealLineKind } from '../../lib/game/view/audience'
import { audienceQuestions, audienceTopic, dareSoFar, prizedSoFar, type AudienceQuestion } from '../../lib/game/view/audienceTalk'
import type { RivalPanel } from '../../lib/game/view/diplomacy'
import { promiseLines, requestCard, requestRefusalText, requestReply, type RequestCard } from '../../lib/game/view/requests'
import { getPlayerPortrait } from '../../state/art'
import { useCampaign } from '../../state/campaign'
import { useLedgerData } from '../../state/hooks'
import { AccordPanel } from '../endgame/Endgame'
import { GameArt, OWNER_COLORS } from '../game/GameArt'
import { PlayerPortrait } from '../game/PlayerPortrait'
import { Modal } from '../Modal'
import { AudienceDebug } from './AudienceDebug' // TEMPORARY: the dev Respect override
import { DealsList } from './DealsList'
import { RULER_LINES } from './rulerLines'

/** Twice the portraits' 128-pixel drawing (their files are 4×), so the pixel art stays even. */
const PORTRAIT_WIDTH = 256

/** Patch 8 (D-62): the lines the Audience reads, Claude's drafts beside Rich's in a development build. */
const LINES = RULER_LINES

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
 * his answer to whatever the player last asked or offered (A3, A4), and what he asks of the player
 * (R1, D-66). Below them the questions the player may put to him, his request to answer, then that
 * court's Accord (none for the Orc, who signs none) and its offers, with `highlight` picking out a
 * hex. The close button and Escape (Modal) return to the page.
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
  const request = useMemo(() => requestCard(campaign, rival, today, LINES), [campaign, rival, today])
  const promises = useMemo(() => promiseLines(campaign, rival, today), [campaign, rival, today])
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
  const settled = (answer: 'grant' | 'refuse'): void => {
    setAsked(null)
    const words = requestReply(rival, answer, LINES)
    setReply(words ? { text: words } : null)
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
          {request?.words && (
            <p className="audience__ask" data-request={request.kind}>
              {request.words}
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
      {request && <RequestPanel campaign={campaign} today={today} card={request} onAnswered={settled} />}
      {promises.length > 0 && <p className="audience__promises">{promises.join(' ')}</p>}
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

/**
 * Patch 8 (R1, D-66): the ruler's request, under the stage: what he asks in plain terms, what each answer
 * does, and (a dare) how the week stands so far; an offer or a demand with its two answers. Answering asks
 * nothing more: the card says what each does.
 */
function RequestPanel({ campaign, today, card, onAnswered }: { campaign: CampaignState; today: ISODate; card: RequestCard; onAnswered(answer: 'grant' | 'refuse'): void }): React.JSX.Element {
  const act = useCampaign((s) => s.act)
  const ledger = useLedgerData()
  const soFar = useMemo(() => (card.kind === 'dare' ? dareSoFar(campaign, card.rival, ledger, today) : undefined), [campaign, card, ledger, today])
  const answer = (choice: 'grant' | 'refuse'): void => {
    const done = act((s) => {
      const r = answerRequest(s, card.rival, choice, today)
      return r.ok ? r : { ...r, reason: requestRefusalText(r.reason) }
    })
    if (!done) return
    if (choice === 'grant') sfx('coin')
    onAnswered(choice)
  }
  return (
    <section className={`panel audience__request audience__request--${card.kind}`} aria-label={card.title}>
      <header className="panel__head">
        <h3 className="panel__title">
          <GiScrollUnfurled aria-hidden="true" /> {card.title}
        </h3>
        <span className="panel__aside">Until {card.until}</span>
      </header>
      <p className="audience__asks">{card.asks}</p>
      {soFar && <p className={`audience__so-far is-${soFar}`}>{soFar === 'kept' ? 'So far this week: kept.' : card.rival === 'orc' ? 'This week: a battle already lost to his raids.' : 'So far this week: not kept yet.'}</p>}
      <p className="muted audience__request-rule">{card.rule}</p>
      {card.grantLabel && (
        <p className="audience__request-actions">
          <button type="button" className="btn btn--small btn--primary" onClick={() => answer('grant')}>
            {card.grantLabel}
          </button>{' '}
          <button type="button" className="btn btn--small btn--ghost" onClick={() => answer('refuse')}>
            {card.refuseLabel}
          </button>
        </p>
      )}
    </section>
  )
}
