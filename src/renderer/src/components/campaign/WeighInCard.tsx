import { useState } from 'react'
import { GiCrown, GiHealthPotion, GiScales } from 'react-icons/gi'
import { addDays, formatShort, formatWeekdayShort } from '../../lib/dates'
import { formatNumber, formatRep, formatSigned, formatWeight } from '../../lib/format'
import type { CampaignState, ISODate } from '../../lib/game/types'
import { healerTermsView, weighInCard, type WeighInCardView, type WeighInChart } from '../../lib/game/view/weighIn'
import { toLb } from '../../lib/game/weight'
import { weighIns } from '../../lib/ledger'
import type { Ledger } from '../../lib/types'
import { useUI } from '../../state/ui'
import { HealerAudience } from './HealerAudience'

/** The player's weigh-ins in lb, from the ledger (live). */
function weighInsLb(ledger: Ledger): { date: ISODate; weight: number }[] {
  return weighIns(ledger).map((w) => ({ date: w.date, weight: toLb(w.weight, ledger.settings.unit) }))
}

const DAY_MS = 86_400_000
const W = 560
const H = 190
const PAD = { left: 40, right: 14, top: 12, bottom: 24 }

function dayNumber(d: ISODate): number {
  return Date.parse(`${d}T00:00:00Z`) / DAY_MS
}

/**
 * The weigh-in chart (D-69, W2): the weekly readings and the trend through them, then, looking ahead
 * from the reading, the band between the target pace and the too-fast pace: Momentum pays in full
 * inside it, and going faster earns nothing more. The coming Milestone marks and the goal run across.
 */
function Chart({ chart, unit }: { chart: WeighInChart; unit: string }): React.JSX.Element {
  const last = chart.readings[chart.readings.length - 1]
  const dates = [...chart.readings.map((r) => r.date), ...chart.ahead.map((a) => a.date)]
  const values = [...chart.readings.map((r) => r.weight), ...chart.ahead.flatMap((a) => [a.pace, a.tooFast])]
  const marks = chart.marks.filter((m) => m.mark >= Math.min(...values) - 2 && m.mark <= Math.max(...values) + 2).slice(0, 3)
  const showGoal = chart.goal >= Math.min(...values) - 2
  const lo = Math.floor(Math.min(...values, ...marks.map((m) => m.mark), ...(showGoal ? [chart.goal] : [])) - 1)
  const hi = Math.ceil(Math.max(...values) + 1)
  const x0 = dayNumber(dates[0])
  const span = Math.max(1, dayNumber(dates[dates.length - 1]) - x0)
  const x = (d: ISODate): number => PAD.left + ((dayNumber(d) - x0) / span) * (W - PAD.left - PAD.right)
  const y = (v: number): number => PAD.top + ((hi - v) / Math.max(1, hi - lo)) * (H - PAD.top - PAD.bottom)
  const band = [
    `${x(last.date)},${y(last.weight)}`,
    ...chart.ahead.map((a) => `${x(a.date)},${y(a.pace)}`),
    ...[...chart.ahead].reverse().map((a) => `${x(a.date)},${y(a.tooFast)}`)
  ].join(' ')
  const ticks = Array.from({ length: 4 }, (_, i) => Math.round(lo + ((hi - lo) * i) / 3))
  return (
    <svg className="weighin-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Weekly weigh-ins, the last at ${last.weight} ${unit}, with the target pace ahead`}>
      {ticks.map((v) => (
        <g key={v}>
          <line className="weighin-chart__grid" x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} />
          <text className="weighin-chart__tick" x={PAD.left - 6} y={y(v) + 4} textAnchor="end">
            {v}
          </text>
        </g>
      ))}
      {marks.map((m) => (
        <g key={m.index}>
          <line className="weighin-chart__mark" x1={PAD.left} x2={W - PAD.right} y1={y(m.mark)} y2={y(m.mark)} />
          <text className="weighin-chart__mark-label" x={PAD.left + 4} y={y(m.mark) - 4}>
            Milestone {m.index} · {m.mark}
          </text>
        </g>
      ))}
      {showGoal && <line className="weighin-chart__goal" x1={PAD.left} x2={W - PAD.right} y1={y(chart.goal)} y2={y(chart.goal)} />}
      <polygon className="weighin-chart__band" points={band} />
      <polyline className="weighin-chart__pace" points={[`${x(last.date)},${y(last.weight)}`, ...chart.ahead.map((a) => `${x(a.date)},${y(a.pace)}`)].join(' ')} />
      {chart.trend && <line className="weighin-chart__trend" x1={x(chart.trend[0].date)} y1={y(chart.trend[0].weight)} x2={x(chart.trend[1].date)} y2={y(chart.trend[1].weight)} />}
      <polyline className="weighin-chart__line" points={chart.readings.map((r) => `${x(r.date)},${y(r.weight)}`).join(' ')} />
      {chart.readings.map((r) => (
        <circle key={r.date} className={`weighin-chart__dot${r === last ? ' is-last' : ''}`} cx={x(r.date)} cy={y(r.weight)} r={r === last ? 5 : 3.5}>
          <title>{`${formatShort(r.date)}: ${r.weight} ${unit}`}</title>
        </circle>
      ))}
      <text className="weighin-chart__tick" x={x(chart.readings[0].date)} y={H - 6}>
        {formatShort(chart.readings[0].date)}
      </text>
      <text className="weighin-chart__tick" x={x(last.date)} y={H - 6} textAnchor="middle">
        {formatShort(last.date)}
      </text>
      <text className="weighin-chart__tick" x={W - PAD.right} y={H - 6} textAnchor="end">
        {formatShort(chart.ahead[chart.ahead.length - 1].date)}
      </text>
    </svg>
  )
}

/** The close's pay for the weigh-in, as one line: what it paid, or what it pays as things stand. */
function paysLine(card: WeighInCardView, today: ISODate): string {
  const parts: string[] = []
  if (card.pays.momentum !== null) parts.push(`Momentum ${formatRep(card.pays.momentum)}`)
  if (card.pays.faithful !== null) parts.push(`Faithful at the Scale ${formatRep(card.pays.faithful)}`)
  for (const m of card.pays.milestones) parts.push(`Milestone ${m}`)
  if (parts.length === 0) return ''
  const when = card.settled ? `Paid at the close of ${formatWeekdayShort(card.settlesOn)}` : `At ${card.settlesOn === today ? 'today’s' : `${formatWeekdayShort(card.settlesOn)}’s`} close`
  return `${when}: ${parts.join(', ')}${card.pays.momentum === null && !card.settled ? '; Momentum at the week close' : ''}.`
}

/**
 * The weigh-in card (Patch 9, D-69, W2): the week's reading, its trend against the target pace, the
 * chart, what the close pays for it, the next Milestone with its waystones (W3), and the Healer's
 * report (H1) and terms (H2). Shown from the moment the weight is typed; until the close, its figures
 * are as things stand.
 */
export function WeighInCard({ campaign, ledger, today }: { campaign: CampaignState; ledger: Ledger; today: ISODate }): React.JSX.Element | null {
  const ui = useUI()
  const [audience, setAudience] = useState(false)
  const card = weighInCard(campaign, weighInsLb(ledger), today)
  if (!card) return null
  const terms = healerTermsView(campaign)
  const { unit } = card
  const pays = paysLine(card, today)
  const lit = card.waystones.filter((w) => w.lit).length
  return (
    <section className="panel weighin-card" aria-label="The weigh-in">
      <header className="panel__head">
        <h3 className="panel__title">
          <GiScales aria-hidden="true" /> The weigh-in · week {card.week}
        </h3>
        <span className="panel__aside">{formatWeekdayShort(card.date)}</span>
      </header>
      <div className="weighin-card__figures">
        <div className="weighin-card__figure">
          <span className="weighin-card__label">This week</span>
          <strong>{formatWeight(card.weight, unit)}</strong>
          <span className={`weighin-card__note${card.change === null || card.change === 0 ? '' : card.change < 0 ? ' is-down' : ' is-up'}`}>
            {card.change === null ? 'the first weigh-in' : `${formatSigned(card.change)} since last`}
          </span>
        </div>
        <div className="weighin-card__figure">
          <span className="weighin-card__label">Trend</span>
          <strong>{card.trend === null ? '—' : `${Math.abs(card.trend).toFixed(1)} ${unit} a week`}</strong>
          <span className="weighin-card__note">
            {card.trend === null ? 'not yet' : card.trend < 0 ? 'up' : 'down'} · target pace {card.target.toFixed(1)}
          </span>
        </div>
      </div>
      {card.chart.readings.length > 0 && <Chart chart={card.chart} unit={unit} />}
      {pays && <p className="weighin-card__pays">{pays}</p>}
      {card.next && (
        <div className="weighin-card__next">
          <p>
            <GiCrown aria-hidden="true" />{' '}
            {card.next.keeping
              ? `Next: Milestone ${card.next.index}, kept by staying near the goal.`
              : card.next.toGo === 0
                ? `Next: Milestone ${card.next.index} at ${card.next.mark} ${unit}, its mark reached; it waits for week ${card.next.earliestWeek}.`
                : `Next: Milestone ${card.next.index} at ${card.next.mark} ${unit}, ${card.next.toGo.toFixed(1)} ${unit} to go; not before week ${card.next.earliestWeek}${
                    card.next.weekAtPace !== null && card.next.weekAtPace > card.next.earliestWeek ? `, about week ${card.next.weekAtPace} at the target pace` : ''
                  }.`}
          </p>
          {card.waystones.length > 0 && (
            <ol className="waystones" aria-label={`Waystones: ${lit} of ${card.waystones.length} passed`}>
              {card.waystones.map((w) => (
                <li key={w.mark} className={`waystone${w.lit ? ' is-lit' : ''}${w.fresh ? ' is-fresh' : ''}`} title={`${w.mark} ${unit}${w.lit ? ', passed' : ''}`}>
                  <span>{w.mark}</span>
                </li>
              ))}
            </ol>
          )}
          {card.waystones.some((w) => w.fresh) && (
            <p className="muted">
              Passed {card.waystones.filter((w) => w.fresh).map((w) => `${w.mark}`).join(', ')} {unit} this week.
            </p>
          )}
        </div>
      )}
      <div className="weighin-card__healer">
        <p className="healer-card" data-text-id={card.report.textId}>
          <GiHealthPotion aria-hidden="true" /> {card.report.text}
        </p>
        {terms && (
          <div className="weighin-card__terms">
            <span>
              Remedy’s terms for the next contract: {terms.calorieLimit !== undefined ? `${formatNumber(terms.calorieLimit)} kcal` : 'no calorie figure yet'},{' '}
              {terms.stepPool !== undefined ? `${formatNumber(terms.stepPool)} steps a week` : 'no step figure yet'}.
            </span>{' '}
            <button type="button" className="link" onClick={() => ui.go('contract')}>
              On the Contract page
            </button>
          </div>
        )}
        <p className="weighin-card__audience">
          <button type="button" className="btn btn--small btn--ghost" onClick={() => setAudience(true)}>
            <GiHealthPotion aria-hidden="true" /> Speak with Remedy
          </button>
        </p>
        {audience && <HealerAudience campaign={campaign} today={today} onClose={() => setAudience(false)} />}
      </div>
    </section>
  )
}

/** The weigh-in in the Dawn tidings (D-47, D-69): the morning after a weigh-in settled its week, its report and pay. */
export function WeighInTidings({ campaign, ledger, today }: { campaign: CampaignState; ledger: Ledger; today: ISODate }): React.JSX.Element | null {
  const card = weighInCard(campaign, weighInsLb(ledger), today)
  if (!card || !card.settled || card.settlesOn !== addDays(today, -1)) return null
  const pays = paysLine(card, today)
  return (
    <div className="dawn__weighin">
      <p className="healer-card" data-text-id={card.report.textId}>
        <GiHealthPotion aria-hidden="true" /> {card.report.text}
      </p>
      {pays && <p className="muted">{pays}</p>}
    </div>
  )
}
