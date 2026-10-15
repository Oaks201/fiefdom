import { useMemo, useState } from 'react'
import { GiCastle } from 'react-icons/gi'
import { sfx } from '../../audio'
import { hashSeed } from '../../lib/contracts'
import { formatShort } from '../../lib/dates'
import { formatNumber, parseDecimal, parseInteger } from '../../lib/format'
import { foundCampaign, foundingHealer, type FoundingInput } from '../../lib/game/campaign'
import { numeral } from '../../lib/game/effects'
import { CampaignError } from '../../lib/game/errors'
import { refound, refoundDefaults, type RefoundAnswers, type RefoundResult } from '../../lib/game/refound'
import { RULES } from '../../lib/game/rules'
import { BUILDING_IDS, RIVAL_IDS, type Campaign, type Charter, type MarchId } from '../../lib/game/types'
import { buildingName, marchName } from '../../lib/game/view/realm'
import { amount } from '../../lib/game/view/refusals'
import { rivalName } from '../../lib/game/view/shell'
import { activeHabits, addHabit, cleanName, openContract, weighIns } from '../../lib/ledger'
import { useCampaign } from '../../state/campaign'
import { campaignNow } from '../../state/campaignClock'
import { useToday } from '../../state/clock'
import { newId, useLedgerData } from '../../state/hooks'
import { useLedger } from '../../state/store'
import { toast } from '../../state/toasts'
import { useUI } from '../../state/ui'
import { HoldButton } from '../HoldButton'
import { Modal } from '../Modal'
import { WaxSeal } from '../WaxSeal'
import { GameArt } from './GameArt'

/** Ch 16's suggested duties: all additive habits, never skipping anything. */
const SUGGESTED_DUTIES = ['Sleep by 11', 'Drink water', 'Stretch', 'Read', 'Cook at home']

const STEPS = ['The journey', 'For the Healer', 'The Charter', 'Seal the realm'] as const
/** The re-founding (D-21): the four questions, then the result to confirm (C-15). */
const REFOUND_STEPS = ['The journey', 'For the Healer', 'The Charter', 'The first weeks', 'Re-found the realm'] as const

/** The four questions' choices (P2-08), as interface text. */
const SPEND_CHOICES: { id: RefoundAnswers['spend']; label: string }[] = [
  { id: 'build', label: 'Build first (tiers, castle, Crossings)' },
  { id: 'arm', label: 'Arm first (the Armory, Wings and Elites, then build)' },
  { id: 'balanced', label: 'Balanced (the cheaper of the two first, each week)' }
]
const LAND_CHOICES: { id: RefoundAnswers['land']; label: string }[] = [
  { id: 'force', label: 'By force (assault; court nothing)' },
  { id: 'deals', label: 'By deals (court every village in reach, buy what trade allows, assault the rest)' },
  { id: 'both', label: 'Both (court what the purse allows, assault the rest)' }
]
const OFFER_CHOICES: { id: RefoundAnswers['offers']; label: string }[] = [
  { id: 'accept', label: 'Accept those you can afford' },
  { id: 'decline', label: 'Decline' }
]

function zone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/**
 * Founding a campaign (T14, Ch 4, Ch 16, A-03, A-07): the weight journey and the pace cap, the
 * optional facts the Healer estimates from, the Charter checked against the floor (shown as it is
 * typed), and a held wax seal. Refusals are shown plainly; nothing is saved until the seal.
 */
export function FoundingWizard(): React.JSX.Element | null {
  const open = useUI((s) => s.foundingOpen)
  const setOpen = useUI((s) => s.setFoundingOpen)
  if (!open) return null
  return <Wizard onClose={() => setOpen(false)} />
}

function Wizard({ onClose }: { onClose(): void }): React.JSX.Element {
  const ledger = useLedgerData()
  const today = useToday()
  const apply = useLedger((s) => s.apply)
  const found = useCampaign((s) => s.found)
  const refoundCampaign = useCampaign((s) => s.refound)
  const go = useUI((s) => s.go)
  const unit = ledger.settings.unit
  const latest = weighIns(ledger).at(-1)

  // A campaign founded under older rules is re-founded instead (D-21), starting from its own answers (C-16).
  const [old] = useState(() => useCampaign.getState().outdated)
  const refounding = old !== null
  const [defaults] = useState(() => (old ? refoundDefaults(ledger, old) : null))
  // A new seed fixed when the wizard opens, so changing the answers changes only what they change (section 7.2).
  const [seed] = useState(() => hashSeed(campaignNow().toISOString()))
  const steps: readonly string[] = refounding ? REFOUND_STEPS : STEPS

  const [step, setStep] = useState(0)
  const [start, setStart] = useState(() => {
    const w = defaults?.startWeight ?? latest?.weight
    return w !== undefined ? w.toFixed(1) : ''
  })
  const [goal, setGoal] = useState(defaults?.goalWeight !== undefined ? String(defaults.goalWeight) : '')
  const [pace, setPace] = useState(String(defaults?.targetPace ?? RULES.momentum.targetPace.capLb))
  // Height in feet and inches beside pounds, in centimetres beside kilograms.
  const imperial = unit === 'lb'
  const knownInches = defaults?.heightCm !== undefined ? defaults.heightCm / RULES.units.cmPerInch : undefined
  const [height, setHeight] = useState(defaults?.heightCm !== undefined ? String(Math.round(defaults.heightCm)) : '')
  const [heightFt, setHeightFt] = useState(knownInches !== undefined ? String(Math.floor(knownInches / RULES.units.inchesPerFoot)) : '')
  const [heightIn, setHeightIn] = useState(knownInches !== undefined ? String(Math.round(knownInches % RULES.units.inchesPerFoot)) : '')
  const [sex, setSex] = useState<Campaign['sex'] | ''>(defaults?.sex ?? '')
  const [birthYear, setBirthYear] = useState(defaults?.birthYear !== undefined ? String(defaults.birthYear) : '')
  const [pool, setPool] = useState(defaults?.charter ? formatNumber(defaults.charter.stepPool) : '50,000')
  const [limit, setLimit] = useState(defaults?.charter ? formatNumber(defaults.charter.calorieLimit) : '2,000')
  const [duties, setDuties] = useState<string[]>(
    () => defaults?.charter?.duties ?? activeHabits(ledger, today).slice(0, RULES.contracts.charter.duties.max).map((h) => h.name)
  )
  const [newDuty, setNewDuty] = useState('')
  const [supervised, setSupervised] = useState(defaults?.medicalSupervision === true)
  const [error, setError] = useState<string | null>(null)
  // The four questions (P2-08), first set to the simulator's greedy player: all four paths, build first, both, accept.
  const [answers, setAnswers] = useState<RefoundAnswers>({ paths: [...RIVAL_IDS], spend: 'build', land: 'both', offers: 'accept' })
  const [result, setResult] = useState<RefoundResult | null>(null)
  const timeZone = defaults?.timeZone ?? zone()

  const legacyOpen = openContract(ledger) !== undefined
  const heightGiven = imperial ? heightFt.trim() !== '' || heightIn.trim() !== '' : height.trim() !== ''
  const heightCm = !heightGiven
    ? undefined
    : imperial
      ? (parseDecimal(heightFt.trim() || '0') * RULES.units.inchesPerFoot + parseDecimal(heightIn.trim() || '0')) * RULES.units.cmPerInch
      : parseDecimal(height)
  const charter: Charter = { stepPool: parseInteger(pool), calorieLimit: parseInteger(limit), duties }
  const input: FoundingInput = useMemo(
    () => ({
      startWeight: parseDecimal(start),
      goalWeight: parseDecimal(goal),
      unit,
      targetPace: parseDecimal(pace),
      ...(heightCm !== undefined ? { heightCm } : {}),
      ...(sex ? { sex } : {}),
      ...(birthYear.trim() ? { birthYear: parseInteger(birthYear) } : {}),
      charter,
      timeZone,
      ...(defaults?.weekStartsOn !== undefined ? { weekStartsOn: defaults.weekStartsOn } : {}),
      ledger,
      ...(supervised ? { medicalSupervision: true } : {})
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [start, goal, unit, pace, heightCm, sex, birthYear, pool, limit, duties, supervised, ledger, timeZone]
  )
  const healer = useMemo(() => {
    try {
      return foundingHealer(input, campaignNow()).range
    } catch {
      return null
    }
  }, [input])

  const journeyProblem = ((): string | null => {
    if (legacyOpen) return 'A ledger contract is still open. Close it with its weigh-in before founding a campaign.'
    if (!(input.startWeight > 0)) return 'Enter your weight today.'
    if (!(input.goalWeight > 0)) return 'Enter a goal weight.'
    if (input.goalWeight >= input.startWeight) return 'The goal must be below the weight today.'
    return null
  })()
  const healerProblem = heightCm !== undefined && !(heightCm > 0) ? 'Enter your height as a number, or leave it blank.' : null
  const charterProblem = ((): string | null => {
    const c = RULES.contracts.charter
    if (!(charter.stepPool >= c.stepPool.min && charter.stepPool <= c.stepPool.max)) return `The step pool must be ${formatNumber(c.stepPool.min)} to ${formatNumber(c.stepPool.max)} a week.`
    if (healer && !supervised && charter.calorieLimit < healer.floor) return `The calorie limit can't sit below the Healer's floor of ${formatNumber(healer.floor)} kcal without medical supervision.`
    if (duties.length < c.duties.min || duties.length > c.duties.max) return `Swear ${c.duties.min} to ${c.duties.max} duties.`
    return null
  })()

  const addDuty = (name: string): void => {
    const clean = cleanName(name)
    if (!clean || duties.some((d) => d.toLowerCase() === clean.toLowerCase()) || duties.length >= RULES.contracts.charter.duties.max) return
    setDuties([...duties, clean])
    setNewDuty('')
  }

  const seal = (): void => {
    let state
    try {
      state = foundCampaign(input, campaignNow())
    } catch (err) {
      if (err instanceof CampaignError) {
        sfx('error')
        setError(err.message)
        return
      }
      throw err
    }
    addMissingDuties()
    found(state)
    sfx('seal')
    sfx('founding', 0.3)
    toast('The realm is founded. Its first day begins at the next dawn.', 'success')
    onClose()
    go('chronicle')
  }

  /** A sworn duty the ledger doesn't keep yet becomes a ledger duty, so it can be ticked (A-122). */
  function addMissingDuties(): void {
    const known = new Set(activeHabits(ledger, today).map((h) => h.name.trim().toLowerCase()))
    for (const d of duties) if (!known.has(d.trim().toLowerCase())) apply((l) => addHabit(l, { id: newId(), name: d, createdOn: today }))
  }

  /** Plays the days since the founding date and holds the result for the last step (C-15): nothing is written yet. */
  const runRefounding = (): boolean => {
    setError(null)
    try {
      setResult(refound({ ...input, seed, answers, old }, campaignNow()))
      return true
    } catch (err) {
      if (err instanceof CampaignError) {
        sfx('error')
        setError(err.message)
        setResult(null)
        return false
      }
      throw err
    }
  }

  const sealRefounding = async (): Promise<void> => {
    if (!result) return
    if (!(await refoundCampaign(result.state))) return
    addMissingDuties()
    sfx('seal')
    sfx('founding', 0.3)
    toast(`The realm is re-founded as of ${formatShort(result.summary.asOf)}.`, 'success')
    onClose()
    go('realm')
  }

  const pathsProblem = answers.paths.length === 0 ? 'Choose at least one rival’s path.' : null
  const canNext = step === 0 ? !journeyProblem : step === 1 ? !healerProblem : step === 2 ? !charterProblem : step === 3 && refounding ? !pathsProblem : true
  const next = (): void => {
    if (refounding && step === REFOUND_STEPS.length - 2 && !runRefounding()) return
    setStep(step + 1)
  }

  return (
    <Modal open onClose={onClose} className="modal--wide modal--founding" title={refounding ? 'Re-found your realm' : 'Found your realm'} labelledBy="founding-title">
      <ol className="wizard__steps" aria-label="Steps">
        {steps.map((s, i) => (
          <li key={s} className={i === step ? 'is-on' : i < step ? 'is-done' : ''} aria-current={i === step ? 'step' : undefined}>
            {s}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="wizard__body">
          <p className="muted">
            {refounding && defaults?.asOf ? (
              <>
                The new campaign starts as of <strong>{formatShort(defaults.asOf)}</strong>, your first ledger contract.{' '}
              </>
            ) : null}
            Your weight journey sets the ten Milestones. Losing faster never earns more: Momentum is capped at the pace below.
          </p>
          <div className="wizard__grid">
            <label className="field">
              <span className="field__label">{refounding ? 'Weight at the start' : 'Weight today'}</span>
              <span className="field__box">
                <input value={start} inputMode="decimal" onChange={(e) => setStart(e.target.value)} data-autofocus />
                <span className="field__suffix">{unit}</span>
              </span>
            </label>
            <label className="field">
              <span className="field__label">Goal</span>
              <span className="field__box">
                <input value={goal} inputMode="decimal" onChange={(e) => setGoal(e.target.value)} />
                <span className="field__suffix">{unit}</span>
              </span>
            </label>
            <label className="field">
              <span className="field__label">Pace cap, lb a week ({RULES.momentum.targetPace.capMinLb} to {RULES.momentum.targetPace.capMaxLb})</span>
              <span className="field__box">
                <input
                  type="range"
                  min={RULES.momentum.targetPace.capMinLb}
                  max={RULES.momentum.targetPace.capMaxLb}
                  step="0.05"
                  value={pace}
                  onChange={(e) => setPace(e.target.value)}
                />
                <span className="field__suffix">{parseDecimal(pace).toFixed(2)}</span>
              </span>
            </label>
          </div>
          {journeyProblem && (start || goal || legacyOpen) && <p className="field__problem">{journeyProblem}</p>}
        </div>
      )}

      {step === 1 && (
        <div className="wizard__body">
          <p className="muted">All optional. These only estimate the Healer’s calorie floor until your own logs can, and a height lets the Healer refuse an unsafe goal.</p>
          <div className="wizard__grid">
            {imperial ? (
              <div className="field">
                <span className="field__label">Height</span>
                <span className="field__pair">
                  <span className="field__box">
                    <input value={heightFt} inputMode="numeric" aria-label="Height, feet" onChange={(e) => setHeightFt(e.target.value)} />
                    <span className="field__suffix">ft</span>
                  </span>
                  <span className="field__box">
                    <input value={heightIn} inputMode="decimal" aria-label="Height, inches" onChange={(e) => setHeightIn(e.target.value)} />
                    <span className="field__suffix">in</span>
                  </span>
                </span>
              </div>
            ) : (
              <label className="field">
                <span className="field__label">Height</span>
                <span className="field__box">
                  <input value={height} inputMode="decimal" onChange={(e) => setHeight(e.target.value)} />
                  <span className="field__suffix">cm</span>
                </span>
              </label>
            )}
            <label className="field">
              <span className="field__label">Sex</span>
              <span className="field__box">
                <select value={sex} onChange={(e) => setSex(e.target.value as Campaign['sex'] | '')}>
                  <option value="">Not given</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                </select>
              </span>
            </label>
            <label className="field">
              <span className="field__label">Birth year</span>
              <span className="field__box">
                <input value={birthYear} inputMode="numeric" onChange={(e) => setBirthYear(e.target.value)} />
              </span>
            </label>
          </div>
          {healerProblem && <p className="field__problem">{healerProblem}</p>}
        </div>
      )}

      {step === 2 && (
        <div className="wizard__body">
          <div className="wizard__grid">
            <label className="field">
              <span className="field__label">Step pool, a week</span>
              <span className="field__box">
                <input value={pool} inputMode="numeric" onChange={(e) => setPool(e.target.value)} />
                <span className="field__suffix">steps</span>
              </span>
            </label>
            <label className="field">
              <span className="field__label">Calorie limit, a day</span>
              <span className="field__box">
                <input value={limit} inputMode="numeric" onChange={(e) => setLimit(e.target.value)} />
                <span className="field__suffix">kcal</span>
              </span>
            </label>
            <div className="field wizard__floor">
              <span className="field__label">The Healer’s floor</span>
              <strong>{healer ? `${formatNumber(healer.floor)} kcal` : '—'}</strong>
              <span className="muted">The limit may not sit below it.</span>
            </div>
          </div>
          <fieldset className="wizard__duties">
            <legend>Duties ({duties.length} of {RULES.contracts.charter.duties.max})</legend>
            <ul>
              {duties.map((d) => (
                <li key={d}>
                  {d}{' '}
                  <button type="button" className="link" onClick={() => setDuties(duties.filter((x) => x !== d))} aria-label={`Remove ${d}`}>
                    remove
                  </button>
                </li>
              ))}
            </ul>
            <div className="chips">
              {SUGGESTED_DUTIES.filter((s) => !duties.some((d) => d.toLowerCase() === s.toLowerCase())).map((s) => (
                <button key={s} type="button" className="chip chip--quiet" onClick={() => addDuty(s)}>
                  + {s}
                </button>
              ))}
            </div>
            <label className="field">
              <span className="field__box">
                <input value={newDuty} placeholder="Another duty" onChange={(e) => setNewDuty(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addDuty(newDuty)} />
              </span>
            </label>
          </fieldset>
          <label className="wizard__check">
            <input type="checkbox" checked={supervised} onChange={(e) => setSupervised(e.target.checked)} /> A doctor supervises my diet (lets the limit sit below the floor)
          </label>
          {charterProblem && <p className="field__problem">{charterProblem}</p>}
        </div>
      )}

      {refounding && step === 3 && (
        <div className="wizard__body">
          <p className="muted">How were the days before today played? The answers steer the player who settles them; your real contracts are kept as they were.</p>
          <fieldset className="wizard__duties">
            <legend>Whose paths? The days are shared evenly between them.</legend>
            <div className="chips">
              {RIVAL_IDS.map((r) => {
                const on = answers.paths.includes(r)
                return (
                  <button
                    key={r}
                    type="button"
                    className={on ? 'chip is-on' : 'chip chip--quiet'}
                    aria-pressed={on}
                    onClick={() => setAnswers({ ...answers, paths: RIVAL_IDS.filter((p) => (p === r ? !on : answers.paths.includes(p))) })}
                  >
                    {rivalName(r)}
                  </button>
                )
              })}
            </div>
          </fieldset>
          <Choice legend="What did you spend on first?" choices={SPEND_CHOICES} value={answers.spend} onChange={(spend) => setAnswers({ ...answers, spend })} />
          <Choice legend="How did you take land?" choices={LAND_CHOICES} value={answers.land} onChange={(land) => setAnswers({ ...answers, land })} />
          <Choice legend="Offers?" choices={OFFER_CHOICES} value={answers.offers} onChange={(offers) => setAnswers({ ...answers, offers })} />
          {pathsProblem && <p className="field__problem">{pathsProblem}</p>}
          {error && <p className="field__problem">{error}</p>}
        </div>
      )}

      {refounding && step === 4 && result && (
        <div className="wizard__body wizard__seal">
          <RefoundSummary result={result} />
          <HoldButton className="seal-button" onComplete={() => void sealRefounding()} duration={1200} aria-label="Hold to re-found the realm">
            <GameArt slot="ui.seal" width={88} fallback={<WaxSeal color="crimson" icon={GiCastle} size={88} seed={23} />} />
            <span className="seal-button__label">Hold to re-found the realm</span>
          </HoldButton>
        </div>
      )}

      {!refounding && step === 3 && (
        <div className="wizard__body wizard__seal">
          <ul className="wizard__summary">
            <li>
              From <strong>{start} {unit}</strong> to <strong>{goal} {unit}</strong>, at most {parseDecimal(pace).toFixed(2)} lb a week counted.
            </li>
            <li>
              {formatNumber(charter.stepPool)} steps a week, {formatNumber(charter.calorieLimit)} kcal a day, {duties.length} duties.
            </li>
            <li>
              The campaign keeps time in <strong>{timeZone}</strong>; each day closes at 04:00.
            </li>
          </ul>
          {error && <p className="field__problem">{error}</p>}
          <HoldButton className="seal-button" onComplete={seal} duration={1200} aria-label="Hold to found the realm">
            <GameArt slot="ui.seal" width={88} fallback={<WaxSeal color="crimson" icon={GiCastle} size={88} seed={23} />} />
            <span className="seal-button__label">Hold to found the realm</span>
          </HoldButton>
        </div>
      )}

      <div className="modal__actions">
        {step > 0 && (
          <button type="button" className="btn btn--ghost" onClick={() => setStep(step - 1)}>
            Back
          </button>
        )}
        {step < steps.length - 1 && (
          <button type="button" className="btn btn--primary" onClick={next} disabled={!canNext}>
            {refounding && step === steps.length - 2 ? 'Play the days' : 'Next'}
          </button>
        )}
      </div>
    </Modal>
  )
}

function Choice<T extends string>({ legend, choices, value, onChange }: { legend: string; choices: { id: T; label: string }[]; value: T; onChange(v: T): void }): React.JSX.Element {
  return (
    <fieldset className="wizard__duties">
      <legend>{legend}</legend>
      {choices.map((c) => (
        <label key={c.id} className="wizard__check">
          <input type="radio" checked={value === c.id} onChange={() => onChange(c.id)} /> {c.label}
        </label>
      ))}
    </fieldset>
  )
}

/** What the re-founding would write (C-15, section 7.7), shown before anything is. */
function RefoundSummary({ result }: { result: RefoundResult }): React.JSX.Element {
  const s = result.summary
  const marches = Object.entries(s.held.byMarch).sort((a, b) => b[1] - a[1])
  const where = (m: string): string => (m === 'heartland' ? 'the heartland' : marchName(m as MarchId))
  return (
    <ul className="wizard__summary">
      <li>
        Founded as of <strong>{formatShort(s.asOf)}</strong>; {s.days} days settled.
      </li>
      <li>
        <strong>{s.held.total}</strong> hexes held{marches.length > 0 ? `: ${marches.map(([m, n]) => `${n} in ${where(m)}`).join(', ')}` : ''}.
      </li>
      <li>
        Paths: {RIVAL_IDS.map((r) => `${rivalName(r)} ${amount(s.paths[r].dominion)} Dominion${s.paths[r].rank > 0 ? `, rank ${numeral(s.paths[r].rank)}` : ''}`).join('; ')}.
      </li>
      <li>
        The purse holds <strong>{amount(s.purse.balance)}</strong>: {amount(s.purse.behavior)} earned by behavior, {amount(s.purse.battle)} in battle,{' '}
        {amount(s.purse.land)} from land and {amount(s.purse.other)} granted; {amount(s.purse.spent)} spent.
      </li>
      <li>
        {BUILDING_IDS.map((b) => `${buildingName(b)} ${s.tiers[b] > 0 ? numeral(s.tiers[b]) : 'unbuilt'}`).join(', ')}; the castle at tier {numeral(s.castleTier)}.
      </li>
      <li>
        Battles: {s.battles.won} won, {s.battles.lost} lost; {s.battles.grand} Grand Battles fought.
      </li>
      <li>
        Contracts carried over:{' '}
        {s.contracts.length === 0
          ? 'none'
          : s.contracts.map((c) => `${formatShort(c.startDate)} to ${formatShort(c.endDate)}${c.payout !== undefined ? ` (paid ${amount(c.payout)})` : ' (running)'}`).join('; ')}
        .
      </li>
    </ul>
  )
}
