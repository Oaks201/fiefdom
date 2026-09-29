import { BAR, Composer, type Bar } from '../lib/music'
import { Drone, drum, pluck, recorder, tak } from './synth'

/**
 * Plays the composer's bars. Notes are scheduled a fraction of a second ahead on the audio
 * clock, so timing stays exact even when the page is busy.
 */
export class MusicPlayer {
  private timer: ReturnType<typeof setInterval> | null = null
  private input: GainNode | null = null
  private luteIn: GainNode | null = null
  private drone: Drone | null = null
  private composer = new Composer()
  private nextBar = 0

  constructor(
    private readonly ctx: AudioContext,
    private readonly dest: AudioNode
  ) {}

  get playing(): boolean {
    return this.timer !== null
  }

  start(fadeIn = 3): void {
    if (this.timer) return
    const ctx = this.ctx
    const t = ctx.currentTime
    // A fresh input per session: stopping fades it out, silencing notes already scheduled.
    const input = ctx.createGain()
    input.gain.setValueAtTime(0.0001, t)
    input.gain.exponentialRampToValueAtTime(1, t + fadeIn)
    input.connect(this.dest)

    // the lute's wooden body: warm low-mids, no harsh top
    const body = ctx.createBiquadFilter()
    body.type = 'peaking'
    body.frequency.value = 230
    body.Q.value = 0.9
    body.gain.value = 3
    const top = ctx.createBiquadFilter()
    top.type = 'lowpass'
    top.frequency.value = 4200
    top.Q.value = 0.5
    const luteIn = ctx.createGain()
    luteIn.connect(body).connect(top).connect(input)

    this.input = input
    this.luteIn = luteIn
    this.drone = new Drone(ctx, input)
    this.composer = new Composer()
    this.nextBar = t + 0.25
    this.timer = setInterval(() => this.tick(), 80)
    this.tick()
  }

  private tick(): void {
    const ctx = this.ctx
    if (ctx.state !== 'running' || !this.input) return
    if (this.nextBar < ctx.currentTime) this.nextBar = ctx.currentTime + 0.05
    while (this.nextBar < ctx.currentTime + 0.5) {
      this.play(this.composer.nextBar(), this.nextBar)
      this.nextBar += BAR
    }
  }

  private play(bar: Bar, t0: number): void {
    const ctx = this.ctx
    const input = this.input
    const lute = this.luteIn
    if (!input || !lute) return
    this.drone?.set(bar.drone, t0)
    for (const e of bar.events) {
      const t = t0 + e.at
      if (e.voice === 'lute') pluck(ctx, lute, t, e.midi, e.vel, { dur: e.dur, pan: (e.midi - 57) / 40 })
      else if (e.voice === 'recorder') recorder(ctx, input, t, e.midi, e.dur, e.vel, 0.12)
      else if (e.voice === 'drum') drum(ctx, input, t, e.vel)
      else tak(ctx, input, t, e.vel)
    }
  }

  stop(fadeOut = 1): void {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = null
    const t = this.ctx.currentTime
    const input = this.input
    const drone = this.drone
    this.input = null
    this.luteIn = null
    this.drone = null
    if (!input) return
    input.gain.cancelScheduledValues(t)
    input.gain.setValueAtTime(Math.max(0.0001, input.gain.value), t)
    input.gain.exponentialRampToValueAtTime(0.0001, t + fadeOut)
    drone?.stop(t + fadeOut + 0.05)
    setTimeout(() => input.disconnect(), (fadeOut + 0.3) * 1000)
  }
}
