import { useEffect, useState } from 'react'
import { GiLaurelCrown, GiScales } from 'react-icons/gi'
import { sfx } from '../../audio'
import { ordinal, type ISODate } from '../../lib/dates'
import { formatNumber, formatRep, parseDecimal } from '../../lib/format'
import { dayLog, setWeight, validateWeight } from '../../lib/ledger'
import { dayRepFor } from '../../lib/reputation'
import { useLedgerData, useReputation } from '../../state/hooks'
import { useLedger } from '../../state/store'
import { WaxSeal } from '../WaxSeal'

export function DayLedger({ date, today }: { date: ISODate; today: ISODate }): React.JSX.Element {
  const ledger = useLedgerData()
  const rep = useReputation()
  const day = dayRepFor(rep, ledger, date)
  const log = dayLog(ledger, date)
  const past = date < today

  const remaining: string[] = []
  const c = day.contract
  if (c) {
    if (!day.stepsMet) remaining.push(`Walk ${formatNumber(c.stepsGoal - (log.steps ?? 0))} more steps`)
    if (!day.caloriesMet) {
      if (c.calorieRule === 'burn') remaining.push(`Burn ${formatNumber(c.caloriesGoal - (log.calories ?? 0))} more calories`)
      else if (log.eaten === undefined) remaining.push('Record the calories you eat')
      else if (day.caloriesOver) remaining.push(`Over the calorie limit by ${formatNumber(log.eaten - c.caloriesGoal)}`)
      else if (c.caloriesMin !== undefined) remaining.push(`Eat at least ${formatNumber(c.caloriesMin - log.eaten)} more calories`)
    }
  }
  const dutiesLeft = day.dutiesTotal - day.dutiesDone
  if (dutiesLeft > 0) remaining.push(`Keep ${dutiesLeft === 1 ? '1 more duty' : `${dutiesLeft} more duties`}`)

  return (
    <section className="panel ledger">
      <header className="panel__head">
        <h3 className="panel__title">Ledger of the Day</h3>
      </header>

      {day.lines.length > 0 ? (
        <ul className="ledger__lines">
          {day.lines.map((l) => (
            <li key={l.key} className={`ledger__line ledger__line--${l.key}`}>
              <span className="ledger__label">{l.label}</span>
              <span className="ledger__dots" aria-hidden="true" />
              <span className="ledger__amount">{formatRep(l.amount)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="ledger__empty">{day.applicable ? 'Nothing earned yet.' : 'Nothing was asked of this day.'}</p>
      )}

      <div className="ledger__total">
        <span>Reputation</span>
        <WaxSeal color="gold" icon={GiLaurelCrown} size={30} seed={9} />
        <strong>{formatRep(day.total)}</strong>
      </div>

      {day.perfect ? (
        <p className="ledger__perfect">
          A perfect day{day.streak > 1 ? ` — the ${ordinal(day.streak)} in a row` : ''}.
        </p>
      ) : (
        day.applicable &&
        remaining.length > 0 && (
          <div className="ledger__todo">
            <h4>{past ? 'Left undone' : 'For a perfect day'}</h4>
            <ul>
              {remaining.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        )
      )}

      <WeightField date={date} today={today} />
    </section>
  )
}

/** The day's weigh-in, typed by hand (A-05). Saved on Enter or on leaving the field; emptied, it is cleared. */
export function WeightField({ date, today }: { date: ISODate; today: ISODate }): React.JSX.Element {
  const ledger = useLedgerData()
  const apply = useLedger((s) => s.apply)
  const unit = ledger.settings.unit
  const saved = dayLog(ledger, date).weight
  const [draft, setDraft] = useState<string | null>(null)

  // Leaving a day abandons any half-typed weight for it.
  useEffect(() => setDraft(null), [date])

  const text = draft ?? (saved === undefined ? '' : saved.toFixed(1))
  const value = text.trim() ? parseDecimal(text) : undefined
  const problem = draft !== null && value !== undefined ? validateWeight(value, unit) : null

  const commit = (): void => {
    if (draft === null || problem) return
    setDraft(null)
    if (value === saved) return
    if (apply((l) => setWeight(l, date, value)) && value !== undefined) sfx('quill')
  }

  return (
    <div className="ledger__weight">
      <label className="field">
        <span className="field__label">
          <GiScales aria-hidden="true" /> {date === today ? 'Weight today' : 'Weight this day'}
        </span>
        <span className="field__box">
          <input
            value={text}
            inputMode="decimal"
            placeholder="—"
            aria-invalid={!!problem}
            onChange={(e) => setDraft(e.target.value.replace(/[^\d.,]/g, ''))}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              else if (e.key === 'Escape') setDraft(null)
            }}
          />
          <span className="field__suffix">{unit}</span>
        </span>
      </label>
      {problem && <p className="field__problem">{problem}</p>}
    </div>
  )
}
