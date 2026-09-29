import { useEffect, useState } from 'react'
import { GiCastle } from 'react-icons/gi'
import { sfx } from '../audio'
import { setProfile, setSettings } from '../lib/ledger'
import type { WeightUnit } from '../lib/types'
import { useLedgerData } from '../state/hooks'
import { useLedger } from '../state/store'
import { toast } from '../state/toasts'
import { useUI } from '../state/ui'
import { Modal } from './Modal'
import { WaxSeal } from './WaxSeal'

const TITLES = ['Lord', 'Lady', 'Sir', 'Dame', 'Noble']
const HOLDINGS = ['Ashford', 'Wyndmere', 'Thornbury', 'Oakhollow', 'Ravensmoor', 'Bramblewick', 'Stonecross', 'Heathfield']

/**
 * The letters patent: who you are and which holding the Crown granted you.
 * Shown automatically the first time the app opens, and from the crest afterwards.
 * (Units and the first day of the week are asked once here, then live in Settings.)
 */
export function ProfileModal(): React.JSX.Element {
  const ledger = useLedgerData()
  const apply = useLedger((s) => s.apply)
  const open = useUI((s) => s.profileOpen)
  const setOpen = useUI((s) => s.setProfileOpen)
  const firstRun = ledger.profile === null

  const [title, setTitle] = useState('Lord')
  const [name, setName] = useState('')
  const [holding, setHolding] = useState(() => HOLDINGS[Math.floor(Math.random() * HOLDINGS.length)])
  const [unit, setUnit] = useState<WeightUnit>('lb')
  const [weekStartsOn, setWeekStartsOn] = useState<0 | 1>(1)

  const visible = open || firstRun

  useEffect(() => {
    if (!visible) return
    if (ledger.profile) {
      setTitle(ledger.profile.title)
      setName(ledger.profile.name)
      setHolding(ledger.profile.holding)
    }
    setUnit(ledger.settings.unit)
    setWeekStartsOn(ledger.settings.weekStartsOn)
    // Refill the form only when the dialog opens, not on every ledger change.
  }, [visible]) // eslint-disable-line react-hooks/exhaustive-deps

  const ready = name.trim().length > 0 && holding.trim().length > 0

  const save = (): void => {
    if (!ready) return
    if (firstRun) {
      apply((l) => setSettings(setProfile(l, { title, name, holding }), { unit, weekStartsOn }))
      sfx('seal')
      toast(`Welcome to ${holding.trim()}, ${title} ${name.trim()}.`, 'success')
    } else {
      apply((l) => setProfile(l, { title, name, holding }))
      sfx('quill')
    }
    setOpen(false)
  }

  return (
    <Modal
      open={visible}
      onClose={() => setOpen(false)}
      dismissable={!firstRun}
      className="modal--patent"
      title={firstRun ? 'Letters Patent' : 'Your Letters Patent'}
      labelledBy="patent-title"
    >
      <form
        className="patent"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <div className="patent__seal">
          <WaxSeal color="crimson" icon={GiCastle} size={92} seed={4} />
        </div>
        <p className="patent__lead">
          {firstRun
            ? 'By order of the Crown, a modest holding is granted to the bearer of these letters — to be tended, and to prosper by the bearer’s good name. Tell the scribe who you are.'
            : 'Amend your name and your holding. Your contracts and chronicle are untouched.'}
        </p>

        <div className="patent__row">
          <label className="field field--title">
            <span className="field__label">Title</span>
            <select value={title} onChange={(e) => setTitle(e.target.value)}>
              {TITLES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="field field--grow">
            <span className="field__label">Name</span>
            <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Your name" data-autofocus autoComplete="off" />
          </label>
        </div>

        <label className="field">
          <span className="field__label">Your holding</span>
          <input value={holding} maxLength={40} onChange={(e) => setHolding(e.target.value)} placeholder="Name your land" autoComplete="off" />
        </label>

        {firstRun && (
          <div className="patent__row">
            <div className="field">
              <span className="field__label">Weights measured in</span>
              <span className="unit-toggle unit-toggle--wide" role="radiogroup" aria-label="Weight unit">
                {(['lb', 'kg'] as const).map((u) => (
                  <button key={u} type="button" role="radio" aria-checked={unit === u} className={unit === u ? 'is-on' : ''} onClick={() => setUnit(u)}>
                    {u === 'lb' ? 'Pounds' : 'Kilograms'}
                  </button>
                ))}
              </span>
            </div>
            <div className="field">
              <span className="field__label">Weeks begin on</span>
              <span className="unit-toggle unit-toggle--wide" role="radiogroup" aria-label="First day of the week">
                {([1, 0] as const).map((d) => (
                  <button key={d} type="button" role="radio" aria-checked={weekStartsOn === d} className={weekStartsOn === d ? 'is-on' : ''} onClick={() => setWeekStartsOn(d)}>
                    {d === 1 ? 'Monday' : 'Sunday'}
                  </button>
                ))}
              </span>
            </div>
          </div>
        )}

        <div className="modal__actions">
          {!firstRun && (
            <button type="button" className="btn btn--ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
          )}
          <button type="submit" className="btn btn--primary" disabled={!ready}>
            {firstRun ? 'Accept the holding' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
