import { useState } from 'react'
import { GiCrossedSwords, GiRallyTheTroops, GiScrollUnfurled, GiSpyglass } from 'react-icons/gi'
import { sfx } from '../../audio'
import { formatShort } from '../../lib/dates'
import { begin, setDoctrine, setFormation } from '../../lib/game/grand'
import { readinessValors } from '../../lib/game/settle'
import type { CampaignState, ISODate, SlotKey } from '../../lib/game/types'
import { FORMATION_SLOTS, companyCount, formationProblemLabel, placeCompany, preparationView, swapSlots } from '../../lib/game/view/battle'
import { amount } from '../../lib/game/view/refusals'
import { useCampaign } from '../../state/campaign'
import { GameArt } from '../game/GameArt'

const SLOT_NAMES: Record<string, string> = {
  'left:front': 'Left front',
  'center:front': 'Center front',
  'right:front': 'Right front',
  'left:rear': 'Left rear',
  'center:rear': 'Center rear',
  'right:rear': 'Right rear'
}

/**
 * Preparation during the warning (Ch 11): the enemy host as the Herald tells it, the companies to
 * field (banners + 2, never more than 6; a choice past the limit is refused with its reason), the
 * 3 × 2 formation, the Doctrine, and Readiness in one line. "Begin" on the battle day.
 */
export function Preparation({ campaign, today, battleId }: { campaign: CampaignState; today: ISODate; battleId: string }): React.JSX.Element | null {
  const act = useCampaign((s) => s.act)
  const view = preparationView(campaign, battleId, today)
  const [picked, setPicked] = useState<string | null>(null)
  const [pickedSlot, setPickedSlot] = useState<SlotKey | null>(null)
  const [blocked, setBlocked] = useState<string | null>(null)
  if (!view) return null
  const formation: Record<string, string> = Object.fromEntries(Object.entries(view.formation).map(([slot, c]) => [slot, (c as { id: string }).id]))

  const store = (next: Record<string, string>): void => {
    if (companyCount(next) > view.limit) {
      setBlocked(`${formationProblemLabel('tooMany')} This battle fields at most ${view.limit}.`)
      sfx('error')
      return
    }
    setBlocked(null)
    if (act((s) => setFormation(s, battleId, next, today))) sfx('click')
  }

  const onSlot = (slot: SlotKey): void => {
    if (picked) {
      store(placeCompany(formation, slot, picked))
      setPicked(null)
      return
    }
    if (pickedSlot) {
      if (pickedSlot !== slot) store(swapSlots(formation, pickedSlot, slot))
      setPickedSlot(null)
      return
    }
    if (formation[slot]) setPickedSlot(slot)
  }

  const start = (): void => {
    if (!act((s) => begin(s, battleId, { today, valors: readinessValors(s, view.battleDate) }))) return
    sfx('strike')
  }

  return (
    <div className="prep">
      <section className="panel prep__host">
        <header className="panel__head">
          <h3 className="panel__title">
            <GiSpyglass aria-hidden="true" /> The enemy
          </h3>
          <span className="panel__aside">{view.host.rivals}</span>
        </header>
        <p className="prep__host-text">{view.host.text}</p>
        {view.host.roster && (
          <table className="prep__roster">
            <tbody>
              {view.host.roster.map((c, i) => (
                <tr key={i}>
                  <td>{c.name}</td>
                  <td className="num">{amount(c.power)}</td>
                  <td>{c.reach}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!view.host.revealed && <p className="muted">The full roster shows with Mage Tower IV, the Spy Network or the Observatory.</p>}
        <p className="prep__readiness">{view.readiness.line}</p>
      </section>

      <section className="panel prep__formation">
        <header className="panel__head">
          <h3 className="panel__title">
            <GiRallyTheTroops aria-hidden="true" /> The formation
          </h3>
          <span className={`panel__aside ${view.fielded > view.limit ? 'is-over' : ''}`}>
            {view.fielded} of {view.limit} companies{view.marshalPick ? ' · the Marshal’s pick' : ''}
          </span>
        </header>
        <p className="muted">Drag a company onto a slot, or choose it and then a slot. Choose a placed company, then another slot, to move or swap it.</p>
        <div className="prep__grid" role="grid" aria-label="Your formation">
          {(['front', 'rear'] as const).map((rank) => (
            <div key={rank} className="prep__row" role="row">
              <span className="field__rank">{rank === 'front' ? 'Front' : 'Rear'}</span>
              {FORMATION_SLOTS.filter((s) => s.endsWith(rank)).map((slot) => {
                const placed = view.formation[slot]
                return (
                  <button
                    key={slot}
                    type="button"
                    role="gridcell"
                    className={`prep__slot ${placed ? 'is-filled' : ''} ${pickedSlot === slot ? 'is-selected' : ''}`}
                    data-slot={slot}
                    onClick={() => onSlot(slot)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault()
                      const id = e.dataTransfer.getData('text/company')
                      if (id) store(placeCompany(formation, slot, id))
                    }}
                    disabled={view.begun || view.fought}
                  >
                    <span className="prep__slot-name">{SLOT_NAMES[slot]}</span>
                    {placed ? <strong>{placed.name}</strong> : <span className="muted">Empty</span>}
                    {placed && (
                      <span
                        className="prep__clear"
                        role="button"
                        tabIndex={0}
                        aria-label={`Clear ${SLOT_NAMES[slot]}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          store(placeCompany(formation, slot, null))
                        }}
                      >
                        ×
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
        {(blocked || view.problem) && <p className="field__problem prep__problem">{blocked ?? view.problem?.label}</p>}
        <ul className="prep__companies" aria-label="Companies">
          {view.companies.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                draggable
                onDragStart={(e) => e.dataTransfer.setData('text/company', c.id)}
                className={`prep__company ${c.slot ? 'is-placed' : ''} ${picked === c.id ? 'is-selected' : ''}`}
                onClick={() => setPicked(picked === c.id ? null : c.id)}
                data-company={c.id}
                disabled={view.begun || view.fought}
              >
                <GameArt slot={c.art} owner="player" width={34} label={c.name} />
                <span>
                  <strong>{c.name}</strong> {amount(c.power)}
                  <span className="tags"> {c.tags.join(' · ')} · {c.reach}</span>
                  {c.weary && <span className="tag tag--weary">Weary</span>}
                  {c.items.length > 0 && <span className="prep__items"> · {c.items.join(', ')}</span>}
                </span>
                {c.slot && <span className="prep__where">{SLOT_NAMES[c.slot]}</span>}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel prep__doctrine">
        <header className="panel__head">
          <h3 className="panel__title">
            <GiScrollUnfurled aria-hidden="true" /> Doctrine
          </h3>
        </header>
        {view.doctrines.length === 0 ? (
          <p className="muted">Your buildings grant no Doctrine yet (Tier II grants each building’s).</p>
        ) : (
          <div className="prep__doctrines" role="radiogroup" aria-label="Doctrine">
            {[{ id: '', name: 'None', text: 'Fight without a Doctrine.', chosen: !view.doctrines.some((d) => d.chosen) }, ...view.doctrines].map((d) => (
              <button
                key={d.id || 'none'}
                type="button"
                role="radio"
                aria-checked={d.chosen}
                className={`doctrine ${d.chosen ? 'is-on' : ''}`}
                disabled={view.begun || view.fought}
                onClick={() => act((s) => setDoctrine(s, battleId, d.id || null, today))}
              >
                <strong>{d.name}</strong>
                <span>{d.text}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="prep__begin">
        {view.canFight ? (
          <button type="button" className="btn btn--primary btn--big" onClick={start}>
            <GiCrossedSwords aria-hidden="true" /> Begin the battle
          </button>
        ) : (
          <p className="muted">
            The battle is fought on {formatShort(view.battleDate)}
            {view.daysLeft > 0 ? `, in ${view.daysLeft === 1 ? '1 day' : `${view.daysLeft} days`}` : ''}. Prepare until then; left unfought, the Marshal fights it at that day’s close.
          </p>
        )}
      </div>
    </div>
  )
}
