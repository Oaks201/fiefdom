/// <reference lib="dom" />
import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { MusicPlayer } from '../src/renderer/src/audio/player'

function setup(t: TestContext): {
  player: MusicPlayer
  audio: FakeAudio
  ramps: Array<[number, number]>
} {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'Audio')
  Object.defineProperty(globalThis, 'Audio', { value: FakeAudio, configurable: true })
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'Audio', original)
    else Reflect.deleteProperty(globalThis, 'Audio')
  })
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const ramps: Array<[number, number]> = []
  const input = {
    gain: {
      value: 0,
      cancelAndHoldAtTime: () => undefined,
      setValueAtTime: (value: number, time: number) => ramps.push([value, time]),
      linearRampToValueAtTime: (value: number, time: number) => ramps.push([value, time])
    },
    connect: () => undefined
  }
  const ctx = {
    currentTime: 10,
    createGain: () => input,
    createMediaElementSource: () => ({ connect: () => input })
  } as unknown as AudioContext
  const player = new MusicPlayer(ctx, {} as AudioNode, '/assets/innfolk-mirth.mp3')
  return { player, audio: FakeAudio.latest, ramps }
}

class FakeAudio {
  static latest: FakeAudio
  loop = false
  preload = ''
  currentTime = 0
  plays = 0
  pauses = 0
  playResult = (): Promise<void> => Promise.resolve()

  constructor(readonly src: string) {
    FakeAudio.latest = this
  }

  play(): Promise<void> {
    this.plays++
    return this.playResult()
  }

  pause(): void {
    this.pauses++
  }
}

test('the bundled song loops and repeated starts do not overlap playback', (t) => {
  const { player, audio, ramps } = setup(t)
  assert.equal(audio.src, '/assets/innfolk-mirth.mp3')
  assert.equal(audio.loop, true)
  assert.equal(player.playing, false)
  player.start()
  player.start()
  assert.equal(player.playing, true)
  assert.equal(audio.plays, 1)
  assert.deepEqual(ramps, [[1, 13]])
})

test('pausing fades out before stopping and resume preserves the song position', (t) => {
  const { player, audio, ramps } = setup(t)
  player.start()
  audio.currentTime = 42
  player.stop(0.4)
  assert.equal(player.playing, false)
  assert.equal(audio.pauses, 0)
  assert.deepEqual(ramps.at(-1), [0, 10.4])
  t.mock.timers.tick(400)
  assert.equal(audio.pauses, 1)
  player.start()
  assert.equal(audio.plays, 2)
  assert.equal(audio.currentTime, 42)
  assert.equal(player.playing, true)
})

test('resuming during a fade cancels its pending pause', (t) => {
  const { player, audio } = setup(t)
  player.start()
  player.stop()
  t.mock.timers.tick(200)
  player.start()
  t.mock.timers.tick(1000)
  assert.equal(audio.pauses, 0)
  assert.equal(player.playing, true)
  player.stop(0)
  assert.equal(audio.pauses, 1)
})

test('failed playback can be retried after a browser gesture', async (t) => {
  const { player, audio } = setup(t)
  t.mock.method(console, 'warn', () => undefined)
  audio.playResult = () => Promise.reject(new Error('autoplay blocked'))
  player.start()
  await Promise.resolve()
  assert.equal(player.playing, false)
  audio.playResult = () => Promise.resolve()
  player.start()
  await Promise.resolve()
  assert.equal(player.playing, true)
  assert.equal(audio.plays, 2)
})

test('an older failed play request cannot stop a newer successful start', async (t) => {
  const { player, audio } = setup(t)
  let rejectOld!: (error: Error) => void
  audio.playResult = () => new Promise((_, reject) => { rejectOld = reject })
  player.start()
  player.stop(0)
  audio.playResult = () => Promise.resolve()
  player.start()
  rejectOld(new Error('previous play was interrupted'))
  await Promise.resolve()
  assert.equal(player.playing, true)
})
