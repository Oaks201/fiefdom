import tavernDesk from '../assets/art/tavern-desk.png'

/** Painted scenery stays behind the ledger and never intercepts input. */
export function DeskProps(): React.JSX.Element {
  return (
    <div className="desk-props" aria-hidden="true">
      <img className="desk-props__art" src={tavernDesk} alt="" draggable={false} />
    </div>
  )
}
