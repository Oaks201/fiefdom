import { GiCastle, GiCrossedSwords, GiScales, GiScrollUnfurled, GiShakingHands, GiTrophy } from 'react-icons/gi'
import { numeral } from '../../lib/game/effects'
import type { RivalPanel } from '../../lib/game/view/diplomacy'
import { amount } from '../../lib/game/view/refusals'
import type { GuideLine, RivalGuide as Guide } from '../../lib/game/view/rivalGuide'
import { GameArt } from '../game/GameArt'
import { RespectMeter } from './RivalCourt'

const DISPOSITIONS: Record<string, string> = { peace: 'Peace', tension: 'Tension', war: 'War' }
const STATUSES: Record<string, string> = { conquered: 'Conquered', abdicated: 'Abdicated', allied: 'Allied' }

const signed = (v: number): string => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '0')

function Lines({ lines }: { lines: GuideLine[] }): React.JSX.Element {
  return (
    <dl className="rival-guide__lines">
      {lines.map((l) => (
        <div key={l.term}>
          <dt>{l.term}</dt>
          <dd>{l.text}</dd>
        </div>
      ))}
    </dl>
  )
}

/** The rival picker above the guide: one portrait button per court. */
export function RivalPicker({ panels, chosen, onChoose }: { panels: RivalPanel[]; chosen: string; onChoose(rival: RivalPanel['rival']): void }): React.JSX.Element {
  return (
    <div className="rival-picker" role="tablist" aria-label="Choose a rival">
      {panels.map((p) => (
        <button key={p.rival} type="button" role="tab" aria-selected={chosen === p.rival} className={`rival-picker__pick court--${p.rival} ${chosen === p.rival ? 'is-on' : ''}`} onClick={() => onChoose(p.rival)}>
          <GameArt slot={p.portrait} owner={p.rival} width={56} label={p.ruler} />
          <span className="rival-picker__name">{p.ruler}</span>
          <span className="rival-picker__title">{p.title}</span>
        </button>
      ))}
    </div>
  )
}

/**
 * How one rival works (the Diplomacy page's second tab): Respect and Renown side by side with his
 * figures, every deed that moves either, how his march fights, what his Respect opens (the court's own
 * meter), his path's perks and the ways he can be resolved. Everything is derived in `rivalGuide`.
 */
export function RivalGuide({ panel, guide, onAudience }: { panel: RivalPanel; guide: Guide; onAudience(): void }): React.JSX.Element {
  const resolved = panel.status !== 'active'
  const { path } = guide
  return (
    <article className={`rival-guide court--${panel.rival}`} aria-label={`How ${panel.ruler} works`}>
      <header className="rival-guide__head">
        <GameArt slot={panel.portrait} owner={panel.rival} width={110} label={panel.ruler} title={`${panel.ruler}, ${panel.mood}`} />
        <div className="rival-guide__who">
          <h2 className="rival-guide__ruler">{panel.ruler}</h2>
          <p className="court__who">
            {panel.title} · {panel.realm}
          </p>
          <p className="court__who">
            His road leads to your {guide.building.name}: your war on {guide.people} feeds its path.
          </p>
          <p className="court__audience">
            <button type="button" className="btn btn--small" onClick={onAudience}>
              <GiShakingHands aria-hidden="true" /> Audience
            </button>
          </p>
        </div>
      </header>

      <section className="panel rival-guide__section rival-guide__section--wide" aria-label="Respect and Renown">
        <header className="panel__head">
          <h3 className="panel__title">
            <GiScales aria-hidden="true" /> Respect and Renown: two different things
          </h3>
        </header>
        <div className="rival-guide__now">
          <div className="rival-guide__figure">
            <span className="rival-guide__label">His Respect for you</span>
            <strong className="rival-guide__big">{signed(panel.respect)}</strong>
            {resolved ? (
              <span className="court__status">{STATUSES[panel.status]}</span>
            ) : (
              <span className={`disposition disposition--${panel.disposition}`}>{DISPOSITIONS[panel.disposition]}</span>
            )}
          </div>
          <div className="rival-guide__figure">
            <span className="rival-guide__label">Your Dominion on his path</span>
            <strong className="rival-guide__big">{amount(path.dominion)}</strong>
            <span className="rival-guide__sum">
              Renown {amount(path.renown)} + Holdings {amount(path.holdings)}
            </span>
            <span className="rival-guide__sum">
              {path.rank > 0 ? `Rank ${numeral(path.rank)}` : 'No rank yet'}
              {path.nextRank !== undefined ? ` · rank ${numeral(path.rank + 1)} at ${amount(path.nextRank)}` : ' · the top rank'}
            </span>
          </div>
        </div>
        <Lines lines={guide.measures} />
      </section>

      <section className="panel rival-guide__section rival-guide__section--wide" aria-label="What moves his Respect and his Renown">
        <header className="panel__head">
          <h3 className="panel__title">
            <GiTrophy aria-hidden="true" /> What moves his Respect and your Renown
          </h3>
        </header>
        <table className="rival-guide__deeds">
          <thead>
            <tr>
              <th>Deed</th>
              <th className="num">His Respect</th>
              <th className="num">Renown on his path</th>
            </tr>
          </thead>
          {guide.deeds.map((g) => (
            <tbody key={g.id} className={`rival-guide__group rival-guide__group--${g.id}`}>
              <tr>
                <th colSpan={3} scope="rowgroup">
                  {g.title}
                </th>
              </tr>
              {g.rows.map((r) => (
                <tr key={r.deed}>
                  <td>{r.deed}</td>
                  <td className="num">{r.respect ?? '—'}</td>
                  <td className="num">{r.renown ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
        <p className="muted rival-guide__note">{guide.deedsNote}</p>
      </section>

      <section className="panel rival-guide__section" aria-label="How his march fights">
        <header className="panel__head">
          <h3 className="panel__title">
            <GiCrossedSwords aria-hidden="true" /> How his march fights
          </h3>
        </header>
        <p className="muted rival-guide__note">His rules cover every hex of his march you don’t hold, the wilds and villages included.</p>
        <Lines lines={guide.march} />
      </section>

      <section className="panel rival-guide__section" aria-label="What his Respect opens">
        <header className="panel__head">
          <h3 className="panel__title">
            <GiShakingHands aria-hidden="true" /> What his Respect opens
          </h3>
        </header>
        <RespectMeter panel={panel} />
      </section>

      <section className="panel rival-guide__section" aria-label="His path's perks">
        <header className="panel__head">
          <h3 className="panel__title">
            <GiCastle aria-hidden="true" /> His path: the {guide.building.name}’s perks
          </h3>
        </header>
        <ol className="rival-guide__ranks">
          {guide.ranks.map((r) => (
            <li key={r.rank} className={r.reached ? 'is-reached' : ''}>
              <strong>{numeral(r.rank)}</strong> {amount(r.at)}
            </li>
          ))}
        </ol>
        <p className="muted rival-guide__note">Each rank needs that much Dominion on his path. A rank, once reached, never falls.</p>
        <Lines lines={guide.perks} />
      </section>

      <section className="panel rival-guide__section" aria-label="How he can be resolved">
        <header className="panel__head">
          <h3 className="panel__title">
            <GiScrollUnfurled aria-hidden="true" /> How he can be resolved
          </h3>
          {panel.stance && <span className="panel__aside">Now: {panel.stance.label}</span>}
        </header>
        <Lines lines={guide.ends} />
        <p className="muted rival-guide__note">{guide.endsNote}</p>
      </section>
    </article>
  )
}
