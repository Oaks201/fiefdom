/**
 * Original tavern sound pack: layered wood, parchment, wax, brass and dulcimer.
 * WAVs are rendered offline with the local SFX MCP; the app needs no audio tools or network.
 */
import { bell, midiToFreq, noise, pluck } from './synth'

export const SFX_NAMES = [
  'page', 'flip', 'open', 'stamp', 'unstamp', 'quill', 'strike', 'click', 'coin',
  'lose', 'goal', 'perfect', 'seal', 'burn', 'gilded', 'honored', 'wanting', 'error',
  // The game's sounds (T14, task A4). Until a file named after one is added to
  // assets/audio/sfx/, it plays nothing: the bank is empty and `playSfx` returns.
  'founding', 'herald', 'battleWon', 'battleLost', 'milestone', 'coalition', 'ultimatum', 'victory', 'fall', 'grandBattle'
] as const
export type SfxName = (typeof SFX_NAMES)[number]

/** Preserve the effects buses used by the rest of the app. */
export interface SfxOut {
  dry: AudioNode
  wet: AudioNode
}

const assets = import.meta.glob<string>('../assets/audio/sfx/*.wav', {
  eager: true,
  query: '?url',
  import: 'default'
})

const banks = Object.fromEntries(SFX_NAMES.map((name) => [
  name,
  Object.entries(assets)
    .filter(([path]) => new RegExp('/' + name + '(?:-\\d+)?\\.wav$').test(path))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, url]) => url)
])) as Record<SfxName, string[]>

const buffers = new WeakMap<BaseAudioContext, Map<string, Promise<AudioBuffer>>>()
const lastTake = new WeakMap<BaseAudioContext, Map<SfxName, number>>()

function load(ctx: BaseAudioContext, url: string): Promise<AudioBuffer> {
  let cache = buffers.get(ctx)
  if (!cache) {
    cache = new Map()
    buffers.set(ctx, cache)
  }
  let pending = cache.get(url)
  if (!pending) {
    pending = fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error('Could not load sound effect: ' + response.status)
        return response.arrayBuffer()
      })
      .then((data) => ctx.decodeAudioData(data))
      .catch((error: unknown) => {
        cache.delete(url)
        throw error
      })
    cache.set(url, pending)
  }
  return pending
}

/** Decode once, ahead of interactions. A failed fetch can be retried on the next action. */
export function preloadSfx(ctx: BaseAudioContext): void {
  for (const url of Object.values(banks).flat()) {
    void load(ctx, url).catch((error: unknown) => console.warn('Sound effect unavailable:', error))
  }
}

export function playSfx(ctx: BaseAudioContext, out: SfxOut, name: SfxName, t: number): void {
  const takes = banks[name]
  if (!takes.length) return
  let previous = lastTake.get(ctx)
  if (!previous) {
    previous = new Map()
    lastTake.set(ctx, previous)
  }
  // Never repeat the same foley take twice in a row; musical cues keep their tuning.
  const last = previous.get(name) ?? -1
  const choices = takes.map((_, i) => i).filter((i) => i !== last)
  const take = choices.length ? choices[Math.floor(Math.random() * choices.length)] : 0
  previous.set(name, take)
  void load(ctx, takes[take]).then((buffer) => {
    if (ctx.state === 'closed') return
    const source = ctx.createBufferSource()
    source.buffer = buffer
    const pan = ctx.createStereoPanner()
    pan.pan.value = takes.length > 1 ? (Math.random() - 0.5) * 0.14 : 0
    source.connect(pan).connect(out.dry)
    source.onended = () => {
      source.disconnect()
      pan.disconnect()
    }
    // Preserve delayed result cues even when the first file still needs decoding.
    source.start(Math.max(t, ctx.currentTime + 0.003))
  }).catch((error: unknown) => console.warn('Could not play', name, error))
}

export interface Charge {
  update(progress: number): void
  stop(): void
}

/** Wax and an open-fifth oath swell, or a growing fire, following the existing hold gesture. */
export function startCharge(ctx: BaseAudioContext, dest: AudioNode, kind: 'seal' | 'burn'): Charge {
  const t = ctx.currentTime
  const out = ctx.createGain()
  out.gain.setValueAtTime(0.0001, t)
  out.gain.exponentialRampToValueAtTime(1, t + 0.08)
  out.connect(dest)

  const nodes: AudioNode[] = [out]
  const voices: AudioScheduledSourceNode[] = []
  const levels: Array<{ gain: AudioParam; from: number; to: number }> = []
  const filters: BiquadFilterNode[] = []
  // A continuous texture avoids gaps between bursts and stops cleanly on cancellation.
  const material = ctx.createBufferSource()
  const bed = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
  const samples = bed.getChannelData(0)
  let brown = 0
  for (let i = 0; i < samples.length; i++) {
    const white = Math.random() * 2 - 1
    brown = (brown + white * 0.035) / 1.02
    const edge = Math.min(1, i / 256, (samples.length - 1 - i) / 256)
    samples[i] = (kind === 'burn' ? white * 0.45 + brown * 2.5 : white) * edge
  }
  material.buffer = bed
  material.loop = true
  const materialFilter = ctx.createBiquadFilter()
  materialFilter.type = kind === 'burn' ? 'lowpass' : 'bandpass'
  materialFilter.frequency.value = kind === 'burn' ? 650 : 1100
  materialFilter.Q.value = 0.6
  const materialGain = ctx.createGain()
  const from = kind === 'burn' ? 0.16 : 0.035
  const to = kind === 'burn' ? 0.45 : 0.13
  materialGain.gain.value = from
  material.connect(materialFilter).connect(materialGain).connect(out)
  nodes.push(material, materialFilter, materialGain)
  voices.push(material)
  levels.push({ gain: materialGain.gain, from, to })
  filters.push(materialFilter)
  material.start(t)

  if (kind === 'seal') {
    const wave = ctx.createPeriodicWave(new Float32Array(6), new Float32Array([0, 1, 0.4, 0.18, 0.1, 0.04]))
    for (const [midi, from, to] of [[50, 0.04, 0.14], [57, 0.025, 0.08]] as const) {
      const voice = ctx.createOscillator()
      voice.setPeriodicWave(wave)
      voice.frequency.value = midiToFreq(midi)
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 700
      const gain = ctx.createGain()
      gain.gain.value = from
      voice.connect(filter).connect(gain).connect(out)
      nodes.push(voice, filter, gain)
      voices.push(voice)
      levels.push({ gain: gain.gain, from, to })
      filters.push(filter)
      voice.start(t)
    }
  }

  let lastTexture = t - 0.1
  let note = 0
  let stopped = false
  material.onended = () => nodes.forEach((node) => node.disconnect())

  return {
    update(p) {
      if (stopped) return
      const progress = Math.min(1, Math.max(0, p))
      const now = ctx.currentTime
      for (const { gain, from, to } of levels) gain.setTargetAtTime(from + (to - from) * progress, now, 0.04)
      for (const filter of filters) filter.frequency.setTargetAtTime(700 + progress * 1600, now, 0.05)
      if (kind === 'burn' && now - lastTexture >= 0.085) {
        lastTexture = now
        noise(ctx, out, now, { dur: 0.03, type: 'bandpass', freq: 2000 + Math.random() * 1600,
          gain: 0.08 + progress * 0.18, attack: 0.001, q: 0.7 })
      }
      if (kind === 'seal' && note < 3 && progress >= [0.28, 0.56, 0.82][note]) {
        pluck(ctx, out, now, [62, 69, 74][note], 0.3 + progress * 0.14, { dur: 0.2, bright: 1.2 })
        bell(ctx, out, now, midiToFreq([74, 81, 86][note]), 0.025 + progress * 0.02, 0.35)
        note++
      }
    },
    stop() {
      if (stopped) return
      stopped = true
      const now = ctx.currentTime
      out.gain.cancelAndHoldAtTime(now)
      // Anchor the release here; otherwise its ramp can start at the initial attack's end.
      out.gain.setValueAtTime(0.0001 ** (1 - Math.min(1, Math.max(0, (now - t) / 0.08))), now)
      out.gain.exponentialRampToValueAtTime(0.0001, now + 0.07)
      for (const voice of voices) voice.stop(now + 0.12)
    }
  }
}
