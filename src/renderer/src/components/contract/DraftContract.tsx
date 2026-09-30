import { useMemo, useRef, useState } from 'react'
import { GiCrown, GiReceiveMoney, GiScrollUnfurled } from 'react-icons/gi'
import { sfx } from '../../audio'
import { CONTRACT_REP, HONORED_SHARE, WAGER_RETURN, wagerReturn } from '../../lib/contracts'
import { addDays, formatRelativeDay, formatShort, WEEKDAYS, weekday, type ISODate } from '../../lib/dates'
import { formatNumber, formatRep, parseDecimal, parseInteger } from '../../lib/format'
import {
  activeHabits,
  addHabit,
  allowedStartDates,
  cleanName,
  lastSealed,
  LIMITS,
  retireHabit,
  sealContract,
  validateDraft,
  type ContractDraft
} from '../../lib/ledger'
import type { ContractKind, Habit, WeightUnit } from '../../lib/types'
import { emitFloat } from '../../state/floats'
import { newId, useLedgerData, useReputation } from '../../state/hooks'
import { useLedger } from '../../state/store'
import { toast } from '../../state/toasts'
import { HoldButton } from '../HoldButton'
import { SealSocket, WaxSeal } from '../WaxSeal'
import { nobleName } from './ContractDocument'

interface Props {
  today: ISODate
  onSealed(id: string): void
}

const NUMERALS = ['I.', 'II.', 'III.', 'IV.', 'V.', 'VI.']

/** A blank contract with the terms written in as inline fields, beside what it pays. */
export function DraftContract({ today, onSealed }: Props): React.JSX.Element {
  const ledger = useLedgerData()
  const balance = useReputation().total
  const apply = useLedger((s) => s.apply)
  const allowed = allowedStartDates(ledger, today)
  // the last contract is a good template — but a calorie limit is only copied from a contract that had one
  const template = lastSealed(ledger)
  const limitTemplate = template?.calorieRule === 'limit' ? template : undefined
  const canWager = balance >= LIMITS.stake.min

  const [kind, setKind] = useState<ContractKind>(() => (template?.kind === 'wager' && canWager ? 'wager' : 'common'))
  const [startDate, setStartDate] = useState<ISODate>(() => allowed[0] ?? today)
  const [steps, setSteps] = useState(() => (template ? formatNumber(template.stepsGoal) : ''))
  const [limit, setLimit] = useState(() => (limitTemplate ? formatNumber(limitTemplate.caloriesGoal) : ''))
  const [minOn, setMinOn] = useState(() => limitTemplate?.caloriesMin !== undefined)
  const [min, setMin] = useState(() => (limitTemplate?.caloriesMin !== undefined ? formatNumber(limitTemplate.caloriesMin) : ''))
  const [stake, setStake] = useState(() => {
    const s = template?.kind === 'wager' ? template.stake : undefined
    return s && canWager ? formatNumber(Math.min(s, balance)) : ''
  })
  const [weight, setWeight] = useState(() => {
    const w = template?.finalWeight ?? template?.startWeight
    return w !== undefined ? w.toFixed(1) : ''
  })
  const [unit, setUnit] = useState<WeightUnit>(() => template?.unit ?? ledger.settings.unit)
  const [touched, setTouched] = useState(false)
  const sealRef = useRef<HTMLDivElement>(null)

  const wager = kind === 'wager'
  const start = allowed.includes(startDate) ? startDate : (allowed[0] ?? today)
  const draft: ContractDraft = useMemo(
    () => ({
      kind,
      startDate: start,
      stepsGoal: parseInteger(steps),
      caloriesGoal: parseInteger(limit),
      caloriesMin: minOn && min.trim() ? parseInteger(min) : undefined,
      stake: kind === 'wager' ? parseInteger(stake) : undefined,
      startWeight: parseDecimal(weight),
      unit
    }),
    [kind, start, steps, limit, minOn, min, stake, weight, unit]
  )
  const incomplete = !steps.trim() || !limit.trim() || !weight.trim() || (wager && !stake.trim())
  const problem = incomplete ? null : validateDraft(ledger, draft, today, balance)
  const ready = !incomplete && !problem
  const staked = wager && Number.isInteger(draft.stake) ? (draft.stake as number) : 0

  const duties = activeHabits(ledger, start)

  const seal = (): void => {
    const id = newId()
    const ok = apply((l) => sealContract(l, draft, { id, today, now: new Date().toISOString(), balance }))
    if (!ok) return
    sfx('seal')
    if (wager && sealRef.current) {
      emitFloat(formatRep(-staked), sealRef.current, 'loss')
      sfx('coin', 0.25)
    }
    toast(wager ? `The wager is sealed and ${formatNumber(staked)} reputation staked. May you keep its terms.` : 'The contract is sealed. May you keep its terms.', 'success')
    onSealed(id)
  }

  const pick = (k: ContractKind): void => {
    if (k === kind) return
    if (k === 'wager' && !canWager) {
      sfx('error')
      toast(`A wager needs at least ${LIMITS.stake.min} reputation to stake. You hold ${formatNumber(Math.max(0, balance))}.`, 'error')
      return
    }
    sfx('flip')
    setKind(k)
  }

  if (allowed.length === 0) {
    return <p className="muted">No new contract can be drafted right now.</p>
  }

  const end = addDays(start, 6)
  let n = 0
  const numeral = (): string => NUMERALS[n++]

  return (
    <div className="contract-draft">
      <div className="contract-kinds" role="radiogroup" aria-label="Kind of contract">
        <button type="button" role="radio" aria-checked={!wager} className={`kind ${!wager ? 'is-on' : ''}`} onClick={() => pick('common')}>
          <GiScrollUnfurled className="kind__icon" aria-hidden="true" />
          <span className="kind__name">A common contract</span>
          <span className="kind__blurb">Keep the terms and earn reputation. Nothing is put at risk.</span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={wager}
          className={`kind kind--wager ${wager ? 'is-on' : ''} ${canWager ? '' : 'is-disabled'}`}
          onClick={() => pick('wager')}
          title={canWager ? undefined : `Needs at least ${LIMITS.stake.min} reputation`}
        >
          <GiReceiveMoney className="kind__icon" aria-hidden="true" />
          <span className="kind__name">A wager</span>
          <span className="kind__blurb">
            Stake reputation up front for up to ×{WAGER_RETURN.gilded} back. Burn it and the stake is lost.{' '}
            <em>Your purse: {formatNumber(Math.max(0, balance))}</em>
          </span>
        </button>
      </div>

      <article className={`deed deed--draft ${wager ? 'deed--wager' : ''}`} onBlur={() => setTouched(true)}>
        <div className="deed__paper" aria-hidden="true" />
        <header className="deed__heading">
          <div className="deed__ornament" aria-hidden="true">
            ❦
          </div>
          <h2 className="deed__title">{wager ? 'Wager of the Week' : 'Contract of the Week'}</h2>
          <div className="deed__dates">A fresh page, awaiting your terms</div>
        </header>

        <p className="deed__preamble">
          Let it be known that I, <span className="ink">{nobleName(ledger.profile)}</span>
          {ledger.profile?.holding ? (
            <>
              {' '}
              of <span className="ink">{ledger.profile.holding}</span>
            </>
          ) : null}
          , bind myself to these terms for the seven days from{' '}
          <label className="deed-field deed-field--select">
            <span className="sr-only">First day of the contract</span>
            <select value={start} onChange={(e) => setStartDate(e.target.value)}>
              {allowed.map((d) => {
                const rel = formatRelativeDay(d, today)
                return (
                  <option key={d} value={d}>
                    {rel ? `${rel}, ` : ''}
                    {WEEKDAYS[weekday(d)]}, {formatShort(d)}
                  </option>
                )
              })}
            </select>
          </label>{' '}
          to{' '}
          <span className="ink">
            {WEEKDAYS[weekday(end)]}, {formatShort(end)}
          </span>
          :
        </p>

        <ol className="deed__terms">
          <li>
            <span className="deed__numeral">{numeral()}</span>
            <span>
              Each day I shall walk no fewer than{' '}
              <DeedNumber value={steps} onChange={setSteps} placeholder="10,000" label="Daily steps" autoFocus={!steps} width={7} /> steps.
            </span>
          </li>
          <li>
            <span className="deed__numeral">{numeral()}</span>
            <span>
              {minOn ? (
                <>
                  Each day I shall eat no fewer than <DeedNumber value={min} onChange={setMin} placeholder="1,500" label="Fewest calories to eat each day" width={5} />{' '}
                  and no more than <DeedNumber value={limit} onChange={setLimit} placeholder="2,000" label="Daily calorie limit" width={5} /> calories.{' '}
                  <button
                    type="button"
                    className="deed__aside link"
                    onClick={() => {
                      setMinOn(false)
                      setMin('')
                    }}
                  >
                    no minimum
                  </button>
                </>
              ) : (
                <>
                  Each day I shall eat no more than <DeedNumber value={limit} onChange={setLimit} placeholder="2,000" label="Daily calorie limit" width={5} />{' '}
                  calories.{' '}
                  <button type="button" className="deed__aside link" onClick={() => setMinOn(true)}>
                    + a minimum
                  </button>
                </>
              )}
            </span>
          </li>
          <li>
            <span className="deed__numeral">{numeral()}</span>
            <DutyTerm duties={duties} today={today} />
          </li>
          <li>
            <span className="deed__numeral">{numeral()}</span>
            <span>
              On this day my weight stands at{' '}
              <DeedNumber value={weight} onChange={setWeight} placeholder="180.0" label="Current weight" decimal width={5} />
              <span className="unit-toggle" role="radiogroup" aria-label="Weight unit">
                {(['lb', 'kg'] as const).map((u) => (
                  <button key={u} type="button" role="radio" aria-checked={unit === u} className={unit === u ? 'is-on' : ''} onClick={() => setUnit(u)}>
                    {u}
                  </button>
                ))}
              </span>
              .
            </span>
          </li>
          {wager && (
            <li className="deed__stake">
              <span className="deed__numeral">{numeral()}</span>
              <span>
                As surety I stake <DeedNumber value={stake} onChange={setStake} placeholder="50" label="Reputation to stake" width={5} /> reputation upon these
                terms, paid now from a purse of <span className="ink">{formatNumber(Math.max(0, balance))}</span>.
              </span>
            </li>
          )}
        </ol>

        <p className="deed__clause">
          A day’s calories count only once they are recorded, and only if they stay within the limit. At the close of the seventh day I shall return and
          declare my final weight. Once sealed, these terms can never be amended — only burned, and every step and calorie recorded under them with it
          {wager ? ', and the stake besides' : ''}.
        </p>

        <footer className="deed__foot">
          <div className="deed__signature">
            <div className={`deed__hint ${problem && touched ? 'is-problem' : ''}`}>
              {incomplete
                ? wager && !stake.trim() && steps.trim() && limit.trim() && weight.trim()
                  ? 'Name your stake to seal the wager.'
                  : 'Fill in every blank to seal the contract.'
                : problem
                  ? problem
                  : wager
                    ? `The terms are written. Press and hold the seal to stake ${formatNumber(staked)}.`
                    : 'The terms are written. Press and hold the seal.'}
            </div>
          </div>
          <div ref={sealRef}>
            <HoldButton
              className="seal-button"
              onComplete={seal}
              disabled={!ready}
              duration={wager ? 1500 : 1100}
              aria-label={wager ? 'Press and hold to seal the wager' : 'Press and hold to seal the contract'}
            >
              <span className="seal-button__socket">
                <SealSocket size={104} />
              </span>
              <span className="seal-button__wax">
                <WaxSeal color={wager ? 'gold' : 'crimson'} icon={GiCrown} size={104} seed={77} />
              </span>
              <svg className="seal-button__ring" viewBox="0 0 120 120" aria-hidden="true">
                <circle cx="60" cy="60" r="56" />
              </svg>
              <span className="seal-button__label">{ready ? 'Hold to seal' : 'Unsealed'}</span>
            </HoldButton>
          </div>
        </footer>
      </article>

      <aside className="contract-rules">
        {wager ? (
          <>
            <h3 className="panel__title">What the wager pays</h3>
            <ul className="rules">
              <li>
                <span>Staked now, at the sealing</span>
                <strong className="is-cost">{staked ? formatRep(-staked) : '—'}</strong>
              </li>
              <li>
                <span>
                  <b>Gilded</b> — every goal, every day <em>×{WAGER_RETURN.gilded}</em>
                </span>
                <strong>{staked ? formatRep(wagerReturn(staked, 'gilded')) : `×${WAGER_RETURN.gilded}`}</strong>
              </li>
              <li>
                <span>
                  <b>Honored</b> — {Math.round(HONORED_SHARE * 100)}% of the goals <em>×{WAGER_RETURN.honored}</em>
                </span>
                <strong>{staked ? formatRep(wagerReturn(staked, 'honored')) : `×${WAGER_RETURN.honored}`}</strong>
              </li>
              <li>
                <span>
                  <b>Found wanting</b> <em>×½</em>
                </span>
                <strong>{staked ? formatRep(wagerReturn(staked, 'wanting')) : '×½'}</strong>
              </li>
              <li>
                <span>
                  <b>Burned</b> — the stake is forfeit
                </span>
                <strong className="is-cost">nothing</strong>
              </li>
            </ul>
            <p className="muted">
              Repaid at the final weigh-in. Each day’s steps and calories still earn {formatRep(CONTRACT_REP.stepsDay)} apiece, as in any contract.
            </p>
          </>
        ) : (
          <>
            <h3 className="panel__title">How reputation is earned</h3>
            <ul className="rules">
              <li>
                <span>Each day the steps goal is met</span>
                <strong>{formatRep(CONTRACT_REP.stepsDay)}</strong>
              </li>
              <li>
                <span>Each day within the calorie limit</span>
                <strong>{formatRep(CONTRACT_REP.caloriesDay)}</strong>
              </li>
              <li>
                <span>Closing the contract with a final weigh-in</span>
                <strong>{formatRep(CONTRACT_REP.honored)}</strong>
              </li>
              <li>
                <span>A flawless week — every goal, every day</span>
                <strong>{formatRep(CONTRACT_REP.flawless)}</strong>
              </li>
            </ul>
            <p className="muted">Daily duties, perfect days and streaks earn more in the Chronicle.</p>
          </>
        )}
        <p className="contract-rules__grades">
          A week’s goals are its steps, its calories and each sworn duty, on each of its seven days. Meet them all and it is <b>Gilded</b>; meet{' '}
          {Math.round(HONORED_SHARE * 100)}% and it is <b>Honored</b>.
        </p>
      </aside>
    </div>
  )
}

/** The duties the contract will swear to — the live roll, which can still be changed until the seal is set. */
function DutyTerm({ duties, today }: { duties: Habit[]; today: ISODate }): React.JSX.Element {
  const apply = useLedger((s) => s.apply)
  const [name, setName] = useState('')
  const [confirming, setConfirming] = useState<string | null>(null)

  const add = (): void => {
    const clean = cleanName(name)
    if (!clean) return
    if (duties.some((h) => h.name.toLowerCase() === clean.toLowerCase())) {
      toast(`“${clean}” is already on the roll.`, 'error')
      sfx('error')
      return
    }
    if (apply((l) => addHabit(l, { id: newId(), name: clean, createdOn: today }))) sfx('quill')
    setName('')
  }

  const strike = (h: Habit): void => {
    if (confirming !== h.id) {
      setConfirming(h.id)
      return
    }
    setConfirming(null)
    if (apply((l) => retireHabit(l, h.id, today))) {
      sfx('strike')
      toast(`“${h.name}” was struck from the roll.`)
    }
  }

  return (
    <div className="deed__duties">
      <span>{duties.length ? 'Each day I shall keep my duties:' : 'I swear to no daily duties this week.'}</span>
      <ul className="deed-duties">
        {duties.map((h) => (
          <li key={h.id} className={confirming === h.id ? 'is-confirming' : ''}>
            <span className="ink">{h.name}</span>
            <button
              type="button"
              className="deed-duties__strike"
              onClick={() => strike(h)}
              onBlur={() => setConfirming((c) => (c === h.id ? null : c))}
              title="Strike from the roll"
              aria-label={confirming === h.id ? `Confirm striking ${h.name}` : `Strike ${h.name} from the roll`}
            >
              {confirming === h.id ? 'strike?' : '✕'}
            </button>
          </li>
        ))}
        <li className="deed-duties__add">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              add()
            }}
          >
            <label className="deed-field">
              <span className="sr-only">Add a duty to swear to</span>
              <input
                value={name}
                maxLength={LIMITS.habitName}
                placeholder="+ add a duty"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setName('')
                }}
                style={{ width: `${Math.max(12, name.length + 2)}ch` }}
              />
            </label>
            {name.trim() && (
              <button type="submit" className="deed__aside link">
                add
              </button>
            )}
          </form>
        </li>
      </ul>
    </div>
  )
}

function DeedNumber({
  value,
  onChange,
  placeholder,
  label,
  decimal,
  width,
  autoFocus
}: {
  value: string
  onChange(v: string): void
  placeholder: string
  label: string
  decimal?: boolean
  width: number
  autoFocus?: boolean
}): React.JSX.Element {
  return (
    <label className="deed-field">
      <span className="sr-only">{label}</span>
      <input
        value={value}
        autoFocus={autoFocus}
        inputMode={decimal ? 'decimal' : 'numeric'}
        placeholder={placeholder}
        style={{ width: `${width + 1}ch` }}
        onChange={(e) => onChange(e.target.value.replace(decimal ? /[^\d.,]/g : /[^\d,]/g, ''))}
        onBlur={() => {
          if (!value.trim()) return
          if (decimal) {
            const n = parseDecimal(value)
            if (Number.isFinite(n)) onChange(n.toFixed(1))
          } else {
            const n = parseInteger(value)
            if (Number.isFinite(n)) onChange(formatNumber(n))
          }
        }}
      />
    </label>
  )
}
