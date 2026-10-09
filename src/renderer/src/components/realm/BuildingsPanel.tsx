import { useMemo } from 'react'
import { GiCheckMark, GiCancel } from 'react-icons/gi'
import { sfx } from '../../audio'
import { buyCastleTier, buyCrossing, buyTier } from '../../lib/game/buildings'
import { numeral } from '../../lib/game/effects'
import type { CampaignState, ISODate } from '../../lib/game/types'
import { buildingName, buildingsView, castleView, crossingsView, crownguardView, rosterView, type CompanyCard, type EffectLine, type NextOffer } from '../../lib/game/view/realm'
import { amount } from '../../lib/game/view/refusals'
import { useCampaign } from '../../state/campaign'
import { toast } from '../../state/toasts'
import { GameArt } from '../game/GameArt'

function Gives({ lines, empty }: { lines: EffectLine[]; empty?: string }): React.JSX.Element | null {
  if (lines.length === 0) return empty ? <p className="muted gives-empty">{empty}</p> : null
  return (
    <ul className="gives">
      {lines.map((l) => (
        <li key={l.field}>{l.label}</li>
      ))}
    </ul>
  )
}

function Company({ company }: { company: CompanyCard }): React.JSX.Element {
  return (
    <span className="company-line" title={company.text}>
      <strong>{company.name}</strong> ({company.power}) <span className="tags">{company.tags.join(' · ')}</span>
    </span>
  )
}

/** The next step's requirements, each met or not, its price and the Buy button (the engine's refusal when it can't). */
function NextStep({ next, title, onBuy }: { next: NextOffer; title: React.ReactNode; onBuy(): void }): React.JSX.Element {
  return (
    <div className="next-step">
      <h5 className="next-step__title">{title}</h5>
      <ul className="requirements">
        {next.requirements.map((r) => (
          <li key={r.code + r.label} className={r.met ? 'is-met' : 'is-unmet'}>
            {r.met ? <GiCheckMark aria-label="met" /> : <GiCancel aria-label="not met" />} {r.label}
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn--primary btn--small" disabled={!next.ok} onClick={onBuy}>
        Raise it · {amount(next.cost)}
      </button>
      {next.refusal && <p className="next-step__why">{next.refusal.label}</p>}
    </div>
  )
}

/** The castle and the four buildings (Ch 7), and the Crownguard (Ch 8). */
export function BuildingsPanel({ campaign, today }: { campaign: CampaignState; today: ISODate }): React.JSX.Element {
  const act = useCampaign((s) => s.act)
  const buildings = useMemo(() => buildingsView(campaign), [campaign])
  const castle = useMemo(() => castleView(campaign), [campaign])
  const crown = crownguardView(campaign)
  return (
    <div className="realm-section buildings">
      <article className="building-card castle-card">
        <GameArt slot={castle.slot} owner="player" width={132} label={castle.name} />
        <div className="building-card__body">
          <h4 className="building-card__name">
            The castle <span className="tier">Tier {numeral(castle.tier)} · {castle.name}</span>
          </h4>
          <p>
            <strong>{castle.banners}</strong> banners · walls <strong>{castle.walls}</strong>
          </p>
          <Gives lines={castle.gives.filter((g) => g.field !== 'banners' && g.field !== 'walls')} />
          {castle.next ? (
            <NextStep
              next={castle.next}
              title={
                <>
                  Tier {numeral(castle.next.tier)}, the {castle.next.name}: {castle.next.banners} banners, walls {castle.next.walls}
                </>
              }
              onBuy={() => {
                if (act((s) => buyCastleTier(s, today))) {
                  sfx('seal')
                  toast(`The castle rises to the ${castle.next?.name}.`, 'success')
                }
              }}
            />
          ) : (
            <p className="muted">{castle.tier < 5 ? 'The High Throne comes only with victory.' : 'The High Throne.'}</p>
          )}
        </div>
      </article>
      <div className="buildings__grid">
        {buildings.map((b) => (
          <article key={b.id} className={`building-card building-card--${b.id}`}>
            <GameArt slot={b.slot} owner="player" width={96} label={b.name} />
            <div className="building-card__body">
              <h4 className="building-card__name">
                {b.name} <span className="tier">Tier {numeral(b.tier)}</span>
              </h4>
              <p>
                <Company company={b.company} />
              </p>
              <details className="dominion" title={b.dominionSources.map((s) => `${s.label}: +${s.value}`).join('\n') || 'No hexes give it Dominion yet'}>
                <summary>
                  Dominion <strong>{b.dominion}</strong>
                </summary>
                {b.dominionSources.length === 0 ? (
                  <p className="muted">No hex you hold gives it Dominion yet.</p>
                ) : (
                  <ul>
                    {b.dominionSources.map((s) => (
                      <li key={s.hexId}>
                        {s.label}: +{s.value}
                      </li>
                    ))}
                  </ul>
                )}
              </details>
              <Gives lines={b.gives} />
              {b.next ? (
                <NextStep
                  next={b.next}
                  title={
                    <>
                      Tier {numeral(b.next.tier)}: <Company company={b.next.company} />
                      <Gives lines={b.next.gives.filter((g) => !b.gives.some((x) => x.field === g.field && x.value === g.value))} />
                    </>
                  }
                  onBuy={() => {
                    if (act((s) => buyTier(s, b.id, today))) {
                      sfx('seal')
                      toast(`The ${b.name} rises to Tier ${numeral(b.next?.tier ?? b.tier + 1)}: ${b.next?.company.name}.`, 'success')
                    }
                  }}
                />
              ) : (
                <p className="muted">At its highest tier.</p>
              )}
            </div>
          </article>
        ))}
      </div>
      <p className="crownguard">
        <strong>The Crownguard</strong>{' '}
        {crown.raised ? `stands with power ${crown.power}, all four tags.` : `rises when all four buildings stand at Tier ${numeral(crown.needsTier)}.`}
      </p>
    </div>
  )
}

/** The six Crossings (Ch 8): stage, hybrid, perks and the next stage. */
export function CrossingsPanel({ campaign, today }: { campaign: CampaignState; today: ISODate }): React.JSX.Element {
  const act = useCampaign((s) => s.act)
  const crossings = useMemo(() => crossingsView(campaign), [campaign])
  return (
    <div className="realm-section crossings">
      {crossings.map((x) => (
        <article key={x.id} className={`crossing-card ${x.stage > 0 ? 'is-raised' : ''}`}>
          <h4 className="crossing-card__name">
            {buildingName(x.buildings[0])} + {buildingName(x.buildings[1])}
            <span className="stage-pips" aria-label={`Stage ${x.stage} of 3`}>
              {[1, 2, 3].map((n) => (
                <span key={n} className={n <= x.stage ? 'is-on' : ''} />
              ))}
            </span>
          </h4>
          {x.hybrid ? (
            <p>
              <Company company={x.hybrid} />
            </p>
          ) : (
            <p className="muted">No hybrid yet.</p>
          )}
          <ul className="perks">
            {x.perks.map((p) => (
              <li key={p.id} className={p.active ? 'is-active' : ''}>
                <strong>{p.name}</strong> <span className="muted">(stage {numeral(p.stage)})</span>: {p.gives.map((g) => g.label).join('; ')}
              </li>
            ))}
          </ul>
          {x.next ? (
            <NextStep
              next={x.next}
              title={<>Stage {numeral(x.next.tier)}{x.nextHybrid ? <>: <Company company={x.nextHybrid} /></> : null}</>}
              onBuy={() => {
                if (act((s) => buyCrossing(s, x.id, today))) {
                  sfx('seal')
                  toast(`${x.name} reaches stage ${numeral(x.next?.tier ?? x.stage + 1)}.`, 'success')
                }
              }}
            />
          ) : (
            <p className="muted">A Legend: every stage raised.</p>
          )}
        </article>
      ))}
    </div>
  )
}

/** The roster (Ch 7): every company, its power and where that power comes from. */
export function RosterPanel({ campaign, today }: { campaign: CampaignState; today: ISODate }): React.JSX.Element {
  const roster = useMemo(() => rosterView(campaign, today), [campaign, today])
  return (
    <div className="realm-section roster">
      <table className="roster__table">
        <thead>
          <tr>
            <th>Company</th>
            <th>From</th>
            <th>Power</th>
            <th>Tags</th>
            <th>Reach</th>
            <th>Items</th>
          </tr>
        </thead>
        <tbody>
          {roster.map((c) => (
            <tr key={c.id} className={c.weary ? 'is-weary' : ''}>
              <td>
                <GameArt slot={c.art} owner="player" width={28} label={c.name} className="roster__token" />
                <strong>{c.name}</strong>
                {c.weary && <span className="tag tag--weary">Weary{c.wearyUntil ? ` through ${c.wearyUntil.slice(5)}` : ''}</span>}
              </td>
              <td>{c.origin}</td>
              <td className="num" title={[`Base ${amount(c.basePower)}`, ...c.sources.map((s) => `${s.label}: ${s.effect}`)].join('\n')}>
                <strong>{amount(c.power)}</strong>
                {c.sources.length > 0 && (
                  <span className="roster__sources">
                    base {amount(c.basePower)}
                    {c.sources.map((s) => `, ${s.label} ${s.effect}`).join('')}
                  </span>
                )}
              </td>
              <td className="tags">{c.tags.join(' · ')}</td>
              <td>{c.reach}</td>
              <td>{c.items.map((i) => i.name).join(', ') || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
