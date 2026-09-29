/**
 * Gradients and filters shared by every seal and sheet of parchment, defined once for the page.
 */
export const WAX = {
  crimson: ['#ffab76', '#c5402e', '#561b16', '#8c281f'],
  gold: ['#fff3b0', '#e1ae43', '#694016', '#a26e26'],
  royal: ['#bdd2ff', '#4b79bc', '#1b2b50', '#2e4c7d'],
  forest: ['#c2dfa3', '#589250', '#243d22', '#3a6535'],
  amber: ['#ffe4a3', '#e69a37', '#723b16', '#a86425'],
  ash: ['#e0d2b9', '#8a7d6c', '#383029', '#605345']
} as const

export type WaxColor = keyof typeof WAX

export function SvgDefs(): React.JSX.Element {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        {Object.entries(WAX).map(([name, [hi, mid, lo, deep]]) => (
          <g key={name}>
            <radialGradient id={`wax-${name}`} cx="30%" cy="20%" r="85%">
              <stop offset="0" stopColor={hi} />
              <stop offset="0.3" stopColor={mid} />
              <stop offset="0.72" stopColor={deep} />
              <stop offset="1" stopColor={lo} />
            </radialGradient>
            <linearGradient id={`wax-${name}-rim`} x1="20%" y1="0%" x2="70%" y2="100%">
              <stop offset="0" stopColor={hi} />
              <stop offset="0.25" stopColor={mid} />
              <stop offset="0.65" stopColor={deep} />
              <stop offset="1" stopColor={lo} />
            </linearGradient>
            <radialGradient id={`wax-${name}-pressed`} cx="58%" cy="76%" r="90%">
              <stop offset="0" stopColor={deep} />
              <stop offset="0.65" stopColor={deep} />
              <stop offset="1" stopColor={lo} />
            </radialGradient>
            <linearGradient id={`wax-${name}-emblem`} x1="0%" y1="0%" x2="25%" y2="100%">
              <stop offset="0" stopColor={hi} />
              <stop offset="1" stopColor={mid} />
            </linearGradient>
          </g>
        ))}
        <linearGradient id="wax-edge-light" x1="10%" y1="0%" x2="65%" y2="100%">
          <stop offset="0" stopColor="#fff4d3" stopOpacity="0.8" />
          <stop offset="0.45" stopColor="#fff4d3" stopOpacity="0.12" />
          <stop offset="1" stopColor="#1e100a" stopOpacity="0.45" />
        </linearGradient>
        <radialGradient id="seal-socket-well" cx="50%" cy="60%" r="60%">
          <stop offset="0" stopColor="#704421" stopOpacity="0.02" />
          <stop offset="0.8" stopColor="#704421" stopOpacity="0.06" />
          <stop offset="1" stopColor="#704421" stopOpacity="0.18" />
        </radialGradient>
        <filter id="seal-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.2" />
        </filter>

        {/* Deckled, slightly burnt paper edges. Applied only to background layers, never to text. */}
        <filter id="rough-edge" x="-3%" y="-3%" width="106%" height="106%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="3" seed="7" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="11" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id="rough-edge-soft" x="-3%" y="-3%" width="106%" height="106%">
          <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="3" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="5" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
    </svg>
  )
}
