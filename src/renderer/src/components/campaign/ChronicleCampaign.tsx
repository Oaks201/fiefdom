import { GiBootPrints, GiHealthPotion, GiHourglass, GiKnifeFork, GiLaurelCrown, GiScales, GiSwordman } from 'react-icons/gi'
import { diffDays, formatShort, WEEKDAYS, weekday } from '../../lib/dates'
import { formatNumber, formatRep } from '../../lib/format'
import { snapshotDay, toDayRecord } from '../../lib/game/ledgerDays'
import { charterOn } from '../../lib/game/settle'
import { isRestDay, respiteDays } from '../../lib/game/state'
import type { CampaignState, ISODate } from '../../lib/game/types'
import { weighInDay } from '../../lib/game/clock'
import {
  calorieWeek,
  catchUp,
  dayEarned,
  dayProjection,
  daySpoils,
  healerCards,
  liveValor,
  liveValorParts,
  liveWeek,
  stepPace,
  weighInPrompt
} from '../../lib/game/view/chronicle'
import { percent } from '../../lib/game/view/shell'
import { dayLog, weighIns } from '../../lib/ledger'
import type { Ledger } from '../../lib/types'
import { useCampaignToday } from '../../state/campaignHooks'
import { WaxSeal } from '../WaxSeal'
import { StartBattles } from '../battle/StartBattles'
import { WeightField } from '../chronicle/DayLedger'
import { calorieCatchUpLine, stepCatchUpLine } from './catchUpLines'

/**
 * The week's pace toward the step pool and its calorie average against the limit (Ch 2, Ch 4), and on
 * the open day what the rest of the week needs to get back on pace (Patch 6, D-46).
 */
export function CampaignWeek({ campaign, ledger, date }: { campaign: CampaignState; ledger: Ledger; date: ISODate }): React.JSX.Element {
  const openDay = useCampaignToday()
  const charter = charterOn(campaign, date)
  const days = liveWeek(campaign, ledger, date)
  const respite = respiteDays(campaign)
  const pace = stepPace(days, charter.stepPool, date, campaign.campaign.weekStartsOn, campaign.campaign.startDate, respite)
  const cal = calorieWeek(days, charter.calorieLimit, campaign.weight.healerFloor ?? 0, date, campaign.campaign.weekStartsOn, campaign.campaign.startDate, respite)
  // A rest day asks for nothing (D-54): no catch-up figures on it.
  const figures = date === openDay && !respite.includes(date) ? catchUp(campaign, ledger, date) : null
  const stepLine = figures ? stepCatchUpLine(figures.steps) : null
  const calorieLine = figures ? calorieCatchUpLine(figures.calories) : null
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
          <strong>{formatNumber(pace.walked)}</strong> of {formatNumber(pace.expected)} expected by today ({formatNumber(pace.pool)} for the week
          {pace.rested > 0 ? `, ${pace.rested === 1 ? 'a day' : `${pace.rested} days`} less for Respite` : ''}) ·{' '}
          <span className={`pace pace--${pace.status}`}>{pace.status === 'ahead' ? 'ahead' : 'behind'}</span>
        </p>
        {stepLine && <p className="weekbar__catchup">{stepLine}</p>}
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
        {calorieLine && <p className="weekbar__catchup">{calorieLine}</p>}
      </div>
    </section>
  )
}

/**
 * Today's Valor so far in its three parts, the reputation the day earned (or will, at its close),
 * and on the campaign's open day "Start today's battles" (D-12).
 */
export function ValorPanel({ campaign, ledger, date, today }: { campaign: CampaignState; ledger: Ledger; date: ISODate; today: ISODate }): React.JSX.Element {
  const openDay = useCampaignToday()
  const days = liveWeek(campaign, ledger, date)
  const day = days.at(-1) ?? toDayRecord(snapshotDay(ledger, date, charterOn(campaign, date)))
  const parts = liveValorParts(campaign, ledger, date)
  const settled = date <= campaign.settledThrough.day
  const earned = settled ? dayEarned(campaign, date) : dayProjection(campaign, day)
  const spoils = daySpoils(campaign, date)
  if (isRestDay(campaign, date)) {
    // A paid day off (D-54): Valor is Realm Consistency, and so is the day's pay.
    const rc = liveValor(campaign, ledger, date)
    return (
      <section className="panel valor valor--rest" aria-label="Valor">
        <header className="panel__head">
          <h3 className="panel__title">
            <GiHourglass aria-hidden="true" /> Valor {date === today ? 'today' : 'this day'}: a Respite day
          </h3>
          <span className="panel__aside">{percent(rc)}%</span>
        </header>
        <p>A paid day off. Valor is your Realm Consistency, so the Marshal fights the day at {percent(rc)}%, and it pays a full day’s reputation at {percent(rc)}%.</p>
        {date === openDay && <StartBattles campaign={campaign} today={date} valor={rc} />}
        <div className="ledger__total">
          <span>{settled ? 'Reputation earned' : 'Earned at the day’s close'}</span>
          <WaxSeal color="gold" icon={GiLaurelCrown} size={30} seed={9} />
          <strong>{formatRep(earned)}</strong>
        </div>
        {spoils > 0 && <p className="muted valor__spoils">Including {formatNumber(spoils)} from battle spoils.</p>}
      </section>
    )
  }
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
      {date === openDay && <StartBattles campaign={campaign} today={date} valor={parts.valor} />}
      <div className="ledger__total">
        <span>{settled ? 'Reputation earned' : 'Earned at the day’s close'}</span>
        <WaxSeal color="gold" icon={GiLaurelCrown} size={30} seed={9} />
        <strong>{formatRep(earned)}</strong>
      </div>
      {spoils > 0 && <p className="muted valor__spoils">Including {formatNumber(spoils)} from battle spoils.</p>}
    </section>
  )
}

/**
 * The weight box, on the week's weigh-in day (Monday, D-13) only; any other day names that day
 * instead. A weight logged on another day stays shown, so it can still be corrected.
 */
export function CampaignWeight({ campaign, ledger, date, today }: { campaign: CampaignState; ledger: Ledger; date: ISODate; today: ISODate }): React.JSX.Element {
  const day = weighInDay(date, campaign.campaign.weekStartsOn)
  const label = `${WEEKDAYS[weekday(day)]}, ${formatShort(day)}`
  const note = day < today ? `This week’s weigh-in day was ${label}.` : day === today ? 'This week’s weigh-in is today.' : `This week’s weigh-in is on ${label}.`
  return (
    <>
      {(date === day || dayLog(ledger, date).weight !== undefined) && <WeightField date={date} today={today} />}
      {date !== day && (
        <p className="muted weigh-in-day">
          <GiScales aria-hidden="true" /> {note}
        </p>
      )}
    </>
  )
}

/** The weekly weigh-in prompt, on the weigh-in day (Monday) until its weight is logged (Ch 2, D-13). */
export function WeighInBanner({ campaign, ledger, today }: { campaign: CampaignState; ledger: Ledger; today: ISODate }): React.JSX.Element | null {
  const prompt = weighInPrompt(weighIns(ledger), today, campaign.campaign.weekStartsOn)
  if (!prompt.due) return null
  const since = prompt.last ? diffDays(prompt.last.date, today) : null
  return (
    <div className="banner">
      <GiScales className="banner__icon" aria-hidden="true" />
      <span>
        Today is weigh-in day. Step on the scale and note your weight below
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
