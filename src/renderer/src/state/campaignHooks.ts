/**
 * Small hooks for reading the campaign in components. Every number a screen shows comes from a
 * view model in `lib/game/view`; these only fetch the state and the campaign's day.
 */
import type { ISODate } from '../lib/game/types'
import type { CampaignState } from '../lib/game/types'
import { useCampaign } from './campaign'
import { campaignToday } from './campaignClock'
import { useClock, useDevClock } from './clock'

export function useCampaignState(): CampaignState | null {
  return useCampaign((s) => s.campaign)
}

/** The campaign's open day (it turns at 04:00 in the campaign's zone), or null without a campaign. */
export function useCampaignToday(): ISODate | null {
  const campaign = useCampaignState()
  // Re-read when the calendar day, the settled day or dev time travel moves.
  useClock((s) => s.today)
  useDevClock((s) => s.offsetMs)
  return campaign ? campaignToday(campaign.campaign.timeZone) : null
}
