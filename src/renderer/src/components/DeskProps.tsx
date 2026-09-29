import { GiFeather } from 'react-icons/gi'
import { WaxSeal } from './WaxSeal'

/** Purely decorative things lying on the desk around the parchment. */
export function DeskProps(): React.JSX.Element {
  return (
    <div className="desk-props" aria-hidden="true">
      <div className="candle-glow" />
      <svg className="prop prop--candle" viewBox="0 0 160 160" width="160" height="160">
        <defs>
          <radialGradient id="brass" cx="40%" cy="35%" r="70%">
            <stop offset="0" stopColor="#f6d98a" />
            <stop offset="0.5" stopColor="#b8862f" />
            <stop offset="1" stopColor="#5b3a0e" />
          </radialGradient>
          <radialGradient id="candle-wax" cx="45%" cy="40%" r="60%">
            <stop offset="0" stopColor="#fff8e6" />
            <stop offset="0.7" stopColor="#efe0bd" />
            <stop offset="1" stopColor="#c9b184" />
          </radialGradient>
          <radialGradient id="flame-halo" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#ffd27a" stopOpacity="0.55" />
            <stop offset="0.35" stopColor="#ffb341" stopOpacity="0.22" />
            <stop offset="1" stopColor="#ff7a18" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="flame" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.25" stopColor="#fff3b0" />
            <stop offset="0.6" stopColor="#ffb341" stopOpacity="0.85" />
            <stop offset="1" stopColor="#ff7a18" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse cx="84" cy="88" rx="66" ry="64" fill="rgba(0,0,0,.45)" />
        <circle cx="80" cy="80" r="64" fill="url(#brass)" />
        <circle cx="80" cy="80" r="52" fill="none" stroke="rgba(60,35,5,.55)" strokeWidth="3" />
        <circle cx="80" cy="80" r="49" fill="none" stroke="rgba(255,230,160,.35)" strokeWidth="1.5" />
        {/* wax drips pooled in the dish */}
        <path d="M98 70 q16 4 14 18 q-2 8 -12 6 q-6 -8 -2 -24z" fill="#eadcb8" opacity=".9" />
        <path d="M60 94 q-12 10 -6 20 q8 4 12 -6 q0 -8 -6 -14z" fill="#eadcb8" opacity=".85" />
        <circle cx="80" cy="80" r="30" fill="url(#candle-wax)" />
        {/* the melted pool around the wick */}
        <circle cx="80" cy="80" r="18" fill="#ecd9a6" opacity=".75" />
        <circle cx="80" cy="80" r="18" fill="none" stroke="rgba(255,255,255,.55)" strokeWidth="1.2" />
        <circle className="prop__flame-halo" cx="80" cy="80" r="44" fill="url(#flame-halo)" />
        <circle cx="80" cy="80" r="2.4" fill="#2b1a0e" />
        <circle className="prop__flame" cx="80" cy="80" r="9" fill="url(#flame)" />
      </svg>

      <svg className="prop prop--coins" viewBox="0 0 150 110" width="150" height="110">
        <defs>
          <radialGradient id="coin" cx="38%" cy="32%" r="75%">
            <stop offset="0" stopColor="#fff3b8" />
            <stop offset="0.5" stopColor="#d7a83b" />
            <stop offset="1" stopColor="#7a520f" />
          </radialGradient>
        </defs>
        {[
          [40, 58, 30],
          [84, 44, 28],
          [102, 78, 24],
          [60, 30, 22]
        ].map(([cx, cy, r], i) => (
          <g key={i}>
            <circle cx={cx + 3} cy={cy + 4} r={r} fill="rgba(0,0,0,.45)" />
            <circle cx={cx} cy={cy} r={r} fill="url(#coin)" />
            <circle cx={cx} cy={cy} r={r * 0.78} fill="none" stroke="rgba(90,58,10,.6)" strokeWidth="1.6" />
            <circle cx={cx} cy={cy} r={r * 0.84} fill="none" stroke="rgba(255,240,190,.45)" strokeWidth="1" />
            <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="central" fontFamily="Cinzel, serif" fontWeight="900" fontSize={r * 0.8} fill="rgba(110,72,12,.85)">
              R
            </text>
          </g>
        ))}
      </svg>

      <div className="prop prop--letter">
        <div className="prop--letter__paper" />
        <WaxSeal color="crimson" letter="F" size={54} seed={23} />
      </div>

      <div className="prop prop--quill">
        <svg width="0" height="0" style={{ position: 'absolute' }}>
          <defs>
            <linearGradient id="quill-shade" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#fbf6ea" />
              <stop offset="0.55" stopColor="#e6d9bb" />
              <stop offset="1" stopColor="#b9a47c" />
            </linearGradient>
          </defs>
        </svg>
        <GiFeather />
      </div>

      <svg className="prop prop--inkwell" viewBox="0 0 120 120" width="120" height="120">
        <defs>
          <radialGradient id="ink-glass" cx="40%" cy="35%" r="65%">
            <stop offset="0" stopColor="#4d5a66" />
            <stop offset="0.6" stopColor="#1b2229" />
            <stop offset="1" stopColor="#07090b" />
          </radialGradient>
        </defs>
        <circle cx="64" cy="66" r="50" fill="rgba(0,0,0,.5)" />
        <circle cx="60" cy="60" r="50" fill="url(#ink-glass)" />
        <circle cx="60" cy="60" r="24" fill="url(#brass)" />
        <circle cx="60" cy="60" r="14" fill="#050608" />
        <ellipse cx="44" cy="40" rx="16" ry="8" fill="rgba(255,255,255,.18)" transform="rotate(-30 44 40)" />
      </svg>
    </div>
  )
}
