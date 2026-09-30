import { useEffect } from 'react'
import { GiCrown } from 'react-icons/gi'
import { sfx } from '../../audio'
import { CONTRACT_REP, evaluateContract, GRADE_INFO, hashSeed, WAGER_RETURN } from '../../lib/contracts'
import { formatRange } from '../../lib/dates'
import { formatRep, formatSigned } from '../../lib/format'
import { useToday } from '../../state/clock'
import { useLedgerData } from '../../state/hooks'
import { useUI } from '../../state/ui'
import { Modal } from '../Modal'
import { WaxSeal } from '../WaxSeal'

function Line({ label, amount }: { label: string; amount: number }): React.JSX.Element {
  return (
    <li className="ledger__line">
      <span className="ledger__label">{label}</span>
      <span className="ledger__dots" />
      <span className={`ledger__amount ${amount < 0 ? 'is-cost' : ''}`}>{formatRep(amount)}</span>
    </li>
  )
}

/** Shown once, right after the final weigh-in closes a contract. */
export function ResultDialog({ contractId, onClose }: { contractId: string | null; onClose(): void }): React.JSX.Element {
  const ledger = useLedgerData()
  const today = useToday()
  const openArchive = useUI((s) => s.openArchive)
  const go = useUI((s) => s.go)
  const contract = contractId ? ledger.contracts.find((c) => c.id === contractId) : undefined
  const ev = contract ? evaluateContract(ledger, contract, today) : null
  const grade = ev?.grade ? GRADE_INFO[ev.grade] : null

  // a fanfare to match the outcome, as the seal lands
  const gradeKey = ev?.grade
  useEffect(() => {
    if (gradeKey) sfx(gradeKey, 0.3)
  }, [contractId, gradeKey])

  const wager = contract?.kind === 'wager'
  const limit = contract?.calorieRule === 'limit'

  return (
    <Modal open={!!ev && !!grade} onClose={onClose} className="modal--result" title={wager ? 'The wager is settled' : 'The contract is closed'}>
      {ev && grade && contract && (
        <div className="result">
          <div className="result__seal">
            <WaxSeal color={grade.seal} icon={GiCrown} size={150} seed={hashSeed(contract.id)} stamp />
            <div className="result__grade">{grade.label}</div>
            <div className="result__blurb">{grade.blurb}</div>
          </div>
          <div className="result__body">
            <div className="result__dates">{formatRange(contract.startDate, contract.endDate)}</div>
            <dl className="result__stats">
              <div>
                <dt>Steps goal met</dt>
                <dd>{ev.stepsDays} of 7 days</dd>
              </div>
              <div>
                <dt>{limit ? 'Within the calorie limit' : 'Calories goal met'}</dt>
                <dd>{ev.caloriesDays} of 7 days</dd>
              </div>
              {ev.duties.length > 0 && (
                <div>
                  <dt>Sworn duties kept</dt>
                  <dd>
                    {ev.dutiesKept} of {ev.duties.length * 7}
                  </dd>
                </div>
              )}
              <div>
                <dt>Goals met</dt>
                <dd>
                  {ev.goalsMet} of {ev.goalsTotal} ({Math.round(ev.score * 100)}%)
                </dd>
              </div>
              <div>
                <dt>Weight</dt>
                <dd>
                  {contract.startWeight.toFixed(1)} → {contract.finalWeight?.toFixed(1)} {contract.unit} ({formatSigned(ev.weightDelta ?? 0)})
                </dd>
              </div>
            </dl>
            <ul className="ledger__lines">
              <Line label="Days of steps & calories" amount={ev.dailyRep} />
              {wager ? (
                <>
                  <Line label="Stake, paid at the sealing" amount={-ev.stake} />
                  <Line label={`${grade.label} — the stake repaid ×${ev.grade === 'wanting' ? '½' : WAGER_RETURN[ev.grade!]}`} amount={ev.closingRep} />
                </>
              ) : (
                <>
                  <Line label="Contract honored" amount={CONTRACT_REP.honored} />
                  {ev.flawless && <Line label="A flawless week" amount={CONTRACT_REP.flawless} />}
                </>
              )}
            </ul>
            <div className="ledger__total">
              <span>{wager ? 'Reputation from this wager' : 'Reputation from this contract'}</span>
              <strong>{formatRep(ev.reputation)}</strong>
            </div>
            <div className="modal__actions">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  onClose()
                  openArchive(contract.id)
                  go('archive')
                }}
              >
                View in the Archive
              </button>
              <button type="button" className="btn btn--primary" onClick={onClose} data-autofocus>
                Draft the next contract
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
