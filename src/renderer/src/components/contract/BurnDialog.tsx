import { GiFire } from 'react-icons/gi'
import { sfx } from '../../audio'
import { evaluateContract } from '../../lib/contracts'
import { formatRange } from '../../lib/dates'
import { formatNumber } from '../../lib/format'
import { burnContract } from '../../lib/ledger'
import type { Contract } from '../../lib/types'
import { useToday } from '../../state/clock'
import { useLedgerData } from '../../state/hooks'
import { useLedger } from '../../state/store'
import { toast } from '../../state/toasts'
import { HoldButton } from '../HoldButton'
import { Modal } from '../Modal'

interface Props {
  contract: Contract | null
  onClose(): void
  onBurned?(): void
}

/** Burning is the only way out of a contract, and it takes the contract's progress with it. */
export function BurnDialog({ contract, onClose, onBurned }: Props): React.JSX.Element {
  const ledger = useLedgerData()
  const today = useToday()
  const apply = useLedger((s) => s.apply)
  const ev = contract ? evaluateContract(ledger, contract, today) : null

  const burn = (): void => {
    if (!contract) return
    apply((l) => burnContract(l, contract.id))
    sfx('burn')
    toast('The contract is ash. Its progress burned with it.')
    onClose()
    onBurned?.()
  }

  return (
    <Modal open={contract !== null} onClose={onClose} title="Burn this contract?" className="modal--narrow modal--burn">
      {contract && ev && (
        <>
          <p>
            The contract of <strong>{formatRange(contract.startDate, contract.endDate)}</strong> will be destroyed, and with it everything recorded under it:
          </p>
          <ul className="burn__list">
            <li>
              the steps and calories logged on {ev.loggedDays === 1 ? 'its 1 recorded day' : `its ${ev.loggedDays} recorded days`} ({formatNumber(ev.totalSteps)} steps,{' '}
              {formatNumber(ev.totalCalories)} calories)
            </li>
            <li>the {formatNumber(ev.reputation)} reputation it has earned</li>
            <li>its terms and weights</li>
          </ul>
          <p className="muted">Your daily duties are not part of the contract and are kept.</p>
          <div className="modal__actions">
            <button type="button" className="btn btn--ghost" onClick={onClose} data-autofocus>
              Keep the contract
            </button>
            <HoldButton className="btn btn--danger btn--hold" onComplete={burn} duration={1500} charge="burn">
              <span className="btn__fill" aria-hidden="true" />
              <span className="btn__text">
                <GiFire aria-hidden="true" /> Hold to burn
              </span>
            </HoldButton>
          </div>
        </>
      )}
    </Modal>
  )
}
