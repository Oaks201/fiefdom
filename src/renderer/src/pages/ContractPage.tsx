import { useState } from 'react'
import { CampaignContract } from '../components/campaign/CampaignContract'
import { useCampaignState, useCampaignToday } from '../state/campaignHooks'
import { GiFire, GiReceiveMoney } from 'react-icons/gi'
import { BurnDialog } from '../components/contract/BurnDialog'
import { ContractDocument } from '../components/contract/ContractDocument'
import { DraftContract } from '../components/contract/DraftContract'
import { ResultDialog } from '../components/contract/ResultDialog'
import { WeekProgress } from '../components/contract/WeekProgress'
import { WeighIn } from '../components/contract/WeighIn'
import { evaluateContract, GRADE_INFO, gradeFor, WAGER_RETURN, wagerReturn, type ContractEval, type ContractGrade } from '../lib/contracts'
import { diffDays, formatShort, WEEKDAYS, weekday } from '../lib/dates'
import { formatNumber, formatRep } from '../lib/format'
import { openContract } from '../lib/ledger'
import type { Contract } from '../lib/types'
import { useToday } from '../state/clock'
import { useLedgerData } from '../state/hooks'

export function ContractPage(): React.JSX.Element {
  const ledger = useLedgerData()
  const today = useToday()
  const campaign = useCampaignState()
  const campaignToday = useCampaignToday()
  const [justSealed, setJustSealed] = useState<string | null>(null)
  const [closedId, setClosedId] = useState<string | null>(null)
  const [burning, setBurning] = useState<Contract | null>(null)

  // Once a campaign is founded, its own contracts take the page; the ledger's stay in the Archive (A-07).
  if (campaign && campaignToday) {
    return (
      <div className="contract-page">
        <header className="page-head">
          <h1 className="page-title">The Contract</h1>
          <p className="page-sub">
            From a single day to a month, sealed in wax. It begins at the next dawn and pays at its end by how well its terms were kept; a longer one pays more for each day.
          </p>
        </header>
        <CampaignContract campaign={campaign} today={campaignToday} />
      </div>
    )
  }
  const open = openContract(ledger)
  // a fresh draft whenever a contract is sealed, closed or burned
  const draftKey = ledger.contracts.map((c) => `${c.id}${c.closedAt ? '+' : ''}${c.burnedAt ? '†' : ''}`).join()

  return (
    <div className="contract-page">
      <header className="page-head">
        <h1 className="page-title">The Contract</h1>
        <p className="page-sub">
          One week, sealed in wax: steps, calories and your daily duties. Terms cannot be changed once sealed — a contract may only be kept, or burned.
        </p>
      </header>

      {open ? (
        <ActiveContract contract={open} stamp={justSealed === open.id} onBurn={() => setBurning(open)} onClosed={setClosedId} />
      ) : (
        <DraftContract key={draftKey} today={today} onSealed={setJustSealed} />
      )}

      <BurnDialog contract={burning} onClose={() => setBurning(null)} />
      <ResultDialog contractId={closedId} onClose={() => setClosedId(null)} />
    </div>
  )
}

/** Goals kept on the finished days so far, and the grade that pace would earn. */
function paceOf(ev: ContractEval): { met: number; possible: number; grade: ContractGrade } | null {
  const past = ev.days.filter((d) => !d.future && !d.isToday)
  if (!past.length) return null
  const perDay = 2 + ev.duties.length
  const possible = past.length * perDay
  const met = past.reduce((sum, d) => sum + (d.stepsMet ? 1 : 0) + (d.caloriesMet ? 1 : 0) + d.dutiesKept, 0)
  return { met, possible, grade: gradeFor(met, possible) }
}

function WagerPanel({ ev }: { ev: ContractEval }): React.JSX.Element {
  const pace = paceOf(ev)
  const grades: ContractGrade[] = ['gilded', 'honored', 'wanting']
  return (
    <section className="panel wager-panel">
      <header className="panel__head">
        <h3 className="panel__title">
          <GiReceiveMoney aria-hidden="true" /> The Wager
        </h3>
        <span className="panel__aside">{formatNumber(ev.stake)} staked</span>
      </header>
      <ul className="wager-panel__odds">
        {grades.map((g) => (
          <li key={g} className={pace?.grade === g ? 'is-pace' : ''}>
            <span>
              {GRADE_INFO[g].label} <em>×{g === 'wanting' ? '½' : WAGER_RETURN[g]}</em>
            </span>
            <strong>{formatRep(wagerReturn(ev.stake, g))}</strong>
          </li>
        ))}
        <li>
          <span>Burned</span>
          <strong className="is-cost">nothing</strong>
        </li>
      </ul>
      <p className="muted">
        {pace
          ? `${pace.met} of ${pace.possible} goals kept on the days behind you — on course to be ${GRADE_INFO[pace.grade].label}. Repaid at the final weigh-in.`
          : 'Repaid at the final weigh-in.'}
      </p>
    </section>
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
  const wager = contract.kind === 'wager'

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
            <span className="panel__aside">{formatRep(ev.dailyRep)} earned</span>
          </header>
          <WeekProgress ev={ev} />
        </section>
        {wager && <WagerPanel ev={ev} />}
        <WeighIn contract={contract} today={today} onClosed={onClosed} />
        <button type="button" className="btn btn--ghost btn--burn" onClick={onBurn}>
          <GiFire aria-hidden="true" /> Burn this {wager ? 'wager' : 'contract'}…
        </button>
      </aside>
    </div>
  )
}
