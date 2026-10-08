import type { IconType } from 'react-icons'
import { GiArrowsShield, GiBowArrow, GiCrossedSwords, GiFlame, GiHeavyArrow, GiMagicSwirl, GiSwordman } from 'react-icons/gi'
import type { Intent, Lane, SlotKey } from '../../lib/game/types'
import { intentName, intentText, type UnitView } from '../../lib/game/view/battle'
import { amount, factor } from '../../lib/game/view/refusals'
import { GameArt } from '../game/GameArt'

const LANES: Lane[] = ['left', 'center', 'right']

export const INTENT_ICONS: Record<Intent, IconType> = {
  strike: GiCrossedSwords,
  charge: GiHeavyArrow,
  volley: GiBowArrow,
  brace: GiArrowsShield,
  shift: GiSwordman,
  spell: GiMagicSwirl
}

const STATUS_NAMES: Record<UnitView['status'][number], string> = { weary: 'Weary', petrified: 'Petrified', poisoned: 'Poisoned', hired: 'Hired' }

/** A company as the field shows it: in its slot, with this frame's health. */
export type FieldUnit = Omit<UnitView, 'slot' | 'hp' | 'routed'> & { slot?: SlotKey; hp: number; routed: boolean }

export interface Float {
  key: string
  unitId: string
  amount: number
}

function UnitCard({ unit, floats, selected, onClick }: { unit: FieldUnit; floats: Float[]; selected: boolean; onClick?(): void }): React.JSX.Element {
  const share = unit.maxHp > 0 ? Math.max(0, unit.hp) / unit.maxHp : 0
  const Intent = unit.intent ? INTENT_ICONS[unit.intent] : null
  return (
    <button
      type="button"
      className={`unit unit--${unit.side} ${unit.routed ? 'is-routed' : ''} ${selected ? 'is-selected' : ''}`}
      onClick={onClick}
      disabled={!onClick}
      title={`${unit.name}${unit.power !== undefined ? `, power ${amount(unit.power)}` : ''}, ${unit.reach}${unit.tags.length ? `, ${unit.tags.join(' and ')}` : ''}`}
      data-unit={unit.id}
    >
      <GameArt slot={unit.art} owner={unit.side === 'player' ? 'player' : 'orc'} width={40} label={unit.name} className="unit__token" />
      <span className="unit__body">
        <span className="unit__name">{unit.name}</span>
        <span className="unit__meta">
          {unit.power !== undefined && <span className="unit__power">{amount(unit.power)}</span>}
          <span className="unit__reach">{unit.reach}</span>
          {unit.tags.length > 0 && <span className="unit__tags">{unit.tags.join(' · ')}</span>}
        </span>
        <span className="unit__health" style={{ ['--hp' as string]: share }} aria-label={`Health ${factor(unit.hp)} of ${factor(unit.maxHp)}`}>
          <span className="unit__hp">
            {factor(Math.max(0, unit.hp))} / {factor(unit.maxHp)}
          </span>
        </span>
        {unit.status.length > 0 && (
          <span className="unit__status">
            {unit.status.map((s) => (
              <span key={s} className={`chip-mini chip-mini--${s}`}>
                {STATUS_NAMES[s]}
              </span>
            ))}
          </span>
        )}
      </span>
      {Intent && unit.intent && (
        <span className="unit__intent" title={intentText(unit.intent)}>
          <Intent aria-hidden="true" />
        </span>
      )}
      {floats.map((f) => (
        <span key={f.key} className="float-dmg">
          −{factor(f.amount)}
        </span>
      ))}
    </button>
  )
}

export interface FieldGridProps {
  units: FieldUnit[]
  /** Each lane's shown intent for the coming round. */
  lanes: { lane: Lane; intent?: Intent }[]
  floats?: Float[]
  /** Player slots picked for a swap. */
  picked?: SlotKey[]
  onPlayerSlot?(slot: SlotKey): void
  onEnemy?(unitId: string): void
  /** Enemy companies an Order can aim at now. */
  aimable?: string[]
}

/**
 * The 3-lane field (Ch 11 "Units on the field"): the enemy's rear and front rows above, the lanes'
 * intents between the sides, the player's front and rear rows below. Routed companies stand aside.
 */
export function FieldGrid({ units, lanes, floats = [], picked = [], onPlayerSlot, onEnemy, aimable = [] }: FieldGridProps): React.JSX.Element {
  const at = (side: 'player' | 'enemy', slot: SlotKey): FieldUnit | undefined => units.find((u) => u.side === side && !u.routed && u.slot === slot)
  const floatsOf = (id: string): Float[] => floats.filter((f) => f.unitId === id)
  const row = (side: 'player' | 'enemy', rank: 'front' | 'rear'): React.JSX.Element => (
    <div className={`field__row field__row--${side} field__row--${rank}`}>
      <span className="field__rank">{rank === 'front' ? 'Front' : 'Rear'}</span>
      {LANES.map((lane) => {
        const slot = `${lane}:${rank}` as SlotKey
        const unit = at(side, slot)
        const onClick = side === 'player' ? (onPlayerSlot ? () => onPlayerSlot(slot) : undefined) : unit && onEnemy && aimable.includes(unit.id) ? () => onEnemy(unit.id) : undefined
        if (!unit) {
          return (
            <button key={slot} type="button" className={`slot slot--empty ${picked.includes(slot) ? 'is-selected' : ''}`} disabled={side === 'enemy' || !onPlayerSlot} onClick={onClick} aria-label={`Empty ${lane} ${rank}`}>
              <span>{side === 'player' ? 'Empty' : ''}</span>
            </button>
          )
        }
        return (
          <div key={slot} className={`slot ${aimable.includes(unit.id) ? 'is-aimable' : ''}`}>
            <UnitCard unit={unit} floats={floatsOf(unit.id)} selected={side === 'player' && picked.includes(slot)} onClick={onClick} />
          </div>
        )
      })}
    </div>
  )
  const routed = units.filter((u) => u.routed)
  return (
    <div className="field">
      {row('enemy', 'rear')}
      {row('enemy', 'front')}
      <div className="field__lanes">
        <span className="field__rank">Intent</span>
        {LANES.map((lane) => {
          const intent = lanes.find((l) => l.lane === lane)?.intent
          const Icon = intent ? INTENT_ICONS[intent] : null
          return (
            <div key={lane} className={`lane-intent ${intent ? `lane-intent--${intent}` : ''}`} title={intent ? intentText(intent) : undefined}>
              <span className="lane-intent__lane">{lane}</span>
              {Icon && intent ? (
                <span className="lane-intent__what">
                  <Icon aria-hidden="true" /> {intentName(intent)}
                </span>
              ) : (
                <span className="lane-intent__what muted">—</span>
              )}
            </div>
          )
        })}
      </div>
      {row('player', 'front')}
      {row('player', 'rear')}
      {routed.length > 0 && (
        <div className="field__routed">
          <GiFlame aria-hidden="true" /> Routed: {routed.map((u) => `${u.name}`).join(', ')}
          {routed
            .flatMap((u) => floatsOf(u.id))
            .map((f) => (
              <span key={f.key} className="float-dmg float-dmg--inline">
                −{amount(f.amount)}
              </span>
            ))}
        </div>
      )}
    </div>
  )
}
