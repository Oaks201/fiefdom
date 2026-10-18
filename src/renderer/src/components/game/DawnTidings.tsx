import { useEffect } from 'react'
import { GiBootPrints, GiHornInternal, GiKnifeFork } from 'react-icons/gi'
import { catchUp } from '../../lib/game/view/chronicle'
import { isPlayable } from '../../lib/game/state'
import { useCampaign } from '../../state/campaign'
import { useCampaignState, useCampaignToday } from '../../state/campaignHooks'
import { dawnTidingsDue, useDawnTidings } from '../../state/dawnTidings'
import { useLedgerData } from '../../state/hooks'
import { useMoments } from '../../state/moments'
import { useUI } from '../../state/ui'
import { Modal } from '../Modal'
import { calorieCatchUpLine, stepCatchUpLine } from '../campaign/catchUpLines'
import { WeighInBanner } from '../campaign/ChronicleCampaign'
import { GameArt } from './GameArt'
import { Herald } from './Herald'

/** How wide the art band is drawn. */
const ART_WIDTH = 960

/**
 * The Dawn tidings (Patch 6, D-47; spec section 3): once per campaign day, the first time the app is
 * open on it, the Herald's tidings and today's catch-up figures, after any Homecoming or big-moment
 * card and never over another dialog (C-78). The words are the Herald's catalog lines and interface
 * labels (C-80); the art band is `moment.dawnTidings`, with the horn until its picture exists (C-81).
 */
export function DawnTidings(): React.JSX.Element | null {
  const campaign = useCampaignState()
  const openDay = useCampaignToday()
  const ledger = useLedgerData()
  const { seen, on, dismiss } = useDawnTidings()
  const homecoming = useCampaign((s) => s.homecoming)
  const moments = useMoments((s) => s.queue.length)
  const ui = useUI()
  const blocked = homecoming !== null || moments > 0 || ui.foundingOpen || ui.settingsOpen || ui.profileOpen || ui.helpOpen
  const due = dawnTidingsDue({ openDay, seen, on, playable: campaign !== null && isPlayable(campaign), blocked })
  const fighting = ui.battle !== null || ui.skirmish !== null

  // A battle opened from the card ("Fight now", "Prepare", a battle led) takes the screen: the card is done.
  useEffect(() => {
    if (due && fighting && openDay) dismiss(openDay)
  }, [due, fighting, openDay, dismiss])

  if (!due || fighting || !campaign || !openDay) return null
  const figures = catchUp(campaign, ledger, openDay)
  const lines = [
    { icon: GiBootPrints, text: stepCatchUpLine(figures.steps) },
    { icon: GiKnifeFork, text: calorieCatchUpLine(figures.calories) }
  ].filter((l): l is { icon: typeof GiBootPrints; text: string } => l.text !== null)
  const close = (): void => dismiss(openDay)
  const to = (page: 'chronicle' | 'realm'): void => {
    close()
    ui.go(page)
  }

  return (
    <Modal open onClose={close} className="modal--dawn" title="Dawn tidings" labelledBy="dawn-title">
      <div className="dawn">
        <GameArt
          slot="moment.dawnTidings"
          owner="player"
          width={ART_WIDTH}
          className="dawn__art"
          fallback={
            <div className="dawn__art dawn__art--placeholder" aria-hidden="true">
              <GiHornInternal />
            </div>
          }
        />
        <WeighInBanner campaign={campaign} ledger={ledger} today={openDay} />
        {lines.length > 0 && (
          <ul className="dawn__today" aria-label="Today">
            {lines.map(({ icon: Icon, text }) => (
              <li key={text}>
                <Icon aria-hidden="true" /> {text}
              </li>
            ))}
          </ul>
        )}
        <Herald today={openDay} bare />
        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={() => to('realm')}>
            To the Realm
          </button>
          <button type="button" className="btn btn--primary" onClick={() => to('chronicle')} data-autofocus>
            To the Chronicle
          </button>
        </div>
      </div>
    </Modal>
  )
}
