import { lazy, Suspense, useEffect } from 'react'
import { applySoundSettings, initAudio, sfx } from './audio'
import { DeskProps } from './components/DeskProps'
import { FloatLayer, Toasts } from './components/Overlays'
import { ProfileModal } from './components/ProfileModal'
import { SettingsModal } from './components/SettingsModal'
import { SvgDefs } from './components/SvgDefs'
import { TopBar } from './components/TopBar'
import { BigMomentCard } from './components/game/BigMomentCard'
import { FoundingWizard } from './components/game/FoundingWizard'
import { GameArt } from './components/game/GameArt'
import { HowToPlay } from './components/HowToPlay'
import { Homecoming } from './components/game/Homecoming'
import { pagesFor } from './lib/game/view/shell'
import { ArchivePage } from './pages/ArchivePage'
import { ArmoryPage } from './pages/ArmoryPage'
import { BattlePage } from './pages/BattlePage'
import { DiplomacyPage } from './pages/DiplomacyPage'
import { RealmPage } from './pages/RealmPage'
import { ChroniclePage } from './pages/ChroniclePage'
import { ContractPage } from './pages/ContractPage'
import { startClock } from './state/clock'
import { startHealthSync } from './state/health'
import { setSound } from './lib/ledger'
import { useCampaign } from './state/campaign'
import { startCampaignClock } from './state/campaignClock'
import { useLedger } from './state/store'
import { isDialogOpen, isTyping, useUI, type Page } from './state/ui'

// Development builds only (A-09): the time-travel panel. Production builds drop this import entirely.
const DevTimeTravel = import.meta.env.DEV ? lazy(() => import('./components/game/DevTimeTravel')) : null
const DevArtSamples = import.meta.env.DEV ? lazy(() => import('./components/game/DevArtSamples')) : null

export default function App(): React.JSX.Element {
  const status = useLedger((s) => s.status)
  const error = useLedger((s) => s.error)
  const load = useLedger((s) => s.load)
  const page = useUI((s) => s.page)
  const battle = useUI((s) => s.battle)
  const campaignStatus = useCampaign((s) => s.status)
  const hasCampaign = useCampaign((s) => s.campaign !== null)

  useEffect(() => {
    void load()
    // Only read here; nothing is written until a campaign is founded.
    void useCampaign.getState().load()
  }, [load])

  // Keep "today" fresh; if the Chronicle was showing today, follow it into the new day.
  useEffect(
    () =>
      startClock((previous, next) => {
        const ui = useUI.getState()
        if (ui.date === previous) ui.setDate(next)
      }),
    []
  )

  // A new page starts at its top, whatever the last one was scrolled to.
  useEffect(() => {
    document.querySelector('.desk__main')?.scrollTo({ top: 0 })
  }, [page, battle?.id, battle?.replay])

  // A page that no longer exists (no campaign) falls back to the Chronicle.
  useEffect(() => {
    if (!hasCampaign && (page === 'realm' || page === 'diplomacy' || page === 'armory')) useUI.getState().go('chronicle')
  }, [hasCampaign, page])

  // Ctrl+1 to 6 switch pages from anywhere (the campaign's pages once one is founded); M pauses or resumes the music;
  // Esc opens Settings and F1 or ? opens How to play when no dialog is open (an open dialog takes Esc to close).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const plain = !e.ctrlKey && !e.metaKey && !e.altKey && !isTyping(e) && !isDialogOpen()
      if (plain && e.key === 'Escape') {
        e.preventDefault()
        useUI.getState().setSettingsOpen(true)
        return
      }
      if (plain && (e.key === 'F1' || e.key === '?')) {
        e.preventDefault()
        useUI.getState().setHelpOpen(true)
        return
      }
      if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey && !e.altKey && !isTyping(e) && !isDialogOpen()) {
        e.preventDefault()
        useLedger.getState().apply((l) => setSound(l, { music: !l.settings.sound.music, musicVolume: l.settings.sound.musicVolume || 0.5 }))
        return
      }
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      const order: Page[] = pagesFor(useCampaign.getState().campaign)
      const i = ['1', '2', '3', '4', '5', '6'].indexOf(e.key)
      if (i >= 0 && i < order.length && !isDialogOpen()) {
        e.preventDefault()
        useUI.getState().go(order[i])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Fitbit: fill in steps and calories once the ledger is open, then keep them fresh.
  useEffect(() => (status === 'ready' ? startHealthSync() : undefined), [status])

  // The campaign settles at launch (after the first Fitbit sync attempt) and at each 04:00 close.
  useEffect(() => (status === 'ready' && campaignStatus === 'ready' ? startCampaignClock() : undefined), [status, campaignStatus])

  // Sound: start once the ledger (and its sound settings) is loaded; follow settings changes;
  // turn pages and days with the rustle of paper.
  useEffect(() => {
    if (status !== 'ready') return
    const stopAudio = initAudio(useLedger.getState().ledger.settings.sound)
    const offLedger = useLedger.subscribe((s, prev) => {
      if (s.ledger.settings.sound !== prev.ledger.settings.sound) applySoundSettings(s.ledger.settings.sound)
    })
    const offUI = useUI.subscribe((s, prev) => {
      if (s.page !== prev.page) sfx('page')
      else if (s.date !== prev.date) sfx('flip')
    })
    return () => {
      stopAudio()
      offLedger()
      offUI()
    }
  }, [status])

  return (
    <div className="desk">
      <SvgDefs />
      <DeskProps />
      {status === 'ready' ? (
        <>
          <TopBar />
          <main className="desk__main">
            <div className={`sheet page page--${battle && hasCampaign ? 'battle' : page}`} key={battle && hasCampaign ? `battle-${battle.id}` : page}>
              <div className="sheet__paper" aria-hidden="true">
                <GameArt slot="ui.parchment" width={1024} className="sheet__art" fallback={<></>} />
              </div>
              <div className="page__content">
                {battle && hasCampaign && <BattlePage />}
                {!(battle && hasCampaign) && page === 'chronicle' && <ChroniclePage />}
                {!(battle && hasCampaign) && page === 'contract' && <ContractPage />}
                {!(battle && hasCampaign) && page === 'archive' && <ArchivePage />}
                {!(battle && hasCampaign) && page === 'realm' && hasCampaign && <RealmPage />}
                {!(battle && hasCampaign) && page === 'diplomacy' && hasCampaign && <DiplomacyPage />}
                {!(battle && hasCampaign) && page === 'armory' && hasCampaign && <ArmoryPage />}
              </div>
            </div>
          </main>
          <ProfileModal />
          <SettingsModal />
          <FoundingWizard />
          <HowToPlay />
          <Homecoming />
          <BigMomentCard />
          {DevTimeTravel && (
            <Suspense fallback={null}>
              <DevTimeTravel />
            </Suspense>
          )}
        </>
      ) : status === 'error' ? (
        <div className="boot">
          <h1>The ledger could not be opened</h1>
          <p>{error}</p>
          <button type="button" className="btn" onClick={() => void load()}>
            Try again
          </button>
        </div>
      ) : (
        <div className="boot">
          <p>Unrolling the ledger…</p>
        </div>
      )}
      {DevArtSamples && (
        <Suspense fallback={null}>
          <DevArtSamples />
        </Suspense>
      )}
      <FloatLayer />
      <Toasts />
    </div>
  )
}
