import { GiBootPrints, GiHealthPotion, GiKnifeFork, GiLaurelCrown, GiScales, GiSwordman } from 'react-icons/gi'
import { diffDays } from '../../lib/dates'
import { formatNumber, formatRep } from '../../lib/format'
import { snapshotDay, toDayRecord } from '../../lib/game/ledgerDays'
import { charterOn } from '../../lib/game/settle'
import type { CampaignState, ISODate } from '../../lib/game/types'
import { calorieWeek, dayEarned, dayProjection, healerCards, liveWeek, stepPace, valorParts, weighInPrompt } from '../../lib/game/view/chronicle'
import { percent } from '../../lib/game/view/shell'
import { weighIns } from '../../lib/ledger'
import type { Ledger } from '../../lib/types'
import { WaxSeal } from '../WaxSeal'

/** The week's pace toward the step pool and its calorie average against the limit (Ch 2, Ch 4). */
export function CampaignWeek({ campaign, ledger, date }: { campaign: CampaignState; ledger: Ledger; date: ISODate }): React.JSX.Element {
  const charter = charterOn(campaign, date)
  const days = liveWeek(campaign, ledger, date)
  const pace = stepPace(days, charter.stepPool, date, campaign.campaign.weekStartsOn, campaign.campaign.startDate)
  const cal = calorieWeek(days, charter.calorieLimit, campaign.weight.healerFloor ?? 0, date, campaign.campaign.weekStartsOn, campaign.campaign.startDate)
  const fill = Math.min(1, pace.walked / pace.pool)
  const mark = Math.min(1, pace.expected / pace.pool)
  const span = Math.max(cal.limit * 1.2, cal.average ?? 0)
  return (
    <section className="panel campaign-week" aria-label="This week">
      <div className="weekbar">
        <h4 className="weekbar__title">
          <GiBootPrints aria-hidden="true" /> Steps this week
        </h4>
        <div className="weekbar__track" style={{ ['--fill' as string]: fill, ['--mark' as string]: mark }}>
          <span className="weekbar__mark" title="Even pace so far" />
        </div>
        <p className="weekbar__text">
          <strong>{formatNumber(pace.walked)}</strong> of {formatNumber(pace.expected)} expected by today ({formatNumber(pace.pool)} for the week) ·{' '}
          <span className={`pace pace--${pace.status}`}>{pace.status === 'ahead' ? 'ahead' : 'behind'}</span>
        </p>
      </div>
      <div className="weekbar">
        <h4 className="weekbar__title">
          <GiKnifeFork aria-hidden="true" /> Calories this week
        </h4>
        <div className="weekbar__track weekbar__track--calories" style={{ ['--fill' as string]: cal.average === null ? 0 : Math.min(1, cal.average / span), ['--mark' as string]: cal.limit / span, ['--floor' as string]: cal.floor / span }}>
          <span className="weekbar__mark" title="The limit" />
          {cal.floor > 0 && <span className="weekbar__floor" title="The Healer’s floor" />}
        </div>
        <p className="weekbar__text">
          {cal.average === null ? (
            'Nothing logged yet this week.'
          ) : (
            <>
              Average <strong>{formatNumber(cal.average)}</strong> kcal on {cal.logged} logged {cal.logged === 1 ? 'day' : 'days'}, against {formatNumber(cal.limit)}.
            </>
          )}
          {cal.underFloor.length > 0 && <span className="gentle"> {cal.underFloor.length === 1 ? 'One day was' : `${cal.underFloor.length} days were`} well under the floor; eating enough counts too.</span>}
        </p>
      </div>
    </section>
  )
}

/** Today's Valor so far in its three parts, and the reputation the day earned (or will, at its close). */
export function ValorPanel({ campaign, ledger, date, today }: { campaign: CampaignState; ledger: Ledger; date: ISODate; today: ISODate }): React.JSX.Element {
  const days = liveWeek(campaign, ledger, date)
  const day = days.at(-1) ?? toDayRecord(snapshotDay(ledger, date, charterOn(campaign, date)))
  const parts = valorParts(day, days, charterOn(campaign, date).stepPool)
  const settled = date <= campaign.settledThrough.day
  const earned = settled ? dayEarned(campaign, date) : dayProjection(campaign, day)
  return (
    <section className="panel valor" aria-label="Valor">
      <header className="panel__head">
        <h3 className="panel__title">
          <GiSwordman aria-hidden="true" /> Valor {date === today ? 'today' : 'this day'}
        </h3>
        <span className="panel__aside">{percent(parts.valor)}%</span>
      </header>
      <ul className="valor__parts">
        <li style={{ ['--fill' as string]: parts.duties }}>
          <span>Duties</span>
          <span className="valor__bar" />
          <span>{percent(parts.duties)}%</span>
        </li>
        <li style={{ ['--fill' as string]: parts.food }}>
          <span>Food logged</span>
          <span className="valor__bar" />
          <span>{parts.food ? 'yes' : 'not yet'}</span>
        </li>
        <li style={{ ['--fill' as string]: parts.steps }}>
          <span>Step pace</span>
          <span className="valor__bar" />
          <span>{percent(parts.steps)}%</span>
        </li>
      </ul>
      <p className="muted">Valor rallies the realm’s companies in the day’s battles.</p>
      <div className="ledger__total">
        <span>{settled ? 'Reputation earned' : 'Earned at the day’s close'}</span>
        <WaxSeal color="gold" icon={GiLaurelCrown} size={30} seed={9} />
        <strong>{formatRep(earned)}</strong>
      </div>
    </section>
  )
}

/** The weekly weigh-in prompt, on the week's last day when none is logged (Ch 2). More often stays optional. */
export function WeighInBanner({ campaign, ledger, today }: { campaign: CampaignState; ledger: Ledger; today: ISODate }): React.JSX.Element | null {
  const prompt = weighInPrompt(weighIns(ledger), today, campaign.campaign.weekStartsOn)
  if (!prompt.due) return null
  const since = prompt.last ? diffDays(prompt.last.date, today) : null
  return (
    <div className="banner">
      <GiScales className="banner__icon" aria-hidden="true" />
      <span>
        The week closes tonight. Step on the scale and note your weight below
        {since !== null ? ` (the last weigh-in was ${since} ${since === 1 ? 'day' : 'days'} ago)` : ''}.
      </span>
    </div>
  )
}

/** The Healer's check-ins, as calm cards (Ch 16); each shows its approved text, or else its placeholder. */
export function HealerCards({ campaign, ledger, today }: { campaign: CampaignState; ledger: Ledger; today: ISODate }): React.JSX.Element | null {
  const steps = liveWeek(campaign, ledger, today).reduce((s, d) => s + (d.steps ?? 0), 0)
  const cards = healerCards(campaign, today, { stepsThisWeek: steps })
  if (cards.length === 0) return null
  return (
    <section className="healer" aria-label="The Healer">
      {cards.map((c) => (
        <p key={c.checkIn} className="healer-card" data-text-id={c.textId}>
          <GiHealthPotion aria-hidden="true" /> {c.text}
        </p>
      ))}
    </section>
  )
}
