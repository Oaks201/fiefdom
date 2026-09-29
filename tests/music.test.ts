import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BAR, CHORDS, Composer, inDorian, pitchClass, voicing, type ChordName } from '../src/renderer/src/lib/music'

test('lute voicings are the chord, in a playable range', () => {
  for (const chord of Object.keys(CHORDS) as ChordName[]) {
    const [bass, ...upper] = voicing(chord)
    assert.ok(bass >= 33 && bass <= 45, `${chord} bass ${bass}`)
    assert.equal(upper.length, 4)
    const pcs = CHORDS[chord].map((i) => ((i % 12) + 12) % 12)
    for (const m of [bass, ...upper]) assert.ok(pcs.includes(pitchClass(m)), `${chord}: ${m} is not a chord tone`)
  }
})

test('the composer writes endless, in-mode, in-time bars', () => {
  const c = new Composer(1234)
  const sections = new Set<string>()
  let recorderNotes = 0
  for (let i = 0; i < 400; i++) {
    const bar = c.nextBar()
    sections.add(bar.section)
    for (const e of bar.events) {
      assert.ok(e.at >= 0 && e.at < BAR, `event at ${e.at}`)
      assert.ok(e.vel > 0 && e.vel <= 1)
      assert.ok(e.dur > 0)
      if (e.voice === 'lute' || e.voice === 'recorder') assert.ok(inDorian(e.midi), `${e.midi} outside D Dorian`)
      if (e.voice === 'recorder') {
        recorderNotes++
        assert.ok(e.midi >= 60 && e.midi <= 76)
      }
    }
  }
  assert.deepEqual([...sections].sort(), ['arpeggio', 'intro', 'rest', 'song', 'sparse'])
  assert.ok(recorderNotes > 100)
})

test('the same seed writes the same music; different seeds differ', () => {
  const a = new Composer(7)
  const b = new Composer(7)
  const c = new Composer(8)
  const take = (x: Composer): string => JSON.stringify(Array.from({ length: 40 }, () => x.nextBar()))
  const ta = take(a)
  assert.equal(ta, take(b))
  assert.notEqual(ta, take(c))
})
