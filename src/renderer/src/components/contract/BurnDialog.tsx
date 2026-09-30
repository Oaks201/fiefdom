import { GiFire } from 'react-icons/gi'
import { sfx } from '../../audio'
import { evaluateContract } from '../../lib/contracts'
import { formatRange } from '../../lib/dates'
import { formatNumber } from '../../lib/format'
import { burnContract } from '../../lib/ledger'
import type { Contract } from '../../lib/types'
import { useToday } from '../../state/clock'
import { useHealth } from '../../state/health'
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
  const fitbit = useHealth((s) => !!s.status?.connected)
  const ev = contract ? evaluateContract(ledger, contract, today) : null
  const wager = contract?.kind === 'wager'

  const burn = (): void => {
    if (!contract) return
    if (!apply((l) => burnContract(l, contract.id, { today, now: new Date().toISOString() }))) return
    sfx('burn')
    toast(
      wager ? `The wager is ash. The stake of ${formatNumber(contract.stake ?? 0)} reputation is forfeit.` : 'The contract is ash. Its progress burned with it.'
    )
    onClose()
    onBurned?.()
  }

  // what the contract has earned, not counting a wager's stake (listed on its own)
  const earned = ev ? ev.dailyRep + ev.closingRep : 0

  return (
    <Modal open={contract !== null} onClose={onClose} title={wager ? 'Burn this wager?' : 'Burn this contract?'} className="modal--narrow modal--burn">
      {contract && ev && (
        <>
          <p>
            The {wager ? 'wager' : 'contract'} of <strong>{formatRange(contract.startDate, contract.endDate)}</strong> will be destroyed, and with it
            everything recorded under it:
          </p>
          <ul className="burn__list">
            <li>
              the steps and calories recorded on {ev.loggedDays === 1 ? 'its 1 recorded day' : `its ${ev.loggedDays} recorded days`} (
              {formatNumber(ev.totalSteps)} steps)
            </li>
            <li>the {formatNumber(earned)} reputation it has earned</li>
            {wager ? (
              <li>
                <strong>the stake of {formatNumber(ev.stake)} reputation — forfeit, never repaid</strong>
              </li>
            ) : (
              <li>its terms and weights</li>
            )}
          </ul>
          <p className="muted">
            {wager ? 'The wager stays in the Archive as ash. ' : ''}Your daily duties are kept, and no longer sworn.
            {fitbit ? ' Fitbit may fill its own counts back in, but they earn nothing unless a new contract binds those days.' : ''}
          </p>
          <div className="modal__actions">
            <button type="button" className="btn btn--ghost" onClick={onClose} data-autofocus>
              Keep the {wager ? 'wager' : 'contract'}
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
