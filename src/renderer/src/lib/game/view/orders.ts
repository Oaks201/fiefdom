/**
 * The day's orders (T15; Ch 2 rule 2, Ch 6, Ch 10, A-36): which hexes to assault, which companies
 * go and which defend, which defenders always fight (the Marshal fills the rest, D-10), hired
 * blades and envoys, the Marshal's default, "repeat yesterday's orders", the countdown to the 04:00 lock, and
 * an estimate of the day's Defense and Assault from today's Valor so far (labeled as an estimate:
 * the close uses the day's final Valor).
 *
 * The orders are built here as plain values; the page stores them with `setOrders`, which the
 * close reads. Anything these builders allow, `ordersValidity` accepts.
 */
import { addDays, dayCloseInstant } from '../clock'
import { assaultBanners, defenseBanners, effectiveGarrison, envoyAvailable, ordersEstimate, ordersValidity, type OrderProblem, type OrdersEstimate } from '../combat'
import { realmEffects } from '../effects'
import { claimableBy, hexName } from '../map'
import { RULES } from '../rules'
import { roster } from '../roster'
import { openDayOf } from '../state'
import { RIVAL_IDS, type CampaignState, type DailyOrders, type Effects, type ISODate, type Owner, type RivalId } from '../types'

const MS_PER_SECOND = 1_000 // rules-ok: unit conversion

export type Pool = 'defense' | 'assault'

export interface OrdersCompany {
  id: string
  name: string
  power: number
  reach: string
  tags: string[]
  weary: boolean
  pool: Pool
  /** Which assault it goes on (0 for the first), when sent. */
  assault?: number
  /** Pinned: always fielded on defense, ahead of the Marshal's pick (D-10). */
  defender: boolean
}

export interface AssaultSlot {
  index: number
  target?: { hexId: string; label: string }
  companies: string[]
  /** It goes out at the close: a target the daily assault may take, and companies of its own. */
  goesOut: boolean
}

export interface AssaultTarget {
  hexId: string
  label: string
  owner: Owner
  ring: number
  /** The exact garrison an assault must beat today (T15 gap 1), wear and fortification counted. */
  garrison: number
}

export interface OrdersLock {
  /** When the orders lock: the day's close, 04:00 the next morning in the campaign's zone (Ch 2 rule 2). */
  locksAt: string
  secondsLeft: number
  /** Past the close: the orders can only be read. */
  locked: boolean
}

export interface OrdersView {
  date: ISODate
  /** Companies each pool may field: the banners, plus any for one pool only (the Muster Field). */
  banners: { defense: number; assault: number }
  assaultsAllowed: number
  companies: OrdersCompany[]
  /** One slot per assault the realm allows (two at Castle IV or with the Siege Park). */
  assaults: AssaultSlot[]
  /** Every hex a daily assault may take today, with its garrison. */
  targets: AssaultTarget[]
  /** The orders as set, or null: no orders means every company defends (A-36). */
  orders: DailyOrders | null
  problems: OrderProblem[]
  /** No assault goes out: every company defends. */
  allDefend: boolean
  /** The companies pinned to always defend (the Marshal fills the other banners), or null when he picks them all. */
  override: string[] | null
  /** Yesterday had orders to repeat (A-36). */
  canRepeat: boolean
  hired: { available: boolean; count: number; costEach: number }
  envoys: { rival: RivalId; available: boolean; chosen: boolean; costEach: number }[]
  /** At today's Valor so far; the close uses the day's final Valor. */
  estimate: OrdersEstimate & { valor: number }
}

/** Whether `date`'s orders are locked at `now`, and how long they have left. */
export function ordersLock(state: CampaignState, date: ISODate, now: Date): OrdersLock {
  const close = dayCloseInstant(date, state.campaign.timeZone)
  return {
    locksAt: close.toISOString(),
    secondsLeft: Math.max(0, Math.floor((close.getTime() - now.getTime()) / MS_PER_SECOND)),
    locked: now.getTime() >= close.getTime()
  }
}

/** The assaults the orders name, the first from `assaultTarget` and `assault`. */
function slotsOf(orders: DailyOrders | null): { target?: string; companies: string[] }[] {
  if (!orders) return []
  return [{ target: orders.assaultTarget, companies: orders.assault }, ...(orders.extraAssaults ?? []).map((a) => ({ target: a.target, companies: a.companies }))]
}

/** Every hex a daily assault may take today (Ch 6: adjacent, not a Gate, capital or Lair Mouth). */
export function assaultTargets(state: CampaignState): AssaultTarget[] {
  return state.hexes
    .filter((h) => claimableBy(state.hexes, h.id, 'player', 'assault'))
    .map((h) => ({ hexId: h.id, label: hexName(h), owner: h.owner, ring: h.ring, garrison: effectiveGarrison(h) }))
}

/** The orders panel for `date`, with today's Valor so far (`valor`, 0 to 1). */
export function ordersView(state: CampaignState, valor: number, date: ISODate = openDayOf(state), effects: Effects = realmEffects(state)): OrdersView {
  const orders = state.orders.find((o) => o.date === date) ?? null
  const validity = ordersValidity(state, orders ?? undefined, effects)
  const allowed = effects.dailyAssaults.value
  const named = slotsOf(orders)
  const assaultOf = new Map<string, number>()
  named.slice(0, allowed).forEach((a, i) => a.companies.forEach((id) => assaultOf.has(id) || assaultOf.set(id, i)))
  const override = orders?.defenseOverride ?? null
  const assaults: AssaultSlot[] = Array.from({ length: allowed }, (_, index) => {
    const a = named[index]
    const target = a?.target
    return {
      index,
      ...(target ? { target: { hexId: target, label: hexName(target) } } : {}),
      companies: a ? [...a.companies] : [],
      goesOut: target !== undefined && validity.assaults.some((x) => x.target === target)
    }
  })
  return {
    date,
    banners: { defense: defenseBanners(effects), assault: assaultBanners(effects) },
    assaultsAllowed: allowed,
    companies: roster(state, { day: date }, effects).map((c) => {
      const assault = assaultOf.get(c.id)
      return {
        id: c.id,
        name: c.name,
        power: c.power,
        reach: c.reach,
        tags: [...c.tags],
        weary: c.wearyUntil !== undefined && c.wearyUntil >= date,
        pool: assault === undefined ? 'defense' : 'assault',
        ...(assault === undefined ? {} : { assault }),
        defender: override?.includes(c.id) ?? false
      }
    }),
    assaults,
    targets: assaultTargets(state),
    orders,
    problems: validity.problems,
    allDefend: validity.assaults.length === 0,
    override: override ? [...override] : null,
    canRepeat: state.orders.some((o) => o.date === addDays(date, -1)),
    hired: { available: effects.hiredBlades.on, count: orders?.hired ?? 0, costEach: RULES.buildings.merchantHall.hiredBlades.costPerBattle },
    envoys: RIVAL_IDS.map((r) => ({ rival: r, available: envoyAvailable(state, r), chosen: orders?.envoys?.includes(r) ?? false, costEach: RULES.respect.envoyCostPerBattle })),
    estimate: { ...ordersEstimate(state, orders ?? undefined, date, valor, effects), valor }
  }
}

// ── Building the orders (pure: the page stores them with `setOrders`) ────────

/** Orders with every company defending and the Marshal picking who fields: the default (A-36). */
export function marshalOrders(date: ISODate): DailyOrders {
  return { date, assault: [], defense: [] }
}

/** Yesterday's orders for today (A-36's "repeat yesterday's orders"), or null when yesterday had none. */
export function repeatYesterday(state: CampaignState, date: ISODate): DailyOrders | null {
  const y = state.orders.find((o) => o.date === addDays(date, -1))
  if (!y) return null
  const out: DailyOrders = { ...y, date, assault: [...y.assault], defense: [...y.defense] }
  if (y.extraAssaults) out.extraAssaults = y.extraAssaults.map((a) => ({ target: a.target, companies: [...a.companies] }))
  if (y.defenseOverride) out.defenseOverride = [...y.defenseOverride]
  if (y.envoys) out.envoys = [...y.envoys]
  return out
}

function copyOf(orders: DailyOrders | null, date: ISODate): DailyOrders {
  const base = orders ?? marshalOrders(date)
  const out: DailyOrders = { ...base, date, assault: [...base.assault], defense: [...base.defense] }
  if (base.extraAssaults) out.extraAssaults = base.extraAssaults.map((a) => ({ target: a.target, companies: [...a.companies] }))
  if (base.defenseOverride) out.defenseOverride = [...base.defenseOverride]
  return out
}

/** The companies on assault `index`. */
function sentOn(orders: DailyOrders, index: number): string[] {
  return index === 0 ? orders.assault : (orders.extraAssaults?.[index - 1]?.companies ?? [])
}

function setSent(orders: DailyOrders, index: number, companies: string[]): void {
  if (index === 0) orders.assault = companies
  else if (orders.extraAssaults?.[index - 1]) orders.extraAssaults[index - 1] = { ...orders.extraAssaults[index - 1], companies }
}

function tidy(orders: DailyOrders): DailyOrders {
  if (orders.extraAssaults?.length === 0) delete orders.extraAssaults
  if (orders.defenseOverride?.length === 0) delete orders.defenseOverride
  return orders
}

/**
 * Orders with `hexId` as the target of assault `index` (0 for the first), keeping who is sent.
 * Undefined clears it: the first assault's companies wait for a new target (they defend until
 * then); a later assault is dropped and its companies defend. A later assault needs the ones
 * before it named.
 */
export function withTarget(orders: DailyOrders | null, date: ISODate, hexId: string | undefined, index = 0): DailyOrders {
  const out = copyOf(orders, date)
  if (index === 0) {
    if (hexId) out.assaultTarget = hexId
    else delete out.assaultTarget
    return tidy(out)
  }
  const extra = out.extraAssaults ?? []
  if (!hexId) out.extraAssaults = extra.filter((_, i) => i !== index - 1)
  else if (extra[index - 1]) out.extraAssaults = extra.map((a, i) => (i === index - 1 ? { ...a, target: hexId } : a))
  else if (extra.length === index - 1) out.extraAssaults = [...extra, { target: hexId, companies: [] }]
  return tidy(out)
}

export type MoveRefusal = 'tooManyCompanies' | 'noTarget'

/**
 * Moves a company to the defense, or onto assault `index`. Sending one more than an assault's
 * banners allow is refused (the orders come back unchanged), as the close would drop it (Ch 6); so
 * is joining a later assault before its target is named. A company sent away leaves the chosen
 * defenders.
 */
export function moveCompany(state: CampaignState, orders: DailyOrders | null, date: ISODate, companyId: string, to: Pool, index = 0, effects: Effects = realmEffects(state)): { orders: DailyOrders; refused?: MoveRefusal } {
  const out = copyOf(orders, date)
  if (to === 'assault' && index > 0 && !out.extraAssaults?.[index - 1]) return { orders: copyOf(orders, date), refused: 'noTarget' }
  const slots = 1 + (out.extraAssaults?.length ?? 0)
  for (let i = 0; i < slots; i++) setSent(out, i, sentOn(out, i).filter((id) => id !== companyId))
  out.defense = out.defense.filter((id) => id !== companyId)
  if (to === 'assault') {
    const sent = sentOn(out, index)
    if (sent.length >= assaultBanners(effects)) return { orders: copyOf(orders, date), refused: 'tooManyCompanies' }
    setSent(out, index, [...sent, companyId])
    if (out.defenseOverride) out.defenseOverride = out.defenseOverride.filter((id) => id !== companyId)
  }
  return { orders: tidy(out) }
}

/**
 * Pins a company to always defend, or unpins it (Ch 10: "unless the player overrides", D-10): the
 * Marshal fills the banners left with his best for each battle. Pinning more than the defense's
 * banners, or a company sent on an assault, is refused.
 */
export function toggleDefender(state: CampaignState, orders: DailyOrders | null, date: ISODate, companyId: string, effects: Effects = realmEffects(state)): { orders: DailyOrders; refused?: 'tooManyCompanies' | 'onAssault' } {
  const out = copyOf(orders, date)
  const chosen = out.defenseOverride ?? []
  if (chosen.includes(companyId)) {
    out.defenseOverride = chosen.filter((id) => id !== companyId)
    return { orders: tidy(out) }
  }
  const slots = 1 + (out.extraAssaults?.length ?? 0)
  for (let i = 0; i < slots; i++) if (sentOn(out, i).includes(companyId)) return { orders: copyOf(orders, date), refused: 'onAssault' }
  if (chosen.length >= defenseBanners(effects)) return { orders: copyOf(orders, date), refused: 'tooManyCompanies' }
  out.defenseOverride = [...chosen, companyId]
  return { orders: tidy(out) }
}

/** Hired blades for the day's defense (Merchant Hall II, A-19), and envoys (Respect 50, A-20). */
export function withHelp(orders: DailyOrders | null, date: ISODate, help: { hired?: number; envoys?: RivalId[] }): DailyOrders {
  const out = copyOf(orders, date)
  if (help.hired !== undefined) {
    if (help.hired > 0) out.hired = help.hired
    else delete out.hired
  }
  if (help.envoys !== undefined) {
    if (help.envoys.length > 0) out.envoys = [...help.envoys]
    else delete out.envoys
  }
  return tidy(out)
}
