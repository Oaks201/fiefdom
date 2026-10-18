import { useRef, type ReactNode } from 'react'
import { WEEKDAYS } from '../lib/dates'
import { formatNumber } from '../lib/format'
import { rankThresholds } from '../lib/game/dominion'
import { numeral } from '../lib/game/effects'
import { trust } from '../lib/game/land'
import { RULES } from '../lib/game/rules'
import { RIVAL_IDS } from '../lib/game/types'
import { amount } from '../lib/game/view/refusals'
import { weekCloseView } from '../lib/game/view/shell'
import { useCampaignState, useCampaignToday } from '../state/campaignHooks'
import { useLedgerData } from '../state/hooks'
import { useUI } from '../state/ui'
import { weekCloseAt, weekCloseLeft } from './game/WeekClose'
import { Modal } from './Modal'

/** A share as a whole percent, e.g. 0.4 → "40%". */
const pct = (share: number): string => `${Math.round(share * 100)}%`

/** "the next day" or "the next 3 days". */
const nextDays = (n: number): string => (n === 1 ? 'the next day' : `the next ${n} days`)

/** [15, 35, 70] → "15, 35 and 70". */
const listed = (items: readonly (string | number)[]): string => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`)

const dawn = `${String(RULES.clock.dayCloseHour).padStart(2, '0')}:00`

/** The depth of the worked Dominion example: a hex this deep in a rival's march. */
const EXAMPLE_DEPTH = 6

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
  /** The section in one plain sentence, shown first. */
  lead: ReactNode
  body: ReactNode
}

interface Category {
  id: string
  title: string
  sections: Section[]
}

/**
 * How to play: a plain guide to the campaign, opened from the top bar or with F1 or ?. It is grouped
 * by what a player needs in order (start here; how habits pay; the realm; Dominion; war; the rivals;
 * winning and losing), and every section opens with one plain sentence. It is help text, not story:
 * no flavor, no spoilers past what the screens already show, and no hidden values (the rival
 * benchmark, rival income, event criteria, terms thresholds). Every number comes from `RULES`, so it
 * follows any retuning.
 */
export function HowToPlay(): React.JSX.Element | null {
  const open = useUI((s) => s.helpOpen)
  const setOpen = useUI((s) => s.setHelpOpen)
  const body = useRef<HTMLDivElement>(null)
  const campaign = useCampaignState()
  const campaignToday = useCampaignToday()
  const ledgerWeekStartsOn = useLedgerData().settings.weekStartsOn
  if (!open) return null

  // The campaign keeps the week it was founded with; without one, the ledger's setting.
  const weekStartsOn = campaign?.campaign.weekStartsOn ?? ledgerWeekStartsOn
  const firstDay = WEEKDAYS[weekStartsOn]
  const lastDay = WEEKDAYS[(weekStartsOn + RULES.clock.daysPerWeek - 1) % RULES.clock.daysPerWeek]
  const weighInDay = WEEKDAYS[RULES.clock.weighInWeekday]
  const thisWeek = campaignToday ? weekCloseView(weekStartsOn, campaignToday) : null

  const rivals = ['no', 'one', 'two', 'three', 'four', 'five', 'six'][RIVAL_IDS.length] ?? String(RIVAL_IDS.length)
  const c = RULES.contracts
  const firstThreatWeek = RULES.combat.earlyGrace[RULES.combat.earlyGrace.length - 1].throughWeek
  const land = RULES.land
  const inf = RULES.influence
  const graceII = numeral(RULES.effects.graceIILevel)
  const ex = courtshipExample()
  const slots = inf.courtshipSlots
  const sg = RULES.sieges
  const deeds = RULES.dominion.deeds
  const pm = RULES.personalities
  const pa = RULES.personalities.archmage
  const rp = RULES.dominion.rankPerks
  const strongholdRings = sg.stronghold.depths.map((d) => d + RULES.map.heartlandRings)
  const map = RULES.map
  const ranks = rankThresholds()
  const tierGates = RULES.buildings.tierDominion.flatMap((n, i) => (i === 0 ? [] : [`Tier ${numeral(i + 1)}: ${formatNumber(n)}`]))
  const pacing = RULES.world.resolution

  const categories: Category[] = [
    {
      id: 'start',
      title: 'Start here',
      sections: [
        {
          id: 'idea',
          title: 'The game in one minute',
          lead: (
            <>
              Keep your real habits, earn <b>reputation</b>, and spend it to grow a realm that outlasts {rivals} rival rulers.
            </>
          ),
          body: (
            <>
              <ol>
                <li>
                  <b>Your habits</b> (steps, food logged, daily duties, contracts kept and a steady weight trend) pay reputation, the realm’s one currency.
                </li>
                <li>
                  <b>How well you kept today</b> is your <b>Valor</b>: it decides how hard your army fights in today’s battles.
                </li>
                <li>
                  <b>Spend reputation</b> on buildings, companies, land and deals.
                </li>
                <li>
                  <b>Take land</b> hex by hex, outward from your castle into the rivals’ marches. Land and victories build your <b>Dominion</b>, which opens your buildings’
                  higher tiers and each rival’s path of perks.
                </li>
                <li>
                  <b>Resolve all {rivals} rivals</b> (conquer them, win them over, or accept their terms) to win.
                </li>
              </ol>
              <p>
                It runs on real days. Each day closes at {dawn}, and nothing can be fast-forwarded. The daily part takes a few minutes, and the ledger keeps working exactly as it
                did before.
              </p>
            </>
          )
        },
        {
          id: 'first',
          title: 'Your first week',
          lead: 'Five steps to get going.',
          body: (
            <ol>
              <li>
                <b>Found a campaign</b> from Settings (<kbd>Esc</kbd>), “Found a campaign…”: your weight today and your goal, your Charter (a weekly step pool, a daily calorie limit
                and {c.charter.duties.min} to {c.charter.duties.max} duties), then hold the seal. The Realm, Diplomacy and Armory tabs appear. If a ledger contract is still open,
                close it with its weigh-in first.
              </li>
              <li>
                <b>Seal a short contract</b> on the Contract tab.
              </li>
              <li>
                <b>Keep the ledger</b> in the Chronicle every day: tick your duties, log your food, and let steps sync (or type them).
              </li>
              <li>
                <b>Open the Realm</b> and choose a hex touching your land. Its panel shows its garrison and what you can do there; send companies to assault one they can beat.
              </li>
              <li>
                <b>Weigh in on {weighInDay}</b>. The Chronicle shows the weight box that day, and the week’s close reads it.
              </li>
            </ol>
          )
        }
      ]
    },
    {
      id: 'habits',
      title: 'Your habits pay',
      sections: [
        {
          id: 'day',
          title: 'Every day',
          lead: `Your habits set the day’s Valor; at ${dawn} the day’s battles are fought and the day is paid.`,
          body: (
            <>
              <ul>
                <li>
                  <b>Valor</b> comes from the day’s ledger: the share of duties kept, whether food was logged, and the week’s step pace. It decides how much of your army’s strength
                  shows up in today’s battles. Even a day with nothing kept fights at {pct(RULES.combat.rallyFloor.base)} (the rally floor).
                </li>
                <li>
                  <b>The Herald</b> (in the Chronicle and on the Realm) tells today’s threat, which hex it targets and roughly how strong it is, and yesterday’s results.
                </li>
                <li>
                  <b>The day’s orders</b> (on the Realm) name a hex to assault and which companies go. Every other company defends. Set nothing and the Marshal presses your standing
                  siege, if you have one. Orders lock at {dawn}, or once you start the day’s battles yourself.
                </li>
                <li>
                  <b>At {dawn}</b> the day closes: battles are fought at the day’s Valor and the day’s reputation is paid. If the app was closed, it catches up on every missed day the
                  next time you open it, with no orders for those days.
                </li>
              </ul>
            </>
          )
        },
        {
          id: 'week',
          title: 'Every week',
          lead: 'Once a week the realm settles its accounts.',
          body: (
            <>
              <p>
                The week runs {firstDay} to {lastDay} and closes at {dawn} on {firstDay} morning.{thisWeek && ` This week closes at ${weekCloseAt(thisWeek)} (${weekCloseLeft(thisWeek)}).`}{' '}
                At the close:
              </p>
              <ul>
                <li>the step pool and the calorie average are judged and paid;</li>
                <li>Momentum pays for your weight trend;</li>
                <li>villages you hold pay their tithes, and village courtships are decided;</li>
                <li>the rivals take their turn (they spend, build, court and plan attacks), and each one’s stance toward you is read;</li>
                <li>the Crown’s Grace is checked.</li>
              </ul>
            </>
          )
        },
        {
          id: 'purse',
          title: 'Reputation',
          lead: 'Reputation is the realm’s one currency: your habits earn it, your realm spends it.',
          body: (
            <>
              <p>
                The gold seal at the top right is your purse. A campaign starts with {formatNumber(RULES.clock.foundingGrant)}.
              </p>
              <ul>
                <li>
                  <b>It fills from</b> duties kept, perfect days and streaks (daily); the step pool, calorie average and Momentum (weekly); contracts (when they end); village tithes;
                  and battle spoils.
                </li>
                <li>
                  <b>It pays for</b> building and castle tiers, Crossings, items, fortifications, courtships, deals and bribes.
                </li>
                <li>
                  <b>Realm Consistency</b> (under the purse) is how steadily you kept your three pillars over the last {RULES.scores.realmConsistencyDays} days. It sets your{' '}
                  <b>Trust</b>, which makes every courtship bid go further.
                </li>
              </ul>
            </>
          )
        },
        {
          id: 'contracts',
          title: 'Contracts',
          lead: 'A contract is a promise to keep your Charter for a set number of days, paid on how well you kept it.',
          body: (
            <>
              <p>
                The score averages three pillars equally: steps against the weekly pool, food logged within the calorie limit, and duties kept. It pays on a smooth curve: nothing at{' '}
                {pct(c.payoutCurve.start)} or below, the full amount at {pct(c.payoutCurve.start + c.payoutCurve.span)}.
              </p>
              <ul>
                <li>
                  <b>Length:</b> {lengthUnlocks()}. Longer contracts pay more per day.
                </li>
                <li>
                  <b>Start day:</b> any of the {c.startChoiceDays} days from the next dawn (or from the day after the running contract ends). One runs and one can wait behind it.
                </li>
                <li>
                  <b>Pledge</b> (optional): up to {c.pledge.capPerDay} × the days in reputation. It comes back doubled at a perfect score, whole at about{' '}
                  {pct(c.payoutCurve.start + c.payoutCurve.span / c.pledge.returnMultiplier)}, and not at all at {pct(c.payoutCurve.start)} or below.
                </li>
                <li>
                  <b>Respite:</b> one Respite day is banked every {RULES.respite.earnEveryDays} days. Spending one on today or yesterday removes that day from the score and moves the
                  end a day later, for illness or travel.
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
          id: 'weight',
          title: 'Your weight journey',
          lead: 'A steady trend pays Momentum, passes Milestones that open the Armory, and raises the Crown’s Grace.',
          body: (
            <ul>
              <li>
                <b>Momentum</b> pays each week for a steady trend toward your goal, up to a capped pace ({RULES.momentum.targetPace.capLb} lb a week by default). Losing faster never
                pays more, and when your habits stay strong through a plateau it still pays part.
              </li>
              <li>
                <b>Milestones:</b> the journey from your starting weight to your goal is split into {RULES.milestones.count} marks. A weekly weigh-in at or below a mark reaches it, and
                each opens something new: the Armory first, then building Wings, Elite companies and more items. A Milestone is never taken back.
              </li>
              <li>
                <b>The Crown’s Grace</b> (levels I to {numeral(RULES.grace.thresholds.length)}) rises with steady Momentum and makes the world gentler: lost battles cost less, lost
                land is easier to take back, and the rivals need longer to threaten you.
              </li>
              <li>
                <b>The weigh-in log</b> in the Chronicle lists each week’s weigh-in and the Milestones reached.
              </li>
            </ul>
          )
        }
      ]
    },
    {
      id: 'realm',
      title: 'Your realm',
      sections: [
        {
          id: 'map',
          title: 'The map',
          lead: `Your castle sits at the center; ${rivals} rival marches run out to the corners, with two wild lairs between them.`,
          body: (
            <>
              <ul>
                <li>
                  <b>The heartland</b> (rings 0 to {map.heartlandRings}) is your castle and its four buildings. Rings 0 to {land.protectedThroughRing} can never be taken from you.
                </li>
                <li>
                  <b>A rival’s march</b> runs out along his road, {map.marchHalfWidth * 2 + 1} hexes wide and {map.marchDepth} deep: his Gate at the far end and his capital beyond.
                  He holds the outer part of it from the start. A hex’s <b>depth</b> is how far out it lies (its ring less {map.heartlandRings}); deeper hexes are stronger and worth
                  more.
                </li>
                <li>
                  <b>The two lairs</b>, the Thornwild and the Wyrmfells, fill the gaps between marches, {map.lairDepth} deep, with a Lair Mouth at the end. Beasts and mythic creatures
                  live there; no rival rules them.
                </li>
                <li>
                  <b>Seams</b>, the hexes where two marches meet, belong to both, half each.
                </li>
                <li>
                  <b>The highlands and the sea</b> around the marches are scenery: nothing there can be taken.
                </li>
              </ul>
              <p>
                <b>Moving around:</b> scroll over the map or use its <b>+</b> and <b>−</b> buttons to zoom, and drag to move while zoomed in. Zoomed all the way out is the{' '}
                <b>realm view</b>: each hex in its holder’s color, unclaimed land in a pale tint of its march, and each march named. Choose any hex to see its panel: who holds it,
                its garrison, what holding it adds to your Dominion, and every action open there today.
              </p>
            </>
          )
        },
        {
          id: 'buildings',
          title: 'Buildings, castle and army',
          lead: 'Buildings and the castle turn reputation and Dominion into stronger companies and realm-wide effects.',
          body: (
            <ul>
              <li>
                <b>Four buildings</b> stand around your castle: the Barracks, Merchant Hall, Mage Tower and Foundry, each on the road to one rival (see Dominion). Each climbs{' '}
                {RULES.buildings.tierCost.length} tiers. A tier costs reputation and needs enough total Dominion. Each tier strengthens the building’s own company and adds a
                realm-wide effect. Tiers are never lost.
              </li>
              <li>
                <b>The castle</b>’s tiers open as your building tiers add up, and are bought with reputation. They add <b>banners</b> (how many companies fight in one battle: {listed(RULES.castle.banners)}), walls for
                every defense, longer contracts, and a second daily assault at Castle Tier {numeral(RULES.castle.secondAssaultTier)}.
              </li>
              <li>
                <b>Crossings</b> pair two buildings at Tier {numeral(RULES.crossings.stageBuildingTier[0])} and above into a hybrid company neither could field alone.
              </li>
              <li>
                <b>Companies</b> are your army. Each has a power and a type; the Army list shows them all. The <b>Armory</b>, opened by your first Milestone, sells items that make
                them stronger.
              </li>
            </ul>
          )
        },
        {
          id: 'hexes',
          title: 'Reading a hex',
          lead: 'What each mark on the map means. The key under the map shows them all.',
          body: (
            <>
              <ul>
                <li>
                  <b>Garrison</b>: what an assault must beat, shown on every hex you don’t hold. It grows with depth.
                </li>
                <li>
                  <b>Scorched</b> (flame): a threat beat your defense here. You paid tribute ({RULES.combat.tribute.perRing} × the ring, halved from the Crown’s Grace {graceII}) but
                  kept the hex. It stays scorched for {RULES.combat.scorchedDays} days; a scorched village pays no tithe that week.
                </li>
                <li>
                  <b>Contested</b> (torch): a rival won a conquest attempt here. You have {nextDays(RULES.combat.contestedDays.base)} to beat it (
                  {nextDays(RULES.combat.contestedDays.graceII)} from the Crown’s Grace {graceII}): win and the hex is safe; lose and it passes to that rival.
                </li>
                <li>
                  <b>Fortified</b> (shield): each level adds {pct(land.garrison.fortificationPerLevel)} of the hex’s base garrison to its defense. Levels 1 to{' '}
                  {land.fortificationMax} cost {listed(land.fortificationCost)} × the ring. A hex loses its fortification when it changes hands.
                </li>
                <li>
                  <b>Settling</b> (on a village): taken by assault or reclaimed. For {land.settling.weeks} weeks it pays {pct(land.settling.titheShare)} of its tithe, and its loyalty
                  starts at {pct(land.villageLoyalty.afterConquestShare)}.
                </li>
                <li>
                  <b>Under siege</b> (siege tower, with a bar for how worn), <b>Stronghold</b> (stone tower) and <b>Fallen back</b> (return arrow): see Taking land.
                </li>
                <li>
                  <b>Threat today</b> (crossed swords), <b>Assault target</b>, <b>Courting</b> and <b>Grand Battle</b> (horn) mark today’s plans and dangers.
                </li>
              </ul>
              <p>
                <b>Lost a hex?</b> From the Crown’s Grace {numeral(RULES.grace.reclaim.level)}, <b>Reclaim</b> on the hex buys back one lost in the last{' '}
                {RULES.grace.reclaim.windowDays} days for {pct(RULES.grace.reclaim.garrisonShare)} of its garrison, while it still touches your land.
              </p>
            </>
          )
        }
      ]
    },
    {
      id: 'dominion',
      title: 'Dominion',
      sections: [
        {
          id: 'dominion',
          title: 'What Dominion is',
          lead: 'Dominion measures how far you have carried your war to each rival. It opens your buildings’ higher tiers, and each rival’s path of perks.',
          body: (
            <>
              <p>
                <b>Four paths, one for each rival.</b> Each path belongs to the building on that rival’s road: the Orc’s to the Barracks, the Goblin’s to the Merchant Hall, the
                Dwarf’s to the Foundry, the Archmage’s to the Mage Tower. A path’s Dominion is two things added together:
              </p>
              <ul>
                <li>
                  <b>Holdings</b>, the land you hold now. Each hex is worth its depth ({RULES.dominion.heartlandHolding} in the heartland), on the path of the march it lies in: a lair
                  hex or a seam counts half on each of its two paths. Holdings rise when you take land and fall when you lose it.
                </li>
                <li>
                  <b>Renown</b>, the deeds you have done. Every hex taken, battle won and rival resolved adds Renown to its path, and Renown is never lost.
                </li>
              </ul>
              <p>
                <b>Example:</b> take a hex at depth {EXAMPLE_DEPTH} of the Orc’s march and the Orc’s path gains {EXAMPLE_DEPTH * deeds.hexTakenPerDepth} Renown for good, plus{' '}
                {EXAMPLE_DEPTH} Holdings for as long as you hold it.
              </p>
              <p>
                <b>Where to see it:</b> each building’s card under the map shows its path’s Dominion and rank; open it for the Renown, the Holdings and the next rank. A hex’s panel
                shows what holding it would add to each path.
              </p>
            </>
          )
        },
        {
          id: 'gates',
          title: 'Building tiers and path ranks',
          lead: 'Your total Dominion opens building tiers; each path’s own Dominion raises its rank.',
          body: (
            <>
              <ul>
                <li>
                  <b>Building tiers</b> need total Dominion (all four paths added): {listed(tierGates)}. Grow anywhere to build anywhere.
                </li>
                <li>
                  <b>Path ranks</b> I to V come from each path’s own Dominion: {listed(ranks.map((t, i) => `${numeral(i + 1)} at ${formatNumber(t)}`))}. A rank, once reached, never
                  falls, even if you lose the land.
                </li>
                <li>
                  <b>Focus or spread:</b> walk one path deep for its rank V capstone, or several halfway for their rank III perks. Ignored marches harden while you’re away (see The
                  rivals).
                </li>
              </ul>
              <p>
                <b>Each path’s perks</b>: every rank adds a step, and ranks III and V add more.
              </p>
              <ul>
                <li>
                  <b>The Orc’s</b> (Barracks): the rally floor +{pct(rp.orc.rallyFloor)} and Weary {pct(rp.orc.wearyEase)} lighter a rank; at III a Grand Battle’s Weary lasts{' '}
                  {rp.orc.grandWearyDays} day less; at V no company is made Weary by a repulsed assault.
                </li>
                <li>
                  <b>The Goblin’s</b> (Merchant Hall): Trust +{rp.goblin.trust} and bribes and trades {pct(rp.goblin.prices)} cheaper a rank; at III your holds against his bids count
                  ×{rp.goblin.holdMult}; at V one more courtship.
                </li>
                <li>
                  <b>The Dwarf’s</b> (Foundry): each repulse wears {pct(rp.dwarf.repulseWear)} more off a garrison, walls count {pct(rp.dwarf.fortificationCut)} less against your
                  assault, and every defense gains {rp.dwarf.walls} wall a rank; at III your siege wear fades half as fast; at V a stronghold counts ×{rp.dwarf.strongholdMult}.
                </li>
                <li>
                  <b>The Archmage’s</b> (Mage Tower): at I tomorrow’s surge is foretold; mythics and surge strikes {pct(rp.archmage.mythicCut)} weaker a rank; at III no curse lands on
                  your companies; at V, once a week, bend a foretold swell into an ebb (on its hex’s panel).
                </li>
              </ul>
            </>
          )
        },
        {
          id: 'deeds',
          title: 'Earning Renown',
          lead: 'Every deed against a rival, or in his march, adds Renown to his path for good.',
          body: (
            <>
              <ul>
                <li>
                  <b>Taking a hex:</b> its depth, +{deeds.perFortification} for each fortification level it had. A stronghold adds {deeds.strongholdPerDepth} × its depth more.
                </li>
                <li>
                  <b>Battles:</b> a rival’s attack beaten {deeds.battleWon}; beasts {deeds.heldAgainstBeasts} and a mythic {deeds.heldAgainstMythic} (on the hex’s paths); a
                  counterattack held {deeds.counterattackHeld}; a Grand Battle won {deeds.grandBattleWon}.
                </li>
                <li>
                  <b>Resolving a rival:</b> {deeds.resolved} on his path.
                </li>
              </ul>
              <p>
                <b>Each rival’s own deeds</b> count too, on his path alone:
              </p>
              <ul>
                <li>
                  <b>The Orc:</b> every battle with him, a loss too ({deeds.battleLost}); a hex he took from you, taken back ({deeds.retaken}).
                </li>
                <li>
                  <b>The Goblin:</b> a hex of his march won by a deal or bribe ({deeds.dealTakenPerDepth} × its depth); a bribe paid below the garrison it bought ({deeds.bargain});
                  his bid for your village held ({deeds.bribeBeaten}); a courtship won against his bid ({deeds.counterBidBeaten}).
                </li>
                <li>
                  <b>The Dwarf:</b> each wall level broken ({deeds.wallsBroken}); each repulse a siege of his endured, up to {deeds.siegeEnduredCap} ({deeds.siegeEndured} each); his
                  conquest attempt beaten ({deeds.siegeBroken}).
                </li>
                <li>
                  <b>The Archmage:</b> a surge strike held ({deeds.surgeWeathered}); a hex taken on its ebb ({deeds.surgeSeized}); a Ritual endured ({deeds.ritualEndured}); a summoned
                  mythic beaten ({deeds.summonedDefeated}).
                </li>
              </ul>
            </>
          )
        }
      ]
    },
    {
      id: 'war',
      title: 'War',
      sections: [
        {
          id: 'defending',
          title: 'Defending',
          lead: 'Every day something attacks your border. Your Valor decides how hard you hit back.',
          body: (
            <>
              <p>
                Each day one threat strikes a hex on your border: beasts, a mythic creature, or a rival’s raid. Your defense is your fielded companies’ strength plus walls, scaled by
                the day’s Valor. Threats strike weaker in weeks 1 to {firstThreatWeek}, while the realm finds its feet.
              </p>
              <ul>
                <li>
                  <b>Win</b> and you earn spoils. <b>Lose</b> and you pay tribute and the hex is scorched for {RULES.combat.scorchedDays} days, and you usually keep it. Only a heavy
                  defeat by beasts or a mythic can return a hex beyond the heartland to the wilds (never in the Dwarf’s march).
                </li>
                <li>
                  <b>Match your companies to the enemy.</b> Each enemy is weak to some company types and resists others. For each defense the Marshal fields the companies that hit it
                  hardest; tick <b>Always field</b> beside a company to make sure it fights in every defense that day.
                </li>
                <li>
                  <b>Conquest attempts</b> come only from a rival at war with you, never before week {RULES.combat.noConquestBeforeWeek}. Losing one makes the hex Contested.
                </li>
                <li>
                  <b>Weary:</b> companies whose assault was repulsed fight {pct(land.weary.powerPenalty)} weaker {nextDays(land.weary.days)}; one routed in a Grand Battle stays Weary
                  for {RULES.grandBattles.wearyDaysAfterRout} days.
                </li>
              </ul>
              <p>
                <b>Lead the battles yourself:</b> <b>Start today’s battles</b> (in the Chronicle and in the day’s orders) lets you fight the day’s battles as short{' '}
                {RULES.skirmish.rounds}-round fights on the battle field. It locks your Valor so far and the day’s orders; until you open a battle, <b>Undo start</b> unlocks them
                again (not under the Veil of Fog). A fight you finish replaces the close’s result; one you leave
                is finished by the Marshal at {dawn}; one you never open is fought at the close as usual. If you never press it, the day closes exactly as before.
              </p>
            </>
          )
        },
        {
          id: 'taking',
          title: 'Taking land',
          lead: 'Take land one hex at a time, always touching what you hold: assault it, keep up a siege, or win it without a fight.',
          body: (
            <>
              <ul>
                <li>
                  <b>Assault:</b> name a neighboring hex in the day’s orders. You take it at the close if your assault beats its garrison.
                </li>
                <li>
                  <b>Siege:</b> a failed assault wears {pct(land.repulseWear)} of its strength off the garrison, and the wear stays (it fades {pct(sg.wearDecay.perDay)} a day while you
                  leave the hex alone). Keep pressing and it falls. The Herald reports a <b>Breach</b> when the same assault would now take it. <b>Lay siege</b> on a hex makes it your
                  standing siege: on days you set no orders, the Marshal presses it for you.
                </li>
                <li>
                  <b>Flanking:</b> each hex you hold touching the target, beyond the first, adds {pct(sg.flanking.perNeighbor)} to your assault there, up to{' '}
                  {pct(sg.flanking.perNeighbor * sg.flanking.maxNeighbors)}.
                </li>
                <li>
                  <b>Strongholds</b> (stone tower) guard each rival’s march at rings {listed(strongholdRings)}. A stronghold’s garrison counts {sg.stronghold.garrisonMult} × until you
                  hold it, and while it stands your assault can’t reach deeper into its march (those hexes are marked Barred). Take it by siege, or challenge it to a Grand Battle from
                  its panel.
                </li>
                <li>
                  <b>Without a fight:</b> court a village (see Villages), bribe a hex in the Goblin’s march, or buy one from a rival who respects you enough.
                </li>
              </ul>
              <p>
                <b>Beaten garrisons fall back.</b> Take a hex without routing its garrison and part of it ({pct(sg.fallback.share)} of what you beat) falls back to a neighboring hex,
                making it harder for {sg.fallback.days} days. In the lairs it may strike back at the hex it lost: hold it for spoils, or lose it and the hex goes back at once. In the
                rivals’ marches each rival’s garrisons behave his own way (see The rivals).
              </p>
            </>
          )
        },
        {
          id: 'grand',
          title: 'Grand Battles',
          lead: 'The big fights, announced days ahead: Gates, capitals, strongholds, hunts and invasions.',
          body: (
            <>
              <p>
                A Grand Battle is announced days before it is fought; the crossed swords in the top bar count down. You call some yourself (a rival’s Gate or capital, a stronghold);
                others come to you (a rival’s invasion, a mythic’s hunt, the Orc’s Warhost, a coalition’s offensive).
              </p>
              <ul>
                <li>
                  <b>Prepare:</b> use the warning to strengthen your army and choose your formation on the Battle screen.
                </li>
                <li>
                  <b>Fight it</b> round by round on the Battle screen, playing an Order each round, or leave it and the Marshal fights it for you at the close.
                </li>
                <li>
                  <b>Win</b> and you take what you fought for (a Gate, a capital, a stronghold) or drive the enemy off with spoils; <b>lose</b> and you may lose a hex or pay tribute.
                </li>
              </ul>
            </>
          )
        }
      ]
    },
    {
      id: 'rivals',
      title: 'The rivals',
      sections: [
        {
          id: 'marches',
          title: 'The four rivals',
          lead: 'Four rulers, each fighting his own way. His march plays by his rules.',
          body: (
            <>
              <p>
                A rival’s rules cover every hex of his march you don’t hold, the wilds and villages included. A seam follows whichever march rules it that day. The lairs and your
                heartland keep the common rules. What makes a march harder starts in week {pm.fromWeek}.
              </p>
              <ul>
                <li>
                  <b>The Orc</b> wars without rest. A garrison beaten in his march strikes back at once, and harder ({pct(pm.orc.counterMult)} of a usual counterattack), and his raids
                  come at his march most. His <b>war track</b> ({pm.orc.track.min} to +{pm.orc.track.max}, on his court) moves a step your way on a day you win more battles with him
                  than you lose, and his way on a day you lose more. Each step your way his strikes are {pct(pm.orc.track.strikePerStep)} weaker and his march’s garrisons{' '}
                  {pct(pm.orc.track.garrisonPerStep)} easier; his way, stronger and harder, and from {pm.orc.track.extraConquestAt} he plans an extra conquest attempt.
                </li>
                <li>
                  <b>The Goblin</b> sells. Any hex of his march you could assault has a <b>bribe</b> price on its panel: pay it and the hex is yours at once. His greed (fair, dear or
                  gouging) rises when you take his march by force. From week {pm.goblin.villageBid.fromWeek} he bids for one of your villages in his march each week; <b>Hold</b> it with
                  reputation before the week closes. His beaten garrisons may offer to buy back the hex they lost.
                </li>
                <li>
                  <b>The Dwarf</b> is slow but steady. He walls the wilds of his march that face you, siege wear there fades only {pct(pm.dwarf.wearDecay)} a day, his beaten garrisons
                  dig in and never strike back, and a hex you take from him is never lost to the wilds.
                </li>
                <li>
                  <b>The Archmage</b> works wild magic: each day one surge lands in his march. A garrison swells (×{pa.swell}) or ebbs (×{pa.ebb}) for the day, a mythic is summoned for{' '}
                  {pa.summonDays} days, one of your companies is blessed or cursed ({pct(pa.companyShare)} for the day), or a surge strikes one of your hexes there. The Herald tells the
                  day’s surge; Mage Tower Tier {numeral(RULES.buildings.mageTower.foresight.tier)}, or his path at rank I, shows tomorrow’s.
                </li>
              </ul>
              <p>
                <b>Ignored marches harden.</b> In a week you push some marches (take or assault a hex there), each march you left alone gains a level, up to{' '}
                {RULES.marches.preparation.max}, and each level makes its garrisons {pct(RULES.marches.preparation.perLevel)} stronger; a week you push a march lowers it. Each rival also prepares his own way: the Dwarf adds a wall, the Orc’s
                Warhost comes sooner, the Goblin grows greedier, the Archmage’s surges grow stronger.
              </p>
            </>
          )
        },
        {
          id: 'villages',
          title: 'Villages and courtships',
          lead: 'Villages pay you every week. Court them with reputation to win them without a fight.',
          body: (
            <>
              <p>
                Each village you hold pays a <b>tithe</b> of {RULES.reputation.weekly.tithePerRing} × its ring at every week’s close. You can take a village by assault, but it is then
                Settling and half loyal. Courting wins it at full loyalty. A rival’s Gate is a village too, but only courtship or a Grand Battle wins it.
              </p>
              <ul>
                <li>
                  <b>Your Offer</b> is your bid × your <b>Trust</b> ({inf.trust.base} + {inf.trust.perRealmConsistency} × your Realm Consistency, from {inf.trust.min.toFixed(2)} to{' '}
                  {inf.trust.max.toFixed(2)}). Steady habits make every bid go further.
                </li>
                <li>
                  <b>Resistance</b> is what your Offer must reach: the village’s loyalty ({inf.loyalty.neutralPerRing} × the ring unaligned, {inf.loyalty.rivalPerRing} × the ring for a
                  rival’s), doubled for a Gate. A rival also defends its villages with a bid you can’t see.
                </li>
                <li>
                  <b>How it goes:</b> choose <b>Court the village</b> on its hex (the suggested bid meets the resistance at today’s Trust). The bid leaves your purse at once, and it is
                  decided at the week’s close. You can court {slots.base} villages at a time, more from the Merchant Hall at Tier
                  {slots.merchantHall.length > 1 ? 's' : ''} {listed(slots.merchantHall.map((m) => numeral(m.tier)))}.
                </li>
                <li>
                  <b>Won:</b> the village is yours and the bid is spent. <b>Held:</b> {pct(inf.failedBid.refundShare)} of your bid comes back and the village’s loyalty falls for good,
                  so the next try costs less. <b>Void</b> (it changed hands another way): the whole bid comes back.
                </li>
              </ul>
              <p>
                <b>Example:</b> an unaligned village in ring {ex.ring} has loyalty {ex.loyalty}. At {ex.rc} Realm Consistency your Trust is {ex.trust}, so a bid of {ex.bid} makes an
                Offer of {amount(ex.offer)}, enough to win it. A bid of {ex.short.bid} (Offer {amount(ex.short.offer)}) falls short: {amount(ex.short.back)} comes back and its loyalty
                falls to {amount(ex.short.loyalty)}.
              </p>
            </>
          )
        },
        {
          id: 'diplomacy',
          title: 'Diplomacy and Respect',
          lead: 'Each court’s Respect for you runs both ways: it opens deals, pacts and, in time, an Accord, and as it falls it brings war.',
          body: (
            <ul>
              <li>
                <b>Respect</b> runs from {RULES.respect.min} to +{RULES.respect.max} on each court, and every ruler starts at {RULES.rivals.start.respect}. It rises and falls with
                what that ruler values. Beating his raids and other attacks raises it (+{RULES.respect.change.raidDefeated}), losing to them lowers it ({RULES.respect.change.raidLost}),
                taking his land lowers it ({RULES.respect.change.hexConquered}; the Orc, who respects force, {RULES.respect.byRival.orc.hexConquered}), and each ruler prizes one
                habit of yours (+{RULES.respect.change.prizedWeek} a week). The Orc also counts every Grand Battle against him (+{RULES.respect.byRival.orc.grandBattleWon} won,{' '}
                {RULES.respect.byRival.orc.grandBattleLost} lost) and gives nothing for a Truce. The Goblin likes your coin: a bribe +{RULES.respect.byRival.goblin.bribePaid}, a
                buy-off taken +{RULES.respect.byRival.goblin.buyOffAccepted}, refused {RULES.respect.byRival.goblin.buyOffRefused}, his bid for a village held off{' '}
                {RULES.respect.byRival.goblin.bidHeld}. The Dwarf honors a pact kept to its end (+{RULES.respect.byRival.dwarf.pactKept}) and resents each wall of his you break (
                {RULES.respect.byRival.dwarf.wallBroken}). The Archmage values constancy: +{RULES.respect.byRival.archmage.constantWeek} a week at Realm Consistency{' '}
                {Math.round(RULES.respect.constantWeekAt * 100)}% or more, +{RULES.respect.byRival.archmage.surgeHeld} for a surge strike held, +
                {RULES.respect.byRival.archmage.ritualEndured} for a Ritual endured. Weight never counts.
              </li>
              <li>
                <b>Its marks</b> open more as it rises: weaker raids ({RULES.respect.thresholds.raidsWeaker}), pacts ({RULES.respect.thresholds.pact}), envoys and Peace (
                {RULES.respect.standing.peace}), Accord talks ({RULES.respect.thresholds.accordTalks}), calls to arms ({RULES.respect.thresholds.callToArms}), an easier Accord (
                {RULES.respect.thresholds.accordEasier}),
                and each ruler’s own perk at +{RULES.respect.own.up}. As it falls they bring worse: War ({RULES.respect.standing.war}), stronger raids (
                {RULES.respect.raidsStrongerAt}) and each ruler’s own threat at {RULES.respect.own.down}. Each court lists its marks and what they bring.
              </li>
              <li>
                <b>Peace, Tension or War</b> (beside each ruler’s name) follows his Respect, read at each week close. <b>War</b> at {RULES.respect.standing.war} or below, or while
                he stands in a coalition against you: raids and conquest attempts. <b>Peace</b> at {RULES.respect.standing.peace} or above: no raids and no conquest attempts. The
                Orc never makes peace. <b>Tension</b> between: raids only. A Truce, which stops his raids for a while, is open at any Respect.
              </li>
              <li>
                <b>Deals</b> (choose a court): Truces, pacts, buying and selling hexes. Each shows what it costs and needs.
              </li>
              <li>
                <b>Stance:</b> from week {RULES.terms.fromWeek} each court shows how near its ruler is to yielding: Defiant, Wary, Shaken or Ready to yield. The Herald’s rumors say what
                he watches; no number is shown.
              </li>
            </ul>
          )
        },
        {
          id: 'terms',
          title: 'Terms',
          lead: 'Push a rival far enough and he offers terms, each in his own way. Accept them, or refuse and fight on.',
          body: (
            <>
              <ul>
                <li>
                  <b>The Goblin</b> first tries to buy his way out (a hex, an item or hired companies, for a {RULES.terms.goblin.pactWeeks}-week pact to leave his march alone), then
                  offers to surrender.
                </li>
                <li>
                  <b>The Archmage</b> surrenders when he fears for his life: when you hold his Gate, or your army and victories frighten him enough.
                </li>
                <li>
                  <b>The Dwarf</b> surrenders, grudgingly, once you hold about two thirds of his march. His villages stay restless for {RULES.terms.dwarf.restlessWeeks} weeks.
                </li>
                <li>
                  <b>The Orc</b> never yields. When he is ready, he comes at you in one last battle: his whole army against your border, or Ugrak’s Challenge if he respects you. Win it
                  and he is conquered; lose and he comes again later.
                </li>
              </ul>
              <p>
                Offers appear as a banner in Diplomacy and stay open {RULES.worldAi.offerDays} days. A surrender gives you the rival’s land and resolves him; a refused offer comes back
                later.
              </p>
            </>
          )
        }
      ]
    },
    {
      id: 'end',
      title: 'Winning and losing',
      sections: [
        {
          id: 'winning',
          title: 'Winning and losing',
          lead: `Resolve all ${rivals} rivals to win. You can only lose to a rival that grows far stronger than you.`,
          body: (
            <>
              <p>
                <b>Resolve each rival</b> in whichever way suits you:
              </p>
              <ul>
                <li>
                  <b>Conquest:</b> take his Gate, then his capital, each in a Grand Battle.
                </li>
                <li>
                  <b>Terms:</b> accept his surrender, or win the Orc’s last battle.
                </li>
                <li>
                  <b>Accord</b> (never the Orc): raise his Respect to {RULES.respect.thresholds.accordTalks}, then keep {c.accord.days}-day Accord contracts (from Castle Tier{' '}
                  {numeral(c.accord.castleTier)}) until his Respect reaches {c.accord.signedAtRespect}.
                </li>
                <li>
                  <b>Defection</b> (never the Orc): win his villages until he holds none, at least half of them by courting or trade.
                </li>
              </ul>
              <p>
                The realm can resolve only one rival at a time: none before week {pacing.notBeforeWeek}, then at most one every {pacing.oncePerWeeks} weeks.
              </p>
              <p>
                <b>You can lose</b> only from week {RULES.defeat.ascendancy.fromWeek}, and only if a rival grows far stronger than you for weeks on end. He then issues an Ultimatum,
                giving you {RULES.defeat.ascendancy.ultimatumDays} days before he lays siege to your castle. The Herald warns you well before.
              </p>
            </>
          )
        },
        {
          id: 'keys',
          title: 'Keyboard',
          lead: 'Shortcuts.',
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
    }
  ]

  const jump = (id: string): void => {
    body.current?.querySelector(`#guide-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <Modal open onClose={() => setOpen(false)} className="modal--guide" title="How to play" labelledBy="guide-title">
      <nav className="guide__toc" aria-label="Contents">
        {categories.map((cat) => (
          <div key={cat.id} className="guide__group">
            <span className="guide__group-title">{cat.title}</span>
            <span className="guide__chips">
              {cat.sections.map((s) => (
                <button key={s.id} type="button" className="guide__chip" onClick={() => jump(s.id)}>
                  {s.title}
                </button>
              ))}
            </span>
          </div>
        ))}
      </nav>
      <div className="guide" ref={body}>
        {categories.map((cat) => (
          <div key={cat.id} className="guide__category">
            <h2 className="guide__category-title">{cat.title}</h2>
            {cat.sections.map((s) => (
              <section key={s.id} id={`guide-${s.id}`} className="guide__section">
                <h3 className="guide__title">{s.title}</h3>
                <p className="guide__lead">{s.lead}</p>
                {s.body}
              </section>
            ))}
          </div>
        ))}
      </div>
    </Modal>
  )
}
