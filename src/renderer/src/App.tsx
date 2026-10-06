import { useEffect } from 'react'
import { applySoundSettings, initAudio, sfx } from './audio'
import { DeskProps } from './components/DeskProps'
import { FloatLayer, Toasts } from './components/Overlays'
import { ProfileModal } from './components/ProfileModal'
import { SettingsModal } from './components/SettingsModal'
import { SvgDefs } from './components/SvgDefs'
import { TopBar } from './components/TopBar'
import { ArchivePage } from './pages/ArchivePage'
import { ChroniclePage } from './pages/ChroniclePage'
import { ContractPage } from './pages/ContractPage'
import { startClock } from './state/clock'
import { startHealthSync } from './state/health'
import { setSound } from './lib/ledger'
import { useCampaign } from './state/campaign'
import { useLedger } from './state/store'
import { isDialogOpen, isTyping, useUI, type Page } from './state/ui'

const PAGES: Page[] = ['chronicle', 'contract', 'archive']

export default function App(): React.JSX.Element {
  const status = useLedger((s) => s.status)
  const error = useLedger((s) => s.error)
  const load = useLedger((s) => s.load)
  const page = useUI((s) => s.page)

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

  // Ctrl+1/2/3 switch pages from anywhere; M pauses or resumes the music.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey && !e.altKey && !isTyping(e) && !isDialogOpen()) {
        e.preventDefault()
        useLedger.getState().apply((l) => setSound(l, { music: !l.settings.sound.music, musicVolume: l.settings.sound.musicVolume || 0.5 }))
        return
      }
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      const i = ['1', '2', '3'].indexOf(e.key)
      if (i >= 0 && !isDialogOpen()) {
        e.preventDefault()
        useUI.getState().go(PAGES[i])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Fitbit: fill in steps and calories once the ledger is open, then keep them fresh.
  useEffect(() => (status === 'ready' ? startHealthSync() : undefined), [status])

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
            <div className={`sheet page page--${page}`} key={page}>
              <div className="sheet__paper" aria-hidden="true" />
              <div className="page__content">
                {page === 'chronicle' && <ChroniclePage />}
                {page === 'contract' && <ContractPage />}
                {page === 'archive' && <ArchivePage />}
              </div>
            </div>
          </main>
          <ProfileModal />
          <SettingsModal />
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
      <FloatLayer />
      <Toasts />
    </div>
  )
}
