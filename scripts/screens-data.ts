/**
 * Data folders for `scripts/screens.cjs` (task T14), built relative to the real today so the app
 * opens them as it would for a player:
 *
 *   npx tsx scripts/screens-data.ts <root>
 *
 * writes <root>/fresh (a ledger, no campaign: the ledger-only app and the founding wizard),
 * <root>/campaign (a campaign five weeks in, with a paid contract, one running and a Milestone
 * broken), <root>/homecoming (the same campaign, last opened 20 days ago and settled 6 days
 * ago, so the Homecoming opens at launch), <root>/devflow (a ledger with three weeks logged
 * ahead, for driving dev time travel) and <root>/devcampaign (the five-week campaign with three
 * weeks logged ahead, for the T15 checks with time travel and the scenario loader) and
 * <root>/founded (a campaign founded yesterday evening: the founding map). Sound is off in each,
 * so the screenshots run quietly.
 *
 * <root>/midgame (T15) is different: 16 weeks of a steady, greedy player from the test driver,
 * on its fixed dates (founded 2026-10-07 in Chicago). Open it with the dev build and the
 * FIEFDOM_DEV_NOW this script prints, so the app's "now" is the driven campaign's open day.
 */
import fs from 'node:fs'
import path from 'node:path'
import { foundCampaign } from '../src/renderer/src/lib/game/campaign'
import { addDays, dayCloseInstant, openDay } from '../src/renderer/src/lib/game/clock'
import { sealContract } from '../src/renderer/src/lib/game/contractActions'
import { settle } from '../src/renderer/src/lib/game/settle'
import type { CampaignState } from '../src/renderer/src/lib/game/types'
import { createLedger } from '../src/renderer/src/lib/ledger'
import type { Ledger } from '../src/renderer/src/lib/types'
import { driveCampaign, habitLedger } from '../tests/game/support/campaign-driver'

const root = process.argv[2]
if (!root) {
  console.error('Usage: npx tsx scripts/screens-data.ts <root folder>')
  process.exit(2)
}

const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
const now = new Date()
const today = openDay(now, zone)
const HABITS = [
  { id: 'h-read', name: 'Read', createdOn: addDays(today, -120) },
  { id: 'h-stretch', name: 'Stretch', createdOn: addDays(today, -120) },
  { id: 'h-water', name: 'Drink water', createdOn: addDays(today, -120) }
]

/** A ledger of `days` days up to today: mostly kept, the odd short day, weigh-ins twice a week losing 1.5 lb a week from 217. */
function ledgerFor(days: number, ahead = 0): Ledger {
  const ledger: Ledger = { ...createLedger(), habits: HABITS.map((h) => ({ ...h })) }
  ledger.profile = { title: 'Lord', name: 'Rich', holding: 'Ashford' }
  ledger.settings = { ...ledger.settings, sound: { music: false, musicVolume: 0, effects: false, effectsVolume: 0 } }
  for (let i = days; i >= -ahead; i--) {
    const date = addDays(today, -i)
    const short = i % 9 === 4
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
    ledger.days[date] = {
      steps: i === 0 ? 4_200 : short ? 3_100 : 7_400 + ((Math.abs(i) * 53) % 2_400),
      ...(i === 0 ? {} : { eaten: short ? 2_250 : 1_850 + ((Math.abs(i) * 37) % 120) }),
      done: i === 0 ? { 'h-read': true } : short ? { 'h-read': true, 'h-water': true } : { 'h-read': true, 'h-stretch': true, 'h-water': true },
      ...(weekday === 1 || weekday === 4 ? { weight: Math.round((217 - (1.5 * (days - i)) / 7) * 10) / 10 } : {})
    }
  }
  return ledger
}

/** The instant just after `day` closes. */
function after(day: string): Date {
  return new Date(dayCloseInstant(day, zone).getTime() + 60_000)
}

function write(dir: string, ledger: Ledger, campaign?: CampaignState): void {
  fs.mkdirSync(dir, { recursive: true })
  for (const f of ['ledger.json', 'campaign.json']) fs.rmSync(path.join(dir, f), { force: true })
  fs.writeFileSync(path.join(dir, 'ledger.json'), JSON.stringify(ledger, null, 2))
  if (campaign) fs.writeFileSync(path.join(dir, 'campaign.json'), JSON.stringify(campaign))
  console.log(`wrote ${dir}`)
}

/** A campaign founded 35 days ago, settled through `through`, with contracts sealed along the way. */
function campaignThrough(ledger: Ledger, through: string, lastLaunch: string): CampaignState {
  const foundedOn = addDays(today, -36)
  const founding = new Date(dayCloseInstant(addDays(foundedOn, -1), zone).getTime() + 10 * 3_600_000)
  let state = foundCampaign({ startWeight: 217, goalWeight: 168, charter: { stepPool: 50_000, calorieLimit: 2_000, duties: ['Read', 'Stretch', 'Drink water'] }, timeZone: zone, seed: 20261007, ledger }, founding)
  // A 3-day contract with a 20 pledge from the first dawn: paid long since.
  state = sealContract(state, { id: 'c-first', termDays: 3, pledge: 20 }, foundedOn).state
  const sealDay = addDays(today, -2)
  const until = sealDay < through ? sealDay : through
  state = settle(state, ledger, after(addDays(until, -1))).state
  if (sealDay <= through) {
    // A second 3-day contract, sealed two days ago: in force today.
    state = sealContract(state, { id: 'c-running', termDays: 3, pledge: 15 }, sealDay).state
    state = settle(state, ledger, after(addDays(through, -1))).state
  }
  return { ...state, settlement: { ...state.settlement, lastLaunch } }
}

const ledger = ledgerFor(64)
write(path.join(root, 'fresh'), ledgerFor(30))
// For dev time travel (--dev): the same ledger, with three weeks of days ahead already logged.
write(path.join(root, 'devflow'), ledgerFor(30, 21))
write(path.join(root, 'campaign'), ledger, campaignThrough(ledger, today, today))
write(path.join(root, 'homecoming'), ledger, campaignThrough(ledger, addDays(today, -6), addDays(today, -20)))
const yesterdayEvening = new Date(dayCloseInstant(addDays(today, -2), zone).getTime() + 16 * 3_600_000)
const foundingLedger = ledgerFor(30)
write(path.join(root, 'founded'), foundingLedger, { ...foundCampaign({ startWeight: 217, goalWeight: 168, charter: { stepPool: 50_000, calorieLimit: 2_000, duties: ['Read', 'Stretch', 'Drink water'] }, timeZone: zone, seed: 20261007, ledger: foundingLedger }, yesterdayEvening) })
const ahead = ledgerFor(64, 21)
write(path.join(root, 'devcampaign'), ahead, campaignThrough(ahead, today, today))

// The mid-game map: the test driver's steady, greedy player, 16 weeks in, on fixed dates.
const MIDGAME_WEEKS = 16
const midgame = driveCampaign({ seed: 3, weeks: MIDGAME_WEEKS, habits: 'steady', policy: 'greedy' }).state
const midLedger = habitLedger(3, 'steady', MIDGAME_WEEKS * 7 + 7)
midLedger.profile = { title: 'Lord', name: 'Rich', holding: 'Ashford' }
midLedger.settings = { ...midLedger.settings, sound: { music: false, musicVolume: 0, effects: false, effectsVolume: 0 } }
const midOpen = addDays(midgame.settledThrough.day, 1)
write(path.join(root, 'midgame'), midLedger, { ...midgame, settlement: { ...midgame.settlement, lastLaunch: midOpen } })
console.log(`midgame: FIEFDOM_DEV_NOW=${new Date(dayCloseInstant(midgame.settledThrough.day, midgame.campaign.timeZone).getTime() + 8 * 3_600_000).toISOString()}`)
