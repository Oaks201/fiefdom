import { useState } from 'react'
import { GiHourglass, GiReceiveMoney, GiScrollUnfurled } from 'react-icons/gi'
import { sfx } from '../../audio'
import { addDays, formatRelativeDay, formatShort, WEEKDAYS, weekday } from '../../lib/dates'
import { formatNumber, formatRep, parseInteger } from '../../lib/format'
import { reviseCharter, sealContract, takeRespite, withdrawContract } from '../../lib/game/contractActions'
import { RULES } from '../../lib/game/rules'
import type { CampaignState, ContractTerm, ISODate } from '../../lib/game/types'
import { contractPageView, payoutPreview, type ContractPageView, type RunningView } from '../../lib/game/view/contract'
import { percent, rivalName } from '../../lib/game/view/shell'
import type { Ledger } from '../../lib/types'
import { useCampaign } from '../../state/campaign'
import { newId } from '../../state/hooks'
import { toast } from '../../state/toasts'
import { HelpLink } from '../game/HelpLink'
import { HoldButton } from '../HoldButton'
import { WaxSeal } from '../WaxSeal'
import { ContractProgress } from './ContractProgress'

function day(d: ISODate): string {
  return `${WEEKDAYS[weekday(d)]}, ${formatShort(d)}`
}

/**
 * The Contract page once a campaign exists (Ch 4, D-01, D-45): with no contract running, the draft
 * (any length, an optional pledge); while one runs, its progress, and on its last day the draft
 * for the next below it.
 */
export function CampaignContract({ campaign, today, ledger }: { campaign: CampaignState; today: ISODate; ledger: Ledger }): React.JSX.Element {
  const view = contractPageView(campaign, today, ledger)
  return (
    <div className="campaign-contract">
      {view.steward && (
        <section className="panel steward-card">
          <header className="panel__head">
            <h3 className="panel__title">The Steward’s Counsel</h3>
          </header>
          <p>{view.steward.text}</p>
        </section>
      )}
      <div className="campaign-contract__cols">
        <div className="campaign-contract__main">
          {view.running && <ContractProgress running={view.running} today={today} />}
          {view.canSeal && view.running && (
            <header className="campaign-contract__next">
              <h2 className="campaign-contract__next-title">The next contract</h2>
              <p className="muted">Sealed today, it begins at dawn tomorrow at the earliest, so no day goes uncovered between them.</p>
            </header>
          )}
          {view.canSeal && <DraftContract view={view} campaign={campaign} today={today} />}
        </div>
        <aside className="campaign-contract__side">
          {view.running && <Running running={view.running} today={today} />}
          {view.queued && (
            <section className="panel">
              <header className="panel__head">
                <h3 className="panel__title">Next</h3>
              </header>
              <p>
                A {view.queued.termDays}-day {view.queued.kind === 'accord' ? 'Accord' : 'contract'} begins {day(view.queued.startDate)}
                {view.queued.pledge > 0 ? `, with ${formatNumber(view.queued.pledge)} pledged` : ''}.
              </p>
            </section>
          )}
          <section className="panel respite-bank">
            <header className="panel__head">
              <h3 className="panel__title">
                <GiHourglass aria-hidden="true" /> Respite
              </h3>
              <span className="panel__aside">{view.respiteBank} banked</span>
            </header>
            {/* Patch 7 (E6): the rule in full lives in How to play › Contracts. */}
            <p className="muted">
              A paid day off: nothing to log, paid at your Realm Consistency. One is earned every {RULES.respite.earnEveryDays} days. <HelpLink section="contracts" label="How Respite works" />
            </p>
          </section>
        </aside>
      </div>
    </div>
  )
}

function DraftContract({ view, campaign, today }: { view: ContractPageView; campaign: CampaignState; today: ISODate }): React.JSX.Element {
  const act = useCampaign((s) => s.act)
  const unlocked = view.lengths.filter((l) => l.unlocked)
  const [term, setTerm] = useState<ContractTerm>(() => unlocked[unlocked.length - 1]?.days ?? 1)
  const [pledgeText, setPledgeText] = useState('')
  const [revising, setRevising] = useState(false)
  const [chosenStart, setChosenStart] = useState<ISODate | null>(null)
  // The earliest day unless the player picked another that is still open (D-06).
  const start = chosenStart && view.sealStartDays.includes(chosenStart) ? chosenStart : view.sealStartDays[0]
  const option = view.lengths.find((l) => l.days === term) ?? view.lengths[0]
  const pledge = pledgeText.trim() ? parseInteger(pledgeText) : 0
  const pledgeProblem = !Number.isInteger(pledge) || pledge < 0 ? 'A pledge is a whole number.' : pledge > option.pledgeCap ? `At most ${formatNumber(option.pledgeCap)} for ${term} days.` : null
  const preview = payoutPreview(campaign, term, pledgeProblem ? 0 : pledge)

  const seal = (): void => {
    if (pledgeProblem) return
    const ok = act((s) => sealContract(s, { id: newId(), termDays: term, pledge, startDate: start }, today))
    if (!ok) return
    sfx('seal')
    toast(`The ${term}-day contract is sealed. It begins ${day(start)}.`, 'success')
    setPledgeText('')
    setChosenStart(null)
  }

  return (
    <article className="deed deed--campaign">
      <div className="deed__paper" aria-hidden="true" />
      <header className="deed__heading">
        <div className="deed__ornament" aria-hidden="true">
          ❦
        </div>
        <h2 className="deed__title">A Contract of the Realm</h2>
        <div className="deed__dates">
          Begins{' '}
          <label className="deed-field deed-field--select">
            <span className="sr-only">First day of the contract</span>
            <select value={start} onChange={(e) => setChosenStart(e.target.value)}>
              {view.sealStartDays.map((d) => {
                const rel = formatRelativeDay(d, today)
                return (
                  <option key={d} value={d}>
                    {rel ? `${rel}, ` : ''}
                    {day(d)}
                  </option>
                )
              })}
            </select>
          </label>{' '}
          at dawn, through {day(addDays(start, term - 1))}
        </div>
      </header>

      <div className="length-picker" role="radiogroup" aria-label="Length">
        {view.lengths.map((l) => (
          <button
            key={l.days}
            type="button"
            role="radio"
            aria-checked={term === l.days}
            className={`length ${term === l.days ? 'is-on' : ''} ${l.unlocked ? '' : 'is-locked'}`}
            disabled={!l.unlocked}
            title={l.requirement ? `Needs ${l.requirement.label}` : undefined}
            onClick={() => {
              sfx('click')
              setTerm(l.days)
            }}
          >
            <span className="length__days">{l.days === 1 ? '1 day' : `${l.days} days`}</span>
            <span className="length__mult">×{l.multiplier.toFixed(2).replace(/0$/, '')}</span>
            <span className="length__note">{l.unlocked ? `up to ${formatNumber(l.fullPayout)}` : `Needs ${l.requirement?.label}`}</span>
          </button>
        ))}
      </div>

      <CharterTerms view={view} campaign={campaign} today={today} revising={revising} setRevising={setRevising} />

      <div className="pledge">
        <label className="field">
          <span className="field__label">
            <GiReceiveMoney aria-hidden="true" /> Pledge (optional, up to {formatNumber(option.pledgeCap)})
          </span>
          <span className="field__box">
            <input value={pledgeText} inputMode="numeric" placeholder="0" onChange={(e) => setPledgeText(e.target.value.replace(/[^\d,]/g, ''))} aria-invalid={!!pledgeProblem} />
          </span>
        </label>
        {pledgeProblem && <p className="field__problem">{pledgeProblem}</p>}
        <table className="payout-preview">
          <caption>What it pays</caption>
          <thead>
            <tr>
              <th>Score</th>
              <th>Payout</th>
              {pledge > 0 && <th>Pledge back</th>}
              {pledge > 0 && <th>Net</th>}
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((r) => (
              <tr key={r.score}>
                <td>{percent(r.score)}%</td>
                <td>{formatRep(r.payout)}</td>
                {pledge > 0 && <td>{formatNumber(r.pledgeReturn)}</td>}
                {pledge > 0 && <td>{formatRep(r.net)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        {preview.breakEven !== null && <p className="muted">At {percent(preview.breakEven)}% the pledge comes back whole: break even.</p>}
      </div>

      <div className="deed__foot">
        <HoldButton className="seal-button" onComplete={seal} disabled={!!pledgeProblem || revising} aria-label="Hold to seal the contract">
          <WaxSeal color="crimson" icon={GiScrollUnfurled} size={76} seed={31} />
          <span className="seal-button__label">Hold to seal</span>
        </HoldButton>
      </div>
    </article>
  )
}

function CharterTerms({
  view,
  campaign,
  today,
  revising,
  setRevising
}: {
  view: ContractPageView
  campaign: CampaignState
  today: ISODate
  revising: boolean
  setRevising(on: boolean): void
}): React.JSX.Element {
  const act = useCampaign((s) => s.act)
  const c = view.charter
  const [pool, setPool] = useState(formatNumber(c.stepPool))
  const [limit, setLimit] = useState(formatNumber(c.calorieLimit))
  const [duties, setDuties] = useState(c.duties.join('\n'))

  const save = (): void => {
    const next = { stepPool: parseInteger(pool), calorieLimit: parseInteger(limit), duties: duties.split('\n').map((d) => d.trim()).filter(Boolean) }
    if (act((s) => reviseCharter(s, next, today))) {
      sfx('quill')
      toast('The Charter is revised. The next contract seals under it.', 'success')
      setRevising(false)
    }
  }

  if (revising) {
    return (
      <section className="charter charter--edit">
        <h3 className="charter__title">The Charter</h3>
        <div className="wizard__grid">
          <label className="field">
            <span className="field__label">Step pool, a week</span>
            <span className="field__box">
              <input value={pool} inputMode="numeric" onChange={(e) => setPool(e.target.value)} />
            </span>
          </label>
          <label className="field">
            <span className="field__label">Calorie limit (the floor is {formatNumber(c.floor)})</span>
            <span className="field__box">
              <input value={limit} inputMode="numeric" onChange={(e) => setLimit(e.target.value)} />
              <span className="field__suffix">kcal</span>
            </span>
          </label>
          <label className="field">
            <span className="field__label">Duties, one a line</span>
            <span className="field__box">
              <textarea rows={4} value={duties} onChange={(e) => setDuties(e.target.value)} />
            </span>
          </label>
        </div>
        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={() => setRevising(false)}>
            Keep the Charter
          </button>
          <button type="button" className="btn btn--primary" onClick={save}>
            Revise
          </button>
        </div>
      </section>
    )
  }
  return (
    <section className="charter">
      <h3 className="charter__title">The Charter</h3>
      <ol className="deed__terms">
        <li>
          <span className="deed__numeral">I.</span>
          <span>
            Each week I shall walk <span className="ink">{formatNumber(c.stepPool)}</span> steps.
          </span>
        </li>
        <li>
          <span className="deed__numeral">II.</span>
          <span>
            Each day I shall eat no more than <span className="ink">{formatNumber(c.calorieLimit)}</span> calories
            <span className="muted"> (the Healer’s floor: {formatNumber(c.floor)})</span>.
          </span>
        </li>
        <li>
          <span className="deed__numeral">III.</span>
          <span>Each day I shall keep my duties: {c.duties.map((d, i) => <span key={d} className="ink">{i > 0 ? ', ' : ''}{d}</span>)}.</span>
        </li>
      </ol>
      {c.locked ? (
        <p className="muted">The Charter is fixed while a contract runs; it can be revised between contracts.</p>
      ) : (
        <button type="button" className="link" onClick={() => setRevising(true)}>
          Revise the Charter…
        </button>
      )}
      {campaign.campaign.medicalSupervision && <p className="muted">Medical supervision confirmed: the limit may sit below the floor.</p>}
    </section>
  )
}

/** What the running contract pays at its end, its Respite and its withdrawal; its progress is in `ContractProgress`. */
function Running({ running, today }: { running: RunningView; today: ISODate }): React.JSX.Element {
  const act = useCampaign((s) => s.act)
  const c = running.contract
  const w = running.withdrawal
  return (
    <section className="panel running-pay">
      <header className="panel__head">
        <h3 className="panel__title">
          <GiReceiveMoney aria-hidden="true" /> At its end
        </h3>
        <span className="panel__aside">{day(c.endDate)}</span>
      </header>
      {running.settledDays > 0 ? (
        <p>
          At {percent(running.score)}% it pays <strong>{formatRep(running.projected.payoutWithBonus)}</strong>
          {c.pledge > 0 ? <>, and returns {formatNumber(running.projected.pledgeReturn)} of the {formatNumber(c.pledge)} pledged</> : null}.
        </p>
      ) : (
        <p>It pays by its score once its days settle{c.pledge > 0 ? <>, with {formatNumber(c.pledge)} pledged</> : null}.</p>
      )}
      {(running.settledDays === 0 || running.score < 1) && <p className="muted">At 100% it would pay {formatRep(running.projected.fullWithBonus)}.</p>}
      {running.accord && (
        <p>
          It would add <strong>{running.accord.projectedGain.toFixed(1)}</strong> Respect with {rivalName(running.accord.rival)} (it was at {running.accord.respectAtStart} when sealed). At 100 the Accord is signed.
        </p>
      )}
      {running.respite.bank > 0 && (
        <div className="running__respite">
          {running.respite.days.map((d) => (
            <button
              key={d.day}
              type="button"
              className="btn btn--small btn--ghost"
              disabled={!d.allowed}
              title={d.reason}
              onClick={() => {
                if (act((s) => takeRespite(s, d.day, today))) {
                  sfx('quill')
                  toast(d.day === today ? 'Today is a Respite day, a paid day off: nothing needs logging.' : `${day(d.day)} is a Respite day: the week’s goals leave it out.`, 'success')
                }
              }}
            >
              Rest {d.day === today ? 'today' : 'yesterday'}
            </button>
          ))}
        </div>
      )}
      <HoldButton
        className="btn btn--ghost btn--burn"
        charge="burn"
        onComplete={() => {
          if (act((s) => withdrawContract(s, today))) {
            sfx('wanting')
            toast(`Withdrawn. It paid ${formatRep(w.payout)} and returned ${formatNumber(w.pledgeReturn)}.`, 'info')
          }
        }}
        aria-label="Hold to withdraw"
      >
        Hold to withdraw: pays {formatRep(w.payout)}
        {c.pledge > 0 ? `, returns ${formatNumber(w.pledgeReturn)}` : ''}
      </HoldButton>
    </section>
  )
}
