/**
 * Patch 8 stage 1 (D-62): the Audience made alive. Greetings that change by the day (A1), a word on
 * the freshest thing that concerns the ruler (A2), the questions the player may ask (A3), his words for
 * a deal struck or turned down (A4), and the drafts kept out of a release build until Rich approves them.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDays } from '../../src/renderer/src/lib/game/clock'
import { placeholders } from '../../src/renderer/src/lib/game/text'
import { RIVAL_IDS, type CampaignState, type GameEvent, type RivalId } from '../../src/renderer/src/lib/game/types'
import { dealAcceptLine, greetingFor, greetingPool, LINE_KEYS, lineTiers, refusalKey, refusalLine, withDrafts } from '../../src/renderer/src/lib/game/view/audience'
import { audienceQuestions, audienceTopic, prizedSoFar, relationTo, TOPICS, topicFacts, type TopicId } from '../../src/renderer/src/lib/game/view/audienceTalk'
import { emptyLedger } from './fixtures/ledgers'
import { hexName } from '../../src/renderer/src/lib/game/map'
import { rivalName } from '../../src/renderer/src/lib/game/view/shell'
import draftJson from '../../rivalLines.draft.json'
import linesJson from '../../rivalLines.json'
import { realm } from './support/realm'
import { START } from './support/war'

const DEV = withDrafts()
type Entry = Record<string, unknown>
const drafts = (draftJson as unknown as { rivals: Record<string, Entry> }).rivals

function logged(state: CampaignState, events: Record<string, unknown>[]): CampaignState {
  return { ...state, log: [...state.log, ...events.map((e, i) => ({ id: `t-${state.log.length + i + 1}`, ...e }) as GameEvent)] }
}

test('A1: a greeting holds all day, changes the next, and is always one of its tier’s lines', () => {
  const state = realm()
  for (const rival of RIVAL_IDS) {
    for (const tier of lineTiers()) {
      const pool = greetingPool(rival, tier, DEV)
      assert.ok(pool.length >= 3, `${rival} at ${tier} has ${pool.length} greetings`)
      let before = ''
      for (let d = 0; d < 6; d++) {
        const day = addDays(START, d)
        const line = greetingFor(state, rival, tier, day, DEV)
        assert.equal(line.tier, tier)
        assert.ok(pool.includes(line.text))
        assert.equal(greetingFor(state, rival, tier, day, DEV).text, line.text, 'the same all day')
        assert.notEqual(line.text, before, `${rival} at ${tier}: never yesterday’s`)
        before = line.text
      }
    }
  }
})

test('D-62: a release build reads Rich’s file alone, so no draft line shows until he moves it in', () => {
  const state = realm()
  const draftTexts = new Set(JSON.stringify(drafts).match(/"[^"]{12,}"/g)?.map((s) => JSON.parse(s) as string))
  for (const rival of RIVAL_IDS) {
    for (const tier of lineTiers()) assert.ok(!draftTexts.has(greetingFor(state, rival, tier, START).text), `${rival} at ${tier}`)
    assert.equal(dealAcceptLine(rival, 'truce').text, (linesJson as unknown as { rivals: Record<string, Entry> }).rivals[LINE_KEYS[rival]].accept, 'his one accept line')
    assert.equal(refusalLine(rival, 'respect'), undefined)
    assert.equal(audienceTopic(state, rival, START, undefined), undefined)
    assert.deepEqual(audienceQuestions(state, rival, START, undefined), [])
  }
  // Rich's line wins over a draft; lists are joined, his first.
  const merged = withDrafts({ rivals: { ugrak: { accept: 'Rich', wishes: ['R'] } } }, { rivals: { ugrak: { accept: 'Draft', wishes: ['D'], noNews: 'N' } } }) as { rivals: { ugrak: Entry } }
  assert.deepEqual(merged.rivals.ugrak, { accept: 'Rich', wishes: ['R', 'D'], noNews: 'N' })
})

test('the drafts: every ruler has a line for every topic, standing, deal and reason, with only the facts each may name', () => {
  const relations = ['war', 'tension', 'peace', 'partner', 'fallen', 'allied']
  const reasons = ['respect', 'notYet', 'atWar', 'atPeace', 'cooldown', 'inForce', 'reputation', 'neverSells', 'other']
  for (const rival of RIVAL_IDS) {
    const e = drafts[LINE_KEYS[rival]]
    const part = (k: string): Record<string, string> => e[k] as Record<string, string>
    for (const [id, facts] of Object.entries(TOPICS)) {
      const line = part('topics')[id]
      assert.ok(typeof line === 'string' && line.trim(), `${rival}: topic ${id}`)
      for (const name of placeholders(line)) assert.ok(facts.includes(name), `${rival}: topic ${id} names {${name}}`)
    }
    for (const r of relations) assert.deepEqual(placeholders(part('relations')[r] ?? ''), ['rival'], `${rival}: relation ${r}`)
    for (const r of reasons) assert.ok(part('refusals')[r], `${rival}: refusal ${r}`)
    for (const other of RIVAL_IDS.filter((x) => x !== rival)) assert.ok(part('of')[LINE_KEYS[other]], `${rival} on ${other}`)
    const deals = ['truce', 'pact', 'callToArms', 'sellHex', 'buyout', ...(rival === 'orc' ? [] : ['accord']), ...(rival === 'archmage' ? ['buyHex'] : [])]
    for (const d of deals) assert.ok(part('deals')[d], `${rival}: deal ${d}`)
    for (const d of Object.values(part('deals'))) assert.deepEqual(placeholders(d), [], `${rival}: a deal line names nothing`)
    assert.ok((e.wishes as string[]).length >= 2)
    assert.ok(e.noNews)
  }
})

test('A4: his words for a deal struck, and for each reason he turns one down', () => {
  assert.equal(dealAcceptLine('dwarf', 'pact', DEV).text, (drafts.hrodgar.deals as Record<string, string>).pact)
  assert.equal(dealAcceptLine('orc', 'accord', DEV).text, (drafts.ugrak as Entry).accept ?? (linesJson as unknown as { rivals: Record<string, Entry> }).rivals.ugrak.accept, 'none of his own: his accept line')
  assert.deepEqual(
    ['respect', 'useBribe', 'neverSells', 'pathRank', 'castle', 'contractRunning', 'cooldown', 'grandBattleWarning'].map(refusalKey),
    ['respect', 'neverSells', 'neverSells', 'notYet', 'notYet', 'notYet', 'cooldown', 'other']
  )
  assert.equal(refusalLine('goblin', 'grandBattleWarning', DEV)?.text, (drafts.skivvet.refusals as Record<string, string>).other)
})

test('A2: the facts a ruler speaks of, freshest first: his land taken, land he took from a neighbor, a Truce ending', () => {
  let state = realm()
  const his = state.hexes.find((h) => h.owner === 'orc' && h.kind !== 'capital' && h.kind !== 'gate')!
  const goblins = state.hexes.find((h) => h.owner === 'goblin' && h.kind !== 'capital' && h.kind !== 'gate')!
  const day = addDays(START, 10)
  state = logged(state, [
    { day: addDays(day, -3), kind: 'hexTransfer', hexId: goblins.id, from: 'goblin', to: 'orc', how: 'conquest' },
    { day: addDays(day, -1), kind: 'hexTransfer', hexId: his.id, from: 'orc', to: 'player', how: 'conquest' },
    { day: addDays(day, -20), kind: 'hexTransfer', hexId: goblins.id, from: 'orc', to: 'goblin', how: 'conquest' }
  ])
  state = { ...state, deals: [...state.deals, { id: 'd-1', rival: 'orc', kind: 'truce', madeOn: addDays(day, -5), until: day, price: 0 }] }
  const facts = topicFacts(state, 'orc', day)
  assert.deepEqual(
    facts.map((f) => f.id),
    ['tookHex', 'tookFrom', 'truceEnding'] as TopicId[],
    'a deed 20 days old is forgotten; what stands comes after the news'
  )
  assert.deepEqual(facts[0].facts, { hex: hexName(his.id) })
  assert.deepEqual(facts[1], { id: 'tookFrom', facts: { rival: rivalName('goblin'), hex: hexName(goblins.id) }, neighbor: true, day: addDays(day, -3) })
  assert.deepEqual(facts[2].facts, { days: 'a day' })
  // The day's topic is one of his freshest, spoken in his words.
  const topic = audienceTopic(state, 'orc', day, DEV)
  assert.ok(topic && ['tookHex', 'tookFrom', 'truceEnding'].includes(topic.id))
  assert.ok(!topic.text.includes('{'), topic.text)
  // A resolved ruler speaks of nothing.
  assert.deepEqual(topicFacts({ ...state, rivals: { ...state.rivals, orc: { ...state.rivals.orc, status: 'conquered' } } }, 'orc', day), [])
})

test('A3: what he thinks of each neighbor follows his real standing with him; what pleases him names the habit he prizes; news is of his neighbors', () => {
  let state = realm()
  const day = addDays(START, 10)
  const of = (s: CampaignState, rival: RivalId, other: RivalId): string => audienceQuestions(s, rival, day, DEV).find((q) => q.id === `of:${other}`)?.answer ?? ''
  const relations = (r: RivalId): Record<string, string> => drafts[LINE_KEYS[r]].relations as Record<string, string>
  state = { ...state, rivals: { ...state.rivals, orc: { ...state.rivals.orc, disposition: { ...state.rivals.orc.disposition, goblin: 'war' } } } }
  assert.equal(relationTo(state, 'orc', 'goblin', day), 'war')
  assert.ok(of(state, 'orc', 'goblin').startsWith(relations('orc').war.replace('{rival}', rivalName('goblin'))))
  assert.ok(of(state, 'orc', 'goblin').endsWith((drafts.ugrak.of as Record<string, string>).skivvet))
  const fallen = { ...state, rivals: { ...state.rivals, dwarf: { ...state.rivals.dwarf, status: 'conquered' as const } } }
  assert.equal(relationTo(fallen, 'orc', 'dwarf', day), 'fallen')
  const allied = { ...state, rivals: { ...state.rivals, dwarf: { ...state.rivals.dwarf, status: 'allied' as const } } }
  assert.equal(relationTo(allied, 'orc', 'dwarf', day), 'allied')
  const partners = { ...state, coalitions: [{ members: ['orc', 'goblin'] as RivalId[], trigger: 'risingCrown' as const, warChest: 0, formedOn: START }] }
  assert.equal(relationTo(partners, 'orc', 'goblin', day), 'partner')
  const wish = audienceQuestions(state, 'dwarf', day, DEV).find((q) => q.id === 'wish')
  assert.ok(wish && (drafts.hrodgar.wishes as string[]).includes(wish.answer))
  assert.match(wish.rule ?? '', /^He prizes a week meeting your step pool\./)
  const news = audienceQuestions(state, 'orc', day, DEV).find((q) => q.id === 'news')
  assert.equal(news?.answer, drafts.ugrak.noNews, 'no news of his neighbors yet')
  const warred = logged(state, [{ day: addDays(day, -2), kind: 'front', front: 'north', state: 'war', track: 0 }])
  assert.equal(audienceQuestions(warred, 'orc', day, DEV, 'tookHex').find((q) => q.id === 'news')?.answer, (drafts.ugrak.topics as Record<string, string>).frontWar.replace('{rival}', rivalName('goblin')))
  // Talking changes nothing: the state is the same object.
  assert.equal(audienceQuestions(state, 'orc', day, DEV).length, 5)
})

test('A2: the habit he prizes, so far this week: Ugrak’s is no battle lost', () => {
  const state = realm()
  const day = addDays(START, 9)
  assert.equal(prizedSoFar(state, 'orc', emptyLedger(), day), 'kept')
  const lost = logged(state, [{ day: addDays(day, -1), kind: 'defense', threat: 'raid', rival: 'orc', hexId: state.hexes[1].id, outcome: 'defeat' }])
  assert.equal(prizedSoFar(lost, 'orc', emptyLedger(), day), 'slipping')
  assert.deepEqual(topicFacts(lost, 'orc', day, 'slipping').map((f) => f.id), ['raidWon', 'habitSlipping'])
  // Hrodgar's is the step pool: nothing walked, behind it.
  assert.equal(prizedSoFar(state, 'dwarf', emptyLedger(), day), 'slipping')
})
