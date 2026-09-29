/**
 * Gradients and filters shared by every seal and sheet of parchment, defined once for the page.
 */
export const WAX = {
  crimson: ['#e56a58', '#a8261d', '#5a0c09', '#7c1611'],
  gold: ['#fff0b3', '#d9a93c', '#7a520f', '#9c6d17'],
  royal: ['#8fb2f0', '#2d57a6', '#0f2350', '#1d3c7a'],
  forest: ['#94d19a', '#2f7440', '#0f3a1b', '#1f5a2e'],
  amber: ['#ffd08a', '#d98424', '#6e3508', '#a45a12'],
  ash: ['#b3aca2', '#57514b', '#1c1916', '#3a3531']
} as const

export type WaxColor = keyof typeof WAX

export function SvgDefs(): React.JSX.Element {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        {Object.entries(WAX).map(([name, [hi, mid, lo, deep]]) => (
          <g key={name}>
            <radialGradient id={`wax-${name}`} cx="34%" cy="30%" r="78%">
              <stop offset="0" stopColor={hi} />
              <stop offset="0.45" stopColor={mid} />
              <stop offset="1" stopColor={lo} />
            </radialGradient>
            <radialGradient id={`wax-${name}-pressed`} cx="62%" cy="66%" r="70%">
              <stop offset="0" stopColor={mid} />
              <stop offset="1" stopColor={deep} />
            </radialGradient>
          </g>
        ))}
        <radialGradient id="wax-gloss" cx="30%" cy="24%" r="40%">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
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
