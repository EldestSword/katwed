import { describe, expect, it } from 'vitest'
import { progressiveQuestion } from '../../test/progressiveFixtures'
import { connectionsFixture } from '../../test/connectionsFixtures'
import { createQuestion } from '../questions/factories'
import type { QuestionType } from '../../types/domain'
import { BUZZ_ANSWER_WINDOW_SECONDS, buzzAnswerOpen, buzzInValidation, canUseBuzzIn, normaliseBuzzState } from './buzz'

describe('Buzz-In rules', () => {
  const ordinary = { ...progressiveQuestion(), progressiveRevealEnabled: false, buzzInEnabled: true }

  it('uses one fixed ten-second answer window', () => {
    expect(BUZZ_ANSWER_WINDOW_SECONDS).toBe(10)
    const types: QuestionType[] = ['single-choice', 'multiple-select', 'true-false', 'slider', 'pinpoint', 'typed-answer', 'mashup', 'ordering', 'matching', 'connections']
    expect(types.map(type => createQuestion(type, 'quiz', 0).buzzInEnabled)).toEqual(types.map(() => false))
  })

  it('allows eligible Standard questions and rejects Head-to-Head, Connections and Progressive Reveal', () => {
    expect(canUseBuzzIn(ordinary)).toBe(true)
    expect(buzzInValidation(ordinary)).toEqual([])
    expect(buzzInValidation(ordinary, 'head-to-head')).toContain('Buzz-In is Standard-only. Disable it before switching to Head-to-Head.')
    expect(buzzInValidation({ ...connectionsFixture(), buzzInEnabled: true })).toContain('Buzz-In is not available for Connections.')
    expect(buzzInValidation({ ...progressiveQuestion(), buzzInEnabled: true })).toContain('Buzz-In cannot be combined with Progressive Reveal.')
  })

  it('normalises only complete, ordered public Buzz state', () => {
    const state = { winnerPlayerId: 'player', claimedAt: '2026-09-04T12:00:00Z', answerDeadlineAt: '2026-09-04T12:00:10Z' }
    expect(normaliseBuzzState(state)).toEqual(state)
    expect(normaliseBuzzState(null)).toBeNull()
    for (const invalid of [
      {},
      { ...state, winnerPlayerId: '' },
      { ...state, claimedAt: 'not-a-date' },
      { ...state, answerDeadlineAt: '2026-09-04T11:59:59Z' },
      { ...state, answerDeadlineAt: '2026-09-04T12:00:10.001Z' },
      { ...state, secret: true },
    ]) expect(() => normaliseBuzzState(invalid)).toThrow('Invalid Buzz state.')
  })

  it('opens answers only for the winner and strictly before the deadline', () => {
    const state = { winnerPlayerId: 'winner', claimedAt: '2026-09-04T12:00:00Z', answerDeadlineAt: '2026-09-04T12:00:10Z' }
    expect(buzzAnswerOpen(state, 'winner', Date.parse('2026-09-04T12:00:09.999Z'))).toBe(true)
    expect(buzzAnswerOpen(state, 'winner', Date.parse(state.answerDeadlineAt))).toBe(false)
    expect(buzzAnswerOpen(state, 'loser', Date.parse(state.claimedAt))).toBe(false)
  })
})
