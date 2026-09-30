import { useEffect, useRef, useState, type RefObject } from 'react'
import { GiCheckMark, GiPadlock, GiQuill } from 'react-icons/gi'
import { sfx } from '../../audio'
import { addDays, formatRange, formatShort, maxDate, minDate, type ISODate } from '../../lib/dates'
import {
  activeHabits,
  addHabit,
  cleanName,
  dayLog,
  dutiesSwornUnder,
  LIMITS,
  moveHabit,
  renameHabit,
  retireFloor,
  retireHabit,
  swornMessage,
  toggleDuty
} from '../../lib/ledger'
import type { Habit } from '../../lib/types'
import { useApplyWithFeedback, useLedgerData, newId } from '../../state/hooks'
import { useLedger } from '../../state/store'
import { isDialogOpen, isTyping } from '../../state/ui'
import { toast } from '../../state/toasts'
import { Modal } from '../Modal'
import { WaxSeal } from '../WaxSeal'

interface Props {
  date: ISODate
  today: ISODate
  newDutyRef: RefObject<HTMLInputElement | null>
}

function seedFor(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return h
}

export function DutyList({ date, today, newDutyRef }: Props): React.JSX.Element {
  const ledger = useLedgerData()
  const apply = useLedger((s) => s.apply)
  const applyFx = useApplyWithFeedback()
  const habits = activeHabits(ledger, date)
  const log = dayLog(ledger, date)
  const doneCount = habits.filter((h) => log.done[h.id]).length
  // While a contract is open its duties are sworn: they are kept or missed, never changed.
  const sworn = dutiesSwornUnder(ledger)
  const swornRef = useRef(sworn)
  swornRef.current = sworn

  const [justDone, setJustDone] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [retiring, setRetiring] = useState<Habit | null>(null)
  const [newName, setNewName] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)
  const listRef = useRef<HTMLOListElement>(null)

  useEffect(() => setJustDone(null), [date])

  const toggle = (h: Habit): void => {
    const el = listRef.current?.querySelector(`[data-duty="${h.id}"] .duty__box`)
    setJustDone(log.done[h.id] ? null : h.id)
    sfx(log.done[h.id] ? 'unstamp' : 'stamp')
    applyFx((l) => toggleDuty(l, date, h.id), el, date)
  }

  // 1–9 toggle duties; N starts a new one.
  const toggleRef = useRef(toggle)
  toggleRef.current = toggle
  const habitsRef = useRef(habits)
  habitsRef.current = habits
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e) || isDialogOpen()) return
      if (/^[1-9]$/.test(e.key)) {
        const h = habitsRef.current[Number(e.key) - 1]
        if (h) {
          e.preventDefault()
          toggleRef.current(h)
        }
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        const lock = swornRef.current
        if (lock) {
          toast(swornMessage(lock))
          sfx('error')
        } else {
          newDutyRef.current?.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [newDutyRef])

  const add = (): void => {
    const name = cleanName(newName)
    if (!name) return
    if (habits.some((h) => h.name.toLowerCase() === name.toLowerCase())) {
      toast(`“${name}” is already on the roll.`, 'error')
      sfx('error')
      return
    }
    if (apply((l) => addHabit(l, { id: newId(), name, createdOn: minDate(date, today) }))) sfx('quill')
    setNewName('')
  }

  // A duty sworn under a sealed contract stays on that contract's days.
  const retireFrom = (h: Habit): ISODate => {
    const floor = retireFloor(ledger, h.id)
    return floor ? maxDate(date, floor) : date
  }

  const confirmRetire = (h: Habit): void => {
    if (apply((l) => retireHabit(l, h.id, date))) {
      sfx('strike')
      toast(`“${h.name}” was struck from the roll.`)
    }
    setRetiring(null)
  }

  const onDrop = (): void => {
    if (dragId !== null && dropAt !== null) {
      // translate the position among visible duties into a position in the full list
      const target = habits[dropAt]
      const from = ledger.habits.findIndex((h) => h.id === dragId)
      let to = target ? ledger.habits.findIndex((h) => h.id === target.id) : ledger.habits.length
      if (from < to) to -= 1
      apply((l) => moveHabit(l, dragId, to))
      sfx('flip')
    }
    setDragId(null)
    setDropAt(null)
  }

  return (
    <section className="panel duties">
      <header className="panel__head">
        <h3 className="panel__title">
          Daily Duties
          {sworn && (
            <span className="duties__sworn" title={swornMessage(sworn)}>
              <GiPadlock aria-hidden="true" /> Sworn
            </span>
          )}
        </h3>
        {habits.length > 0 && (
          <span className={`duties__count ${doneCount === habits.length ? 'is-complete' : ''}`}>
            {doneCount} of {habits.length} kept
          </span>
        )}
      </header>

      {habits.length === 0 ? (
        sworn ? (
          <p className="duties__empty">No duties are on the roll for this day.</p>
        ) : (
          <p className="duties__empty">
            No duties on the roll yet. Add the small things you mean to do every day — <em>read twenty pages</em>, <em>drink eight cups of water</em>,{' '}
            <em>no sweets</em>. Sealing a contract swears them in for its week.
          </p>
        )
      ) : (
        <ol ref={listRef} className="duties__list" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
          {habits.map((h, i) => {
            const done = !!log.done[h.id]
            return (
              <li
                key={h.id}
                data-duty={h.id}
                className={[
                  'duty',
                  done ? 'is-done' : '',
                  dragId === h.id ? 'is-dragging' : '',
                  dropAt === i && dragId !== h.id ? 'is-drop-before' : '',
                  dropAt === habits.length && i === habits.length - 1 && dragId !== null ? 'is-drop-after' : ''
                ]
                  .filter(Boolean)
                  .join(' ')}
                draggable={editing === null}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData('text/plain', h.id)
                  setDragId(h.id)
                }}
                onDragEnd={() => {
                  setDragId(null)
                  setDropAt(null)
                }}
                onDragOver={(e) => {
                  if (dragId === null) return
                  e.preventDefault()
                  const r = e.currentTarget.getBoundingClientRect()
                  setDropAt(e.clientY < r.top + r.height / 2 ? i : i + 1)
                }}
              >
                <span className="duty__grip" title="Drag to reorder" aria-hidden="true">
                  ⋮⋮
                </span>
                {editing === h.id ? (
                  <RenameField
                    initial={h.name}
                    onDone={(name) => {
                      setEditing(null)
                      if (name !== null && name !== h.name && apply((l) => renameHabit(l, h.id, name))) sfx('quill')
                    }}
                  />
                ) : (
                  <button type="button" className="duty__toggle" role="checkbox" aria-checked={done} onClick={() => toggle(h)}>
                    <span className="duty__box">
                      {done && <WaxSeal color="crimson" icon={GiCheckMark} size={34} seed={seedFor(h.id)} stamp={justDone === h.id} />}
                    </span>
                    <span className="duty__name">{h.name}</span>
                    {i < 9 && <kbd className="kbd duty__key">{i + 1}</kbd>}
                  </button>
                )}
                {editing !== h.id && !sworn && (
                  <span className="duty__actions">
                    <button type="button" className="icon-btn" title="Rename" aria-label={`Rename ${h.name}`} onClick={() => setEditing(h.id)}>
                      <GiQuill />
                    </button>
                    <button type="button" className="icon-btn icon-btn--danger" title="Strike from the roll" aria-label={`Remove ${h.name}`} onClick={() => setRetiring(h)}>
                      <span aria-hidden="true">✕</span>
                    </button>
                  </span>
                )}
              </li>
            )
          })}
        </ol>
      )}

      {sworn ? (
        <p className="duties__lock">
          <GiPadlock aria-hidden="true" />
          <span>
            Sworn under the contract of <strong>{formatRange(sworn.startDate, sworn.endDate)}</strong>. Duties can be added or struck once it is closed or burned.
          </span>
        </p>
      ) : (
        <form
          className="duties__add"
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
        >
          <span className="duties__plus" aria-hidden="true">
            +
          </span>
          <input
            ref={newDutyRef}
            value={newName}
            maxLength={LIMITS.habitName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setNewName('')
                e.currentTarget.blur()
              }
            }}
            placeholder="Add a duty to the roll…"
            aria-label="New duty"
          />
          <kbd className="kbd">N</kbd>
          {newName.trim() && (
            <button type="submit" className="btn btn--small">
              Add
            </button>
          )}
        </form>
      )}

      <Modal open={retiring !== null} onClose={() => setRetiring(null)} title="Strike from the roll?" className="modal--narrow">
        {retiring && (
          <>
            <p>
              <strong>“{retiring.name}”</strong>{' '}
              {retireFrom(retiring) <= retiring.createdOn
                ? 'will be removed entirely, as if it had never been written.'
                : `will no longer appear from ${formatShort(retireFrom(retiring))} onward. Earlier days keep their record of it.`}
            </p>
            {retireFrom(retiring) > date && (
              <p className="muted">
                It was sworn under a contract that ran until {formatShort(addDays(retireFrom(retiring), -1))}, so it stays on that week’s days.
              </p>
            )}
            <div className="modal__actions">
              <button type="button" className="btn btn--ghost" onClick={() => setRetiring(null)} data-autofocus>
                Keep it
              </button>
              <button type="button" className="btn btn--danger" onClick={() => confirmRetire(retiring)}>
                Strike it
              </button>
            </div>
          </>
        )}
      </Modal>
    </section>
  )
}

function RenameField({ initial, onDone }: { initial: string; onDone(name: string | null): void }): React.JSX.Element {
  const [value, setValue] = useState(initial)
  const finished = useRef(false)
  const finish = (name: string | null): void => {
    if (finished.current) return
    finished.current = true
    onDone(name === null ? null : cleanName(name) || null)
  }
  return (
    <input
      className="duty__rename"
      autoFocus
      value={value}
      maxLength={LIMITS.habitName}
      onChange={(e) => setValue(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={() => finish(value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(value)
        if (e.key === 'Escape') finish(null)
      }}
      aria-label="Duty name"
    />
  )
}
