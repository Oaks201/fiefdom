import { useEffect, useState } from 'react'
import { RIVAL_IDS, type RivalId } from '../../lib/game/types'
import { PORTRAIT_SETUP, portraitChoice, portraitFiles, standingFrom, standingOf, type Fallback, type PathPick } from '../../lib/game/view/playerPortrait'
import { rivalName } from '../../lib/game/view/shell'
import { useCampaign } from '../../state/campaign'
import { useMoments } from '../../state/moments'
import { readSeenStanding, standingMoment, usePlayerPortrait, usePortraitFiles, writeSeenStanding } from '../../state/playerPortrait'
import { Modal } from '../Modal'
import { PlayerPortrait } from './PlayerPortrait'
import './DevPortraitPaths.css'

const FALLBACKS: Record<Fallback, string> = {
  none: 'None: the wanted file exists',
  leadSameTier: 'The leading path, same tier (the hybrid is missing)',
  lowerTier: 'The leading path at a lower tier',
  base: 'The base file',
  placeholder: 'No file found: the placeholder card'
}

const ZERO = Object.fromEntries(RIVAL_IDS.map((r) => [r, 0])) as Record<RivalId, number>

function pathName(rival: RivalId): string {
  return PORTRAIT_SETUP.config?.paths.find(([id]) => id === rival)?.[1] ?? rival
}

function decision(path: PathPick, tier: number): string {
  if (tier <= 1) return 'Tier 1 always uses the base file.'
  if (path.kind === 'base') return 'Every path is at 0: the base file.'
  const n = path.numbers
  const share = `${Math.round((PORTRAIT_SETUP.config?.closeMargin ?? 0) * 100)}% of ${n.top} = ${Math.round(n.limit * 10) / 10}`
  if (path.kind === 'pure') return `${rivalName(path.lead)} ${n.top}, next ${n.second}: the gap ${n.gap} is more than ${share} → pure ${pathName(path.lead)}.`
  return `${rivalName(path.lead)} ${n.top}, ${rivalName(path.second)} ${n.second}: the gap ${n.gap} is within ${share} → hybrid of the top two.`
}

/**
 * TEMPORARY, development builds only (App.tsx loads it under `import.meta.env.DEV`): set the tier
 * and each rival's Dominion and see which portrait file is chosen and which fallback stood in;
 * check which of the 41 files exist; raise the standing card. It never changes the campaign. To
 * remove it, delete this file, DevPortraitPaths.css and the lines marked TEMPORARY in App.tsx.
 */
export default function DevPortraitPaths(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const campaign = useCampaign((s) => s.campaign)
  const known = usePortraitFiles((s) => s.known)
  const check = usePortraitFiles((s) => s.check)
  const recheck = usePortraitFiles((s) => s.recheck)
  const revision = usePortraitFiles((s) => s.revision)
  const [tier, setTier] = useState<number | null>(null)
  const [values, setValues] = useState<Record<RivalId, number> | null>(null)
  const [seen, setSeen] = useState(readSeenStanding)

  const real = campaign ? standingOf(campaign) : standingFrom(ZERO)
  const standing = standingFrom(values ?? real.perPath, tier ?? undefined)
  const choice = portraitChoice(standing)
  const resolved = usePlayerPortrait(choice)
  const files = portraitFiles()
  const filesKey = files.join('|')
  const tiers = PORTRAIT_SETUP.config?.tiers ?? []
  useEffect(() => {
    if (open && filesKey) check(filesKey.split('|'))
  }, [open, revision, check, filesKey])

  const remember = (next: { tier: number; key: string } | null): void => {
    writeSeenStanding(next)
    setSeen(readSeenStanding())
  }

  return (
    <>
      <button type="button" className="dev-portrait-toggle" title="Player portraits (development)" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        Portraits
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Player portraits" labelledBy="dev-portrait-title" className="dev-portrait-modal">
        {PORTRAIT_SETUP.problems.length > 0 && (
          <p className="dev-portrait__problem" role="alert">
            playerPortraits.json: {PORTRAIT_SETUP.problems.join('; ')}
          </p>
        )}
        <div className="dev-portrait__cols">
          <section className="dev-portrait__inputs" aria-label="Inputs">
            <label className="dev-portrait__row">
              <span>Tier</span>
              <select value={tier ?? ''} onChange={(e) => setTier(e.target.value ? Number(e.target.value) : null)}>
                <option value="">From Dominion ({standingFrom(values ?? real.perPath).tier})</option>
                {tiers.map((floor, i) => (
                  <option key={floor} value={i + 1}>
                    {i + 1} (from {floor})
                  </option>
                ))}
              </select>
            </label>
            {RIVAL_IDS.map((r) => (
              <label key={r} className="dev-portrait__row">
                <span>
                  {rivalName(r)} <small>({pathName(r)})</small>
                </span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={(values ?? real.perPath)[r]}
                  onChange={(e) => setValues({ ...(values ?? real.perPath), [r]: Math.max(0, Number(e.target.value) || 0) })}
                  aria-label={`${rivalName(r)} Dominion`}
                />
              </label>
            ))}
            <p className="dev-portrait__muted">
              Overall {standing.overall} · tier {choice.tier}
              {campaign ? ` · the campaign: overall ${real.overall}, tier ${real.tier}` : ' · no campaign'}
            </p>
            <button
              type="button"
              className="btn btn--small"
              onClick={() => {
                setValues(null)
                setTier(null)
              }}
              disabled={values === null && tier === null}
            >
              Use real values
            </button>
          </section>

          <section className="dev-portrait__result" aria-label="Result" data-key={choice.key} data-file={resolved.file ?? ''} data-fallback={resolved.fallback}>
            <PlayerPortrait choice={choice} width={150} name="Preview" className="dev-portrait__preview" />
            <p>{decision(choice.path, choice.tier)}</p>
            <dl>
              <dt>Wanted</dt>
              <dd>
                <code>{choice.wanted ?? '—'}</code>
              </dd>
              <dt>Chosen</dt>
              <dd>
                <code>{resolved.file ?? 'none'}</code>
                {resolved.pending && ' (still checking)'}
              </dd>
              <dt>Fallback</dt>
              <dd>{FALLBACKS[resolved.fallback]}</dd>
            </dl>
            <ol className="dev-portrait__chain">
              {choice.chain.map((file) => (
                <li key={file} className={file === resolved.file ? 'is-chosen' : ''}>
                  <code>{file}</code> <span className={`dev-portrait__state is-${known[file] === undefined ? 'checking' : known[file] ? 'present' : 'missing'}`}>{known[file] === undefined ? 'checking…' : known[file] ? 'present' : 'missing'}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <section aria-label="Standing card" className="dev-portrait__card">
          <h3>Standing card</h3>
          <p className="dev-portrait__muted">Last seen on this computer: {seen ? <code>{seen.key}</code> : 'nothing yet (the next settlement only records it)'}</p>
          <div className="dev-portrait__actions">
            <button
              type="button"
              className="btn btn--small"
              onClick={() => {
                setOpen(false)
                useMoments.getState().show(standingMoment(choice))
              }}
            >
              Show the standing card
            </button>
            <button type="button" className="btn btn--small btn--ghost" onClick={() => remember({ tier: 1, key: 't1' })}>
              Remember tier 1 as last seen
            </button>
            <button type="button" className="btn btn--small btn--ghost" onClick={() => remember(null)} disabled={!seen}>
              Forget last seen
            </button>
          </div>
        </section>

        <section aria-label="Every portrait file" className="dev-portrait__files">
          <h3>
            Every portrait file: {files.filter((f) => known[f]).length} of {files.length} present
          </h3>
          <button type="button" className="btn btn--small" onClick={recheck}>
            Re-check files
          </button>
          <ul>
            {files.map((file) => (
              <li key={file} className={`dev-portrait__state is-${known[file] === undefined ? 'checking' : known[file] ? 'present' : 'missing'}`}>
                {file}
              </li>
            ))}
          </ul>
        </section>
      </Modal>
    </>
  )
}
