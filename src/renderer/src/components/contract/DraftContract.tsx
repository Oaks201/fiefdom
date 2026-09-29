import { useMemo, useState } from 'react'
import { GiCrown } from 'react-icons/gi'
import { sfx } from '../../audio'
import { addDays, formatRelativeDay, formatShort, WEEKDAYS, weekday, type ISODate } from '../../lib/dates'
import { formatNumber, parseDecimal, parseInteger } from '../../lib/format'
import { allowedStartDates, lastContract, sealContract, validateDraft, type ContractDraft } from '../../lib/ledger'
import type { WeightUnit } from '../../lib/types'
import { newId, useLedgerData } from '../../state/hooks'
import { useLedger } from '../../state/store'
import { toast } from '../../state/toasts'
import { HoldButton } from '../HoldButton'
import { SealSocket, WaxSeal } from '../WaxSeal'
import { nobleName } from './ContractDocument'

interface Props {
  today: ISODate
  onSealed(id: string): void
}

/** A blank contract with the terms written in as inline fields. */
export function DraftContract({ today, onSealed }: Props): React.JSX.Element {
  const ledger = useLedgerData()
  const apply = useLedger((s) => s.apply)
  const allowed = allowedStartDates(ledger, today)
  const last = lastContract(ledger)

  const [startDate, setStartDate] = useState<ISODate>(() => allowed[0] ?? today)
  const [steps, setSteps] = useState(() => (last ? formatNumber(last.stepsGoal) : ''))
  const [calories, setCalories] = useState(() => (last ? formatNumber(last.caloriesGoal) : ''))
  const [weight, setWeight] = useState(() => {
    const w = last?.finalWeight ?? last?.startWeight
    return w !== undefined ? w.toFixed(1) : ''
  })
  const [unit, setUnit] = useState<WeightUnit>(() => last?.unit ?? ledger.settings.unit)
  const [touched, setTouched] = useState(false)

  const start = allowed.includes(startDate) ? startDate : (allowed[0] ?? today)
  const draft: ContractDraft = useMemo(
    () => ({
      startDate: start,
      stepsGoal: parseInteger(steps),
      caloriesGoal: parseInteger(calories),
      startWeight: parseDecimal(weight),
      unit
    }),
    [start, steps, calories, weight, unit]
  )
  const incomplete = !steps.trim() || !calories.trim() || !weight.trim()
  const problem = incomplete ? null : validateDraft(ledger, draft, today)
  const ready = !incomplete && !problem

  const seal = (): void => {
    const id = newId()
    const ok = apply((l) => sealContract(l, draft, { id, today, now: new Date().toISOString() }))
    if (ok) {
      sfx('seal')
      toast('The contract is sealed. May you keep its terms.', 'success')
      onSealed(id)
    }
  }

  if (allowed.length === 0) {
    return <p className="muted">No new contract can be drafted right now.</p>
  }

  const end = addDays(start, 6)

  return (
    <article className="deed deed--draft" onBlur={() => setTouched(true)}>
      <div className="deed__paper" aria-hidden="true" />
      <header className="deed__heading">
        <div className="deed__ornament" aria-hidden="true">
          ❦
        </div>
        <h2 className="deed__title">Contract of the Week</h2>
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
          <span className="deed__numeral">I.</span>
          <span>
            Each day I shall walk no fewer than{' '}
            <DeedNumber value={steps} onChange={setSteps} placeholder="10,000" label="Daily steps" autoFocus={!steps} width={7} /> steps.
          </span>
        </li>
        <li>
          <span className="deed__numeral">II.</span>
          <span>
            Each day I shall burn no fewer than <DeedNumber value={calories} onChange={setCalories} placeholder="500" label="Daily calories burned" width={5} />{' '}
            calories.
          </span>
        </li>
        <li>
          <span className="deed__numeral">III.</span>
          <span>
            On this day my weight stands at <DeedNumber value={weight} onChange={setWeight} placeholder="180.0" label="Current weight" decimal width={5} />
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
      </ol>

      <p className="deed__clause">
        At the close of the seventh day I shall return and declare my final weight. Once sealed, these terms can never be amended — only burned, and every
        step and calorie recorded under them with it.
      </p>

      <footer className="deed__foot">
        <div className="deed__signature">
          <div className={`deed__hint ${problem && touched ? 'is-problem' : ''}`}>
            {incomplete ? 'Fill in every blank to seal the contract.' : problem ? problem : 'The terms are written. Press and hold the seal.'}
          </div>
        </div>
        <HoldButton className="seal-button" onComplete={seal} disabled={!ready} duration={1100} aria-label="Press and hold to seal the contract">
          <span className="seal-button__socket">
            <SealSocket size={104} />
          </span>
          <span className="seal-button__wax">
            <WaxSeal color="crimson" icon={GiCrown} size={104} seed={77} />
          </span>
          <svg className="seal-button__ring" viewBox="0 0 120 120" aria-hidden="true">
            <circle cx="60" cy="60" r="56" />
          </svg>
          <span className="seal-button__label">{ready ? 'Hold to seal' : 'Unsealed'}</span>
        </HoldButton>
      </footer>
    </article>
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
