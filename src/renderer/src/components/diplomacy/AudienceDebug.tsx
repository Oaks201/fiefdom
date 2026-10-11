/**
 * TEMPORARY, development builds only (Audience.tsx draws it under `import.meta.env.DEV`): sets the
 * Respect the Audience picks its line by, to read each tier's line. It never changes the campaign;
 * Respect, saves and deals are untouched. To remove it, delete this file and the lines marked
 * TEMPORARY in Audience.tsx.
 */
export function AudienceDebug({ real, value, tiers, onChange }: { real: number; value: number | null; tiers: number[]; onChange(next: number | null): void }): React.JSX.Element {
  const shown = value ?? real
  return (
    <div className="audience-debug" role="group" aria-label="Development: Respect for the line">
      <span className="audience-debug__tag">DEV</span>
      <label className="audience-debug__range">
        Respect for the line
        <input type="range" min={0} max={100} step={1} value={shown} onChange={(e) => onChange(Number(e.target.value))} />
        <output>{shown}</output>
      </label>
      {tiers.map((tier) => (
        <button key={tier} type="button" className="btn btn--ghost btn--small" onClick={() => onChange(tier)}>
          {tier}
        </button>
      ))}
      <button type="button" className="btn btn--small" onClick={() => onChange(null)} disabled={value === null}>
        Real ({real})
      </button>
    </div>
  )
}
