import { memo } from 'react'
import { GiCoins, GiCrossedSwords, GiShakingHands, GiSpeaker } from 'react-icons/gi'
import { formatShort } from '../../lib/dates'
import { frontsNote, meterAt, type RivalPanel } from '../../lib/game/view/diplomacy'
import { amount } from '../../lib/game/view/refusals'
import { GameArt } from '../game/GameArt'
import { WarTrackBar } from './WarTrack'

const DISPOSITIONS: Record<string, string> = { peace: 'Peace', tension: 'Tension', war: 'War' }
const STATUSES: Record<string, string> = { active: '', conquered: 'Conquered', abdicated: 'Abdicated', allied: 'Allied' }
const TREASURY: Record<string, string> = { meager: 'Meager', modest: 'Modest', prosperous: 'Prosperous', mighty: 'Mighty' }
const ARMY: Record<string, string> = { weaker: 'Weaker than yours', matched: 'Matched with yours', stronger: 'Stronger than yours', overwhelming: 'Overwhelming' }
const FRONTS: Record<string, string> = { north: 'North', south: 'South', west: 'West', east: 'East' }

/** Respect toward the player on a −100 to +100 meter (D-39), with his marks on both sides and what each brings. */
export function RespectMeter({ panel }: { panel: RivalPanel }): React.JSX.Element {
  return (
    <div className="respect">
      <div className="respect__head">
        <span>Respect</span> <strong>{panel.respect > 0 ? `+${panel.respect}` : panel.respect < 0 ? `−${-panel.respect}` : '0'}</strong>
      </div>
      <div className="respect__bar" style={{ ['--fill' as string]: meterAt(panel.marks, panel.respect) }} role="meter" aria-valuemin={-100} aria-valuemax={100} aria-valuenow={panel.respect} aria-label="Respect">
        {panel.marks.map((m) => (
          <span key={m.at} className={`respect__mark ${m.reached ? 'is-reached' : ''}`} style={{ left: `${meterAt(panel.marks, m.at) * 100}%` }} title={`${m.at}: ${m.labels.join('; ')}`}>
            <span className="respect__at">{m.at}</span>
          </span>
        ))}
      </div>
      <ul className="respect__opens">
        {panel.marks.map((m) => (
          <li key={m.at} className={m.reached ? 'is-reached' : ''}>
            <strong>{m.at}</strong> {m.labels.join('; ')}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * One rival court (Ch 12, Ch 17's NPC note): the ruler's portrait in a mood that follows its
 * disposition, who it is, how it feels about you, its Respect and what it opens, its treasury and
 * army as bands (numbers only when revealed), its war tracks drawn as tugs of war (the Orc's against you,
 * and each Rim front) with what they mean, and the rumors. The portrait and the Audience button open an
 * audience with it, where its deals are.
 */
export const RivalCourt = memo(function RivalCourt({ panel, onAudience }: { panel: RivalPanel; onAudience(): void }): React.JSX.Element {
  const resolved = panel.status !== 'active'
  return (
    <article className={`court court--${panel.rival} ${resolved ? 'is-resolved' : ''}`} aria-label={panel.ruler}>
      <button type="button" className="court__pick" onClick={onAudience} title={`An audience with ${panel.ruler}`}>
        <GameArt slot={panel.portrait} owner={panel.rival} width={150} label={panel.ruler} title={`${panel.ruler}, ${panel.mood}`} />
      </button>
      <div className="court__body">
        <h3 className="court__ruler">{panel.ruler}</h3>
        <p className="court__who">
          {panel.title} · {panel.realm}
        </p>
        <p className="court__standing">
          {resolved ? (
            <span className="court__status">{STATUSES[panel.status]}</span>
          ) : (
            <span className={`disposition disposition--${panel.disposition}`} title={panel.standingNote}>
              {DISPOSITIONS[panel.disposition]}
            </span>
          )}
          {panel.stance && (
            <span className={`court__stance court__stance--${panel.stance.band}`} title="How near he is to yielding, as his court shows it; no number is told">
              {' '}
              · {panel.stance.label}
            </span>
          )}
        </p>
        {!resolved && panel.standingNote && <p className="court__why">{panel.standingNote}</p>}
        <p className="court__audience">
          <button type="button" className="btn btn--small" onClick={onAudience}>
            <GiShakingHands aria-hidden="true" /> Audience
          </button>
        </p>
        <RespectMeter panel={panel} />
        <dl className="court__strength">
          <div>
            <dt>
              <GiCoins aria-hidden="true" /> Treasury
            </dt>
            <dd>
              {TREASURY[panel.treasuryBand]}
              {panel.treasury !== undefined && <span className="court__exact"> ({amount(Math.floor(panel.treasury))})</span>}
            </dd>
          </div>
          <div>
            <dt>
              <GiCrossedSwords aria-hidden="true" /> Army
            </dt>
            <dd>
              {ARMY[panel.armyBand]}
              {panel.army !== undefined && <span className="court__exact"> ({amount(panel.army)})</span>}
            </dd>
          </div>
        </dl>
        {panel.orcWar && (
          <section className="war war--you" aria-label="His war track against you">
            <header className="war__head">
              <strong>His war on you</strong>
              <span className="war__leader">{panel.orcWar.tug.leader}</span>
            </header>
            <WarTrackBar tug={panel.orcWar.tug} />
            <p className="war__now">{panel.orcWar.now}</p>
            <p className="war__how">{panel.orcWar.how}</p>
          </section>
        )}
        {panel.fronts.length > 0 && (
          <section className="court__wars" aria-label="His wars with the other rivals">
            <h4 className="court__wars-title">His wars with the other rivals</h4>
            <p className="war__how">{frontsNote()}</p>
            {panel.fronts.map((f) => (
              <div key={f.front} className={`war war--${f.state}`}>
                <header className="war__head">
                  <strong>{FRONTS[f.front]} front</strong>
                  <span className={`disposition disposition--${f.state}`}>{DISPOSITIONS[f.state]}</span>
                  <span className="war__leader">{f.tug.leader}</span>
                </header>
                <WarTrackBar tug={f.tug} />
                {f.end && <p className="war__now">{f.end}</p>}
                <p className="war__how">{f.how}</p>
              </div>
            ))}
          </section>
        )}
        {panel.march.length > 0 && (
          <ul className="court__march">
            {panel.march.map((m) => (
              <li key={m.label}>
                {m.label}
                {m.until ? ` through ${formatShort(m.until)}` : ''}
              </li>
            ))}
          </ul>
        )}
        {panel.rumors.length > 0 && (
          <ul className="court__rumors">
            {panel.rumors.map((r) => (
              <li key={r.textId} data-text-id={r.textId}>
                <GiSpeaker aria-hidden="true" /> {r.text}
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  )
})
