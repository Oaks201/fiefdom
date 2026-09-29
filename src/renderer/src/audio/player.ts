/** A looping soundtrack routed through the app's music bus, with gentle pause/resume fades. */
export class MusicPlayer {
  private readonly audio: HTMLAudioElement
  private readonly input: GainNode
  private pauseTimer: ReturnType<typeof setTimeout> | null = null
  private active = false
  private request = 0

  constructor(
    private readonly ctx: AudioContext,
    dest: AudioNode,
    source: string
  ) {
    this.audio = new Audio(source)
    this.audio.loop = true
    this.audio.preload = 'auto'
    this.input = ctx.createGain()
    this.input.gain.value = 0
    ctx.createMediaElementSource(this.audio).connect(this.input).connect(dest)
  }

  get playing(): boolean {
    return this.active
  }

  start(fadeIn = 3): void {
    if (this.active) return
    this.active = true
    const request = ++this.request
    if (this.pauseTimer !== null) clearTimeout(this.pauseTimer)
    this.pauseTimer = null
    this.fadeTo(1, fadeIn)
    // Keep the same media element so toggling music or restoring the window resumes the song.
    void this.audio.play().catch((err: unknown) => {
      if (request !== this.request) return
      this.active = false
      this.fadeTo(0, 0)
      console.warn('Could not play background music:', err)
    })
  }

  stop(fadeOut = 1): void {
    if (!this.active) return
    this.active = false
    this.request++
    this.fadeTo(0, fadeOut)
    if (fadeOut <= 0) {
      this.audio.pause()
      return
    }
    this.pauseTimer = setTimeout(() => {
      this.pauseTimer = null
      this.audio.pause()
    }, fadeOut * 1000)
  }

  private fadeTo(value: number, duration: number): void {
    const now = this.ctx.currentTime
    this.input.gain.cancelAndHoldAtTime(now)
    if (duration <= 0) this.input.gain.setValueAtTime(value, now)
    else this.input.gain.linearRampToValueAtTime(value, now + duration)
  }
}
