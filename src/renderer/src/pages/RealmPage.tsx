import { GameArt } from '../components/game/GameArt'
import { Herald } from '../components/game/Herald'
import { useCampaignToday } from '../state/campaignHooks'

/** The Realm: the hex map and the day's orders. A shell until T15 draws the map. */
export function RealmPage(): React.JSX.Element {
  const today = useCampaignToday()
  return (
    <div className="game-page realm-page">
      <header className="page-head">
        <h1 className="page-title">The Realm</h1>
        <p className="page-sub">Your lands, the rivals’ borders and the wilds between. The map and the day’s orders are being drawn.</p>
      </header>
      <div className="game-page__cols">
        <div className="game-page__art">
          <GameArt slot="castle.1" owner="player" width={360} label="Castle" />
        </div>
        {today && <Herald today={today} />}
      </div>
    </div>
  )
}
