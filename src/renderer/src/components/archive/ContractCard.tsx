import { GiCrown } from 'react-icons/gi'
import { hashSeed, sealFor, type ContractEval } from '../../lib/contracts'
import { formatRange } from '../../lib/dates'
import { formatCompact, formatRep, formatSigned } from '../../lib/format'
import { WaxSeal } from '../WaxSeal'

/** A tiny two-row bar chart: steps above, calories below, one pair per day. */
export function MiniBars({ ev }: { ev: ContractEval }): React.JSX.Element {
  const c = ev.contract
  const w = 7 * 18
  const bar = (value: number | undefined, goal: number): number => (value === undefined ? 0 : Math.min(1, value / goal))
  return (
    <svg className="minibars" viewBox={`0 0 ${w} 46`} width={w} height={46} aria-hidden="true">
      <line x1="0" x2={w} y1="1" y2="1" className="minibars__goal" />
      <line x1="0" x2={w} y1="25" y2="25" className="minibars__goal" />
      {ev.days.map((d, i) => {
        const x = i * 18 + 3
        const s = bar(d.steps, c.stepsGoal)
        const k = bar(d.calories, c.caloriesGoal)
        return (
          <g key={d.date}>
            <rect x={x} y={21 - 20 * s} width={12} height={Math.max(20 * s, 0.5)} className={d.stepsMet ? 'minibars__met' : 'minibars__short'} rx="1.5" />
            <rect x={x} y={45 - 20 * k} width={12} height={Math.max(20 * k, 0.5)} className={d.caloriesMet ? 'minibars__met' : 'minibars__short'} rx="1.5" />
          </g>
        )
      })}
    </svg>
  )
}

export function ContractCard({ ev, onOpen }: { ev: ContractEval; onOpen(): void }): React.JSX.Element {
  const c = ev.contract
  const seal = sealFor(ev)
  return (
    <button type="button" className={`card card--${ev.grade ?? ev.status}`} onClick={onOpen}>
      <span className="card__paper" aria-hidden="true" />
      <span className="card__head">
        <span className="card__dates">{formatRange(c.startDate, c.endDate)}</span>
        <span className="card__terms">
          {formatCompact(c.stepsGoal)} steps · {formatCompact(c.caloriesGoal)} kcal a day
        </span>
      </span>
      <span className="card__seal">
        <WaxSeal color={seal.color} icon={GiCrown} size={58} seed={hashSeed(c.id)} />
      </span>
      <span className="card__chart">
        <MiniBars ev={ev} />
        <span className="card__legend">
          <span>
            Steps <strong>{ev.stepsDays}</strong>/7
          </span>
          <span>
            Calories <strong>{ev.caloriesDays}</strong>/7
          </span>
        </span>
      </span>
      <span className="card__foot">
        <span className="card__weight">
          {c.finalWeight !== undefined ? (
            <>
              {c.startWeight.toFixed(1)} → {c.finalWeight.toFixed(1)} {c.unit}{' '}
              <em className={ev.weightDelta! < 0 ? 'is-down' : ev.weightDelta! > 0 ? 'is-up' : ''}>({formatSigned(ev.weightDelta ?? 0)})</em>
            </>
          ) : (
            <>
              {c.startWeight.toFixed(1)} {c.unit} · <em>{seal.label.toLowerCase()}</em>
            </>
          )}
        </span>
        <span className="card__rep">{formatRep(ev.reputation)}</span>
      </span>
    </button>
  )
}
