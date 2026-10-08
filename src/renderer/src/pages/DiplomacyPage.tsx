import { GameArt } from '../components/game/GameArt'
import { RIVAL_IDS } from '../lib/game/types'
import { rivalName } from '../lib/game/view/shell'

/** Diplomacy: the four rival courts, deals and courtships. A shell until T15 and T16 fill it. */
export function DiplomacyPage(): React.JSX.Element {
  return (
    <div className="game-page diplomacy-page">
      <header className="page-head">
        <h1 className="page-title">Diplomacy</h1>
        <p className="page-sub">The four rival courts, their Respect, and the deals and courtships between you. The envoys are on their way.</p>
      </header>
      <ul className="rival-shells">
        {RIVAL_IDS.map((r) => (
          <li key={r}>
            <GameArt slot={`rival.${r}.calm`} owner={r} width={160} label={rivalName(r)} />
            <span>{rivalName(r)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
