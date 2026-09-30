import { GiCrown, GiReceiveMoney } from 'react-icons/gi'
import { hashSeed, sealFor, type ContractEval } from '../../lib/contracts'
import { formatRange, formatShort } from '../../lib/dates'
import { formatCompact, formatNumber, formatRep, formatSigned } from '../../lib/format'
import type { Contract } from '../../lib/types'
import { WaxSeal } from '../WaxSeal'

const ROW = 20
const GAP = 4

/** A tiny bar chart, one row per goal (steps, calories, and sworn duties), one bar per day. */
export function MiniBars({ ev }: { ev: ContractEval }): React.JSX.Element {
  const c = ev.contract
  const sworn = ev.duties.length
  const w = 7 * 18
  const rows: Array<(i: number) => { frac: number; cls: string }> = [
    (i) => {
      const d = ev.days[i]
      return { frac: d.steps === undefined ? 0 : Math.min(1, d.steps / c.stepsGoal), cls: d.stepsMet ? 'met' : 'short' }
    },
    (i) => {
      const d = ev.days[i]
      return {
        frac: d.calories === undefined ? 0 : Math.min(1, d.calories / c.caloriesGoal),
        cls: d.caloriesMet ? 'met' : d.caloriesOver ? 'over' : 'short'
      }
    }
  ]
  if (sworn) rows.push((i) => ({ frac: ev.days[i].dutiesKept / sworn, cls: ev.days[i].dutiesKept === sworn ? 'met' : 'short' }))
  const pitch = ROW + GAP
  const h = rows.length * pitch - 2

  return (
    <svg className="minibars" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
      {rows.map((row, r) => {
        const top = r * pitch + 1
        return (
          <g key={r}>
            <line x1="0" x2={w} y1={top} y2={top} className="minibars__goal" />
            {ev.days.map((d, i) => {
              const { frac, cls } = row(i)
              return (
                <rect
                  key={d.date}
                  x={i * 18 + 3}
                  y={top + ROW - ROW * frac}
                  width={12}
                  height={Math.max(ROW * frac, 0.5)}
                  className={`minibars__${cls}`}
                  rx="1.5"
                />
              )
            })}
          </g>
        )
      })}
    </svg>
  )
}

/** "10k steps · ≤2k kcal", "10k steps · 1.6–2k kcal", "10k steps · 500 kcal burned" */
function termsLine(c: Contract): string {
  const steps = `${formatCompact(c.stepsGoal)} steps`
  if (c.calorieRule === 'burn') return `${steps} · ${formatCompact(c.caloriesGoal)} kcal burned`
  if (c.caloriesMin !== undefined) return `${steps} · ${formatCompact(c.caloriesMin)}–${formatCompact(c.caloriesGoal)} kcal`
  return `${steps} · ≤${formatCompact(c.caloriesGoal)} kcal`
}

export function ContractCard({ ev, onOpen }: { ev: ContractEval; onOpen(): void }): React.JSX.Element {
  const c = ev.contract
  const seal = sealFor(ev)
  const burned = ev.status === 'burned'
  return (
    <button type="button" className={`card card--${ev.grade ?? ev.status} ${c.kind === 'wager' ? 'card--wager' : ''}`} onClick={onOpen}>
      <span className="card__paper" aria-hidden="true" />
      <span className="card__head">
        <span className="card__dates">{formatRange(c.startDate, c.endDate)}</span>
        <span className="card__terms">{termsLine(c)} a day</span>
        {c.kind === 'wager' && (
          <span className="card__wager">
            <GiReceiveMoney aria-hidden="true" /> Wager · {formatNumber(ev.stake)} staked
          </span>
        )}
      </span>
      <span className="card__seal">
        <WaxSeal color={seal.color} icon={GiCrown} size={58} seed={hashSeed(c.id)} />
      </span>
      {burned ? (
        <span className="card__ash">
          Burned{c.burnedOn ? ` ${formatShort(c.burnedOn)}` : ''} — {c.kind === 'wager' ? 'the stake is forfeit' : 'its progress went with it'}.
        </span>
      ) : (
        <span className="card__chart">
          <MiniBars ev={ev} />
          <span className="card__legend">
            <span>
              Steps <strong>{ev.stepsDays}</strong>/7
            </span>
            <span>
              Calories <strong>{ev.caloriesDays}</strong>/7
            </span>
            {ev.duties.length > 0 && (
              <span>
                Duties <strong>{ev.dutiesKept}</strong>/{ev.duties.length * 7}
              </span>
            )}
          </span>
        </span>
      )}
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
        <span className={`card__rep ${ev.reputation < 0 ? 'is-cost' : ''}`}>{formatRep(ev.reputation)}</span>
      </span>
    </button>
  )
}
