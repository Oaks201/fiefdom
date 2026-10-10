import { useRef, type ReactNode } from 'react'
import { formatNumber } from '../lib/format'
import { numeral } from '../lib/game/effects'
import { trust } from '../lib/game/land'
import { RULES } from '../lib/game/rules'
import { RIVAL_IDS } from '../lib/game/types'
import { amount } from '../lib/game/view/refusals'
import { useUI } from '../state/ui'
import { Modal } from './Modal'

/** A share as a whole percent, e.g. 0.4 → "40%". */
const pct = (share: number): string => `${Math.round(share * 100)}%`

/** "the next day" or "the next 3 days". */
const nextDays = (n: number): string => (n === 1 ? 'the next day' : `the next ${n} days`)

/** [15, 35, 70] → "15, 35 and 70". */
const listed = (items: readonly (string | number)[]): string => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`)

const dawn = `${String(RULES.clock.dayCloseHour).padStart(2, '0')}:00`

/**
 * A worked courtship on an unaligned ring-3 village at 50% Realm Consistency, read from the rules.
 * Trust is rounded to the two places the Courtships panel shows.
 */
function courtshipExample(): { ring: number; rc: string; loyalty: number; trust: string; bid: number; offer: number; short: { bid: number; offer: number; back: number; loyalty: number } } {
  const ring = 3
  const rc = 0.5
  const tenth = (n: number): number => Math.round(n * 10) / 10
  const tr = Math.round(trust(rc) * 100) / 100
  const loyalty = RULES.influence.loyalty.neutralPerRing * ring
  const bid = Math.ceil(loyalty / tr)
  // A bid 10 short of it, which the village holds against.
  const shortBid = bid - 10
  const shortOffer = shortBid * tr
  return {
    ring,
    rc: pct(rc),
    loyalty,
    trust: tr.toFixed(2),
    bid,
    offer: tenth(bid * tr),
    short: {
      bid: shortBid,
      offer: tenth(shortOffer),
      back: shortBid * RULES.influence.failedBid.refundShare,
      loyalty: tenth(loyalty - shortOffer * RULES.influence.failedBid.loyaltyDropShareOfOffer)
    }
  }
}

/** "1 and 3 days from the start, 7 once any building reaches Tier II, …", read from the rules. */
function lengthUnlocks(): string {
  const start = RULES.contracts.lengths.filter((l) => l.unlock.kind === 'start').map((l) => l.days)
  const later = RULES.contracts.lengths.flatMap((l) => {
    const u = l.unlock
    if (u.kind === 'anyBuildingTier') return [`${l.days} once any building reaches Tier ${numeral(u.tier)}`]
    if (u.kind === 'castleTier') return [`${l.days} at Castle Tier ${numeral(u.tier)}`]
    return []
  })
  return `${start.join(' and ')} days from the start; ${later.join('; ')}`
}

interface Section {
  id: string
  title: string
  body: ReactNode
}

/**
 * How to play: a plain reference to the campaign's rules, opened from the top bar or with F1 or ?.
 * It is help text, not story: no flavor, no spoilers past what the screens already show, and no
 * hidden values (the rival benchmark, rival income, event criteria). Every number comes from
 * `RULES`, so it follows any retuning.
 */
export function HowToPlay(): React.JSX.Element | null {
  const open = useUI((s) => s.helpOpen)
  const setOpen = useUI((s) => s.setHelpOpen)
  const body = useRef<HTMLDivElement>(null)
  if (!open) return null

  const rivals = RIVAL_IDS.length
  const c = RULES.contracts
  const firstThreatWeek = RULES.combat.earlyGrace[RULES.combat.earlyGrace.length - 1].throughWeek
  const land = RULES.land
  const inf = RULES.influence
  const graceII = numeral(RULES.effects.graceIILevel)
  const ex = courtshipExample()
  const slots = inf.courtshipSlots

  const sections: Section[] = [
    {
      id: 'idea',
      title: 'The idea',
      body: (
        <>
          <p>
            Your real habits pay for a kingdom. Steps, logged food, daily duties, kept contracts and a steady weight trend earn <b>reputation</b>, the realm’s one currency. You spend it on
            buildings, companies, land and deals, and use them to outlast {rivals} rival rulers who grow on their own.
          </p>
          <p>
            It runs on real days. Each day closes at {dawn} and nothing can be fast-forwarded. The daily part takes a few minutes; the ledger keeps working exactly as it did before.
          </p>
        </>
      )
    },
    {
      id: 'start',
      title: 'Getting started',
      body: (
        <ol>
          <li>
            <b>Found a campaign</b> from Settings (<kbd>Esc</kbd>), “Found a campaign…”: your weight today and your goal, your Charter (a weekly step pool, a daily calorie limit
            and {c.charter.duties.min} to {c.charter.duties.max} duties), then hold the seal. The Realm, Diplomacy and Armory tabs appear. If a ledger contract is still open, close it
            with its weigh-in first.
          </li>
          <li>
            <b>Seal a contract</b> on the Contract tab. A short one is the easy start.
          </li>
          <li>
            <b>Keep the ledger</b> in the Chronicle every day: tick your duties, log your food, and let steps sync (or type them).
          </li>
          <li>
            <b>Look at the map</b> on the Realm tab. Choose the hexes touching your land to see their garrisons, and assault one your companies can beat.
          </li>
          <li>
            <b>Weigh in once a week</b> in the Chronicle. It reminds you on the week’s last day.
          </li>
        </ol>
      )
    },
    {
      id: 'day',
      title: 'Every day',
      body: (
        <>
          <p>
            <b>In the Chronicle</b>, the day’s ledger sets its <b>Valor</b>: the share of duties kept, whether food was logged, and the week’s step pace. Valor decides how much of your
            army’s strength shows up in that day’s battles, so a kept day defends better than a missed one.
          </p>
          <p>
            <b>The Herald</b> (in the Chronicle and on the Realm) posts the day’s tidings: the threat coming, which hex it targets and roughly how strong it is.
          </p>
          <p>
            <b>The day’s orders</b> (on the Realm) name a hex to assault (a second from Castle Tier {numeral(RULES.castle.secondAssaultTier)}) and which companies go: each company
            either defends or assaults that day. If you set nothing, every company defends and nothing is assaulted. Orders lock at {dawn}.
          </p>
          <p>
            <b>Banners</b> cap how many companies fight in one battle; your castle sets them. For each defense the Marshal fields the defenders that hit hardest against that
            attacker. Tick <b>Always field</b> beside a company to make sure it fights in every defense that day; the Marshal fills the other banners.
          </p>
          <p>
            <b>At {dawn}</b> the day closes: battles are fought with the day’s Valor and daily reputation is paid. If the app was closed, it catches up on every missed day at its next
            launch, with no orders for those days.
          </p>
          <p>
            <b>The results</b> appear the next day under <b>Yesterday</b> in the Herald: each threat held or lost, and each assault taken or repulsed. The map changes color when a hex
            changes hands.
          </p>
        </>
      )
    },
    {
      id: 'week',
      title: 'Every week',
      body: (
        <p>
          At the week’s close the step pool and the calorie average are judged, Momentum pays for your weight trend, villages you hold pay tithes, village courtships are decided, the
          rivals take their turn, and the Crown’s Grace is checked.
        </p>
      )
    },
    {
      id: 'contracts',
      title: 'Contracts',
      body: (
        <>
          <p>
            A contract is a span of days during which you keep your Charter. It pays reputation on a smooth curve of how well you kept it: nothing at {pct(c.payoutCurve.start)}{' '}
            consistency or below, the full amount at {pct(c.payoutCurve.start + c.payoutCurve.span)}, and every point between pays the same. The score averages three pillars equally:
            steps against the weekly pool, food logged within the calorie limit, and duties kept.
          </p>
          <ul>
            <li>
              <b>Length:</b> {lengthUnlocks()}. Longer contracts pay more per day.
            </li>
            <li>
              <b>Start day:</b> any of the {c.startChoiceDays} days from the next dawn (or from the day after the running contract ends). A contract never starts partway through a day.
            </li>
            <li>
              <b>Pledge:</b> optional, up to {c.pledge.capPerDay} × the days in reputation. It comes back doubled at a perfect score, whole at about{' '}
              {pct(c.payoutCurve.start + c.payoutCurve.span / c.pledge.returnMultiplier)}, and not at all at {pct(c.payoutCurve.start)} or below.
            </li>
            <li>
              <b>One runs, one waits.</b> You can seal the next contract while one runs; it starts after.
            </li>
            <li>
              <b>Respite:</b> one Respite day is banked every {RULES.respite.earnEveryDays} days. Spending one on today or yesterday removes that day from the score and moves the end a day
              later, for illness or travel.
            </li>
            <li>
              <b>Withdrawing</b> ends a contract early: it pays for the days so far without the length bonus and returns half the pledge.
            </li>
          </ul>
          <p>The Charter can be revised between contracts. Each contract keeps the terms it was sealed with.</p>
        </>
      )
    },
    {
      id: 'purse',
      title: 'The purse',
      body: (
        <>
          <p>
            The gold seal at the top right is your purse. A campaign starts with {formatNumber(RULES.clock.foundingGrant)}. It fills from duties kept, perfect days and streaks (daily), the
            step pool, calorie average and Momentum (weekly), contracts (when they end), village tithes and battle spoils.
          </p>
          <p>
            It pays for building and castle tiers, Crossings, items, fortifications, courtships and trades. Under it are your Realm Consistency (the three pillars over the last 28 days)
            and your Crown’s Grace level.
          </p>
        </>
      )
    },
    {
      id: 'realm',
      title: 'The Realm',
      body: (
        <>
          <p>
            Your castle sits at the center with its four buildings around it; the rivals hold the far corners. Choose any hex to see who holds it, its garrison, and what you can do
            there. Every hex you take must touch land you already hold. Rings 0 to {RULES.land.protectedThroughRing} around the castle can never be taken from you.
          </p>
          <p>
            To see the hexes larger, scroll over the map or use its <b>+</b> and <b>−</b> buttons; drag to move around while zoomed in, and the third button shows the whole
            realm again.
          </p>
          <ul>
            <li>
              <b>Assault</b> a neighboring hex with your day’s orders. You take it if your assault beats its garrison at the close. A failed assault still wears the garrison down until
              the week closes.
            </li>
            <li>
              <b>Court the village</b> on a village hex: a reputation bid, decided at the week’s close (see Villages and courtships).
            </li>
            <li>
              <b>Buy the hex</b> from a rival who respects you enough.
            </li>
            <li>
              <b>Fortify</b> a hex you hold to make it harder to take (see Hex conditions).
            </li>
          </ul>
          <p>
            <b>Buildings</b> (below the map): the Barracks, Merchant Hall, Mage Tower and Foundry each climb {RULES.buildings.tierCost.length} tiers. A tier needs reputation and{' '}
            <b>Dominion</b>, which comes from land you hold in that building’s direction, so expanding feeds your buildings. Each tier strengthens the building’s company and adds a
            realm-wide effect. The castle’s tiers come from your building tiers; they add banners (how many companies fight at once), walls, and longer contracts.
          </p>
          <p>
            <b>Crossings</b> pair two buildings at Tier {numeral(RULES.crossings.stageBuildingTier[0])} and above into a hybrid company neither could field alone. <b>Army</b> lists
            every company and its power.
          </p>
        </>
      )
    },
    {
      id: 'battles',
      title: 'Battles',
      body: (
        <>
          <p>
            Every day one threat strikes a hex on your border: beasts, a mythic creature or a rival’s raid. Your defense is your fielded companies’ strength, plus walls, scaled by the
            day’s Valor; even a day with nothing kept fights at {pct(RULES.combat.rallyFloor.base)} (the rally floor, raised by the Barracks).
          </p>
          <ul>
            <li>
              <b>Win</b> and you earn spoils. <b>Lose</b> and you pay tribute and the hex is scorched for {RULES.combat.scorchedDays} days, but you keep it: a daily threat never takes
              land.
            </li>
            <li>
              <b>Match your companies to the enemy.</b> Each enemy is weak to some company types and resists others; a weakness strikes much harder.
            </li>
            <li>
              <b>Conquest attempts</b> come only from a rival at war with you, never before week {RULES.combat.noConquestBeforeWeek}. Losing one makes the hex Contested; hold it the next
              day or it passes to that rival.
            </li>
            <li>
              Threats strike weaker in weeks 1 to {firstThreatWeek}, while the realm finds its feet.
            </li>
          </ul>
          <p>
            <b>Grand Battles</b> are larger fights, announced days ahead (the crossed swords in the top bar). Use the warning to prepare, then fight on the Battle screen, or the Marshal
            fights for you at the close.
          </p>
        </>
      )
    },
    {
      id: 'hexes',
      title: 'Hex conditions',
      body: (
        <>
          <p>
            The key under the map shows each mark. Choose a hex to read its <b>Status</b> (with the last day it holds), its garrison, its fortification and, on a village, its loyalty.
          </p>
          <ul>
            <li>
              <b>Held</b> is the normal state.
            </li>
            <li>
              <b>Scorched</b> (flame): a threat beat your defense here. You paid tribute ({RULES.combat.tribute.perRing} × the ring in reputation, halved from the Crown’s Grace{' '}
              {graceII}) but kept the hex. It stays scorched for {RULES.combat.scorchedDays} days, longer if it loses again. A village still scorched when the week closes pays no tithe
              that week.
            </li>
            <li>
              <b>Contested</b> (torch): a rival at war with you won a conquest attempt on this hex. The same force strikes again at each close. You have{' '}
              {nextDays(RULES.combat.contestedDays.base)} to beat it ({nextDays(RULES.combat.contestedDays.graceII)} from the Crown’s Grace {graceII}): win and the attempt is broken
              and the hex is held again; lose and the hex passes to that rival. A Truce with that rival (in Diplomacy) calls the attempt off. Conquest attempts strike only ring{' '}
              {RULES.combat.conquestMinRing} and beyond; rings 0 to {land.protectedThroughRing} can never be taken.
            </li>
            <li>
              <b>Lost a hex?</b> From the Crown’s Grace {numeral(RULES.grace.reclaim.level)}, <b>Reclaim</b> on the hex buys back one lost in the last{' '}
              {RULES.grace.reclaim.windowDays} days for {pct(RULES.grace.reclaim.garrisonShare)} of its garrison, without a battle, while it still touches your land.
            </li>
            <li>
              <b>Settling</b> (on a village’s loyalty line): a village you took by assault or reclaimed. For {land.settling.weeks} weeks it pays{' '}
              {pct(land.settling.titheShare)} of its tithe, and its loyalty starts at {pct(land.villageLoyalty.afterConquestShare)}.
            </li>
            <li>
              <b>Fortified</b> (shield): each level adds {pct(land.garrison.fortificationPerLevel)} of the ring’s base garrison to the hex, in your defense against threats and conquest
              attempts. Levels 1 to {land.fortificationMax} cost {listed(land.fortificationCost)} × the ring. Fortification is lost when a hex changes hands. Rivals fortify their own
              hexes too, which raises the garrison your assault must beat.
            </li>
            <li>
              <b>Garrison</b>: what an assault must beat, shown on every hex you don’t hold. It grows with the ring, and a village’s militia is lighter than a beast den’s garrison. A
              repulsed assault wears {pct(land.repulseWear)} of its strength off the garrison until the week closes, so the next push on the same hex is easier.
            </li>
            <li>
              <b>Threat today</b> (crossed swords): the day’s threat strikes this hex. Its band (weaker, matched, stronger or overwhelming) compares it with your defense.
            </li>
            <li>
              <b>Assault target</b>, <b>Courting</b> and <b>Grand Battle</b>: today’s orders assault this hex; you have an open bid on this village; a Grand Battle is announced here.
            </li>
          </ul>
          <p>
            <b>Weary</b> marks companies, not hexes (in the orders and on the Army tab). Companies whose assault was repulsed fight {pct(land.weary.powerPenalty)} weaker{' '}
            {nextDays(land.weary.days)}; a company routed in a Grand Battle stays Weary for {RULES.grandBattles.wearyDaysAfterRout} days.
          </p>
        </>
      )
    },
    {
      id: 'villages',
      title: 'Villages and courtships',
      body: (
        <>
          <p>
            Each village you hold pays a <b>tithe</b> of {RULES.reputation.weekly.tithePerRing} × its ring in reputation at every week’s close. You can take a village by assault like any
            hex, but it is then Settling and half loyal. Courting wins it without a battle and at full loyalty. A rival’s <b>Gate</b> is a village too: it can’t be assaulted, only courted
            or won in a Grand Battle.
          </p>
          <ul>
            <li>
              <b>Loyalty</b> is how firmly a village holds to its owner: {inf.loyalty.neutralPerRing} × the ring for an unaligned village, {inf.loyalty.rivalPerRing} × the ring for a
              rival’s. Your own villages are at {inf.loyalty.neutralPerRing} × the ring once courted or bought; one taken by assault starts lower and recovers{' '}
              {pct(land.villageLoyalty.weeklyRecoveryShare)} of that each week.
            </li>
            <li>
              <b>Resistance</b> is what your Offer must reach for the village to change sides: its loyalty, doubled for a Gate. A rival also defends its own villages with a counter-bid
              you can’t see, so on a rival’s village the resistance shown is the least you need.
            </li>
            <li>
              <b>Trust</b> is how far the realm believes your word: {inf.trust.base} + {inf.trust.perRealmConsistency} × your Realm Consistency, from {inf.trust.min.toFixed(2)} to{' '}
              {inf.trust.max.toFixed(2)}. The Courtships panel in Diplomacy shows it.
            </li>
            <li>
              <b>Offer</b> = your bid × Trust. Steady habits raise Realm Consistency, so every bid goes further.
            </li>
          </ul>
          <p>
            <b>A courtship, step by step:</b>
          </p>
          <ol>
            <li>
              Choose a village touching your land: <b>Court the village</b> on its hex, or the Courtships panel in Diplomacy. The suggested bid is the one whose Offer meets the shown
              resistance at today’s Trust.
            </li>
            <li>
              The bid leaves your purse at once. You can court {slots.base} villages at a time, more from the Merchant Hall at Tier{slots.merchantHall.length > 1 ? 's' : ''}{' '}
              {listed(slots.merchantHall.map((m) => numeral(m.tier)))}.
            </li>
            <li>
              At the week’s close the village changes sides if your Offer reaches its resistance and no rival offers more. Rivals court unaligned villages too, at a Trust of{' '}
              {inf.rivalTrust.toFixed(2)}; a tie goes to you.
            </li>
            <li>
              <b>Won:</b> the village is yours at full loyalty and the whole bid is spent. Taking a rival’s village lowers its Respect for you.
            </li>
            <li>
              <b>Held:</b> {pct(inf.failedBid.refundShare)} of your bid comes back, and the village’s loyalty falls by {pct(inf.failedBid.loyaltyDropShareOfOffer)} of the highest
              Offer for good, so the next try costs less. If a rival wins it instead, {pct(inf.outbidRefundShare)} of your bid comes back.
            </li>
            <li>
              <b>Void:</b> if the village changes hands another way or stops touching your land, the whole bid comes back.
            </li>
          </ol>
          <p>
            <b>Example:</b> an unaligned village in ring {ex.ring} has loyalty {ex.loyalty}. At {ex.rc} Realm Consistency your Trust is {ex.trust}, so a bid of {ex.bid} makes an Offer of{' '}
            {amount(ex.offer)}, enough to win it. A bid of {ex.short.bid} (Offer {amount(ex.short.offer)}) falls short: the village holds, {amount(ex.short.back)} comes back, and its
            loyalty falls to {amount(ex.short.loyalty)}, so the next bid needs less.
          </p>
          <p>Past courtships and their results are listed in Diplomacy.</p>
        </>
      )
    },
    {
      id: 'diplomacy',
      title: 'Diplomacy',
      body: (
        <p>
          Each of the {rivals} rival courts shows how it regards you (its Respect) and what that Respect opens: truces, pacts, buying and selling hexes, and in time an Accord. Respect
          rises when you beat a rival’s raids, trade or make peace with it, and falls when you take its land or villages. Your open courtships are listed here too.
        </p>
      )
    },
    {
      id: 'weight',
      title: 'Your weight journey',
      body: (
        <>
          <p>
            <b>Momentum</b> pays each week for a steady trend toward your goal, up to a capped pace ({RULES.momentum.targetPace.capLb} lb a week by default). Losing faster never pays
            more. When habits stay strong through a plateau, Momentum still pays part.
          </p>
          <p>
            <b>Milestones:</b> the journey from your starting weight to your goal is split into {RULES.milestones.count} marks. Each one, once reached and its earliest week has come,
            opens something new: the Armory first, then building Wings, Elite companies and more items. A Milestone is never taken back.
          </p>
          <p>
            <b>The Crown’s Grace</b> rises with steady Momentum over the weeks (levels I to {numeral(RULES.grace.thresholds.length)}) and makes the world gentler: lost land is easier to
            take back (Reclaim, on the hex), lost battles cost less, and the rivals need longer to threaten you.
          </p>
        </>
      )
    },
    {
      id: 'winning',
      title: 'Winning and losing',
      body: (
        <>
          <p>
            <b>You win</b> by resolving all {rivals} rivals, each in whichever way you choose:
          </p>
          <ul>
            <li>
              <b>Conquest:</b> take its Gate, then its capital, each in a Grand Battle.
            </li>
            <li>
              <b>Defection:</b> win its villages until it holds none, at least half of them by courting or trade.
            </li>
            <li>
              <b>Accord:</b> raise its Respect to {RULES.respect.thresholds.accordTalks}, then keep {c.accord.days}-day Accord contracts (from Castle Tier{' '}
              {numeral(c.accord.castleTier)}) until its Respect reaches {c.accord.signedAtRespect}.
            </li>
          </ul>
          <p>
            <b>You can lose</b> only from week {RULES.defeat.ascendancy.fromWeek}, and only if a rival grows far stronger than you for weeks on end. Then it issues an Ultimatum, giving
            you {RULES.defeat.ascendancy.ultimatumDays} days to answer before it lays siege to the castle. The Herald warns you well before.
          </p>
        </>
      )
    },
    {
      id: 'keys',
      title: 'Keyboard',
      body: (
        <table className="guide__keys">
          <tbody>
            <tr>
              <td>
                <kbd>Ctrl</kbd>+<kbd>1</kbd> to <kbd>6</kbd>
              </td>
              <td>Switch pages</td>
            </tr>
            <tr>
              <td>
                <kbd>Esc</kbd>
              </td>
              <td>Open Settings, or close the open dialog</td>
            </tr>
            <tr>
              <td>
                <kbd>F1</kbd> or <kbd>?</kbd>
              </td>
              <td>This guide</td>
            </tr>
            <tr>
              <td>
                <kbd>M</kbd>
              </td>
              <td>Pause or play the music</td>
            </tr>
            <tr>
              <td>
                <kbd>←</kbd> <kbd>→</kbd> (with <kbd>Shift</kbd>: a week)
              </td>
              <td>Chronicle: the day before or after</td>
            </tr>
            <tr>
              <td>
                <kbd>T</kbd>, <kbd>S</kbd>, <kbd>C</kbd>
              </td>
              <td>Chronicle: today, type steps, type calories</td>
            </tr>
          </tbody>
        </table>
      )
    }
  ]

  const jump = (id: string): void => {
    body.current?.querySelector(`#guide-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <Modal open onClose={() => setOpen(false)} className="modal--guide" title="How to play" labelledBy="guide-title">
      <nav className="guide__toc" aria-label="Sections">
        {sections.map((s) => (
          <button key={s.id} type="button" className="guide__chip" onClick={() => jump(s.id)}>
            {s.title}
          </button>
        ))}
      </nav>
      <div className="guide" ref={body}>
        {sections.map((s) => (
          <section key={s.id} id={`guide-${s.id}`} className="guide__section">
            <h3 className="guide__title">{s.title}</h3>
            {s.body}
          </section>
        ))}
      </div>
    </Modal>
  )
}
