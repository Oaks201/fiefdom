import { GiCrown } from 'react-icons/gi'
import { GRADE_INFO, hashSeed, HONORED_SHARE, sealFor, WAGER_RETURN, type ContractEval } from '../../lib/contracts'
import { formatDocumentDate, formatRange, formatShort, toISO, WEEKDAYS, weekday } from '../../lib/dates'
import { formatNumber, formatSigned, formatWeight } from '../../lib/format'
import type { Contract, Profile } from '../../lib/types'
import { WaxSeal } from '../WaxSeal'

export function nobleName(profile: Profile | null): string {
  if (!profile) return 'the undersigned'
  return `${profile.title} ${profile.name}`.trim()
}

const NUMERALS = ['I.', 'II.', 'III.', 'IV.', 'V.', 'VI.']

function CalorieTerm({ c }: { c: Contract }): React.JSX.Element {
  if (c.calorieRule === 'burn') {
    return (
      <>
        Each day I shall burn no fewer than <span className="ink">{formatNumber(c.caloriesGoal)}</span> calories.
      </>
    )
  }
  if (c.caloriesMin !== undefined) {
    return (
      <>
        Each day I shall eat no fewer than <span className="ink">{formatNumber(c.caloriesMin)}</span> and no more than{' '}
        <span className="ink">{formatNumber(c.caloriesGoal)}</span> calories.
      </>
    )
  }
  return (
    <>
      Each day I shall eat no more than <span className="ink">{formatNumber(c.caloriesGoal)}</span> calories.
    </>
  )
}

/** The sealed contract as a document. Its terms are shown, never edited. */
export function ContractDocument({ ev, profile, stamp }: { ev: ContractEval; profile: Profile | null; stamp?: boolean }): React.JSX.Element {
  const c = ev.contract
  const seal = sealFor(ev)
  const sealedOn = toISO(new Date(c.sealedAt))
  const wager = c.kind === 'wager'
  let n = 0
  const numeral = (): string => NUMERALS[n++]

  return (
    <article className={`deed ${wager ? 'deed--wager' : ''} ${ev.status === 'burned' ? 'deed--burned' : ''}`}>
      <div className="deed__paper" aria-hidden="true" />
      <header className="deed__heading">
        <div className="deed__ornament" aria-hidden="true">
          ❦
        </div>
        <h2 className="deed__title">{wager ? 'Wager of the Week' : 'Contract of the Week'}</h2>
        <div className="deed__dates">{formatRange(c.startDate, c.endDate)}</div>
      </header>

      <p className="deed__preamble">
        Let it be known that I, <span className="ink">{nobleName(profile)}</span>
        {profile?.holding ? (
          <>
            {' '}
            of <span className="ink">{profile.holding}</span>
          </>
        ) : null}
        , have bound myself to these terms for the seven days from{' '}
        <span className="ink">
          {WEEKDAYS[weekday(c.startDate)]}, {formatShort(c.startDate)}
        </span>{' '}
        to{' '}
        <span className="ink">
          {WEEKDAYS[weekday(c.endDate)]}, {formatShort(c.endDate)}
        </span>
        :
      </p>

      <ol className="deed__terms">
        <li>
          <span className="deed__numeral">{numeral()}</span>
          <span>
            Each day I shall walk no fewer than <span className="ink">{formatNumber(c.stepsGoal)}</span> steps.
          </span>
        </li>
        <li>
          <span className="deed__numeral">{numeral()}</span>
          <span>
            <CalorieTerm c={c} />
          </span>
        </li>
        {c.duties && (
          <li>
            <span className="deed__numeral">{numeral()}</span>
            {c.duties.length ? (
              <div className="deed__duties">
                <span>Each day I shall keep my duties:</span>
                <ul className="deed-duties">
                  {c.duties.map((d) => (
                    <li key={d.id}>
                      <span className="ink">{d.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <span>I swear to no daily duties this week.</span>
            )}
          </li>
        )}
        <li>
          <span className="deed__numeral">{numeral()}</span>
          <span>
            At the sealing my weight stood at <span className="ink">{formatWeight(c.startWeight, c.unit)}</span>
            {c.finalWeight !== undefined ? (
              <>
                ; at the close, <span className="ink">{formatWeight(c.finalWeight, c.unit)}</span> ({formatSigned(ev.weightDelta ?? 0)} {c.unit}).
              </>
            ) : (
              '. My final weight shall be declared at the close.'
            )}
          </span>
        </li>
        {wager && (
          <li className="deed__stake">
            <span className="deed__numeral">{numeral()}</span>
            <span>
              As surety I staked <span className="ink">{formatNumber(ev.stake)}</span> reputation upon these terms, to be repaid threefold if every term is
              kept, twofold if {Math.round(HONORED_SHARE * 100)}% of them are, and by half if I am found wanting.
            </span>
          </li>
        )}
      </ol>

      {wager && ev.status === 'closed' && ev.grade && (
        <p className="deed__clause">
          Closed {GRADE_INFO[ev.grade].label}: the stake was repaid ×{ev.grade === 'wanting' ? '½' : WAGER_RETURN[ev.grade]}, returning{' '}
          {formatNumber(ev.closingRep)} reputation.
        </p>
      )}
      {ev.status === 'burned' && c.burnedOn && (
        <p className="deed__clause deed__clause--burned">
          Burned on {WEEKDAYS[weekday(c.burnedOn)]}, {formatShort(c.burnedOn)}. Its progress went up in smoke
          {wager ? <>, and the stake of {formatNumber(ev.stake)} reputation is forfeit</> : null}.
        </p>
      )}

      {c.note && <blockquote className="deed__note">“{c.note}”</blockquote>}

      <footer className="deed__foot">
        <div className="deed__signature">
          <div className="deed__sig-name">{profile?.name || 'Signed'}</div>
          <div className="deed__sig-line">Sealed {formatDocumentDate(sealedOn)}</div>
          {c.closedOn && <div className="deed__sig-line">Closed {formatDocumentDate(c.closedOn)}</div>}
        </div>
        <div className="deed__seal">
          <WaxSeal color={seal.color} icon={GiCrown} size={104} seed={hashSeed(c.id)} stamp={stamp} />
          <div className="deed__seal-label">{seal.label}</div>
        </div>
      </footer>
    </article>
  )
}
