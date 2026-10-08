import { memo } from 'react'
import { GiCoins, GiCrossedSwords, GiSpeaker } from 'react-icons/gi'
import type { RivalPanel } from '../../lib/game/view/diplomacy'
import { amount } from '../../lib/game/view/refusals'
import { GameArt } from '../game/GameArt'

const DISPOSITIONS: Record<string, string> = { peace: 'Peace', tension: 'Tension', war: 'War' }
const STATUSES: Record<string, string> = { active: '', conquered: 'Conquered', abdicated: 'Abdicated', allied: 'Allied' }
const TREASURY: Record<string, string> = { meager: 'Meager', modest: 'Modest', prosperous: 'Prosperous', mighty: 'Mighty' }
const ARMY: Record<string, string> = { weaker: 'Weaker than yours', matched: 'Matched with yours', stronger: 'Stronger than yours', overwhelming: 'Overwhelming' }
const FRONTS: Record<string, string> = { north: 'North', south: 'South', west: 'West', east: 'East' }

/** Respect toward the player on a 0 to 100 meter, with Ch 12's marks and what each opens. */
export function RespectMeter({ panel }: { panel: RivalPanel }): React.JSX.Element {
  return (
    <div className="respect">
      <div className="respect__head">
        <span>Respect</span> <strong>{panel.respect}</strong>
      </div>
      <div className="respect__bar" style={{ ['--fill' as string]: Math.min(100, Math.max(0, panel.respect)) / 100 }} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={panel.respect} aria-label="Respect">
        {panel.marks.map((m) => (
          <span key={m.at} className={`respect__mark ${m.reached ? 'is-reached' : ''}`} style={{ left: `${m.at}%` }} title={`${m.at}: ${m.labels.join('; ')}`}>
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
 * army as bands (numbers only when revealed), the rumors, and its fronts.
 */
export const RivalCourt = memo(function RivalCourt({ panel, selected, onSelect }: { panel: RivalPanel; selected: boolean; onSelect(): void }): React.JSX.Element {
  const resolved = panel.status !== 'active'
  return (
    <article className={`court court--${panel.rival} ${selected ? 'is-selected' : ''} ${resolved ? 'is-resolved' : ''}`} aria-label={panel.ruler}>
      <button type="button" className="court__pick" onClick={onSelect} aria-pressed={selected} title={`See ${panel.name}’s deals`}>
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
            <span className={`disposition disposition--${panel.disposition}`}>{DISPOSITIONS[panel.disposition]}</span>
          )}
        </p>
        <blockquote className="court__greeting" data-text-id={panel.greeting.textId}>
          {panel.greeting.text}
        </blockquote>
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
        {panel.rumors.length > 0 && (
          <ul className="court__rumors">
            {panel.rumors.map((r) => (
              <li key={r.textId} data-text-id={r.textId}>
                <GiSpeaker aria-hidden="true" /> {r.text}
              </li>
            ))}
          </ul>
        )}
        <ul className="court__fronts">
          {panel.fronts.map((f) => (
            <li key={f.front} className={`front front--${f.state}`}>
              {FRONTS[f.front]} front with {f.otherName}: {DISPOSITIONS[f.state]}, track {f.track > 0 ? `+${f.track}` : f.track < 0 ? `−${-f.track}` : '0'}
            </li>
          ))}
        </ul>
      </div>
    </article>
  )
})
