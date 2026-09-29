import type { IconType } from 'react-icons'
import { GiBookshelf, GiCandleFlame, GiCog, GiLaurelCrown, GiMusicalNotes, GiQuillInk, GiScrollUnfurled } from 'react-icons/gi'
import { contractStatus } from '../lib/contracts'
import { openContract, setSound } from '../lib/ledger'
import { useToday } from '../state/clock'
import { useLedgerData, useReputation } from '../state/hooks'
import { useLedger } from '../state/store'
import { useUI, type Page } from '../state/ui'
import { AnimatedNumber } from './AnimatedNumber'
import { WaxSeal } from './WaxSeal'

const TABS: Array<{ id: Page; label: string; icon: IconType }> = [
  { id: 'chronicle', label: 'Chronicle', icon: GiQuillInk },
  { id: 'contract', label: 'Contract', icon: GiScrollUnfurled },
  { id: 'archive', label: 'Archive', icon: GiBookshelf }
]

export function TopBar(): React.JSX.Element {
  const page = useUI((s) => s.page)
  const go = useUI((s) => s.go)
  const setProfileOpen = useUI((s) => s.setProfileOpen)
  const setSettingsOpen = useUI((s) => s.setSettingsOpen)
  const apply = useLedger((s) => s.apply)
  const ledger = useLedgerData()
  const today = useToday()
  const rep = useReputation()

  const open = openContract(ledger)
  const status = open ? contractStatus(open, today) : null
  const contractBadge = !open
    ? { text: '!', title: 'No contract is in force' }
    : status === 'awaiting' || (status === 'active' && open.endDate === today)
      ? { text: '⚖', title: 'Your final weigh-in is due' }
      : null

  const profile = ledger.profile
  const music = ledger.settings.sound.music
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

      <nav className="tabs" aria-label="Pages">
        {TABS.map(({ id, label, icon: Icon }, i) => (
          <button
            key={id}
            type="button"
            className={`tab ${page === id ? 'tab--active' : ''}`}
            aria-current={page === id ? 'page' : undefined}
            onClick={() => go(id)}
            title={`${label} (Ctrl+${i + 1})`}
          >
            <Icon className="tab__icon" aria-hidden="true" />
            <span>{label}</span>
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
          <button type="button" className="tool" aria-label="Settings" title="Settings" onClick={() => setSettingsOpen(true)}>
            <GiCog aria-hidden="true" />
          </button>
        </div>
        <div className={`streak ${rep.currentStreak > 0 ? 'streak--lit' : ''}`} title={`Perfect-day streak (best: ${rep.bestStreak})`}>
          <GiCandleFlame className="streak__icon" aria-hidden="true" />
          <span className="streak__count">{rep.currentStreak}</span>
          <span className="streak__label">{rep.currentStreak === 1 ? 'day' : 'days'}</span>
        </div>
        <div className="reputation" title={`Reputation — ${rep.fromDays.toLocaleString('en-US')} from days, ${rep.fromContracts.toLocaleString('en-US')} from contracts`}>
          <WaxSeal color="gold" icon={GiLaurelCrown} size={46} seed={5} />
          <span className="reputation__text">
            <span className="reputation__value">
              <AnimatedNumber value={rep.total} />
            </span>
            <span className="reputation__label">Reputation</span>
          </span>
        </div>
      </div>
    </header>
  )
}
