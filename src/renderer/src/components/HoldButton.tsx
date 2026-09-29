import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { charge as startCharge } from '../audio'
import type { Charge } from '../audio/sfx'

interface HoldButtonProps {
  onComplete(): void
  children: ReactNode
  /** milliseconds the press must be held */
  duration?: number
  /** the sound that builds while held */
  charge?: 'seal' | 'burn'
  className?: string
  disabled?: boolean
  title?: string
  'aria-label'?: string
}

/**
 * A button that must be pressed and held — used for things that can't be undone,
 * like sealing a contract. Progress is exposed to CSS as `--hold` (0 → 1).
 * Works with the mouse, touch, and by holding Space or Enter.
 */
export function HoldButton({ onComplete, children, duration = 900, charge = 'seal', className, disabled, title, ...rest }: HoldButtonProps): React.JSX.Element {
  const ref = useRef<HTMLButtonElement>(null)
  const raf = useRef(0)
  const start = useRef<number | null>(null)
  const sound = useRef<Charge | null>(null)
  const done = useRef(onComplete)
  done.current = onComplete

  const paint = (p: number): void => {
    ref.current?.style.setProperty('--hold', p.toFixed(3))
    ref.current?.classList.toggle('is-holding', p > 0 && p < 1)
  }

  const silence = (): void => {
    sound.current?.stop()
    sound.current = null
  }

  const cancel = useCallback(() => {
    cancelAnimationFrame(raf.current)
    start.current = null
    silence()
    paint(0)
  }, [])

  const begin = useCallback(() => {
    if (disabled || start.current !== null) return
    start.current = performance.now()
    sound.current = startCharge(charge)
    const step = (now: number): void => {
      if (start.current === null) return
      const p = Math.min(1, (now - start.current) / duration)
      paint(p)
      sound.current?.update(p)
      if (p >= 1) {
        start.current = null
        silence()
        paint(0)
        done.current()
        return
      }
      raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
  }, [disabled, duration, charge])

  useEffect(() => cancel, [cancel])

  return (
    <button
      ref={ref}
      type="button"
      className={`hold-button ${className ?? ''}`}
      disabled={disabled}
      title={title}
      aria-label={rest['aria-label']}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.currentTarget.setPointerCapture(e.pointerId)
        begin()
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
      onKeyDown={(e) => {
        if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
          e.preventDefault()
          begin()
        }
      }}
      onKeyUp={(e) => {
        if (e.key === ' ' || e.key === 'Enter') cancel()
      }}
      onBlur={cancel}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  )
}
