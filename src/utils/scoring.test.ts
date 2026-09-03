import { describe, expect, it } from 'vitest'
import { scoreExactPair, scoreQuestion, sortLeaderboard } from './scoring'
import type { Player, Question } from '../types/domain'

describe('scoreExactPair', () => {
  it('awards one point for the correct pair in original order', () => {
    expect(scoreExactPair(['alex', 'bailey'], ['alex', 'bailey'])).toEqual({ valid: true, correct: true, points: 1 })
  })

  it('awards one point for the correct pair in reverse order', () => {
    expect(scoreExactPair(['bailey', 'alex'], ['alex', 'bailey'])).toEqual({ valid: true, correct: true, points: 1 })
  })

  it.each([
    [['alex', 'casey'], 'one correct and one incorrect'],
    [['casey', 'drew'], 'two incorrect'],
  ])('awards zero for %s (%s)', (selected) => {
    expect(scoreExactPair(selected, ['alex', 'bailey'])).toEqual({ valid: true, correct: false, points: 0 })
  })

  it('rejects only one selection', () => {
    expect(scoreExactPair(['alex'], ['alex', 'bailey'])).toMatchObject({ valid: false, points: 0, reason: 'selection-count' })
  })

  it('rejects a duplicate selection', () => {
    expect(scoreExactPair(['alex', 'alex'], ['alex', 'bailey'])).toMatchObject({ valid: false, points: 0, reason: 'duplicate-selection' })
  })

  it('rejects more than two selections', () => {
    expect(scoreExactPair(['alex', 'bailey', 'casey'], ['alex', 'bailey'])).toMatchObject({ valid: false, points: 0, reason: 'selection-count' })
  })
})

describe('scoreQuestion', () => {
  const base = {
    id: 'q', quizId: 'quiz', roundId: 'round-1', prompt: 'Question', supportingText: '', timeLimitSeconds: 30,
    assignedCompetitorId: null,
    points: 1000, speedScoringEnabled: false, doubleScore: false, displayOrder: 0, revealCaption: '', media: { type: 'none' as const },
    mediaVisibility: 'both' as const, presentationChoiceVisibility: 'show' as const,
  }

  it('scores single choice and true/false exactly', () => {
    const single: Question = { ...base, type: 'single-choice', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], correctOptionId: 'a', randomiseOptions: false }
    expect(scoreQuestion(single, { type: 'single-choice', optionId: 'a' })).toMatchObject({ correct: true, points: 1000 })
    expect(scoreQuestion(single, { type: 'single-choice', optionId: 'b' })).toMatchObject({ correct: false, points: 0 })
    const bool: Question = { ...base, type: 'true-false', correctValue: false }
    expect(scoreQuestion(bool, { type: 'true-false', value: false })).toMatchObject({ correct: true })
  })

  it('supports exact and partial-wipeout multiple select', () => {
    const question: Question = {
      ...base, type: 'multiple-select',
      options: ['a', 'b', 'c'].map((id) => ({ id, label: id })),
      correctOptionIds: ['a', 'b'], minimumSelections: 1, maximumSelections: 2,
      scoringMode: 'partial-wipeout', randomiseOptions: false,
    }
    expect(scoreQuestion(question, { type: 'multiple-select', optionIds: ['a'] })).toMatchObject({ points: 500, correct: false })
    expect(scoreQuestion(question, { type: 'multiple-select', optionIds: ['a', 'c'] })).toMatchObject({ points: 0 })
    expect(scoreQuestion({ ...question, scoringMode: 'exact' }, { type: 'multiple-select', optionIds: ['b', 'a'] })).toMatchObject({ points: 1000, correct: true })
  })

  it('scores slider tolerance and rejects non-step values', () => {
    const question: Question = { ...base, type: 'slider', minimum: 0, maximum: 100, step: 5, correctValue: 50, tolerance: 5, prefix: '', suffix: '', unitLabel: '' }
    expect(scoreQuestion(question, { type: 'slider', value: 55 })).toMatchObject({ correct: true })
    expect(scoreQuestion(question, { type: 'slider', value: 56 })).toMatchObject({ valid: false })
  })

  it('scores normalised pinpoint distance including the boundary', () => {
    const question: Question = {
      ...base, type: 'pinpoint',
      media: { type: 'image', path: '/x.svg', altText: 'Map', revealEffect: 'immediate', revealDurationSeconds: 0 },
      target: { kind: 'circle', x: .5, y: .5, radius: .1 },
    }
    expect(scoreQuestion(question, { type: 'pinpoint', x: .6, y: .5 })).toMatchObject({ correct: true })
    expect(scoreQuestion(question, { type: 'pinpoint', x: .7, y: .5 })).toMatchObject({ correct: false })
    expect(scoreQuestion(question, { type: 'pinpoint', x: 2, y: .5 })).toMatchObject({ valid: false })
  })

  it('scores Typed Answer by exact normalised primary or alternative text', () => {
    const question: Question = {
      ...base, type: 'typed-answer', correctAnswer: 'Chris O\u2019Dowd', acceptedAnswers: ['Christopher O Dowd'],
    }
    expect(scoreQuestion(question, { type: 'typed-answer', value: " chris-o'dowd " })).toMatchObject({ correct: true, points: 1000 })
    expect(scoreQuestion(question, { type: 'typed-answer', value: 'Christopher O. Dowd' })).toMatchObject({ correct: true, points: 1000 })
    expect(scoreQuestion(question, { type: 'typed-answer', value: 'Chris O Dow' })).toMatchObject({ correct: false, points: 0 })
    expect(scoreQuestion(question, { type: 'typed-answer', value: '---' })).toMatchObject({ valid: false, points: 0 })
  })
})

describe('sortLeaderboard', () => {
  const player = (nickname: string, score: number, correct: number, time: number): Player => ({
    id: nickname, sessionId: 'game', nickname, connected: true, joinedAt: '', totalScore: score,
    correctAnswerCount: correct, totalCorrectResponseMs: time,
  })

  it('uses score, correct count, response time, then nickname', () => {
    const result = sortLeaderboard([
      player('Morgan', 2, 2, 9000),
      player('alex', 2, 2, 6000),
      player('Bailey', 2, 2, 6000),
      player('Drew', 1, 1, 1000),
    ])
    expect(result.map((entry) => entry.nickname)).toEqual(['alex', 'Bailey', 'Morgan', 'Drew'])
    expect(result.map((entry) => entry.rank)).toEqual([1, 2, 3, 4])
  })
})
