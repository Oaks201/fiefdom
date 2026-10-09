import { useEffect, useState } from 'react'
import { useArt } from '../../state/art'
import { Modal } from '../Modal'
import { GameArt } from './GameArt'
import './DevArtSamples.css'

/** Plain labels for the manifest's asset classes; the art itself always uses the game's slots. */
const CLASS_LABELS: Record<string, string> = {
  hex: 'Terrain',
  overlay: 'Terrain overlay',
  building: 'Building',
  castle: 'Castle',
  rival: 'Rival ruler',
  token: 'Company token',
  portrait: 'Company portrait',
  item: 'Item',
  banner: 'Banner',
  event: 'Event card',
  milestone: 'Milestone',
  moment: 'Big moment',
  frame: 'Interface frame',
  button: 'Button',
  parchment: 'Parchment',
  seal: 'Wax seal',
  icon: 'Interface icon'
}

/** Development-only art review. It reads art slots and never loads scenarios or writes progress. */
export default function DevArtSamples(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const slots = useArt((s) => s.slots)
  const status = useArt((s) => s.status)
  const load = useArt((s) => s.load)
  const reload = useArt((s) => s.reload)
  useEffect(load, [load])

  const installed = Object.entries(slots).filter(([, entry]) => entry.file)
  const samples = showAll ? installed.map(([slot, entry]) => ({ slot, entry, label: CLASS_LABELS[entry.kind] ?? entry.kind })) : Object.entries(CLASS_LABELS).flatMap(([kind, label]) => {
    const sample = Object.entries(slots).find(([, entry]) => entry.kind === kind && entry.file)
    return sample ? [{ slot: sample[0], entry: sample[1], label }] : []
  })

  return (
    <>
      <button type="button" className="dev-art-toggle" title="Art samples" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        Art samples
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Art samples" labelledBy="dev-art-title" className="dev-art-modal">
        <div className="dev-art-toolbar">
          <label>
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show all installed art
          </label>
          <button type="button" className="btn btn--small" onClick={reload} disabled={status === 'loading'}>
            {status === 'loading' ? 'Loading…' : 'Reload art'}
          </button>
        </div>
        <p className="dev-art-count" role="status">{showAll ? `${installed.length} installed assets` : `${samples.length} of ${Object.keys(CLASS_LABELS).length} asset classes installed`}</p>
        <div className="dev-art-grid">
          {samples.map(({ slot, entry, label }) => (
            <figure className={`dev-art-card dev-art-card--${entry.kind}`} key={slot}>
              <div className="dev-art-card__image">
                {entry.kind === 'overlay' && <GameArt slot="hex.wild" width={126} className="dev-art-card__terrain" />}
                <GameArt slot={slot} width={entry.kind === 'banner' ? 90 : entry.kind === 'icon' ? 64 : 180} title={label} />
              </div>
              <figcaption>
                <strong>{label}</strong>
                <code>{slot}</code>
                <span>{entry.size[0]} × {entry.size[1]}</span>
              </figcaption>
            </figure>
          ))}
        </div>
        {samples.length === 0 && <p>No art files are listed in the manifest yet.</p>}
      </Modal>
    </>
  )
}
