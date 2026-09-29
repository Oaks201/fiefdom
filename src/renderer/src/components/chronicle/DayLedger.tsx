import { GiLaurelCrown } from 'react-icons/gi'
import { ordinal, type ISODate } from '../../lib/dates'
import { formatNumber, formatRep } from '../../lib/format'
import { dayLog } from '../../lib/ledger'
import { dayRepFor } from '../../lib/reputation'
import { useLedgerData, useReputation } from '../../state/hooks'
import { WaxSeal } from '../WaxSeal'

export function DayLedger({ date, today }: { date: ISODate; today: ISODate }): React.JSX.Element {
  const ledger = useLedgerData()
  const rep = useReputation()
  const day = dayRepFor(rep, ledger, date)
  const log = dayLog(ledger, date)
  const past = date < today

  const remaining: string[] = []
  if (day.contract) {
    if (!day.stepsMet) remaining.push(`Walk ${formatNumber(day.contract.stepsGoal - (log.steps ?? 0))} more steps`)
    if (!day.caloriesMet) remaining.push(`Burn ${formatNumber(day.contract.caloriesGoal - (log.calories ?? 0))} more calories`)
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
    </section>
  )
}
