import { GiCrown } from 'react-icons/gi'
import { hashSeed, sealFor, type ContractEval } from '../../lib/contracts'
import { formatDocumentDate, formatRange, formatShort, toISO, WEEKDAYS, weekday } from '../../lib/dates'
import { formatNumber, formatSigned, formatWeight } from '../../lib/format'
import type { Profile } from '../../lib/types'
import { WaxSeal } from '../WaxSeal'

export function nobleName(profile: Profile | null): string {
  if (!profile) return 'the undersigned'
  return `${profile.title} ${profile.name}`.trim()
}

/** The sealed contract as a document. Its terms are shown, never edited. */
export function ContractDocument({ ev, profile, stamp }: { ev: ContractEval; profile: Profile | null; stamp?: boolean }): React.JSX.Element {
  const c = ev.contract
  const seal = sealFor(ev)
  const sealedOn = toISO(new Date(c.sealedAt))

  return (
    <article className="deed">
      <div className="deed__paper" aria-hidden="true" />
      <header className="deed__heading">
        <div className="deed__ornament" aria-hidden="true">
          ❦
        </div>
        <h2 className="deed__title">Contract of the Week</h2>
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
          <span className="deed__numeral">I.</span>
          <span>
            Each day I shall walk no fewer than <span className="ink">{formatNumber(c.stepsGoal)}</span> steps.
          </span>
        </li>
        <li>
          <span className="deed__numeral">II.</span>
          <span>
            Each day I shall burn no fewer than <span className="ink">{formatNumber(c.caloriesGoal)}</span> calories.
          </span>
        </li>
        <li>
          <span className="deed__numeral">III.</span>
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
      </ol>

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
