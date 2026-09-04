import { describe, expect, it } from 'vitest'
import type { LeaderboardEntry, Player } from '../../types/domain'
import {
  applyTieBreakerWinner,
  automaticTieBreakersSupported,
  normaliseTieBreakerValue,
  leaderboardBeforeTieBreaker,
  resolveTieBreakerAnswers,
  winningTiePlayerIds,
} from './tieBreakers'

const player = (id: string, score: number, lives = 0, eliminatedAt: number | null = null): Player => ({
  id, sessionId: 'session', nickname: id, connected: true, joinedAt: '', totalScore: score,
  correctAnswerCount: id.length, totalCorrectResponseMs: id.length * 500,
  survivorLivesRemaining: lives, survivorEliminatedAtQuestion: eliminatedAt,
})

describe('winningTiePlayerIds', () => {
  it('uses only the highest visible point score, including negative totals', () => {
    expect(winningTiePlayerIds([player('a', 8500), player('b', 8500), player('c', 7000)], 'points')).toEqual(['a', 'b'])
    expect(winningTiePlayerIds([player('a', 8500), player('b', 8200)], 'points')).toEqual([])
    expect(winningTiePlayerIds([player('a', -500), player('b', -500), player('c', -1000)], 'points')).toEqual(['a', 'b'])
  })

  it('uses highest living lives, one last survivor, and latest wipeout elimination', () => {
    expect(winningTiePlayerIds([player('a', 0, 2), player('b', 99, 2), player('c', 999, 1)], 'survivor')).toEqual(['a', 'b'])
    expect(winningTiePlayerIds([player('a', 0, 1), player('b', 999, 0, 9)], 'survivor')).toEqual([])
    expect(winningTiePlayerIds([player('a', 0, 0, 12), player('b', 500, 0, 12), player('c', 999, 0, 10)], 'survivor')).toEqual(['a', 'b'])
    expect(winningTiePlayerIds([player('a', 0, 0, 12), player('b', 999, 0, 10)], 'survivor')).toEqual([])
  })

  it('enables only new Standard Individual sessions', () => {
    expect(automaticTieBreakersSupported({ playMode: 'individual', automaticTieBreakersEnabled: true }, 'standard')).toBe(true)
    expect(automaticTieBreakersSupported({ playMode: 'teams', automaticTieBreakersEnabled: true }, 'standard')).toBe(false)
    expect(automaticTieBreakersSupported({ playMode: 'individual', automaticTieBreakersEnabled: true }, 'head-to-head')).toBe(false)
    expect(automaticTieBreakersSupported({ playMode: 'individual' }, 'standard')).toBe(false)
  })
})

describe('tie-breaker decimal resolution', () => {
  it.each([
    ['381.500', '381.5'], ['-000.25', '-0.25'], ['.5', '0.5'], ['0', '0'], ['-0', '0'],
  ])('normalises %s without floating-point transport', (input, expected) => expect(normaliseTieBreakerValue(input)).toBe(expected))

  it.each(['', '1e3', 'NaN', 'Infinity', '1,000', 'one', '1000000000000001'])('rejects unsupported input %s', (input) => {
    expect(normaliseTieBreakerValue(input)).toBeNull()
  })

  it('chooses closest, then fastest only among equal-distance answers', () => {
    const closest = resolveTieBreakerAnswers([
      { playerId: 'a', nickname: 'A', value: '90', responseTimeMs: 1 },
      { playerId: 'b', nickname: 'B', value: '96', responseTimeMs: 9000 },
    ], '100')
    expect(closest.winnerPlayerId).toBe('b')
    expect(closest.results.map((entry) => entry.absoluteError)).toEqual(['10', '4'])
    expect(resolveTieBreakerAnswers([
      { playerId: 'a', nickname: 'A', value: '90', responseTimeMs: 2000 },
      { playerId: 'b', nickname: 'B', value: '110', responseTimeMs: 1500 },
    ], '100').winnerPlayerId).toBe('b')
  })

  it('continues exact secondary ties and handles every missing-answer case', () => {
    const exact = resolveTieBreakerAnswers([
      { playerId: 'a', nickname: 'A', value: '90', responseTimeMs: 1500 },
      { playerId: 'b', nickname: 'B', value: '110', responseTimeMs: 1500 },
      { playerId: 'c', nickname: 'C', value: null, responseTimeMs: null },
    ], '100')
    expect(exact).toMatchObject({ winnerPlayerId: null, unresolvedPlayerIds: ['a', 'b'] })
    expect(resolveTieBreakerAnswers([
      { playerId: 'a', nickname: 'A', value: '4.5', responseTimeMs: 500 },
      { playerId: 'b', nickname: 'B', value: null, responseTimeMs: null },
    ], '5').winnerPlayerId).toBe('a')
    expect(resolveTieBreakerAnswers([
      { playerId: 'a', nickname: 'A', value: null, responseTimeMs: null },
      { playerId: 'b', nickname: 'B', value: null, responseTimeMs: null },
    ], '5')).toMatchObject({ winnerPlayerId: null, unresolvedPlayerIds: ['a', 'b'] })
  })

  it('moves only the resolved winner placement without mutating scores or input', () => {
    const entries: LeaderboardEntry[] = [
      { playerId: 'a', nickname: 'A', rank: 1, totalScore: 100, correctAnswerCount: 5, totalCorrectResponseMs: 5000 },
      { playerId: 'b', nickname: 'B', rank: 2, totalScore: 100, correctAnswerCount: 3, totalCorrectResponseMs: 2000 },
      { playerId: 'c', nickname: 'C', rank: 3, totalScore: 50, correctAnswerCount: 9, totalCorrectResponseMs: 1000 },
    ]
    const before = structuredClone(entries)
    expect(applyTieBreakerWinner(entries, 'b').map((entry) => [entry.playerId, entry.rank, entry.totalScore])).toEqual([
      ['b', 1, 100], ['a', 2, 100], ['c', 3, 50],
    ])
    expect(entries).toEqual(before)
    expect(leaderboardBeforeTieBreaker(applyTieBreakerWinner(entries, 'b')).map((entry) => entry.playerId)).toEqual(['a', 'b', 'c'])
  })
})
