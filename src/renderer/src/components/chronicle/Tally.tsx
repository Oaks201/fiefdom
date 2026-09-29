import { useEffect, useRef, useState, type RefObject } from 'react'
import type { IconType } from 'react-icons'
import { GiBootPrints, GiCheckMark, GiFlame } from 'react-icons/gi'
import type { ISODate } from '../../lib/dates'
import { formatNumber, parseTally } from '../../lib/format'
import { contractOn, dayLog, setMetric } from '../../lib/ledger'
import type { Metric } from '../../lib/types'
import { sfx } from '../../audio'
import { emitFloat } from '../../state/floats'
import { useApplyWithFeedback, useLedgerData } from '../../state/hooks'
import { SealSocket, WaxSeal } from '../WaxSeal'

const META: Record<Metric, { label: string; unit: string; icon: IconType; presets: number[]; step: number; key: string }> = {
  steps: { label: 'Steps walked', unit: 'steps', icon: GiBootPrints, presets: [500, 1000, 2500], step: 100, key: 'S' },
  calories: { label: 'Calories burned', unit: 'kcal', icon: GiFlame, presets: [50, 100, 250], step: 10, key: 'C' }
}

interface TallyProps {
  metric: Metric
  date: ISODate
  inputRef?: RefObject<HTMLInputElement | null>
}

export function Tally({ metric, date, inputRef }: TallyProps): React.JSX.Element {
  const meta = META[metric]
  const ledger = useLedgerData()
  const applyFx = useApplyWithFeedback()
  const value = dayLog(ledger, date)[metric]
  const contract = contractOn(ledger, date)
  const goal = contract ? (metric === 'steps' ? contract.stepsGoal : contract.caloriesGoal) : undefined

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
  const met = goal !== undefined && (value ?? 0) >= goal
  const previewMet = goal !== undefined && (shown ?? 0) >= goal

  // Stamp the seal only when the goal is crossed right now, not when browsing to a finished day.
  const [stampFor, setStampFor] = useState<string | null>(null)
  const prev = useRef({ date, met })
  useEffect(() => {
    if (prev.current.date === date && !prev.current.met && met) setStampFor(date)
    prev.current = { date, met }
  }, [date, met])

  const save = (next: number | undefined): void => {
    if (next === value) return
    applyFx((l) => setMetric(l, date, metric, next), sealRef.current ?? input.current, date)
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
    if (parsed !== value) sfx(parsed === undefined ? 'unstamp' : 'quill')
    save(parsed)
  }

  const nudge = (dir: 1 | -1, big: boolean): void => {
    const base = (draft !== null ? parseTally(draft, value) : value) ?? 0
    const next = Math.max(0, (base ?? 0) + dir * meta.step * (big ? 10 : 1))
    setDraft(String(next))
  }

  const pct = goal ? Math.min(100, ((shown ?? 0) / goal) * 100) : 0
  const Icon = meta.icon

  return (
    <section className={`tally tally--${metric} ${previewMet ? 'is-met' : ''} ${invalid ? 'is-invalid' : ''}`}>
      <header className="tally__head">
        <Icon className="tally__icon" aria-hidden="true" />
        <h3 className="tally__label">{meta.label}</h3>
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
            <WaxSeal color="crimson" icon={GiCheckMark} size={66} seed={metric === 'steps' ? 31 : 47} stamp={stampFor === date} title="Goal met" />
          ) : (
            <SealSocket size={66} />
          )}
        </div>
      </div>

      {goal !== undefined ? (
        <>
          <div className="tally__bar" role="progressbar" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={shown ?? 0}>
            <div className="tally__fill" style={{ width: `${pct}%` }} />
          </div>
          <p className="tally__goal">
            {previewMet ? (
              <>
                <strong>Goal met</strong>
                {(shown ?? 0) > goal && <> · {formatNumber((shown ?? 0) - goal)} beyond</>}
              </>
            ) : (
              <>
                <strong>{formatNumber(goal - (shown ?? 0))}</strong> to go of {formatNumber(goal)}
              </>
            )}
          </p>
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
      </div>
    </section>
  )
}
