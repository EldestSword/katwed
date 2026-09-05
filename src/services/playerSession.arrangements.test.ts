import { beforeEach, describe, expect, it } from 'vitest'
import { loadSubmittedAnswer, saveSubmittedAnswer } from './playerSession'
import { orderingFixture, matchingFixture } from '../test/arrangementFixtures'
import type { PlayerAnswerPayload } from '../types/domain'
beforeEach(() => localStorage.clear())
describe('Arrangement submitted-answer recovery', () => {
  it.each([
    { type: 'ordering', itemIds: orderingFixture().correctItemIds },
    { type: 'matching', pairs: matchingFixture().correctPairs },
  ] satisfies PlayerAnswerPayload[])('restores $type on refresh/reveal and keeps restart identity separate', (answer) => {
    saveSubmittedAnswer('player', 'question', 'opening', answer)
    expect(loadSubmittedAnswer('player', 'question', 'opening')).toEqual(answer)
    expect(loadSubmittedAnswer('other-player', 'question', 'opening')).toBeNull()
    expect(loadSubmittedAnswer('player', 'question', 'restarted')).toBeNull()
  })
  it.each([
    { type: 'ordering', itemIds: ['a', 'a'] }, { type: 'ordering', itemIds: null },
    { type: 'ordering', itemIds: ['a', 'b'], extra: true },
    { type: 'matching', pairs: [{ leftId: 'a', rightId: 'x' }, { leftId: 'b', rightId: 'x' }] },
    { type: 'matching', pairs: [{ leftId: 'a', rightId: 'x', extra: 1 }, { leftId: 'b', rightId: 'y' }] },
    { type: 'matching', pairs: [null, null] },
  ])('ignores malformed cached payload %j', (value) => {
    localStorage.setItem('katwed.answer.player.question.opening', JSON.stringify(value))
    expect(loadSubmittedAnswer('player', 'question', 'opening')).toBeNull()
  })
})
