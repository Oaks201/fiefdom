import { foundCampaign } from '../src/renderer/src/lib/game/campaign'
import { addDays, dayCloseInstant } from '../src/renderer/src/lib/game/clock'
import { settle } from '../src/renderer/src/lib/game/settle'
import { FOUNDED_AT, START, TZ, isRoughDay, ledgerFor } from './ledgerGen'
import { act } from './policy'
import { JOURNEY, profileOf } from './profiles'
const after = (d: string) => new Date(dayCloseInstant(d, TZ).getTime() + 60_000)
const profile = profileOf('casual')
const ledger = ledgerFor(profile, 1001, 300)
let state = settle(foundCampaign({ startWeight: 217, goalWeight: 168, charter: { stepPool: JOURNEY.stepPool, calorieLimit: JOURNEY.calorieLimit, duties: [...JOURNEY.duties] }, timeZone: TZ, seed: 1001, ledger }, FOUNDED_AT), ledger, after(addDays(START, -1)), { launch: true }).state
let n = 0
for (let i = 0; i < 200; i++) {
  const today = addDays(START, i)
  state = act(state, today, { policy: 'greedy', rough: isRoughDay(profile, 1001, today), nextId: () => `x${n++}` })
  state = settle(state, ledger, after(today)).state
  if (today === '2027-03-15') {
    const a = settle(state, ledger, after(today)).state
    const b = settle(state, ledger, after(addDays(today, -7))).state
    for (const [name, s] of [['same', a], ['earlier', b]] as const) {
      const diff = Object.keys(state).filter((k) => JSON.stringify((state as any)[k]) !== JSON.stringify((s as any)[k]))
      console.log(name, diff, s === state)
      for (const k of diff) {
        const x = JSON.stringify((state as any)[k]); const y = JSON.stringify((s as any)[k])
        let j = 0; while (x[j] === y[j]) j++
        console.log('  ', k, x.slice(Math.max(0, j - 120), j + 80), '\n   vs', y.slice(Math.max(0, j - 120), j + 80))
      }
    }
    break
  }
}
