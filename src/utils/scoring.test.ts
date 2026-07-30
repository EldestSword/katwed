import { describe, expect, it } from 'vitest'
import { scoreExactPair, sortLeaderboard } from './scoring'
import type { Player } from '../types/domain'

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
