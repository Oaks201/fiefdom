/**
 * Patch 10 stage 3 (R5, F3; D-79, D-91): the rulers' words in parts, and what they speak of. A line may be built from
 * an opening, a body and a close, each picked by the campaign's seeded draw for the day; the drafts give each ruler
 * his commission's words, his terms in an Ultimatum, his replies, and the new topics and memories.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDays } from '../../src/renderer/src/lib/game/clock'
import { placeholders } from '../../src/renderer/src/lib/game/text'
import { RIVAL_IDS, type CampaignState, type GameEvent, type GameEventKind, type RivalId } from '../../src/renderer/src/lib/game/types'
import { isParts, lineFrom, rulerEntry, withDrafts } from '../../src/renderer/src/lib/game/view/audience'
import { NOT_RULER_TOPICS, R5_TOPICS, RULER_TOPICS, TOPICS, audienceTopic, memoryFacts, topicFacts } from '../../src/renderer/src/lib/game/view/audienceTalk'
import { requestCard, requestReply } from '../../src/renderer/src/lib/game/view/requests'
import { withWorld } from '../../src/renderer/src/lib/game/state'
import linesJson from '../../rivalLines.json'
import { realm } from './support/realm'
import { START, withOwner } from './support/war'

const DEV = withDrafts()
const parts = { open: ['Hear me.', 'Listen.'], body: ['{hex} is mine.', 'I want {hex}.'], close: ['Go.'] }

test('R5 (F3): a line in parts is one body, with an opening and a close when given, each picked by the day; the same day reads the same', () => {
  const lines = new Set<string>()
  for (let d = 0; d < 30; d++) {
    const day = addDays(START, d)
    const line = lineFrom(parts, { hex: 'Ashgate' }, 7, day, 'test')
    assert.ok(line)
    assert.equal(lineFrom(parts, { hex: 'Ashgate' }, 7, day, 'test'), line, 'seeded: the same all day')
    assert.match(line, /^(Hear me\.|Listen\.) (Ashgate is mine\.|I want Ashgate\.) Go\.$/)
    lines.add(line)
  }
  assert.equal(lines.size, 4, 'every opening and body come up')
  assert.equal(lineFrom({ body: ['Only {hex}.'] }, { hex: 'X' }, 7, START, 'b'), 'Only X.', 'no opening or close: the body alone')
  assert.equal(lineFrom('A plain {hex}.', { hex: 'X' }, 7, START, 'p'), 'A plain X.', 'a plain line, as before')
  assert.equal(lineFrom({ body: [] }, {}, 7, START, 'e'), undefined)
  assert.equal(isParts({ open: ['x'] }), false)
})

test('R5, D-92: every ruler has approved words for his commission, his terms, his replies and each new topic, naming only its facts', () => {
  const requestFacts: Record<string, string[]> = { commission: ['need', 'until'], ultimatumTerms: ['need', 'until'], taken: [], declined: [] }
  const named = (value: unknown): string[] => {
    const all = typeof value === 'string' ? [value] : isParts(value) ? [...(value.open ?? []), ...value.body, ...(value.close ?? [])] : []
    return all.flatMap((s) => placeholders(s))
  }
  for (const rival of RIVAL_IDS) {
    const entry = rulerEntry(linesJson, rival) as Record<string, Record<string, unknown>>
    for (const [key, facts] of Object.entries(requestFacts)) {
      const value = entry.requests[key]
      assert.ok(isParts(value), `${rival}: request ${key}`)
      for (const n of named(value)) assert.ok(facts.includes(n), `${rival}: request ${key} names {${n}}`)
    }
    for (const id of R5_TOPICS) {
      const only = RULER_TOPICS[id]
      if ((only && only !== rival) || NOT_RULER_TOPICS[id] === rival) continue
      const value = entry.topics[id]
      assert.ok(isParts(value) || typeof value === 'string', `${rival}: topic ${id}`)
      for (const n of named(value)) assert.ok(TOPICS[id].includes(n), `${rival}: topic ${id} names {${n}}`)
    }
  }
})

function logged(state: CampaignState, events: ({ day: string; kind: GameEventKind } & Record<string, unknown>)[]): CampaignState {
  return { ...state, log: [...state.log, ...events.map((e, i) => ({ ...e, id: `t-${state.log.length + i}` }) as GameEvent)] }
}

test('R5: his commission met or missed, walls raised near him, the streak and the leading tag become topics; a dare keeps its own', () => {
  const s0 = realm()
  const his = s0.hexes.find((h) => h.march === 'dwarf' && h.ring === 4) as { id: string }
  const state = withOwner(
    logged(s0, [
      { day: START, kind: 'request', rival: 'dwarf', request: 'commission', stage: 'met', need: 2, done: 2 },
      { day: START, kind: 'request', rival: 'orc', request: 'dare', stage: 'missed' },
      { day: START, kind: 'fortified', hexId: his.id, level: 2 },
      { day: START, kind: 'hexTransfer', hexId: his.id, from: 'neutral', to: 'player', how: 'conquest', banners: { engine: 0.7, steel: 0.3 } }
    ]),
    [his.id],
    'player'
  )
  const ids = (r: RivalId): string[] => topicFacts(state, r, START).map((f) => f.id)
  assert.ok(ids('dwarf').includes('commissionMet'))
  assert.ok(ids('dwarf').includes('wallsRaised'), 'the Dwarf speaks of walls anywhere')
  assert.ok(ids('dwarf').includes('leadingTag'), 'Engine led, so Hrodgar speaks of it')
  assert.ok(!ids('goblin').includes('leadingTag'))
  assert.ok(ids('orc').includes('dareMissed'), 'a dare keeps its own topic')
  const onStreak: CampaignState = { ...state, paths: { ...(state.paths as NonNullable<CampaignState['paths']>), field: { days: 7, through: START } } }
  assert.ok(topicFacts(onStreak, 'orc', START).some((f) => f.id === 'fieldStreak' && f.facts.days === 7))
  assert.ok(topicFacts(onStreak, 'dwarf', START).some((f) => f.id === 'heardStreak'))
  assert.ok(!topicFacts(onStreak, 'orc', START).some((f) => f.id === 'heardStreak'))
})

test('R5: on a day with nothing fresh he recalls a deed, with its week; and never the same topic two days running unless it is news', () => {
  const s0 = realm()
  const first = s0.hexes.find((h) => h.march === 'orc' && h.ring === 4) as { id: string }
  const old = addDays(START, -60)
  const state = logged(withOwner(s0, [first.id], 'player'), [{ day: old, kind: 'hexTransfer', hexId: first.id, from: 'orc', to: 'player', how: 'conquest' }])
  assert.deepEqual(memoryFacts(state, 'orc').map((f) => f.id), ['memoryFirstHex'])
  const topic = audienceTopic(state, 'orc', START, DEV)
  assert.equal(topic?.id, 'memoryFirstHex')
  assert.match(topic?.text ?? '', /[Ww]eek -?\d+/)
  assert.doesNotMatch(topic?.text ?? '{', /\{/)

  // Two facts to speak of, no news: the topic changes from one day to the next.
  const busy = logged(state, [
    { day: START, kind: 'request', rival: 'orc', request: 'commission', stage: 'met', need: 3, done: 3 },
    { day: START, kind: 'fortified', hexId: first.id, level: 1 }
  ])
  for (let d = 1; d < 5; d++) {
    const a = audienceTopic(busy, 'orc', addDays(START, d - 1), DEV)
    const b = audienceTopic(busy, 'orc', addDays(START, d), DEV)
    if (a && b) assert.notEqual(a.id, b.id, `day ${d}`)
  }
})

test('R5: the commission card speaks his words, and his replies to it are his own', () => {
  const q = { id: 'q', rival: 'orc' as const, kind: 'commission' as const, madeOn: addDays(START, -1), until: addDays(START, 6), need: 3 }
  const state = withWorld(realm(), { requests: [q] })
  const card = requestCard(state, 'orc', START, DEV)
  assert.match(card?.words ?? '', /3 days/)
  assert.doesNotMatch(card?.words ?? '{', /\{/)
  const terms = requestCard(withWorld(realm(), { requests: [{ ...q, ultimatum: true }] }), 'orc', START, DEV)
  assert.notEqual(terms?.words, card?.words)
  const taken = requestReply('orc', 'grant', DEV, 'commission', { seed: 7, day: START })
  assert.ok(taken && (rulerEntry(DEV, 'orc') as { requests: { taken: { body: string[] } } }).requests.taken.body.includes(taken))
  assert.equal(requestReply('orc', 'grant', DEV), (rulerEntry(DEV, 'orc') as { requests: { granted: string } }).requests.granted, 'other requests keep their line')
})
