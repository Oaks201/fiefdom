/**
 * A tiny generative composer. It writes endless, gently varying music in D Dorian — the mode of a
 * great deal of medieval music — as plain note events: lute arpeggios, a recorder tune, a frame
 * drum and a drone. It never touches audio itself; the audio engine plays what it writes.
 */

export type Voice = 'lute' | 'recorder' | 'drum' | 'tak'

export interface NoteEvent {
  /** seconds from the start of the bar */
  at: number
  /** MIDI note number (ignored by the percussion voices) */
  midi: number
  /** seconds */
  dur: number
  /** 0 … 1 */
  vel: number
  voice: Voice
}

export type SectionKind = 'intro' | 'arpeggio' | 'song' | 'sparse' | 'rest'

export interface Bar {
  section: SectionKind
  chord: ChordName
  events: NoteEvent[]
  /** whether the hurdy-gurdy drone sounds under this bar */
  drone: boolean
}

export const TEMPO = 72
export const BEAT = 60 / TEMPO
export const EIGHTH = BEAT / 2
export const BAR = BEAT * 4

/** D Dorian pitch classes, counted in semitones from D */
export const DORIAN = [0, 2, 3, 5, 7, 9, 10]
const D = 2 // pitch class of D

/** chord tones in semitones above D */
export const CHORDS = {
  Dm: [0, 3, 7],
  C: [-2, 2, 5],
  G: [5, 9, 12],
  Am: [7, 10, 14],
  F: [3, 7, 10]
} as const
export type ChordName = keyof typeof CHORDS

const PROGRESSIONS: ChordName[][] = [
  ['Dm', 'C', 'Dm', 'Am', 'F', 'C', 'Dm', 'Dm'],
  ['Dm', 'G', 'Dm', 'C', 'F', 'C', 'Am', 'Dm'],
  ['F', 'C', 'Dm', 'Am', 'F', 'G', 'Am', 'Dm'],
  ['Dm', 'Dm', 'C', 'C', 'F', 'G', 'C', 'Dm']
]

/** eight eighth-notes per bar; indexes into [bass, upper1…upper4]; -1 rests */
const ARPEGGIOS = [
  [0, 1, 2, 3, 4, 3, 2, 1],
  [0, 2, 1, 3, 2, 4, 3, 2],
  [0, 1, 3, 2, 4, 2, 3, 1],
  [0, 3, 2, 3, 1, 3, 2, 3]
]
const SPARSE_ARPEGGIOS = [
  [0, -1, 2, -1, 3, -1, 2, -1],
  [0, -1, -1, 2, -1, 3, -1, -1],
  [0, -1, 3, -1, -1, 2, -1, 1]
]

/** melody rhythms, in eighths, each filling one bar */
const RHYTHMS = [
  [4, 4],
  [2, 2, 4],
  [3, 1, 2, 2],
  [2, 2, 2, 2],
  [6, 2],
  [2, 4, 2],
  [4, 2, 2]
]
const CADENCE_RHYTHMS = [[8], [6, 2], [4, 4]]

/** the recorder's range, D Dorian from C4 to E5 */
export const MELODY_SCALE = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76]

export function pitchClass(midi: number): number {
  return (((midi - D) % 12) + 12) % 12
}

export function inDorian(midi: number): boolean {
  return DORIAN.includes(pitchClass(midi))
}

function mulberry32(seed: number): () => number {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Bass note plus four chord tones above it, voiced like a lute would play them. */
export function voicing(chord: ChordName): number[] {
  const iv = CHORDS[chord]
  const root = ((iv[0] % 12) + 12) % 12
  let bass = 38 + root // D2 = 38
  if (bass > 45) bass -= 12
  const upper: number[] = []
  for (let k = 0; k < 3; k++) for (const i of iv) upper.push(50 + i + 12 * k)
  const chosen = upper.filter((m) => m >= 55 && m <= 71).sort((a, b) => a - b).slice(0, 4)
  return [bass, ...chosen]
}

function isChordTone(midi: number, chord: ChordName): boolean {
  return CHORDS[chord].some((i) => ((i % 12) + 12) % 12 === pitchClass(midi))
}

export class Composer {
  private rand: () => number
  private queue: SectionKind[] = []
  private section: SectionKind = 'intro'
  private barInSection = 0
  private sectionLength = 4
  private progression: ChordName[] = PROGRESSIONS[0]
  private arpeggio = ARPEGGIOS[0]
  private melodyIndex = 5
  private droneInSection = true

  constructor(seed = Date.now()) {
    this.rand = mulberry32(seed)
    this.startSection('intro')
  }

  private pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.rand() * list.length)]
  }

  private startSection(kind: SectionKind): void {
    this.section = kind
    this.barInSection = 0
    this.sectionLength = kind === 'intro' || kind === 'rest' ? 4 : 8
    this.progression = this.pick(PROGRESSIONS)
    this.arpeggio = kind === 'sparse' || kind === 'intro' ? this.pick(SPARSE_ARPEGGIOS) : this.pick(ARPEGGIOS)
    this.melodyIndex = 4 + Math.floor(this.rand() * 2) // start on G4 or A4
    this.droneInSection = kind !== 'song' || this.rand() < 0.5
  }

  private nextSection(): SectionKind {
    if (this.queue.length === 0) {
      // one "movement": a little variety, always coming home to rest
      this.queue = ['arpeggio', 'song', this.rand() < 0.5 ? 'song' : 'arpeggio', 'sparse', 'rest']
      if (this.rand() < 0.3) this.queue.splice(2, 0, 'song')
    }
    return this.queue.shift()!
  }

  nextBar(): Bar {
    if (this.barInSection >= this.sectionLength) this.startSection(this.nextSection())
    const barIndex = this.barInSection++
    const chord = this.section === 'intro' || this.section === 'rest' ? (barIndex % 2 === 0 ? 'Dm' : barIndex === 1 ? 'C' : 'Am') : this.progression[barIndex % 8]
    const events: NoteEvent[] = []
    const jitter = (): number => (this.rand() - 0.5) * 0.016

    // lute
    const v = voicing(chord)
    const pattern = this.section === 'rest' ? [0, -1, -1, -1, 2, -1, -1, -1] : this.arpeggio
    pattern.forEach((idx, step) => {
      if (idx < 0) return
      const strong = step === 0
      const onBeat = step % 2 === 0
      const base = strong ? 0.72 : onBeat ? 0.52 : 0.4
      const quiet = this.section === 'rest' || this.section === 'intro' ? 0.75 : 1
      events.push({
        at: Math.max(0, step * EIGHTH + (strong ? 0 : jitter())),
        midi: v[idx],
        dur: idx === 0 ? BAR : BEAT * 2,
        vel: Math.min(1, (base + (this.rand() - 0.5) * 0.12) * quiet),
        voice: 'lute'
      })
    })

    // recorder tune
    if (this.section === 'song') {
      const phraseEnd = barIndex % 8 === 7
      const halfCadence = barIndex % 8 === 3
      const rhythm = phraseEnd || halfCadence ? this.pick(CADENCE_RHYTHMS) : this.pick(RHYTHMS)
      let pos = 0
      rhythm.forEach((len, n) => {
        const last = n === rhythm.length - 1
        const strong = pos === 0 || pos === 4
        let idx = this.melodyIndex
        const r = this.rand()
        const step = r < 0.55 ? 1 : r < 0.8 ? 2 : r < 0.9 ? 0 : 3
        const center = 5
        const dir = idx > center + 2 ? -1 : idx < center - 2 ? 1 : this.rand() < 0.5 ? -1 : 1
        idx = Math.min(MELODY_SCALE.length - 1, Math.max(0, idx + dir * step))
        if (last && phraseEnd) {
          // come home to D
          idx = Math.abs(idx - 1) <= Math.abs(idx - 8) ? 1 : 8
        } else if (last && halfCadence) {
          idx = 5 // A
        } else if (strong && !isChordTone(MELODY_SCALE[idx], chord)) {
          const near = [idx - 1, idx + 1, idx - 2, idx + 2].filter((i) => i >= 0 && i < MELODY_SCALE.length && isChordTone(MELODY_SCALE[i], chord))
          if (near.length) idx = near[0]
        }
        this.melodyIndex = idx
        const breath = last && (phraseEnd || halfCadence) ? 0.8 : 0.94
        events.push({
          at: pos * EIGHTH + jitter(),
          midi: MELODY_SCALE[idx],
          dur: len * EIGHTH * breath,
          vel: 0.55 + this.rand() * 0.15 + (strong ? 0.06 : 0),
          voice: 'recorder'
        })
        pos += len
      })

      // a soft frame drum under the tune
      events.push({ at: 0, midi: 0, dur: 0.4, vel: 0.55, voice: 'drum' })
      events.push({ at: BEAT * 2, midi: 0, dur: 0.3, vel: 0.32, voice: 'drum' })
      if (this.rand() < 0.6) events.push({ at: BEAT * 3.5, midi: 0, dur: 0.1, vel: 0.28, voice: 'tak' })
    }

    return { section: this.section, chord, events: events.map((e) => ({ ...e, at: Math.max(0, e.at) })), drone: this.droneInSection }
  }
}
