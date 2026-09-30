import { useEffect, useRef, useState, type RefObject } from 'react'
import type { IconType } from 'react-icons'
import { GiBootPrints, GiCheckMark, GiFlame, GiKnifeFork, GiWatch } from 'react-icons/gi'
import { calorieMetricOf, caloriesKept, overLimit, stepsKept } from '../../lib/contracts'
import type { ISODate } from '../../lib/dates'
import { formatNumber, parseTally } from '../../lib/format'
import { adoptSyncedValue, contractOn, dayLog, metricSource, setMetric } from '../../lib/ledger'
import type { Contract, Metric } from '../../lib/types'
import { sfx } from '../../audio'
import { emitFloat } from '../../state/floats'
import { useApplyWithFeedback, useLedgerData } from '../../state/hooks'
import { SealSocket, WaxSeal } from '../WaxSeal'

const META: Record<Metric, { label: string; unit: string; icon: IconType; presets: number[]; step: number; key: string }> = {
  steps: { label: 'Steps walked', unit: 'steps', icon: GiBootPrints, presets: [500, 1000, 2500], step: 100, key: 'S' },
  eaten: { label: 'Calories eaten', unit: 'kcal', icon: GiKnifeFork, presets: [100, 250, 500], step: 10, key: 'C' },
  calories: { label: 'Calories burned', unit: 'kcal', icon: GiFlame, presets: [50, 100, 250], step: 10, key: 'C' }
}

interface TallyProps {
  metric: Metric
  date: ISODate
  inputRef?: RefObject<HTMLInputElement | null>
}

/** How a number measures up against the day's contract. */
interface Standing {
  met: boolean
  over: boolean
  /** 0…1 of the bar */
  fill: number
  /** where the minimum sits on the bar (0…1), for a calorie range */
  floor?: number
  text: React.JSX.Element
}

function standing(metric: Metric, c: Contract, value: number | undefined): Standing {
  const v = value ?? 0
  if (metric === 'steps' || c.calorieRule === 'burn') {
    const goal = metric === 'steps' ? c.stepsGoal : c.caloriesGoal
    const met = metric === 'steps' ? stepsKept(c, value) : caloriesKept(c, value)
    return {
      met,
      over: false,
      fill: Math.min(1, v / goal),
      text: met ? (
        <>
          <strong>Goal met</strong>
          {v > goal && <> · {formatNumber(v - goal)} beyond</>}
        </>
      ) : (
        <>
          <strong>{formatNumber(goal - v)}</strong> to go of {formatNumber(goal)}
        </>
      )
    }
  }

  // calories eaten, against a limit (and perhaps a minimum)
  const limit = c.caloriesGoal
  const min = c.caloriesMin
  const met = caloriesKept(c, value)
  const over = overLimit(c, value)
  const range = min !== undefined ? `${formatNumber(min)}–${formatNumber(limit)}` : `no more than ${formatNumber(limit)}`
  let text: React.JSX.Element
  if (value === undefined) {
    text = (
      <>
        Record what you eat — <strong>{range}</strong> keeps the term
      </>
    )
  } else if (over) {
    text = (
      <>
        <strong>Over the limit</strong> by {formatNumber(v - limit)}
      </>
    )
  } else if (!met && min !== undefined) {
    text = (
      <>
        <strong>{formatNumber(min - v)}</strong> short of the {formatNumber(min)} minimum
      </>
    )
  } else {
    text = (
      <>
        <strong>Within the limit</strong> · {formatNumber(limit - v)} to spare
      </>
    )
  }
  return { met, over, fill: Math.min(1, v / limit), floor: min !== undefined ? min / limit : undefined, text }
}

export function Tally({ metric, date, inputRef }: TallyProps): React.JSX.Element {
  const meta = META[metric]
  const ledger = useLedgerData()
  const applyFx = useApplyWithFeedback()
  const log = dayLog(ledger, date)
  const value = log[metric]
  const source = metricSource(log, metric)
  const fitbitSays = log.synced?.[metric]
  const bound = contractOn(ledger, date)
  // the contract judges this tally (steps, and the calories it counts)
  const contract = bound && (metric === 'steps' || calorieMetricOf(bound) === metric) ? bound : undefined

  // null while untouched; the text being typed otherwise
  const [draft, setDraft] = useState<string | null>(null)
  const draftRef = useRef(draft)
  draftRef.current = draft
  const [invalid, setInvalid] = useState(false)
  const ownRef = useRef<HTMLInputElement>(null)
  const input = inputRef ?? ownRef
  const sealRef = useRef<HTMLDivElement>(null)

  // Leaving a day abandons any half-typed number for it.
  useEffect(() => setDraft(null), [date])

  const preview = draft !== null ? parseTally(draft, value) : value
  const shown = preview === null ? value : preview
  const now = contract ? standing(metric, contract, value) : null
  const next = contract ? standing(metric, contract, shown) : null
  const met = !!now?.met

  // Stamp the seal only when the goal is reached right now, not when browsing to a finished day.
  const [stampFor, setStampFor] = useState<string | null>(null)
  const prev = useRef({ date, met })
  useEffect(() => {
    if (prev.current.date === date && !prev.current.met && met) setStampFor(date)
    prev.current = { date, met }
  }, [date, met])

  const save = (nextValue: number | undefined): void => {
    if (nextValue === value) return
    applyFx((l) => setMetric(l, date, metric, nextValue), sealRef.current ?? input.current, date)
  }

  const commit = (): void => {
    if (draft === null) return
    const parsed = parseTally(draft, value)
    setDraft(null)
    if (parsed === null) {
      setInvalid(true)
      setTimeout(() => setInvalid(false), 600)
      sfx('error')
      return
    }
    if (parsed === value) return
    sfx(parsed === undefined ? 'unstamp' : 'quill')
    save(parsed)
  }

  const nudge = (dir: 1 | -1, big: boolean): void => {
    const base = (draft !== null ? parseTally(draft, value) : value) ?? 0
    const n = Math.max(0, (base ?? 0) + dir * meta.step * (big ? 10 : 1))
    setDraft(String(n))
  }

  const Icon = meta.icon
  const classes = ['tally', `tally--${metric}`, next?.met ? 'is-met' : '', next?.over ? 'is-over' : '', invalid ? 'is-invalid' : '']

  return (
    <section className={classes.filter(Boolean).join(' ')}>
      <header className="tally__head">
        <Icon className="tally__icon" aria-hidden="true" />
        <h3 className="tally__label">{meta.label}</h3>
        {source === 'fitbit' && (
          <span className="tally__source" title="Filled in by Fitbit. Type a number to use your own instead.">
            <GiWatch aria-hidden="true" /> Fitbit
          </span>
        )}
        <kbd className="kbd" title={`Press ${meta.key} to jump here`}>
          {meta.key}
        </kbd>
      </header>

      <div className="tally__main">
        <label className="tally__field">
          <span className="sr-only">{meta.label}</span>
          <input
            ref={input}
            className="tally__input"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            placeholder="0"
            value={draft ?? (value !== undefined ? formatNumber(value) : '')}
            onFocus={(e) => {
              // Select everything so typing replaces the tally ("+1200" adds to it instead).
              const el = e.currentTarget
              el.select()
              // A mouse click can collapse the selection on mouseup; reselect unless typing has begun.
              requestAnimationFrame(() => {
                if (document.activeElement === el && draftRef.current === null) el.select()
              })
            }}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur()
              } else if (e.key === 'Escape') {
                setDraft(null)
                requestAnimationFrame(() => input.current?.blur())
              } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault()
                nudge(e.key === 'ArrowUp' ? 1 : -1, e.shiftKey)
              }
            }}
          />
          <span className="tally__unit">{meta.unit}</span>
        </label>
        <div className="tally__seal" ref={sealRef}>
          {met ? (
            <WaxSeal
              color="crimson"
              icon={GiCheckMark}
              size={66}
              seed={metric === 'steps' ? 31 : 47}
              stamp={stampFor === date}
              title={metric === 'eaten' ? 'Within the limit' : 'Goal met'}
            />
          ) : (
            <SealSocket size={66} />
          )}
        </div>
      </div>

      {contract && next ? (
        <>
          <div
            className="tally__bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={metric === 'steps' ? contract.stepsGoal : contract.caloriesGoal}
            aria-valuenow={shown ?? 0}
          >
            <div className="tally__fill" style={{ width: `${next.fill * 100}%` }} />
            {next.floor !== undefined && <div className="tally__floor" style={{ left: `${next.floor * 100}%` }} title="The daily minimum" />}
          </div>
          <p className="tally__goal">{next.text}</p>
        </>
      ) : (
        <p className="tally__unbound">No contract binds this day. Recorded, but it earns no reputation.</p>
      )}

      <div className="tally__presets">
        {meta.presets.map((n) => (
          <button
            key={n}
            type="button"
            className="chip"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              emitFloat(`+${formatNumber(n)}`, e.currentTarget, 'neutral')
              sfx('click')
              save(((draft !== null ? parseTally(draft, value) : value) ?? value ?? 0) + n)
              setDraft(null)
            }}
          >
            +{formatNumber(n)}
          </button>
        ))}
        {value !== undefined && (
          <button
            type="button"
            className="chip chip--quiet"
            onClick={() => {
              sfx('unstamp')
              save(undefined)
            }}
            title="Clear this tally"
          >
            Clear
          </button>
        )}
        {source !== 'fitbit' && fitbitSays !== undefined && fitbitSays !== value && (
          <button
            type="button"
            className="tally__adopt link"
            onClick={() => {
              sfx('quill')
              applyFx((l) => adoptSyncedValue(l, date, metric), sealRef.current, date)
            }}
            title="Replace your number with Fitbit's, and let Fitbit keep it up to date"
          >
            Fitbit counts {formatNumber(fitbitSays)} — use it
          </button>
        )}
        {metric === 'eaten' && log.calories !== undefined && (
          <span className="tally__aside" title="Calories burned in activity that day, for reference — the contract counts what you eat">
            <GiFlame aria-hidden="true" /> {formatNumber(log.calories)} burned
          </span>
        )}
      </div>
    </section>
  )
}
