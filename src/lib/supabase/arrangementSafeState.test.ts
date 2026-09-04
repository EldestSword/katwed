import { describe, expect, it } from 'vitest'
import { matchingFixture, orderingFixture, safeArrangement } from '../../test/arrangementFixtures'
import { parseSafeGameState } from './safeGameState'

function fixture(type: 'ordering' | 'matching', phase = 'question') {
  return { sessionId: 'session', phase, quizType: 'standard', players: [], leaderboard: [], currentQuestion: safeArrangement(type === 'ordering' ? orderingFixture() : matchingFixture()), reveal: null }
}
describe('Arrangement safe-state boundary', () => {
  it.each(['ordering', 'matching'] as const)('accepts safe %s and rejects any leaked answer keys', (type) => {
    expect(parseSafeGameState(fixture(type)).currentQuestion?.type).toBe(type)
    for (const key of ['correctItemIds', 'correctItemKeys', 'correctPairs']) {
      const state = fixture(type); Object.assign(state.currentQuestion, { [key]: [] })
      expect(() => parseSafeGameState(state)).toThrow()
    }
  })
  it.each(['lobby', 'question', 'locked', 'round-intro'])('rejects answer material in %s', (phase) => {
    const q = orderingFixture()
    expect(() => parseSafeGameState({ ...fixture('ordering', phase), reveal: { type: 'ordering', caption: '', correctItemIds: q.correctItemIds } })).toThrow()
  })
  it.each(['reveal', 'leaderboard', 'finished'])('accepts complete answer keys only in permitted %s phase', (phase) => {
    const q = matchingFixture()
    expect(parseSafeGameState({ ...fixture('matching', phase), reveal: { type: 'matching', caption: '', correctPairs: q.correctPairs, scoringMode: q.scoringMode } }).reveal).toMatchObject({ correctPairs: q.correctPairs })
  })
  it.each(['missing', 'duplicate', 'extra', 'mismatch'])('rejects invalid revealed %s references or fields', (kind) => {
    const q = matchingFixture(), reveal = { type: 'matching', caption: '', correctPairs: q.correctPairs, scoringMode: q.scoringMode }
    if (kind === 'missing') reveal.correctPairs.pop()
    if (kind === 'duplicate') reveal.correctPairs[0].rightId = reveal.correctPairs[1].rightId
    if (kind === 'extra') Object.assign(reveal.correctPairs[0], { extra: true })
    expect(() => parseSafeGameState({ ...fixture(kind === 'mismatch' ? 'ordering' : 'matching', 'reveal'), reveal })).toThrow()
  })
})
