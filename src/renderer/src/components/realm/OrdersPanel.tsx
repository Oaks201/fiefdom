import { useEffect, useMemo, useState } from 'react'
import { GiArcheryTarget, GiHourglass, GiRallyTheTroops, GiScrollUnfurled, GiShield } from 'react-icons/gi'
import { sfx } from '../../audio'
import { setOrders } from '../../lib/game/combat'
import { hexLabel } from '../../lib/game/map'
import type { CampaignState, DailyOrders, ISODate, RivalId } from '../../lib/game/types'
import { liveValor } from '../../lib/game/view/chronicle'
import { marshalOrders, moveCompany, ordersLock, ordersView, repeatYesterday, toggleDefender, withHelp, withTarget, type OrdersView } from '../../lib/game/view/orders'
import { amount, orderProblemLabel } from '../../lib/game/view/refusals'
import { percent, rivalName } from '../../lib/game/view/shell'
import { useCampaign } from '../../state/campaign'
import { campaignNow } from '../../state/campaignClock'
import { useLedger } from '../../state/store'
import { toast } from '../../state/toasts'

const THREATS: Record<string, string> = { beasts: 'Beasts', mythic: 'A mythic', raid: 'Raid', conquest: 'Conquest attempt' }
const OUTCOMES: Record<string, string> = { taken: 'taken', rout: 'taken in a rout', repulsed: 'repulsed' }

function countdown(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(seconds % 60).padStart(2, '0')}s`
}

/** "now", ticking once a second (dev time travel included). */
function useNow(): Date {
  const [now, setNow] = useState(() => campaignNow())
  useEffect(() => {
    const id = setInterval(() => setNow(campaignNow()), 1_000)
    return () => clearInterval(id)
  }, [])
  return now
}

/**
 * The day's orders (Ch 2 rule 2, Ch 6, Ch 10, A-36): the assault targets and who goes, who
 * defends, hired blades and envoys, the Marshal's default and yesterday's orders, the countdown to
 * the 04:00 lock (read-only after it), and an estimate of the day's battles from today's Valor so
 * far.
 */
export function OrdersPanel({ campaign, today }: { campaign: CampaignState; today: ISODate }): React.JSX.Element {
  const apply = useCampaign((s) => s.apply)
  const ledger = useLedger((s) => s.ledger)
  const now = useNow()
  const valor = useMemo(() => liveValor(campaign, ledger, today), [campaign, ledger, today])
  const view = useMemo(() => ordersView(campaign, valor, today), [campaign, valor, today])
  const lock = ordersLock(campaign, today, now)
  const names = new Map(view.companies.map((c) => [c.id, c.name]))
  const name = (id: string): string => names.get(id) ?? (id.startsWith('hired') ? 'Hired blades' : id.startsWith('envoy:') ? `${rivalName(id.slice(6) as RivalId)}’s envoy` : id)

  const store = (next: DailyOrders | null, refused?: string): void => {
    if (refused) {
      toast(refused === 'noTarget' ? 'Name that assault’s target first.' : refused === 'onAssault' ? 'That company is on an assault.' : 'Every banner there is taken.', 'error')
      return
    }
    if (next) apply((s) => setOrders(s, next).state)
  }

  return (
    <section className={`panel orders ${lock.locked ? 'is-locked' : ''}`} aria-label="The day’s orders">
      <header className="panel__head">
        <h3 className="panel__title">
          <GiScrollUnfurled aria-hidden="true" /> The day’s orders
        </h3>
        <span className={`orders__clock ${lock.locked ? 'is-locked' : ''}`} title={`They lock at the day’s close, ${new Date(lock.locksAt).toLocaleString()}`}>
          <GiHourglass aria-hidden="true" /> {lock.locked ? 'Locked' : `Locks at 04:00 · ${countdown(lock.secondsLeft)}`}
        </span>
      </header>

      {lock.locked && <p className="banner">These orders are locked; they settle with the day.</p>}

      <p className="orders__state">
        {view.allDefend ? (
          <>
            <GiShield aria-hidden="true" /> No assault: every company defends.
          </>
        ) : (
          <>
            <GiArcheryTarget aria-hidden="true" /> {view.assaults.filter((a) => a.goesOut).map((a) => `Hex ${a.target?.label}`).join(' and ')} assaulted at the close.
          </>
        )}
      </p>

      <div className="orders__quick">
        <button type="button" className="btn btn--small btn--ghost" disabled={lock.locked} onClick={() => store(marshalOrders(today))} title="Every company defends; the Marshal fields the best for each battle">
          Use the Marshal’s choice
        </button>
        <button
          type="button"
          className="btn btn--small btn--ghost"
          disabled={lock.locked || !view.canRepeat}
          onClick={() => {
            store(repeatYesterday(campaign, today))
            sfx('stamp')
          }}
        >
          Repeat yesterday’s orders
        </button>
      </div>

      <div className="orders__assaults">
        {view.assaults.map((slot) => (
          <AssaultSlot key={slot.index} view={view} slot={slot} locked={lock.locked} onTarget={(hexId) => store(withTarget(view.orders, today, hexId || undefined, slot.index))} />
        ))}
      </div>

      <table className="orders__companies">
        <thead>
          <tr>
            <th>Company</th>
            <th>Power</th>
            <th>Goes to</th>
            <th title="Field it on defense in place of the Marshal’s pick">Fields</th>
          </tr>
        </thead>
        <tbody>
          {view.companies.map((c) => (
            <tr key={c.id} className={c.pool === 'assault' ? 'is-assault' : ''}>
              <td>
                <span className="orders__name">{c.name}</span>
                <span className="tags">{c.tags.join(' · ')}</span>
                {c.weary && <span className="tag tag--weary">Weary</span>}
              </td>
              <td className="num">{amount(c.power)}</td>
              <td>
                <div className="segmented" role="radiogroup" aria-label={`${c.name} goes to`}>
                  <button type="button" role="radio" aria-checked={c.pool === 'defense'} className={c.pool === 'defense' ? 'is-on' : ''} disabled={lock.locked} onClick={() => store(...unpack(moveCompany(campaign, view.orders, today, c.id, 'defense')))}>
                    Defend
                  </button>
                  {view.assaults.map((slot) => (
                    <button
                      key={slot.index}
                      type="button"
                      role="radio"
                      aria-checked={c.assault === slot.index}
                      className={c.assault === slot.index ? 'is-on' : ''}
                      disabled={lock.locked}
                      onClick={() => store(...unpack(moveCompany(campaign, view.orders, today, c.id, 'assault', slot.index)))}
                    >
                      {view.assaults.length > 1 ? `Assault ${slot.index + 1}` : 'Assault'}
                    </button>
                  ))}
                </div>
              </td>
              <td className="orders__field">
                <input type="checkbox" checked={c.defender} disabled={lock.locked || c.pool === 'assault'} onChange={() => store(...unpack(toggleDefender(campaign, view.orders, today, c.id)))} aria-label={`Field ${c.name} on defense`} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="orders__banners">
        Banners: each assault fields up to {view.banners.assault}; each defense up to {view.banners.defense}.{' '}
        {view.override ? `You field ${view.override.map(name).join(', ')} on defense.` : 'The Marshal fields the best defenders for each battle.'}
        {view.override && (
          <button type="button" className="link" disabled={lock.locked} onClick={() => store(withOverride(view.orders, today))}>
            Let the Marshal choose
          </button>
        )}
      </p>

      {(view.hired.available || view.envoys.some((e) => e.available)) && (
        <div className="orders__help">
          {view.hired.available && (
            <label className="orders__hired">
              Hired blades ({view.hired.costEach} a battle):
              <input type="number" min={0} max={9} value={view.hired.count} disabled={lock.locked} onChange={(e) => store(withHelp(view.orders, today, { hired: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))} />
            </label>
          )}
          {view.envoys.some((e) => e.available) && (
            <div className="chips" aria-label="Envoys">
              {view.envoys
                .filter((e) => e.available)
                .map((e) => (
                  <button
                    key={e.rival}
                    type="button"
                    className={`chip ${e.chosen ? 'is-on' : ''}`}
                    disabled={lock.locked}
                    onClick={() => store(withHelp(view.orders, today, { envoys: e.chosen ? view.envoys.filter((x) => x.chosen && x.rival !== e.rival).map((x) => x.rival) : [...view.envoys.filter((x) => x.chosen).map((x) => x.rival), e.rival] }))}
                  >
                    {rivalName(e.rival)}’s envoy ({e.costEach} a battle)
                  </button>
                ))}
            </div>
          )}
        </div>
      )}

      <Estimate view={view} name={name} />

      {view.problems.length > 0 && (
        <ul className="orders__problems">
          {view.problems.map((p, i) => (
            <li key={i}>{orderProblemLabel(p)}</li>
          ))}
        </ul>
      )}
    </section>
  )
}

function unpack(r: { orders: DailyOrders; refused?: string }): [DailyOrders, string | undefined] {
  return [r.orders, r.refused]
}

function withOverride(orders: DailyOrders | null, today: ISODate): DailyOrders {
  const next: DailyOrders = { ...(orders ?? marshalOrders(today)), date: today }
  delete next.defenseOverride
  return next
}

function AssaultSlot({ view, slot, locked, onTarget }: { view: OrdersView; slot: OrdersView['assaults'][number]; locked: boolean; onTarget(hexId: string): void }): React.JSX.Element {
  const earlier = view.assaults[slot.index - 1]
  const blocked = slot.index > 0 && !earlier?.target
  return (
    <div className={`assault-slot ${slot.goesOut ? 'goes-out' : ''}`}>
      <label className="field">
        <span className="field__label">
          <GiRallyTheTroops aria-hidden="true" /> {view.assaults.length > 1 ? `Assault ${slot.index + 1}` : 'Assault'}: {slot.companies.length} of {view.banners.assault} companies
        </span>
        <span className="field__box">
          <select value={slot.target?.hexId ?? ''} disabled={locked || blocked} onChange={(e) => onTarget(e.target.value)}>
            <option value="">No target</option>
            {view.targets.map((t) => (
              <option key={t.hexId} value={t.hexId}>
                Hex {t.label} · {t.owner === 'neutral' ? 'unaligned' : rivalName(t.owner as RivalId)} · garrison {amount(t.garrison)}
              </option>
            ))}
          </select>
        </span>
      </label>
      {slot.target && !slot.goesOut && <p className="muted">{slot.companies.length === 0 ? 'Send at least one company.' : 'This assault cannot go out as ordered.'}</p>}
      {!slot.target && slot.companies.length > 0 && <p className="muted">No target yet: these companies defend until one is named.</p>}
    </div>
  )
}

function Estimate({ view, name }: { view: OrdersView; name(id: string): string }): React.JSX.Element {
  const e = view.estimate
  return (
    <div className="orders__estimate">
      <h4>
        Estimate at today’s Valor so far ({percent(e.valor)}%)
      </h4>
      <p className="muted">An estimate: the close uses the day’s final Valor.</p>
      {e.defenses.length === 0 && e.assaults.length === 0 && <p>No battle is foretold for today.</p>}
      <ul>
        {e.defenses.map((d, i) => (
          <li key={`d${i}`}>
            {THREATS[d.kind]}
            {d.rival ? ` (${rivalName(d.rival)})` : ''} at hex {hexLabel(d.hexId)}: Defense <strong>{amount(d.defense)}</strong> with {d.fielded.map(name).join(', ') || 'no one'}
          </li>
        ))}
        {e.assaults.map((a, i) => (
          <li key={`a${i}`}>
            Assault on hex {hexLabel(a.hexId)}: <strong>{amount(a.value)}</strong> against garrison {amount(a.garrison)}, {OUTCOMES[a.outcome]}
          </li>
        ))}
      </ul>
    </div>
  )
}
