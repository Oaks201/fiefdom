import { GameArt } from '../components/game/GameArt'

/** The Armory: items, Wings and Elites, opened by the Milestones. A shell until T16 fills it. */
export function ArmoryPage(): React.JSX.Element {
  return (
    <div className="game-page armory-page">
      <header className="page-head">
        <h1 className="page-title">The Armory</h1>
        <p className="page-sub">Arms and companies for the realm. Its doors open with your first Milestone.</p>
      </header>
      <div className="game-page__art">
        <GameArt slot="ui.parchment" owner="player" width={320} label="Armory" />
      </div>
    </div>
  )
}
