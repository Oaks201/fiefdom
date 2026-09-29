/**
 * The sound of the desk: paper, wax, quills and coin. Each effect is a few synthesised layers,
 * slightly randomised every time so repeated actions never sound mechanical.
 */
import { bell, noise, pluck, tone } from './synth'

export type SfxName =
  | 'page'
  | 'flip'
  | 'open'
  | 'stamp'
  | 'unstamp'
  | 'quill'
  | 'strike'
  | 'click'
  | 'coin'
  | 'lose'
  | 'goal'
  | 'perfect'
  | 'seal'
  | 'burn'
  | 'gilded'
  | 'honored'
  | 'wanting'
  | 'error'

const r = (lo: number, hi: number): number => lo + Math.random() * (hi - lo)

/** Where effects are sent: the dry bus, and a send into the hall reverb. */
export interface SfxOut {
  dry: AudioNode
  wet: AudioNode
}

function clink(ctx: BaseAudioContext, dest: AudioNode, t: number, base: number, gain: number): void {
  const pan = r(-0.25, 0.25)
  for (const [ratio, amp, dur] of [
    [1, 1, 0.32],
    [1.52, 0.55, 0.22],
    [2.14, 0.4, 0.16],
    [2.87, 0.25, 0.1]
  ] as const) {
    tone(ctx, dest, t, { freq: base * ratio * r(0.99, 1.01), dur, gain: gain * amp, attack: 0.0015, pan })
  }
}

function coins(ctx: BaseAudioContext, dest: AudioNode, t: number, count: number, gain = 0.12): void {
  for (let i = 0; i < count; i++) clink(ctx, dest, t + i * r(0.06, 0.09), r(2500, 3300), gain * (1 - i * 0.15))
}

export function playSfx(ctx: BaseAudioContext, out: SfxOut, name: SfxName, t: number): void {
  const { dry, wet } = out
  switch (name) {
    case 'page': {
      // a sheet slid across the desk, a crinkle, and paper settling
      noise(ctx, dry, t, { dur: r(0.2, 0.26), type: 'bandpass', freq: r(2400, 3000), freqEnd: r(1500, 1900), q: 0.9, gain: 0.4, attack: 0.035, pan: r(-0.2, 0.2) })
      noise(ctx, dry, t + r(0.04, 0.08), { dur: 0.12, type: 'highpass', freq: 3600, q: 0.7, gain: 0.14, attack: 0.01 })
      noise(ctx, dry, t + r(0.11, 0.16), { dur: 0.2, type: 'lowpass', freq: 900, q: 0.6, gain: 0.26, attack: 0.02 })
      break
    }
    case 'flip': {
      noise(ctx, dry, t, { dur: 0.15, type: 'bandpass', freq: r(1500, 1900), freqEnd: r(3800, 4600), q: 1.1, gain: 0.27, attack: 0.045, pan: r(-0.3, 0.3) })
      noise(ctx, dry, t + 0.12, { dur: 0.05, type: 'highpass', freq: 4000, gain: 0.08, attack: 0.005 })
      break
    }
    case 'open': {
      noise(ctx, dry, t, { dur: 0.22, type: 'bandpass', freq: 2100, freqEnd: 1300, q: 0.8, gain: 0.2, attack: 0.05 })
      noise(ctx, dry, t + 0.1, { dur: 0.18, type: 'lowpass', freq: 700, gain: 0.16, attack: 0.03 })
      break
    }
    case 'stamp': {
      // wax pressed under a seal: a soft thud, a squish, a tiny contact click
      tone(ctx, dry, t, { freq: r(145, 165), freqEnd: 58, dur: 0.19, gain: 0.5, attack: 0.002 })
      noise(ctx, dry, t, { dur: 0.1, type: 'lowpass', freq: 650, gain: 0.24, attack: 0.002 })
      noise(ctx, dry, t + 0.004, { dur: 0.03, type: 'bandpass', freq: 2600, q: 2, gain: 0.1, attack: 0.001 })
      break
    }
    case 'unstamp': {
      noise(ctx, dry, t, { dur: 0.13, type: 'bandpass', freq: 1400, freqEnd: 650, q: 1.2, gain: 0.28, attack: 0.01 })
      tone(ctx, dry, t, { freq: 290, freqEnd: 210, dur: 0.08, gain: 0.14 })
      break
    }
    case 'quill':
    case 'strike': {
      // quick nib strokes on parchment; striking out is faster and heavier
      const strokes = name === 'strike' ? 4 : Math.round(r(3, 5))
      let at = t
      for (let i = 0; i < strokes; i++) {
        const d = name === 'strike' ? r(0.05, 0.07) : r(0.045, 0.09)
        noise(ctx, dry, at, { dur: d, type: 'bandpass', freq: r(3800, 5600), q: 3.5, gain: name === 'strike' ? 0.42 : r(0.22, 0.34), attack: 0.008, pan: r(-0.15, 0.15) })
        noise(ctx, dry, at, { dur: d, type: 'bandpass', freq: r(1700, 2300), q: 3, gain: 0.1, attack: 0.008 })
        at += d + (name === 'strike' ? 0.015 : r(0.02, 0.05))
      }
      break
    }
    case 'click': {
      tone(ctx, dry, t, { type: 'triangle', freq: r(1300, 1500), freqEnd: 900, dur: 0.04, gain: 0.13 })
      noise(ctx, dry, t, { dur: 0.02, type: 'highpass', freq: 3200, gain: 0.066, attack: 0.001 })
      break
    }
    case 'coin': {
      coins(ctx, dry, t, 2)
      break
    }
    case 'lose': {
      pluck(ctx, dry, t, 57, 0.45, { dur: 0.5, bright: 0.6 })
      pluck(ctx, dry, t + 0.14, 53, 0.4, { dur: 0.7, bright: 0.5 })
      break
    }
    case 'goal': {
      // a rising lute flourish and a bell: D, A, D
      ;[62, 69, 74].forEach((m, i) => pluck(ctx, dry, t + i * 0.085, m, 0.72, { pan: (i - 1) * 0.2 }))
      ;[62, 69, 74].forEach((m, i) => pluck(ctx, wet, t + i * 0.085, m, 0.5))
      bell(ctx, dry, t + 0.22, 1174.7, 0.035, 1.4)
      coins(ctx, dry, t + 0.3, 2, 0.1)
      break
    }
    case 'perfect':
    case 'gilded': {
      // a small fanfare in D major, with bells and a shower of coin
      const notes = [62, 66, 69, 74, 78]
      notes.forEach((m, i) => {
        pluck(ctx, dry, t + i * 0.07, m, 0.78, { pan: (i - 2) * 0.15 })
        pluck(ctx, wet, t + i * 0.07, m, 0.55)
      })
      brassChord(ctx, dry, wet, t + 0.34, [62, 66, 69], name === 'gilded' ? 1.4 : 0.9)
      bell(ctx, dry, t + 0.36, 1174.7, 0.04, 1.8, -0.2)
      bell(ctx, wet, t + 0.5, 1480, 0.03, 1.8, 0.2)
      coins(ctx, dry, t + 0.45, name === 'gilded' ? 5 : 3, 0.1)
      break
    }
    case 'honored': {
      ;[57, 62, 66, 69].forEach((m, i) => {
        pluck(ctx, dry, t + i * 0.1, m, 0.7)
        pluck(ctx, wet, t + i * 0.1, m, 0.5)
      })
      bell(ctx, dry, t + 0.42, 1174.7, 0.035, 1.6)
      coins(ctx, dry, t + 0.5, 2, 0.1)
      break
    }
    case 'wanting': {
      ;[69, 65, 62, 57].forEach((m, i) => {
        pluck(ctx, dry, t + i * 0.22, m, 0.55, { bright: 0.6 })
        pluck(ctx, wet, t + i * 0.22, m, 0.45, { bright: 0.6 })
      })
      break
    }
    case 'seal': {
      // a heavy seal pressed into a pool of hot wax
      tone(ctx, dry, t, { freq: 120, freqEnd: 38, dur: 0.38, gain: 0.6, attack: 0.002 })
      noise(ctx, dry, t, { dur: 0.26, type: 'lowpass', freq: 520, gain: 0.26, attack: 0.003 })
      noise(ctx, wet, t, { dur: 0.3, type: 'lowpass', freq: 400, gain: 0.25, attack: 0.003 })
      ;[38, 45, 50].forEach((m) => pluck(ctx, wet, t + 0.02, m, 0.7))
      bell(ctx, wet, t + 0.05, 587.3, 0.04, 2.2)
      break
    }
    case 'burn': {
      // flames catch: a rising whoosh, crackling, a low roar
      noise(ctx, dry, t, { dur: 1.5, type: 'bandpass', freq: 320, freqEnd: 2600, q: 0.8, gain: 0.6, attack: 0.5 })
      noise(ctx, wet, t, { dur: 1.7, type: 'lowpass', freq: 160, freqEnd: 420, q: 0.7, gain: 0.55, attack: 0.3 })
      for (let i = 0; i < 26; i++) {
        noise(ctx, dry, t + r(0.05, 1.8), { dur: r(0.006, 0.022), type: 'highpass', freq: r(2000, 4200), gain: r(0.1, 0.32), attack: 0.001, pan: r(-0.5, 0.5) })
      }
      break
    }
    case 'error': {
      tone(ctx, dry, t, { type: 'triangle', freq: 200, freqEnd: 128, dur: 0.07, gain: 0.24 })
      tone(ctx, dry, t + 0.09, { type: 'triangle', freq: 190, freqEnd: 120, dur: 0.08, gain: 0.2 })
      noise(ctx, dry, t, { dur: 0.05, type: 'lowpass', freq: 420, gain: 0.14 })
      break
    }
  }
}

/** A soft horn-like chord: filtered sawtooths with a gentle swell. */
function brassChord(ctx: BaseAudioContext, dry: AudioNode, wet: AudioNode, t: number, midis: number[], dur: number): void {
  for (const m of midis) {
    const f = 440 * Math.pow(2, (m - 69) / 12)
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.value = f
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(500, t)
    lp.frequency.linearRampToValueAtTime(1500, t + 0.12)
    lp.frequency.linearRampToValueAtTime(900, t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.04, t + 0.09)
    g.gain.setValueAtTime(0.036, t + dur - 0.2)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.25)
    osc.connect(lp).connect(g)
    g.connect(dry)
    g.connect(wet)
    osc.start(t)
    osc.stop(t + dur + 0.3)
  }
}

/** The rising hum while a seal is pressed, or the crackle while a contract catches fire. */
export interface Charge {
  update(progress: number): void
  stop(): void
}

export function startCharge(ctx: BaseAudioContext, dest: AudioNode, kind: 'seal' | 'burn'): Charge {
  const t = ctx.currentTime
  const out = ctx.createGain()
  out.gain.setValueAtTime(0.0001, t)
  out.gain.exponentialRampToValueAtTime(1, t + 0.08)
  out.connect(dest)

  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 700
  lp.connect(out)

  const osc = ctx.createOscillator()
  osc.type = 'triangle'
  osc.frequency.value = kind === 'seal' ? 150 : 90
  const oscGain = ctx.createGain()
  oscGain.gain.value = kind === 'seal' ? 0.1 : 0.07
  const trem = ctx.createOscillator()
  trem.frequency.value = 7
  const tremDepth = ctx.createGain()
  tremDepth.gain.value = 0.02
  trem.connect(tremDepth).connect(oscGain.gain)
  osc.connect(oscGain).connect(lp)
  osc.start(t)
  trem.start(t)

  let crackle: ReturnType<typeof setInterval> | null = null
  let progress = 0
  if (kind === 'burn') {
    crackle = setInterval(() => {
      const now = ctx.currentTime
      for (let i = 0; i < 1 + Math.floor(progress * 4); i++) {
        noise(ctx, out, now + Math.random() * 0.08, { dur: r(0.006, 0.02), type: 'highpass', freq: r(1800, 4000), gain: 0.06 + progress * 0.2, attack: 0.001 })
      }
    }, 70)
  }

  return {
    update(p) {
      progress = p
      const now = ctx.currentTime
      osc.frequency.setTargetAtTime((kind === 'seal' ? 150 : 90) + p * (kind === 'seal' ? 230 : 120), now, 0.05)
      lp.frequency.setTargetAtTime(700 + p * 1600, now, 0.05)
    },
    stop() {
      const now = ctx.currentTime
      out.gain.cancelScheduledValues(now)
      out.gain.setValueAtTime(Math.max(0.0001, out.gain.value), now)
      out.gain.exponentialRampToValueAtTime(0.0001, now + 0.07)
      osc.stop(now + 0.1)
      trem.stop(now + 0.1)
      if (crackle) clearInterval(crackle)
      setTimeout(() => out.disconnect(), 200)
    }
  }
}
