/**
 * Instruments, synthesised live with the Web Audio API — no recordings, nothing to download.
 * Every function schedules one sound at time `t` into `dest`.
 */

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

function connectPanned(ctx: BaseAudioContext, node: AudioNode, dest: AudioNode, pan = 0): void {
  if (pan === 0) {
    node.connect(dest)
    return
  }
  const p = ctx.createStereoPanner()
  p.pan.value = Math.max(-1, Math.min(1, pan))
  node.connect(p).connect(dest)
}

// ---------------------------------------------------------------------------- noise

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>()

function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buf = noiseCache.get(ctx)
  if (!buf) {
    buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    noiseCache.set(ctx, buf)
  }
  return buf
}

export interface NoiseOpts {
  dur: number
  type: BiquadFilterType
  freq: number
  freqEnd?: number
  q?: number
  gain: number
  attack?: number
  pan?: number
}

/** A burst of filtered noise: paper, wax, breath, fire. */
export function noise(ctx: BaseAudioContext, dest: AudioNode, t: number, o: NoiseOpts): void {
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer(ctx)
  const f = ctx.createBiquadFilter()
  f.type = o.type
  f.Q.value = o.q ?? 0.8
  f.frequency.setValueAtTime(o.freq, t)
  if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(o.freqEnd, t + o.dur)
  const g = ctx.createGain()
  const attack = Math.min(o.attack ?? 0.005, o.dur / 2)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(o.gain, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur)
  src.connect(f).connect(g)
  connectPanned(ctx, g, dest, o.pan)
  src.start(t, Math.random() * 1.4)
  src.stop(t + o.dur + 0.05)
}

// ---------------------------------------------------------------------------- simple tones

export interface ToneOpts {
  type?: OscillatorType
  freq: number
  freqEnd?: number
  dur: number
  gain: number
  attack?: number
  pan?: number
}

export function tone(ctx: BaseAudioContext, dest: AudioNode, t: number, o: ToneOpts): void {
  const osc = ctx.createOscillator()
  osc.type = o.type ?? 'sine'
  osc.frequency.setValueAtTime(o.freq, t)
  if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(o.freqEnd, t + o.dur)
  const g = ctx.createGain()
  const attack = Math.min(o.attack ?? 0.004, o.dur / 2)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(o.gain, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur)
  osc.connect(g)
  connectPanned(ctx, g, dest, o.pan)
  osc.start(t)
  osc.stop(t + o.dur + 0.05)
}

// ---------------------------------------------------------------------------- plucked string (lute)

const pluckCache = new WeakMap<BaseAudioContext, Map<number, AudioBuffer>>()

/**
 * Karplus–Strong plucked string: a burst of soft noise circulating in a tuned delay line,
 * losing a little brightness on every trip — it sounds remarkably like gut strings.
 * An all-pass filter supplies the fractional part of the delay so every note is in tune.
 */
export function pluckBuffer(ctx: BaseAudioContext, midi: number): AudioBuffer {
  let byNote = pluckCache.get(ctx)
  if (!byNote) {
    byNote = new Map()
    pluckCache.set(ctx, byNote)
  }
  const cached = byNote.get(midi)
  if (cached) return cached

  const sr = ctx.sampleRate
  const f = midiToFreq(midi)
  const t60 = Math.max(1.1, Math.min(3.4, 3.4 - (midi - 36) * 0.055))
  const len = Math.floor(sr * (t60 + 0.15))
  const buf = ctx.createBuffer(1, len, sr)
  const out = buf.getChannelData(0)

  const period = sr / f
  let n = Math.floor(period - 0.5)
  let frac = period - 0.5 - n
  if (frac < 0.1) {
    n -= 1
    frac += 1
  }
  const c = (1 - frac) / (1 + frac)
  const line = new Float32Array(n)

  // a soft pluck: low-passed noise, zero-mean, normalised
  let lp = 0
  for (let i = 0; i < n; i++) {
    lp += 0.42 * (Math.random() * 2 - 1 - lp)
    line[i] = lp
  }
  let mean = 0
  for (let i = 0; i < n; i++) mean += line[i]
  mean /= n
  let peak = 0
  for (let i = 0; i < n; i++) {
    line[i] -= mean
    peak = Math.max(peak, Math.abs(line[i]))
  }
  for (let i = 0; i < n; i++) line[i] /= peak || 1

  const loop = Math.min(0.99995, Math.pow(0.001, 1 / (f * t60)) / Math.cos((Math.PI * f) / sr))
  let idx = 0
  let prev = 0
  let apX = 0
  let apY = 0
  for (let i = 0; i < len; i++) {
    const y = line[idx]
    const avg = loop * 0.5 * (y + prev)
    const w = c * avg + apX - c * apY
    apX = avg
    apY = w
    prev = y
    line[idx] = w
    out[i] = y
    idx = idx + 1 === n ? 0 : idx + 1
  }
  // fade the very end so a note never clicks off
  const fade = Math.min(len, Math.floor(sr * 0.05))
  for (let i = 0; i < fade; i++) out[len - 1 - i] *= i / fade

  byNote.set(midi, buf)
  return buf
}

export function pluck(
  ctx: BaseAudioContext,
  dest: AudioNode,
  t: number,
  midi: number,
  vel: number,
  o: { dur?: number; pan?: number; bright?: number } = {}
): void {
  const src = ctx.createBufferSource()
  src.buffer = pluckBuffer(ctx, midi)
  const f = ctx.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.value = 700 + vel * 3600 * (o.bright ?? 1)
  f.Q.value = 0.4
  const g = ctx.createGain()
  const level = Math.pow(vel, 1.5) * 0.75
  g.gain.setValueAtTime(level, t)
  src.connect(f).connect(g)
  connectPanned(ctx, g, dest, o.pan)
  src.start(t)
  const end = src.buffer.duration
  if (o.dur !== undefined && o.dur < end) {
    g.gain.setValueAtTime(level, t + o.dur)
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur + 0.4)
    src.stop(t + o.dur + 0.45)
  }
}

// ---------------------------------------------------------------------------- bell

/** A small bell: a few inharmonic partials, each fading at its own pace. */
export function bell(ctx: BaseAudioContext, dest: AudioNode, t: number, freq: number, gain: number, dur = 1.6, pan = 0): void {
  const partials: Array<[number, number]> = [
    [1, 1],
    [2, 0.42],
    [2.76, 0.28],
    [5.4, 0.14],
    [8.93, 0.06]
  ]
  for (const [ratio, amp] of partials) {
    if (freq * ratio > 16000) continue
    tone(ctx, dest, t, { freq: freq * ratio, dur: dur / Math.sqrt(ratio), gain: gain * amp, attack: 0.002, pan })
  }
}

// ---------------------------------------------------------------------------- recorder

const waveCache = new WeakMap<BaseAudioContext, PeriodicWave>()

function recorderWave(ctx: BaseAudioContext): PeriodicWave {
  let w = waveCache.get(ctx)
  if (!w) {
    const imag = new Float32Array([0, 1, 0.16, 0.07, 0.035, 0.015])
    w = ctx.createPeriodicWave(new Float32Array(imag.length), imag)
    waveCache.set(ctx, w)
  }
  return w
}

/** A wooden recorder: an almost-pure tone, a breathy chiff, and vibrato that blooms as the note holds. */
export function recorder(ctx: BaseAudioContext, dest: AudioNode, t: number, midi: number, dur: number, vel: number, pan = 0): void {
  const f0 = midiToFreq(midi)
  const osc = ctx.createOscillator()
  osc.setPeriodicWave(recorderWave(ctx))
  osc.frequency.setValueAtTime(f0, t)

  const lfo = ctx.createOscillator()
  lfo.frequency.value = 4.8 + Math.random() * 0.8
  const depth = ctx.createGain()
  depth.gain.setValueAtTime(0, t)
  depth.gain.linearRampToValueAtTime(0, t + Math.min(0.2, dur * 0.4))
  depth.gain.linearRampToValueAtTime(f0 * 0.0055, t + Math.min(0.7, dur))
  lfo.connect(depth).connect(osc.frequency)

  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 3000
  const g = ctx.createGain()
  const peak = 0.13 * vel
  const hold = Math.max(t + 0.26, t + dur - 0.04)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(peak, t + 0.05)
  g.gain.exponentialRampToValueAtTime(peak * 0.82, t + 0.25)
  g.gain.setValueAtTime(peak * 0.82, hold)
  g.gain.exponentialRampToValueAtTime(0.0001, hold + 0.2)

  osc.connect(lp).connect(g)
  connectPanned(ctx, g, dest, pan)
  osc.start(t)
  lfo.start(t)
  osc.stop(hold + 0.25)
  lfo.stop(hold + 0.25)

  noise(ctx, dest, t, { dur: 0.07, type: 'bandpass', freq: Math.min(9000, f0 * 3), q: 1.4, gain: 0.018 * vel, attack: 0.01, pan })
}

// ---------------------------------------------------------------------------- frame drum

export function drum(ctx: BaseAudioContext, dest: AudioNode, t: number, vel: number): void {
  tone(ctx, dest, t, { freq: 118, freqEnd: 58, dur: 0.32, gain: 0.3 * vel, attack: 0.003 })
  noise(ctx, dest, t, { dur: 0.07, type: 'lowpass', freq: 380, gain: 0.07 * vel, attack: 0.002 })
}

export function tak(ctx: BaseAudioContext, dest: AudioNode, t: number, vel: number): void {
  noise(ctx, dest, t, { dur: 0.05, type: 'bandpass', freq: 1900, q: 2.5, gain: 0.1 * vel, attack: 0.002, pan: 0.2 })
  tone(ctx, dest, t, { type: 'triangle', freq: 440, freqEnd: 300, dur: 0.05, gain: 0.04 * vel, pan: 0.2 })
}

// ---------------------------------------------------------------------------- drone

/** A hurdy-gurdy drone on D and A, low-passed and slowly breathing. */
export class Drone {
  private oscs: OscillatorNode[] = []
  private lfo: OscillatorNode
  readonly gain: GainNode
  private on = false

  constructor(ctx: BaseAudioContext, dest: AudioNode) {
    const t = ctx.currentTime
    this.gain = ctx.createGain()
    this.gain.gain.setValueAtTime(0.0001, t)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 420
    lp.Q.value = 0.7
    this.lfo = ctx.createOscillator()
    this.lfo.frequency.value = 0.055
    const lfoDepth = ctx.createGain()
    lfoDepth.gain.value = 110
    this.lfo.connect(lfoDepth).connect(lp.frequency)
    for (const [freq, detune, level] of [
      [73.42, -4, 0.5],
      [73.42, 4, 0.5],
      [110, -3, 0.35],
      [110, 5, 0.35],
      [146.83, 0, 0.18]
    ] as const) {
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = freq
      o.detune.value = detune
      const g = ctx.createGain()
      g.gain.value = level
      o.connect(g).connect(lp)
      this.oscs.push(o)
    }
    lp.connect(this.gain).connect(dest)
    for (const o of this.oscs) o.start(t)
    this.lfo.start(t)
  }

  set(on: boolean, t: number): void {
    if (on === this.on) return
    this.on = on
    this.gain.gain.cancelScheduledValues(t)
    this.gain.gain.setTargetAtTime(on ? 0.018 : 0.0001, t, on ? 1.4 : 0.9)
  }

  stop(t: number): void {
    for (const o of this.oscs) o.stop(t)
    this.lfo.stop(t)
  }
}

// ---------------------------------------------------------------------------- reverb

/** A stone hall: an impulse response of decaying, gently darkened noise. */
export function hallImpulse(ctx: BaseAudioContext, seconds = 2.6, decay = 2.8): AudioBuffer {
  const sr = ctx.sampleRate
  const len = Math.floor(sr * seconds)
  const buf = ctx.createBuffer(2, len, sr)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    let lp = 0
    const pre = Math.floor(sr * 0.012)
    for (let i = pre; i < len; i++) {
      lp += 0.35 * (Math.random() * 2 - 1 - lp)
      d[i] = lp * Math.pow(1 - (i - pre) / (len - pre), decay)
    }
  }
  return buf
}
