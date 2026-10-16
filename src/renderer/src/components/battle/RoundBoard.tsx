import { useEffect, useState } from 'react'
import { GiBackForth, GiCrossedSwords } from 'react-icons/gi'
import { sfx } from '../../audio'
import type { RoundPlay } from '../../lib/game/grand/field'
import type { OrderTarget, SlotKey } from '../../lib/game/types'
import type { FieldView, RoundView } from '../../lib/game/view/battle'
import { amount } from '../../lib/game/view/refusals'
import { FieldGrid, type Float } from './FieldGrid'
import { RoundLog, Shares } from './BattleParts'

const FLOAT_MS = 1_600

function sameTarget(a: OrderTarget, b: OrderTarget): boolean {
  return a.lane === b.lane && a.unit === b.unit && a.slot === b.slot
}

/**
 * The round controls of a battle on the field (Ch 11 "A round"), shared by Grand Battles and the
 * daily skirmishes (D-12): the field with each lane's intent, the Orders on offer (each playable
 * once), one optional swap, and "Resolve round". `play` plays the round and answers the round it
 * played (or null when refused), whose damage then shows over the companies.
 */
export function RoundBoard({ view, play }: { view: FieldView; play(play: RoundPlay): RoundView | null }): React.JSX.Element {
  const [order, setOrder] = useState<string | null>(null)
  const [target, setTarget] = useState<OrderTarget | null>(null)
  const [swapping, setSwapping] = useState(false)
  const [swap, setSwap] = useState<SlotKey[]>([])
  const [floats, setFloats] = useState<Float[]>([])

  useEffect(() => {
    if (floats.length === 0) return
    const id = setTimeout(() => setFloats([]), FLOAT_MS)
    return () => clearTimeout(id)
  }, [floats])

  const card = view.offered.find((o) => o.id === order)
  const needsTarget = !!card && (card.needs.lane || card.needs.unit || card.needs.slot)
  const aimable = card?.needs.unit ? [...new Set(card.targets.map((t) => t.target.unit).filter((u): u is string => !!u))] : []
  const ready = !needsTarget || target !== null

  const resolve = (): void => {
    const round = play({ ...(order ? { order } : {}), ...(order && target ? { target } : {}), ...(swap.length === 2 ? { swap: [swap[0], swap[1]] as [SlotKey, SlotKey] } : {}) })
    if (!round) return
    setFloats(round.lines.map((l, i) => ({ key: `${round.round}-${i}`, unitId: l.toId, amount: l.amount })))
    sfx('strike')
    setOrder(null)
    setTarget(null)
    setSwap([])
    setSwapping(false)
  }

  const onPlayerSlot = (slot: SlotKey): void => {
    if (card?.needs.slot) {
      const t = card.targets.find((x) => x.target.slot === slot)
      if (t) setTarget(t.target)
      return
    }
    if (!swapping) return
    setSwap((s) => (s.includes(slot) ? s.filter((x) => x !== slot) : s.length >= 2 ? [s[1], slot] : [...s, slot]))
  }

  return (
    <div className="battle">
      <div className="battle__top">
        <h3 className="battle__round">
          Round {Math.min(view.round + 1, view.rounds)} of {view.rounds}
        </h3>
        <span className="battle__readiness" title="Readiness multiplies every company's damage for the whole battle">
          Readiness {amount(view.readiness)}
        </span>
        <Shares shares={view.shares} />
      </div>
      <FieldGrid
        units={view.units}
        lanes={view.lanes}
        floats={floats}
        picked={swap}
        onPlayerSlot={onPlayerSlot}
        aimable={aimable}
        onEnemy={(unitId) => {
          const t = card?.targets.find((x) => x.target.unit === unitId)
          if (t) setTarget(t.target)
        }}
      />
      {view.later.length > 0 && (
        <p className="battle__later">
          Foreknowledge:{' '}
          {view.later.map((l) => `round ${l.round}: ${(['left', 'center', 'right'] as const).map((lane) => `${lane} ${l.lanes[lane] ?? '—'}`).join(', ')}`).join(' · ')}
        </p>
      )}

      <section className="orders-hand" aria-label="Orders on offer">
        <h4>Orders this round</h4>
        {view.offered.length === 0 ? (
          <p className="muted">No Order is on offer this round.</p>
        ) : (
          <div className="orders-hand__cards">
            {view.offered.map((o) => {
              const unplayable = (o.needs.lane || o.needs.unit || o.needs.slot) && o.targets.length === 0
              return (
                <button
                  key={o.id}
                  type="button"
                  className={`order-card ${order === o.id ? 'is-on' : ''}`}
                  aria-pressed={order === o.id}
                  disabled={unplayable}
                  title={unplayable ? 'Nothing it could aim at this round' : undefined}
                  onClick={() => {
                    setOrder(order === o.id ? null : o.id)
                    setTarget(null)
                  }}
                >
                  <strong className="order-card__name">{o.name}</strong>
                  <span className="order-card__text">{o.text}</span>
                </button>
              )
            })}
          </div>
        )}
        {card && needsTarget && (
          <div className="orders-hand__targets">
            <span>Aim {card.name} at:</span>
            {card.targets.map((t, i) => (
              <button key={i} type="button" className={`chip ${target && sameTarget(target, t.target) ? 'is-on' : ''}`} onClick={() => setTarget(t.target)}>
                {t.label}
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="battle__actions">
        <button type="button" className={`btn btn--small ${swapping ? 'is-active btn--ghost' : 'btn--ghost'}`} onClick={() => (swapping ? (setSwapping(false), setSwap([])) : setSwapping(true))}>
          <GiBackForth aria-hidden="true" /> {swapping ? (swap.length === 2 ? 'Swap ready' : `Choose ${2 - swap.length} of your slots`) : 'Swap two companies'}
        </button>
        <button type="button" className="btn btn--primary btn--big" disabled={!ready} onClick={resolve}>
          <GiCrossedSwords aria-hidden="true" /> Resolve round
        </button>
        {!ready && <span className="muted">Choose where to aim {card?.name}.</span>}
      </div>

      <RoundLog log={view.log} />
    </div>
  )
}
