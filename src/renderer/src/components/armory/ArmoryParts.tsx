import { useState } from 'react'
import { GiAnvil, GiCastle, GiLockedChest, GiRallyTheTroops, GiSwordsEmblem, GiTwoCoins } from 'react-icons/gi'
import { sfx } from '../../audio'
import { buyItem, chooseWing, equipItem, promoteElite, recruitElite, setArmorer, swearSworn, unequipItem } from '../../lib/game/armory'
import type { ISODate, Tag } from '../../lib/game/types'
import type { ArmoryView, WingOption } from '../../lib/game/view/armory'
import { amount } from '../../lib/game/view/refusals'
import { useCampaign } from '../../state/campaign'
import { toast } from '../../state/toasts'
import { HoldButton } from '../HoldButton'
import { Modal } from '../Modal'
import { GameArt } from '../game/GameArt'

const TAG_NAMES: Record<Tag, string> = { steel: 'Steel', coin: 'Coin', arcane: 'Arcane', engine: 'Engine' }

function Locked({ milestone, what }: { milestone: number; what: string }): React.JSX.Element {
  return (
    <p className="armory-locked">
      <GiLockedChest aria-hidden="true" /> {what} open{what.endsWith('s') ? '' : 's'} at Milestone {milestone}.
    </p>
  )
}

/** Items by rank (Appendix C "Items"): a locked rank shows only the Milestone that opens it. */
export function ItemShop({ view, today }: { view: ArmoryView; today: ISODate }): React.JSX.Element {
  const act = useCampaign((s) => s.act)
  return (
    <section className="panel armory-items">
      <header className="panel__head">
        <h3 className="panel__title">
          <GiAnvil aria-hidden="true" /> Items
        </h3>
        <span className="panel__aside">Bought into the stash, then carried by a company</span>
      </header>
      {view.ranks.map((r) => (
        <div key={r.rank} className={`armory-rank ${r.open ? 'is-open' : 'is-locked'}`}>
          <h4 className="armory-rank__name">{r.name}</h4>
          {!r.open || !r.items ? (
            <Locked milestone={r.milestone} what={r.name} />
          ) : (
            <ul className="item-cards">
              {r.items.map((i) => (
                <li key={i.id} className="item-card">
                  <GameArt slot={i.art} owner="player" width={52} label={i.name} />
                  <div className="item-card__body">
                    <strong>{i.name}</strong>
                    <span className="item-card__text" data-text-id={i.textId}>
                      {i.text}
                    </span>
                    {i.held > 0 && <span className="item-card__held">Held: {i.held}</span>}
                  </div>
                  <div className="item-card__buy">
                    <button
                      type="button"
                      className="btn btn--small"
                      disabled={!i.offer.ok}
                      title={i.offer.reason?.label}
                      onClick={() => {
                        if (act((s) => buyItem(s, i.id, today))) {
                          sfx('coin')
                          toast(`${i.name} is in the stash.`, 'success')
                        }
                      }}
                    >
                      <GiTwoCoins aria-hidden="true" /> {amount(i.offer.cost)}
                    </button>
                    {!i.offer.ok && i.offer.reason && <span className="item-card__why">{i.offer.reason.label}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      {view.trophies.length > 0 && (
        <div className="armory-rank is-open">
          <h4 className="armory-rank__name">Trophies</h4>
          <ul className="item-cards">
            {view.trophies.map((t) => (
              <li key={t.id} className="item-card">
                <GameArt slot={`item.${t.id}`} owner="player" width={52} label={t.name} />
                <div className="item-card__body">
                  <strong>{t.name}</strong>
                  <span className="item-card__text">{t.text}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

/** The stash and each company's item slots: equip within the slots; the roster changes at once. */
export function Equipment({ view, today }: { view: ArmoryView; today: ISODate }): React.JSX.Element {
  const act = useCampaign((s) => s.act)
  const [choice, setChoice] = useState<Record<string, string>>({})
  return (
    <section className="panel armory-equip">
      <header className="panel__head">
        <h3 className="panel__title">
          <GiRallyTheTroops aria-hidden="true" /> The companies
        </h3>
        <span className="panel__aside">Stash: {view.stash.length === 0 ? 'empty' : view.stash.map((s) => s.name).join(', ')}</span>
      </header>
      <table className="equip__table">
        <thead>
          <tr>
            <th>Company</th>
            <th className="num">Power</th>
            <th>Carries</th>
            <th>Equip from the stash</th>
          </tr>
        </thead>
        <tbody>
          {view.companies.map((c) => {
            const full = c.items.length >= c.slots
            return (
              <tr key={c.id}>
                <td>
                  <GameArt slot={c.art} owner="player" width={28} label={c.name} className="roster__token" /> <strong>{c.name}</strong>
                  {c.armorer && <span className="tag tag--armorer">Armorer’s slot</span>}
                </td>
                <td className="num">{amount(c.power)}</td>
                <td>
                  {c.items.length === 0 && <span className="muted">Nothing ({c.slots} slot{c.slots === 1 ? '' : 's'})</span>}
                  {c.items.map((it, idx) => (
                    <button
                      key={`${it.id}-${idx}`}
                      type="button"
                      className="chip chip--quiet"
                      title="Take it off, back to the stash"
                      onClick={() => {
                        if (act((s) => unequipItem(s, c.id, it.id, today))) sfx('unstamp')
                      }}
                    >
                      {it.name} ×
                    </button>
                  ))}
                  {c.items.length > 0 && <span className="muted equip__slots"> {c.items.length} of {c.slots}</span>}
                </td>
                <td>
                  <span className="equip__pick">
                    <select value={choice[c.id] ?? ''} disabled={full || view.stash.length === 0} onChange={(e) => setChoice({ ...choice, [c.id]: e.target.value })} aria-label={`Item for ${c.name}`}>
                      <option value="">{full ? 'Slots full' : view.stash.length === 0 ? 'The stash is empty' : 'Choose an item…'}</option>
                      {[...new Set(view.stash.map((s) => s.id))].map((id) => (
                        <option key={id} value={id}>
                          {view.stash.find((s) => s.id === id)?.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn--small"
                      disabled={full || !choice[c.id]}
                      onClick={() => {
                        if (act((s) => equipItem(s, c.id, choice[c.id], today))) {
                          sfx('stamp')
                          setChoice({ ...choice, [c.id]: '' })
                        }
                      }}
                    >
                      Equip
                    </button>
                    {view.armorer && !c.armorer && (
                      <button type="button" className="link" onClick={() => act((s) => setArmorer(s, c.id, today))}>
                        Give it the Armorer’s slot
                      </button>
                    )}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

/** The Wings (Appendix C): one of two per building in each wave, chosen once with a confirming hold. */
export function Wings({ view, today }: { view: ArmoryView; today: ISODate }): React.JSX.Element {
  const act = useCampaign((s) => s.act)
  const [asking, setAsking] = useState<WingOption | null>(null)
  return (
    <section className="panel armory-wings">
      <header className="panel__head">
        <h3 className="panel__title">
          <GiCastle aria-hidden="true" /> Wings
        </h3>
        <span className="panel__aside">One of two for each building, for good</span>
      </header>
      {view.wings.map((w) => (
        <div key={w.wave} className="wing-wave">
          <h4 className="armory-rank__name">{w.wave === 1 ? 'The first Wings' : w.wave === 2 ? 'The second Wings' : 'The third Wings'}</h4>
          {!w.open || !w.buildings ? (
            <Locked milestone={w.milestone} what="These Wings" />
          ) : (
            <div className="wing-pairs">
              {w.buildings.map((b) => (
                <div key={b.building} className="wing-pair">
                  <span className="wing-pair__building">{b.name}</span>
                  {b.options.map((o) => (
                    <button key={o.id} type="button" className={`wing ${o.chosen ? 'is-chosen' : ''}`} disabled={!o.available} onClick={() => setAsking(o)} title={o.reason?.label}>
                      <strong>{o.name}</strong>
                      <span>{o.text}</span>
                      {o.chosen && <span className="wing__built">Built</span>}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      <Modal open={asking !== null} onClose={() => setAsking(null)} title={asking ? `Build the ${asking.name}?` : ''} className="modal--narrow">
        {asking && (
          <div className="wing-confirm">
            <p>{asking.text}.</p>
            <p>
              <strong>The choice is permanent.</strong> The other Wing of this pair can never be built.
            </p>
            <HoldButton
              className="btn btn--primary"
              onComplete={() => {
                if (act((s) => chooseWing(s, asking.id, today))) {
                  sfx('seal')
                  toast(`The ${asking.name} is built.`, 'success')
                }
                setAsking(null)
              }}
              aria-label={`Hold to build the ${asking.name}`}
            >
              Hold to build the {asking.name}
            </HoldButton>
          </div>
        )}
      </Modal>
    </section>
  )
}

/** Elite companies (Milestone 3; rank II at Milestone 7) and the Sworn (Milestone 7, two tags chosen once, A-21). */
export function Elites({ view, today }: { view: ArmoryView; today: ISODate }): React.JSX.Element {
  const act = useCampaign((s) => s.act)
  const [tags, setTags] = useState<Tag[]>([])
  const e = view.elites
  return (
    <section className="panel armory-elites">
      <header className="panel__head">
        <h3 className="panel__title">
          <GiSwordsEmblem aria-hidden="true" /> Elites and the Sworn
        </h3>
      </header>
      {!e.open || !e.cards ? (
        <Locked milestone={e.milestone} what="Elite companies" />
      ) : (
        <ul className="elite-cards">
          {e.cards.map((c) => (
            <li key={c.id} className={`elite-card ${c.rank > 0 ? 'is-recruited' : ''}`}>
              <GameArt slot={c.art} owner="player" width={84} label={c.name} />
              <div className="elite-card__body">
                <strong>{c.name}</strong>
                <span className="muted">
                  {c.building} · {c.tags.join(' · ')} · {c.reach} · power {c.power[0]} / {c.power[1]}
                </span>
                <span>{c.ability}</span>
                <span className="item-card__text" data-text-id={c.textId}>
                  {c.text}
                </span>
                {c.rank > 0 && <span className="tag tag--rank">Rank {c.rank === 2 ? 'II' : 'I'}</span>}
                {c.recruit && (
                  <button type="button" className="btn btn--small" disabled={!c.recruit.ok} title={c.recruit.reason?.label} onClick={() => act((s) => recruitElite(s, c.id, today)) && sfx('seal')}>
                    Recruit · {amount(c.recruit.cost)}
                  </button>
                )}
                {c.promote && (
                  <button type="button" className="btn btn--small" disabled={!c.promote.ok} title={c.promote.reason?.label} onClick={() => act((s) => promoteElite(s, c.id, today)) && sfx('seal')}>
                    Rank II · {amount(c.promote.cost)}
                  </button>
                )}
                {(c.recruit && !c.recruit.ok && c.recruit.reason) || (c.promote && !c.promote.ok && c.promote.reason) ? <span className="item-card__why">{(c.recruit ?? c.promote)?.reason?.label}</span> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="sworn">
        <h4 className="armory-rank__name">The Sworn</h4>
        {!view.sworn.open ? (
          <Locked milestone={view.sworn.milestone} what="The Sworn" />
        ) : view.sworn.tags ? (
          <p>The Sworn stand with the realm, sworn to {view.sworn.tags.map((t) => TAG_NAMES[t as Tag]).join(' and ')}.</p>
        ) : (
          <div className="sworn__choose">
            <p>Choose the Sworn’s {view.sworn.tagCount} tags. They are chosen once.</p>
            <div className="chips">
              {(view.sworn.choices ?? []).map((t) => (
                <button key={t} type="button" className={`chip ${tags.includes(t) ? 'is-on' : ''}`} onClick={() => setTags(tags.includes(t) ? tags.filter((x) => x !== t) : tags.length >= view.sworn.tagCount ? [tags[1], t] : [...tags, t])}>
                  {TAG_NAMES[t]}
                </button>
              ))}
            </div>
            <HoldButton
              className="btn btn--primary"
              disabled={tags.length !== view.sworn.tagCount}
              onComplete={() => {
                if (act((s) => swearSworn(s, tags, today))) {
                  sfx('seal')
                  toast('The Sworn have taken their oath.', 'success')
                }
              }}
              aria-label="Hold to swear the Sworn"
            >
              Hold to swear them
            </HoldButton>
          </div>
        )}
      </div>
    </section>
  )
}

