import { runCampaign } from './campaign'
for (const [profile, policy] of [['steadfast', 'greedy'], ['steadfast', 'smarter'], ['committed', 'greedy'], ['casual', 'greedy']] as const) {
  const t = performance.now()
  const r = runCampaign({ seed: 1001, profile, policy, weeks: 70, variant: 'base' })
  const ms = Math.round(performance.now() - t)
  console.log(profile, policy, ms + 'ms', r.status, 'won', r.wonWeek, 'fell', r.fallWeek, 'last', r.lastWeek, 'q', r.q, 'gb', JSON.stringify(r.grandBattles), 'res', JSON.stringify(r.resolutions), 'coal', r.coalitions, 'ult', r.ultimatums, 'hexes', r.hexes.player.join(','), 'bc', r.borderCampaignHexes, 'fm', JSON.stringify(r.firstMonth), 'viol', r.violations.slice(0, 3), 'inc48', Math.round(r.income.slice(0, 48).reduce((s, v) => s + v, 0)), 'bench48', Math.round(r.benchmark.slice(0, 48).reduce((s, v) => s + v, 0)), 'binds', JSON.stringify(r.binds), 'spend', JSON.stringify(r.spend))
}
