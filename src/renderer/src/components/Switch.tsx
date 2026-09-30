import { sfx } from '../audio'

export function Switch({ on, label, onChange }: { on: boolean; label: string; onChange(on: boolean): void }): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`switch ${on ? 'is-on' : ''}`}
      onClick={() => {
        sfx('click')
        onChange(!on)
      }}
    >
      <span className="switch__track" aria-hidden="true">
        <span className="switch__word">{on ? 'On' : 'Off'}</span>
      </span>
      <span className="switch__knob" aria-hidden="true" />
    </button>
  )
}
