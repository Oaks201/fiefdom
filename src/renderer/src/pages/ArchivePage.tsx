import { useMemo, useState } from 'react'
import { GiFire, GiMagnifyingGlass } from 'react-icons/gi'
import { sfx } from '../audio'
import { ContractCard } from '../components/archive/ContractCard'
import { BurnDialog } from '../components/contract/BurnDialog'
import { ContractDocument } from '../components/contract/ContractDocument'
import { WeekProgress } from '../components/contract/WeekProgress'
import { Modal } from '../components/Modal'
import { contractHaystack, evaluateContract, matchesQuery, type ContractEval } from '../lib/contracts'
import { formatShort } from '../lib/dates'
import { formatNumber, formatRep, formatSigned } from '../lib/format'
import type { Contract, WeightUnit } from '../lib/types'
import { useToday } from '../state/clock'
import { useLedgerData } from '../state/hooks'
import { useUI } from '../state/ui'

type Filter = 'all' | 'gilded' | 'honored' | 'wanting' | 'open' | 'wager' | 'burned'
type Sort = 'newest' | 'oldest' | 'reputation' | 'weight'

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'gilded', label: 'Gilded' },
  { id: 'honored', label: 'Honored' },
  { id: 'wanting', label: 'Found wanting' },
  { id: 'open', label: 'Open' },
  { id: 'wager', label: 'Wagers' },
  { id: 'burned', label: 'Burned' }
]

function passes(ev: ContractEval, filter: Filter): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'open':
      return ev.status !== 'closed' && ev.status !== 'burned'
    case 'wager':
      return ev.contract.kind === 'wager'
    case 'burned':
      return ev.status === 'burned'
    default:
      return ev.grade === filter
  }
}

const LB_PER_KG = 2.2046226218

function toUnit(value: number, from: WeightUnit, to: WeightUnit): number {
  if (from === to) return value
  return from === 'kg' ? value * LB_PER_KG : value / LB_PER_KG
}

export function ArchivePage(): React.JSX.Element {
  const ledger = useLedgerData()
  const today = useToday()
  const archiveId = useUI((s) => s.archiveId)
  const openArchive = useUI((s) => s.openArchive)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('newest')
  const [burning, setBurning] = useState<Contract | null>(null)

  const evals = useMemo(
    () => ledger.contracts.map((c) => ({ ev: evaluateContract(ledger, c, today), hay: '' })).map((x) => ({ ...x, hay: contractHaystack(x.ev) })),
    [ledger, today]
  )

  const shown = useMemo(() => {
    const list = evals.filter(({ ev, hay }) => passes(ev, filter) && matchesQuery(hay, query))
    const by: Record<Sort, (a: ContractEval, b: ContractEval) => number> = {
      newest: (a, b) => b.contract.startDate.localeCompare(a.contract.startDate),
      oldest: (a, b) => a.contract.startDate.localeCompare(b.contract.startDate),
      reputation: (a, b) => b.reputation - a.reputation,
      weight: (a, b) => {
        const wa = a.weightDelta === undefined ? Infinity : toUnit(a.weightDelta, a.contract.unit, 'kg')
        const wb = b.weightDelta === undefined ? Infinity : toUnit(b.weightDelta, b.contract.unit, 'kg')
        return wa === wb ? 0 : wa < wb ? -1 : 1
      }
    }
    return list.map((x) => x.ev).sort(by[sort])
  }, [evals, filter, query, sort])

  const closed = evals.filter((x) => x.ev.status === 'closed').map((x) => x.ev)
  const unit = ledger.settings.unit
  const weightChange = closed.reduce((sum, ev) => sum + toUnit(ev.weightDelta ?? 0, ev.contract.unit, unit), 0)
  const fromContracts = evals.reduce((sum, x) => sum + x.ev.reputation, 0)
  const gilded = closed.filter((ev) => ev.grade === 'gilded').length

  const selected = archiveId ? evals.find((x) => x.ev.contract.id === archiveId)?.ev : undefined
  // Wagers and ashes get their own chips only once there are some.
  const hasWagers = evals.some((x) => x.ev.contract.kind === 'wager')
  const hasAsh = evals.some((x) => x.ev.status === 'burned')
  const filters = FILTERS.filter((f) => (f.id === 'wager' ? hasWagers : f.id === 'burned' ? hasAsh : true))

  return (
    <div className="archive">
      <header className="page-head">
        <h1 className="page-title">The Archive</h1>
        <p className="page-sub">Every contract you have sealed, kept in order. Search by month, date, goal, outcome or the words you left at the weigh-in.</p>
      </header>

      <dl className="archive__stats">
        <div>
          <dt>Contracts closed</dt>
          <dd>{closed.length}</dd>
        </div>
        <div>
          <dt>Gilded weeks</dt>
          <dd>{gilded}</dd>
        </div>
        <div>
          <dt>Weight change</dt>
          <dd>
            {formatSigned(Math.round(weightChange * 10) / 10)} {unit}
          </dd>
        </div>
        <div>
          <dt>Contract reputation</dt>
          <dd>{formatRep(fromContracts)}</dd>
        </div>
      </dl>

      <div className="archive__controls">
        <label className="search">
          <GiMagnifyingGlass className="search__icon" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search — “march”, “2026”, “gilded”, “10,000”…"
            aria-label="Search contracts"
          />
        </label>
        <div className="chips" role="radiogroup" aria-label="Filter by outcome">
          {filters.map((f) => (
            <button key={f.id} type="button" role="radio" aria-checked={filter === f.id} className={`chip ${filter === f.id ? 'is-on' : ''}`}
              onClick={() => {
                sfx('click')
                setFilter(f.id)
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <label className="select">
          <span className="sr-only">Sort</span>
          <select
            value={sort}
            onChange={(e) => {
              sfx('click')
              setSort(e.target.value as Sort)
            }}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="reputation">Most reputation</option>
            <option value="weight">Most weight lost</option>
          </select>
        </label>
      </div>

      {evals.length === 0 ? (
        <div className="archive__empty">
          <p>The shelves are bare. Sealed contracts will be kept here, week upon week.</p>
        </div>
      ) : shown.length === 0 ? (
        <div className="archive__empty">
          <p>No contract matches “{query}”.</p>
        </div>
      ) : (
        <div className="archive__grid">
          {shown.map((ev) => (
            <ContractCard key={ev.contract.id} ev={ev} onOpen={() => openArchive(ev.contract.id)} />
          ))}
        </div>
      )}

      <Modal open={!!selected && !burning} onClose={() => openArchive(null)} className="modal--wide">
        {selected && (
          <div className="archive-detail">
            <ContractDocument ev={selected} profile={ledger.profile} />
            <div className="archive-detail__side">
              {selected.status === 'burned' ? (
                <section className="panel panel--ash">
                  <header className="panel__head">
                    <h3 className="panel__title">
                      <GiFire aria-hidden="true" /> Ash
                    </h3>
                    <span className="panel__aside">{formatRep(selected.reputation)} reputation</span>
                  </header>
                  <p>
                    This {selected.contract.kind === 'wager' ? 'wager' : 'contract'} was burned
                    {selected.contract.burnedOn ? ` on ${formatShort(selected.contract.burnedOn)}` : ''}. What was recorded under it burned with it
                    {selected.contract.kind === 'wager' ? `, and its stake of ${formatNumber(selected.stake)} reputation is forfeit` : ''}.
                  </p>
                </section>
              ) : (
                <>
                  <section className="panel">
                    <header className="panel__head">
                      <h3 className="panel__title">The Week</h3>
                      <span className="panel__aside">{formatRep(selected.reputation)} reputation</span>
                    </header>
                    <WeekProgress ev={selected} />
                  </section>
                  <button type="button" className="btn btn--ghost btn--burn" onClick={() => setBurning(selected.contract)}>
                    <GiFire aria-hidden="true" /> Burn this {selected.contract.kind === 'wager' ? 'wager' : 'contract'}…
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </Modal>

      <BurnDialog contract={burning} onClose={() => setBurning(null)} onBurned={() => openArchive(null)} />
    </div>
  )
}
