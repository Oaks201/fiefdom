import type { IconType } from 'react-icons'
import { GiAnvilImpact, GiBookshelf, GiCandleFlame, GiCog, GiCrossedSwords, GiCycle, GiHelp, GiLaurelCrown, GiMusicalNotes, GiQuillInk, GiScrollUnfurled, GiShakingHands, GiTreasureMap } from 'react-icons/gi'
import { battleNotices } from '../lib/game/view/battle'
import { pagesFor, topBarView } from '../lib/game/view/shell'
import { useCampaignState, useCampaignToday } from '../state/campaignHooks'
import { contractStatus } from '../lib/contracts'
import { formatAgo } from '../lib/format'
import { openContract, setSound } from '../lib/ledger'
import { useToday } from '../state/clock'
import { useHealth } from '../state/health'
import { useLedgerData, useReputation } from '../state/hooks'
import { useLedger } from '../state/store'
import { useUI, type Page } from '../state/ui'
import { AnimatedNumber } from './AnimatedNumber'
import { WaxSeal } from './WaxSeal'

const TAB_INFO: Record<Page, { label: string; icon: IconType }> = {
  chronicle: { label: 'Chronicle', icon: GiQuillInk },
  contract: { label: 'Contract', icon: GiScrollUnfurled },
  archive: { label: 'Archive', icon: GiBookshelf },
  realm: { label: 'Realm', icon: GiTreasureMap },
  diplomacy: { label: 'Diplomacy', icon: GiShakingHands },
  armory: { label: 'Armory', icon: GiAnvilImpact }
}

const NUMERALS = ['I', 'II', 'III']

export function TopBar(): React.JSX.Element {
  const page = useUI((s) => s.page)
  const go = useUI((s) => s.go)
  const setProfileOpen = useUI((s) => s.setProfileOpen)
  const setSettingsOpen = useUI((s) => s.setSettingsOpen)
  const setHelpOpen = useUI((s) => s.setHelpOpen)
  const apply = useLedger((s) => s.apply)
  const ledger = useLedgerData()
  const today = useToday()
  const rep = useReputation()
  const campaign = useCampaignState()
  const campaignToday = useCampaignToday()
  const tabs = pagesFor(campaign).map((id) => ({ id, ...TAB_INFO[id] }))
  const bar = campaign && campaignToday ? topBarView(campaign, campaignToday) : null
  const battle = campaign && campaignToday ? battleNotices(campaign, campaignToday)[0] : undefined

  const open = openContract(ledger)
  const status = open ? contractStatus(open, today) : null
  const contractBadge = campaign
    ? !campaign.contracts.active && !campaign.contracts.queued
      ? { text: '!', title: 'No contract is in force' }
      : null
    : !open
      ? { text: '!', title: 'No contract is in force' }
      : status === 'awaiting' || (status === 'active' && open.endDate === today)
        ? { text: '⚖', title: 'Your final weigh-in is due' }
        : null
  const campaignStreak = campaign ? (campaign.settlement.snapshots.find((s) => s.date === campaign.settledThrough.day)?.streak ?? 0) : 0
  const streak = campaign ? campaignStreak : rep.currentStreak

  const profile = ledger.profile
  const music = ledger.settings.sound.music

  // Fitbit: shown once it has been set up — spins while syncing, flags trouble
  const health = useHealth()
  const fitbit = health.status
  const showFitbit = health.available && !!fitbit && (fitbit.connected || !!fitbit.problem)
  const fitbitTrouble = !!fitbit?.problem || (!!fitbit?.connected && !!health.lastError)
  const fitbitTitle = health.syncing
    ? 'Syncing with Fitbit…'
    : fitbit?.problem
      ? `Fitbit needs attention: ${fitbit.problem}`
      : health.lastError
        ? `Fitbit: ${health.lastError}. Click to try again.`
        : health.lastSync
          ? `Fitbit synced ${formatAgo(health.lastSync)}. Click to sync now.`
          : 'Sync with Fitbit'
  const initial = (profile?.name.trim()[0] ?? 'F').toUpperCase()

  return (
    <header className="topbar">
      <div className="topbar__beam" aria-hidden="true" />
      <button type="button" className="crest" onClick={() => setProfileOpen(true)} title="Your letters patent">
        <WaxSeal letter={initial} color="crimson" size={50} seed={11} />
        <span className="crest__text">
          <span className="crest__name">{profile ? `${profile.title} ${profile.name}`.trim() : 'A New Noble'}</span>
          <span className="crest__holding">{profile?.holding ? `of ${profile.holding}` : 'Fiefdom'}</span>
        </span>
      </button>

      <nav className={`tabs ${tabs.length > 3 ? 'tabs--campaign' : ''}`} aria-label="Pages">
        {tabs.map(({ id, label, icon: Icon }, i) => (
          <button
            key={id}
            type="button"
            className={`tab ${page === id ? 'tab--active' : ''}`}
            aria-current={page === id ? 'page' : undefined}
            onClick={() => go(id)}
            title={`${label} (Ctrl+${i + 1})`}
          >
            <Icon className="tab__icon" aria-hidden="true" />
            <span className="tab__label">{label}</span>
            {id === 'contract' && contractBadge && (
              <span className="tab__badge" title={contractBadge.title}>
                {contractBadge.text}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="purse">
        <div className="tools">
          {battle && (
            <button
              type="button"
              className={`tool tool--battle ${battle.today ? 'has-alert' : ''}`}
              aria-label={battle.label}
              title={`${battle.label}: ${battle.today ? 'fight now' : 'prepare'}`}
              onClick={() => useUI.getState().openBattle(battle.battleId)}
            >
              <GiCrossedSwords aria-hidden="true" />
              {battle.today && <span className="tool__alert">!</span>}
            </button>
          )}
          <button
            type="button"
            className={`tool ${music ? '' : 'is-off'}`}
            aria-pressed={music}
            aria-label="Music"
            title={music ? 'Pause the music (M)' : 'Play the music (M)'}
            onClick={() => apply((l) => setSound(l, { music: !music, musicVolume: !music && l.settings.sound.musicVolume === 0 ? 0.5 : l.settings.sound.musicVolume }))}
          >
            <GiMusicalNotes aria-hidden="true" />
          </button>
          {showFitbit && (
            <button
              type="button"
              className={`tool tool--sync ${health.syncing ? 'is-busy' : ''} ${fitbitTrouble ? 'has-alert' : ''}`}
              aria-label="Sync with Fitbit"
              title={fitbitTitle}
              onClick={() => (fitbit?.connected ? void health.sync() : setSettingsOpen(true))}
            >
              <GiCycle aria-hidden="true" />
              {fitbitTrouble && <span className="tool__alert">!</span>}
            </button>
          )}
          <button type="button" className="tool" aria-label="How to play" title="How to play (F1)" onClick={() => setHelpOpen(true)}>
            <GiHelp aria-hidden="true" />
          </button>
          <button type="button" className="tool" aria-label="Settings" title="Settings (Esc)" onClick={() => setSettingsOpen(true)}>
            <GiCog aria-hidden="true" />
          </button>
        </div>
        <div className={`streak ${streak > 0 ? 'streak--lit' : ''}`} title={campaign ? 'Perfect-day streak' : `Perfect-day streak (best: ${rep.bestStreak})`}>
          <GiCandleFlame className="streak__icon" aria-hidden="true" />
          <span className="streak__count">{streak}</span>
          <span className="streak__label">{streak === 1 ? 'day' : 'days'}</span>
        </div>
        {bar ? (
          <div className="reputation reputation--campaign" title={`${bar.grace.text} Realm Consistency over the last 28 days: ${bar.realmConsistencyPercent}%.`}>
            <WaxSeal color="gold" icon={GiLaurelCrown} size={46} seed={5} />
            <span className="reputation__text">
              <span className="reputation__value">
                <AnimatedNumber value={bar.purse} />
              </span>
              <span className="reputation__label">
                Purse · {bar.realmConsistencyPercent}% · Grace {bar.grace.level === 0 ? 'none' : NUMERALS[bar.grace.level - 1]}
              </span>
            </span>
          </div>
        ) : (
        <div
          className="reputation"
          title={`Reputation — ${rep.fromDays.toLocaleString('en-US')} from days, ${rep.fromContracts.toLocaleString('en-US')} from contracts (bonuses and wagers, less stakes)`}
        >
          <WaxSeal color="gold" icon={GiLaurelCrown} size={46} seed={5} />
          <span className="reputation__text">
            <span className="reputation__value">
              <AnimatedNumber value={rep.total} />
            </span>
            <span className="reputation__label">Reputation</span>
          </span>
        </div>
        )}
      </div>
    </header>
  )
}
