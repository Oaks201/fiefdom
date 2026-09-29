import { useState } from 'react'
import { GiScales } from 'react-icons/gi'
import { sfx } from '../../audio'
import { formatShort, WEEKDAYS, weekday, type ISODate } from '../../lib/dates'
import { formatSigned, parseDecimal } from '../../lib/format'
import { canWeighIn, closeContract, LIMITS, validateWeight } from '../../lib/ledger'
import type { Contract } from '../../lib/types'
import { useLedger } from '../../state/store'
import { HoldButton } from '../HoldButton'

interface Props {
  contract: Contract
  today: ISODate
  onClosed(id: string): void
}

export function WeighIn({ contract, today, onClosed }: Props): React.JSX.Element {
  const apply = useLedger((s) => s.apply)
  const [weight, setWeight] = useState('')
  const [note, setNote] = useState('')
  const open = canWeighIn(contract, today)

  if (!open) {
    return (
      <section className="panel weighin weighin--locked">
        <header className="panel__head">
          <h3 className="panel__title">
            <GiScales aria-hidden="true" /> The Final Weigh-in
          </h3>
        </header>
        <p>
          Opens on the contract’s last day, <strong>{WEEKDAYS[weekday(contract.endDate)]}, {formatShort(contract.endDate)}</strong>.
        </p>
      </section>
    )
  }

  const value = parseDecimal(weight)
  const problem = weight.trim() ? validateWeight(value, contract.unit) : null
  const ready = weight.trim() !== '' && !problem
  const delta = ready ? Math.round((value - contract.startWeight) * 10) / 10 : null

  const seal = (): void => {
    const ok = apply((l) => closeContract(l, contract.id, { finalWeight: value, note }, { today, now: new Date().toISOString() }))
    if (ok) {
      sfx('seal')
      onClosed(contract.id)
    }
  }

  return (
    <section className="panel weighin">
      <header className="panel__head">
        <h3 className="panel__title">
          <GiScales aria-hidden="true" /> The Final Weigh-in
        </h3>
      </header>
      <p className="weighin__lead">Declare your weight at the close of the contract. You began at {contract.startWeight.toFixed(1)} {contract.unit}.</p>
      <div className="weighin__row">
        <label className="field field--big">
          <span className="field__label">Final weight</span>
          <span className="field__box">
            <input
              value={weight}
              inputMode="decimal"
              placeholder={contract.startWeight.toFixed(1)}
              onChange={(e) => setWeight(e.target.value.replace(/[^\d.,]/g, ''))}
              autoFocus
            />
            <span className="field__suffix">{contract.unit}</span>
          </span>
        </label>
        <div className={`weighin__delta ${delta === null ? '' : delta < 0 ? 'is-down' : delta > 0 ? 'is-up' : ''}`}>
          {delta === null ? ' ' : `${formatSigned(delta)} ${contract.unit}`}
        </div>
      </div>
      {problem && <p className="field__problem">{problem}</p>}
      <label className="field">
        <span className="field__label">A few words for the chronicle (optional)</span>
        <textarea value={note} maxLength={LIMITS.note} rows={3} onChange={(e) => setNote(e.target.value)} placeholder="How did the week go?" />
      </label>
      <HoldButton className="btn btn--primary btn--hold" onComplete={seal} disabled={!ready} duration={900}>
        <span className="btn__fill" aria-hidden="true" />
        <span className="btn__text">Hold to close the contract</span>
      </HoldButton>
    </section>
  )
}
