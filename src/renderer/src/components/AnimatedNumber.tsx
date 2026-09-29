import { useEffect, useRef, useState } from 'react'
import { formatNumber } from '../lib/format'

/** Counts smoothly from the previous value to the new one. */
export function AnimatedNumber({ value, duration = 700, format = formatNumber }: { value: number; duration?: number; format?: (n: number) => string }): React.JSX.Element {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  const raf = useRef(0)

  useEffect(() => {
    const start = performance.now()
    const a = from.current
    const b = value
    if (a === b) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      from.current = b
      setShown(b)
      return
    }
    const step = (now: number): void => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      const v = a + (b - a) * eased
      from.current = v
      setShown(v)
      if (t < 1) raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [value, duration])

  return <>{format(Math.round(shown))}</>
}
