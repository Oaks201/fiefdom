/**
 * The app's sound: one AudioContext, a music bus and an effects bus (each with its own volume),
 * a stone-hall reverb for effects, and a compressor so nothing ever clips.
 *
 *   sfx('stamp')            play an effect (silently ignored when effects are off)
 *   charge('seal')          a sound that follows a press-and-hold; call update(p) and stop()
 *   applySoundSettings(s)   music / effects on-off and volumes
 */
import { DEFAULT_SOUND } from '../lib/ledger'
import type { SoundSettings } from '../lib/types'
import soundtrack from '../assets/audio/innfolk-mirth.mp3'
import { MusicPlayer } from './player'
import { playSfx, startCharge, type Charge, type SfxName, type SfxOut } from './sfx'
import { hallImpulse } from './synth'

export type { SfxName }

interface Graph {
  ctx: AudioContext
  musicBus: GainNode
  sfxBus: GainNode
  sfxWetBus: GainNode
  sfxOut: SfxOut
}

let graph: Graph | null = null
let graphFailed = false
let player: MusicPlayer | null = null
let settings: SoundSettings = { ...DEFAULT_SOUND }
let idleTimer: ReturnType<typeof setTimeout> | undefined

function build(): Graph | null {
  const Ctx = window.AudioContext
  if (!Ctx) return null
  const ctx = new Ctx({ latencyHint: 'interactive' })

  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -16
  comp.knee.value = 10
  comp.ratio.value = 4
  comp.attack.value = 0.004
  comp.release.value = 0.25
  const master = ctx.createGain()
  master.gain.value = 0.9
  // A soft-clipper after the compressor: y = tanh(x), which is transparent for quiet sound and
  // rounds off any peak before it can clip. (Halved going in, so inputs up to ±2 stay on the curve.)
  const halve = ctx.createGain()
  halve.gain.value = 0.5
  const limiter = ctx.createWaveShaper()
  const curve = new Float32Array(4096)
  for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(2 * ((i / (curve.length - 1)) * 2 - 1))
  limiter.curve = curve
  master.connect(comp).connect(halve).connect(limiter).connect(ctx.destination)

  const reverb = ctx.createConvolver()
  reverb.buffer = hallImpulse(ctx)
  reverb.connect(master)

  const musicBus = ctx.createGain()
  musicBus.gain.value = 0
  musicBus.connect(master)

  const sfxBus = ctx.createGain()
  sfxBus.gain.value = 0
  sfxBus.connect(master)
  const sfxRoom = ctx.createGain()
  sfxRoom.gain.value = 0.12
  sfxBus.connect(sfxRoom).connect(reverb)
  const sfxWetBus = ctx.createGain()
  sfxWetBus.gain.value = 0
  sfxWetBus.connect(reverb)

  return { ctx, musicBus, sfxBus, sfxWetBus, sfxOut: { dry: sfxBus, wet: sfxWetBus } }
}

/** The desktop app may start sound at once; a plain browser only after the first click or key press. */
function allowedToStart(): boolean {
  return !!window.fiefdom || navigator.userActivation?.hasBeenActive === true
}

function ensure(): Graph | null {
  if (graph || graphFailed) return graph
  if (!allowedToStart()) return null
  try {
    graph = build()
    if (graph) player = new MusicPlayer(graph.ctx, graph.musicBus, soundtrack)
  } catch (err) {
    console.warn('Sound is unavailable:', err)
    graphFailed = true
    graph = null
  }
  return graph
}

/** Resume the audio clock if needed, and let it sleep again once everything falls quiet. */
function wake(g: Graph): void {
  if (g.ctx.state === 'suspended') void g.ctx.resume().catch(() => undefined)
  clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    if (graph && !player?.playing && graph.ctx.state === 'running') void graph.ctx.suspend().catch(() => undefined)
  }, 8000)
}

const musicWanted = (): boolean => settings.music && settings.musicVolume > 0 && !document.hidden
const effectsOn = (): boolean => settings.effects && settings.effectsVolume > 0

function syncMusic(): void {
  const g = ensure()
  if (!g || !player) return
  if (musicWanted()) {
    wake(g)
    player.start()
  } else if (player.playing) {
    player.stop(document.hidden ? 0.4 : 1)
    wake(g)
  }
}

export function applySoundSettings(next: SoundSettings): void {
  settings = next
  const g = ensure()
  if (!g) return
  const now = g.ctx.currentTime
  g.musicBus.gain.setTargetAtTime(next.music ? next.musicVolume ** 1.7 : 0, now, 0.12)
  const fx = next.effects ? next.effectsVolume ** 2 : 0
  g.sfxBus.gain.setTargetAtTime(fx, now, 0.04)
  g.sfxWetBus.gain.setTargetAtTime(fx, now, 0.04)
  syncMusic()
}

export function sfx(name: SfxName, delay = 0): void {
  if (!effectsOn()) return
  const g = ensure()
  if (!g) return
  wake(g)
  try {
    playSfx(g.ctx, g.sfxOut, name, g.ctx.currentTime + 0.012 + delay)
  } catch (err) {
    console.warn('Could not play', name, err)
  }
}

const SILENT: Charge = { update: () => undefined, stop: () => undefined }

export function charge(kind: 'seal' | 'burn'): Charge {
  if (!effectsOn()) return SILENT
  const g = ensure()
  if (!g) return SILENT
  wake(g)
  try {
    return startCharge(g.ctx, g.sfxBus, kind)
  } catch {
    return SILENT
  }
}

/** Read-only diagnostics, handy when checking the app automatically. */
export function audioStatus(): { state: string; music: boolean; time: number } {
  return { state: graph?.ctx.state ?? 'none', music: !!player?.playing, time: graph?.ctx.currentTime ?? 0 }
}

/** Starts the sound system. Returns a function that shuts it down again. */
export function initAudio(initial: SoundSettings): () => void {
  Object.defineProperty(window, '__fiefdomAudio', { value: audioStatus, configurable: true })
  applySoundSettings(initial)
  // Browsers (not the Electron app) only allow sound after the first click or key press.
  const onGesture = (): void => {
    const fresh = !graph
    const g = ensure()
    if (!g) return
    if (fresh) applySoundSettings(settings)
    if (g.ctx.state === 'suspended' && (musicWanted() || effectsOn())) void g.ctx.resume().catch(() => undefined)
    if (musicWanted() && !player?.playing) syncMusic()
  }
  // Minimised: let the music rest; restored: resume where it paused.
  const onVisibility = (): void => syncMusic()
  window.addEventListener('pointerdown', onGesture, true)
  window.addEventListener('keydown', onGesture, true)
  document.addEventListener('visibilitychange', onVisibility)
  return () => {
    window.removeEventListener('pointerdown', onGesture, true)
    window.removeEventListener('keydown', onGesture, true)
    document.removeEventListener('visibilitychange', onVisibility)
    player?.stop(0.3)
  }
}
