import { useEffect, useState } from 'react'
import type { IconType } from 'react-icons'
import { GiLyre, GiQuillInk } from 'react-icons/gi'
import { sfx } from '../audio'
import { setSettings, setSound } from '../lib/ledger'
import type { SoundSettings } from '../lib/types'
import { useLedgerData } from '../state/hooks'
import { appInfo, isDesktop, revealLedgerFolder } from '../state/persistence'
import { useLedger } from '../state/store'
import { useUI } from '../state/ui'
import { Modal } from './Modal'

function Switch({ on, label, onChange }: { on: boolean; label: string; onChange(on: boolean): void }): React.JSX.Element {
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

interface SoundRowProps {
  icon: IconType
  label: string
  hint: string
  on: boolean
  volume: number
  onToggle(on: boolean): void
  onVolume(v: number): void
  onVolumeSet?(): void
}

function SoundRow({ icon: Icon, label, hint, on, volume, onToggle, onVolume, onVolumeSet }: SoundRowProps): React.JSX.Element {
  const pct = Math.round(volume * 100)
  return (
    <div className={`sound-row ${on ? '' : 'is-off'}`}>
      <Icon className="sound-row__icon" aria-hidden="true" />
      <div className="sound-row__text">
        <div className="sound-row__label">{label}</div>
        <div className="sound-row__hint">{hint}</div>
      </div>
      <label className="volume" title={`${label} volume`}>
        <span className="sr-only">{label} volume</span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={pct}
          disabled={!on}
          style={{ '--fill': `${pct}%` } as React.CSSProperties}
          onChange={(e) => onVolume(Number(e.target.value) / 100)}
          onPointerUp={onVolumeSet}
          onKeyUp={onVolumeSet}
        />
        <span className="volume__value">{on ? `${pct}%` : '—'}</span>
      </label>
      <Switch on={on} label={label} onChange={onToggle} />
    </div>
  )
}

export function SettingsModal(): React.JSX.Element {
  const open = useUI((s) => s.settingsOpen)
  const setOpen = useUI((s) => s.setSettingsOpen)
  const ledger = useLedgerData()
  const apply = useLedger((s) => s.apply)
  const { sound, unit, weekStartsOn } = ledger.settings
  const [dataDir, setDataDir] = useState<string | null>(null)

  useEffect(() => {
    if (open) void appInfo().then((info) => setDataDir(info?.dataDir ?? null))
  }, [open])

  const setS = (patch: Partial<SoundSettings>): void => {
    apply((l) => setSound(l, patch))
  }

  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Settings" className="modal--settings" labelledBy="settings-title">
      <section className="settings__section">
        <h3 className="settings__heading">Sound</h3>
        <SoundRow
          icon={GiLyre}
          label="Music"
          hint="Innfolk Mirth — a tune for the tavern"
          on={sound.music}
          volume={sound.musicVolume}
          onToggle={(music) => setS({ music, musicVolume: music && sound.musicVolume === 0 ? 0.5 : sound.musicVolume })}
          onVolume={(musicVolume) => setS({ musicVolume })}
        />
        <SoundRow
          icon={GiQuillInk}
          label="Sound effects"
          hint="Paper, wax seals, quills and coin"
          on={sound.effects}
          volume={sound.effectsVolume}
          onToggle={(effects) => {
            setS({ effects, effectsVolume: effects && sound.effectsVolume === 0 ? 0.7 : sound.effectsVolume })
            if (effects) setTimeout(() => sfx('stamp'), 40)
          }}
          onVolume={(effectsVolume) => setS({ effectsVolume })}
          onVolumeSet={() => sfx('coin')}
        />
        <p className="settings__tip">
          Press <kbd className="kbd">M</kbd> anywhere to pause or resume the music.
        </p>
      </section>

      <section className="settings__section">
        <h3 className="settings__heading">The ledger</h3>
        <div className="settings__row">
          <span className="settings__label">Weights measured in</span>
          <span className="unit-toggle unit-toggle--wide" role="radiogroup" aria-label="Weight unit">
            {(['lb', 'kg'] as const).map((u) => (
              <button
                key={u}
                type="button"
                role="radio"
                aria-checked={unit === u}
                className={unit === u ? 'is-on' : ''}
                onClick={() => {
                  sfx('click')
                  apply((l) => setSettings(l, { unit: u }))
                }}
              >
                {u === 'lb' ? 'Pounds' : 'Kilograms'}
              </button>
            ))}
          </span>
        </div>
        <div className="settings__row">
          <span className="settings__label">Weeks begin on</span>
          <span className="unit-toggle unit-toggle--wide" role="radiogroup" aria-label="First day of the week">
            {([1, 0] as const).map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={weekStartsOn === d}
                className={weekStartsOn === d ? 'is-on' : ''}
                onClick={() => {
                  sfx('click')
                  apply((l) => setSettings(l, { weekStartsOn: d }))
                }}
              >
                {d === 1 ? 'Monday' : 'Sunday'}
              </button>
            ))}
          </span>
        </div>
        <p className="settings__note">A contract keeps the unit it was sealed with.</p>
      </section>

      {isDesktop && (
        <section className="settings__section">
          <h3 className="settings__heading">Your data</h3>
          <p className="settings__note">
            Saved on this computer{dataDir ? <> in <code>{dataDir}</code></> : null}, with a backup each day.{' '}
            <button type="button" className="link" onClick={() => void revealLedgerFolder()}>
              Open the folder
            </button>
          </p>
        </section>
      )}

      <p className="settings__fine">
        Background music: Innfolk Mirth. Sound effects are played live by the app. Icons by the authors of game-icons.net (CC BY 3.0); fonts under the SIL Open Font License.
      </p>

      <div className="modal__actions">
        <button type="button" className="btn btn--primary" onClick={() => setOpen(false)} data-autofocus>
          Done
        </button>
      </div>
    </Modal>
  )
}
