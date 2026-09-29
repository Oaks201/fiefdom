import { useState } from 'react'
import { GiFire } from 'react-icons/gi'
import { BurnDialog } from '../components/contract/BurnDialog'
import { ContractDocument } from '../components/contract/ContractDocument'
import { DraftContract } from '../components/contract/DraftContract'
import { ResultDialog } from '../components/contract/ResultDialog'
import { WeekProgress } from '../components/contract/WeekProgress'
import { WeighIn } from '../components/contract/WeighIn'
import { CONTRACT_REP, evaluateContract } from '../lib/contracts'
import { diffDays, formatShort, WEEKDAYS, weekday } from '../lib/dates'
import { formatRep } from '../lib/format'
import { openContract } from '../lib/ledger'
import type { Contract } from '../lib/types'
import { useToday } from '../state/clock'
import { useLedgerData } from '../state/hooks'

export function ContractPage(): React.JSX.Element {
  const ledger = useLedgerData()
  const today = useToday()
  const [justSealed, setJustSealed] = useState<string | null>(null)
  const [closedId, setClosedId] = useState<string | null>(null)
  const [burning, setBurning] = useState<Contract | null>(null)
  const open = openContract(ledger)

  return (
    <div className="contract-page">
      <header className="page-head">
        <h1 className="page-title">The Contract</h1>
        <p className="page-sub">
          One week, three terms, sealed in wax. Terms cannot be changed once sealed — a contract may only be kept, or burned.
        </p>
      </header>

      {open ? (
        <ActiveContract contract={open} stamp={justSealed === open.id} onBurn={() => setBurning(open)} onClosed={setClosedId} />
      ) : (
        <div className="contract-draft">
          <DraftContract key={ledger.contracts.length} today={today} onSealed={setJustSealed} />
          <aside className="contract-rules">
            <h3 className="panel__title">How reputation is earned</h3>
            <ul className="rules">
              <li>
                <span>Each day the steps goal is met</span>
                <strong>{formatRep(CONTRACT_REP.stepsDay)}</strong>
              </li>
              <li>
                <span>Each day the calories goal is met</span>
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
          </aside>
        </div>
      )}

      <BurnDialog contract={burning} onClose={() => setBurning(null)} />
      <ResultDialog contractId={closedId} onClose={() => setClosedId(null)} />
    </div>
  )
}

function ActiveContract({
  contract,
  stamp,
  onBurn,
  onClosed
}: {
  contract: Contract
  stamp: boolean
  onBurn(): void
  onClosed(id: string): void
}): React.JSX.Element {
  const ledger = useLedgerData()
  const today = useToday()
  const ev = evaluateContract(ledger, contract, today)

  let status: string
  if (ev.status === 'upcoming') {
    const n = diffDays(today, contract.startDate)
    status = `Begins ${n === 1 ? 'tomorrow' : `in ${n} days`}, ${WEEKDAYS[weekday(contract.startDate)]} ${formatShort(contract.startDate)}`
  } else if (ev.status === 'active') {
    const left = 7 - ev.dayNumber
    status = `In force · Day ${ev.dayNumber} of 7 · ${left === 0 ? 'the last day' : left === 1 ? '1 day remains' : `${left} days remain`}`
  } else {
    status = 'Seven days done · awaiting weigh-in'
  }

  return (
    <div className="contract-active">
      <div className="contract-active__main">
        <div className={`status-ribbon status-ribbon--${ev.status}`}>{status}</div>
        <ContractDocument ev={ev} profile={ledger.profile} stamp={stamp} />
      </div>
      <aside className="contract-active__side">
        <section className="panel">
          <header className="panel__head">
            <h3 className="panel__title">The Week So Far</h3>
            <span className="panel__aside">{formatRep(ev.reputation)} reputation</span>
          </header>
          <WeekProgress ev={ev} />
        </section>
        <WeighIn contract={contract} today={today} onClosed={onClosed} />
        <button type="button" className="btn btn--ghost btn--burn" onClick={onBurn}>
          <GiFire aria-hidden="true" /> Burn this contract…
        </button>
      </aside>
    </div>
  )
}
