import { describe, expect, it } from 'vitest'
import { parseSafeGameState } from './safeGameState'

const openedAt = '2026-09-04T12:00:00Z'
const closesAt = '2026-09-04T12:00:20Z'
const players = ['Carol', 'Roger', 'Jaki'].map((nickname) => ({
  id: nickname.toLowerCase(), sessionId: 'session', nickname, connected: true, joinedAt: '',
  totalScore: 0, correctAnswerCount: 0, totalCorrectResponseMs: 0,
}))

function state(status: 'question' | 'result' = 'question') {
  return {
    sessionId: 'session', quizTitle: 'Quiz', quizType: 'standard', themeId: 'katwed', backgroundId: null,
    roomCode: '123456', status: 'active', phase: status === 'question' ? 'tiebreaker' : 'tiebreaker-result',
    currentQuestion: null, roster: [], players, submittedCount: status === 'question' ? 1 : 2,
    eligibleResponderCount: 2, leaderboard: [], reveal: null, questionOpenedAt: null, questionClosesAt: null, buzz: null,
    tieBreaker: {
      round: 1, status, questionId: 'TB001', prompt: 'How many?', category: 'Science', unit: 'metres',
      openedAt, closesAt, contenderPlayerIds: ['carol', 'roger'], submittedCount: status === 'question' ? 1 : 2,
      ...(status === 'result' ? {
        correctAnswer: '100', winnerPlayerId: 'roger', unresolvedPlayerIds: [],
        results: [
          { playerId: 'carol', nickname: 'Carol', value: '90', absoluteError: '10', responseTimeMs: 2000 },
          { playerId: 'roger', nickname: 'Roger', value: '96', absoluteError: '4', responseTimeMs: 3000 },
        ],
      } : {}),
    },
  }
}

describe('tie-breaker safe state', () => {
  it('accepts minimal question and public result states', () => {
    expect(parseSafeGameState(state()).tieBreaker).toMatchObject({ status: 'question', submittedCount: 1 })
    expect(parseSafeGameState(state('result')).tieBreaker).toMatchObject({ status: 'result', correctAnswer: '100', winnerPlayerId: 'roger' })
  })

  it('rejects answer/source spoilers and ordinary quiz state during the question', () => {
    expect(() => parseSafeGameState({ ...state(), tieBreaker: { ...state().tieBreaker, correctAnswer: '100' } })).toThrow(/too early/)
    expect(() => parseSafeGameState({ ...state(), tieBreaker: { ...state().tieBreaker, sourceUrl: 'https://example.com' } })).toThrow(/invalid tie-breaker state/)
    expect(() => parseSafeGameState({ ...state(), leaderboard: [{ playerId: 'carol', nickname: 'Carol', rank: 1 }] })).toThrow(/mixed quiz question data/)
    expect(() => parseSafeGameState({ ...state(), questionOpenedAt: openedAt })).toThrow(/mixed quiz question data/)
  })

  it('rejects strangers, duplicates, malformed decimals and inconsistent winners', () => {
    expect(() => parseSafeGameState({ ...state(), tieBreaker: { ...state().tieBreaker, contenderPlayerIds: ['carol', 'stranger'] } })).toThrow(/contenders/)
    const result = state('result')
    expect(() => parseSafeGameState({ ...result, tieBreaker: { ...result.tieBreaker, correctAnswer: '1e2' } })).toThrow(/outcome/)
    expect(() => parseSafeGameState({ ...result, tieBreaker: { ...result.tieBreaker, winnerPlayerId: null } })).toThrow(/inconsistent/)
    expect(() => parseSafeGameState({ ...result, tieBreaker: { ...result.tieBreaker, results: [result.tieBreaker.results![0], result.tieBreaker.results![0]] } })).toThrow(/inconsistent/)
  })

  it('retains the resolved result through Finished and requires it only in tie phases', () => {
    const result = state('result')
    expect(parseSafeGameState({ ...result, phase: 'finished', leaderboard: [], eligibleResponderCount: 3 }).tieBreaker?.winnerPlayerId).toBe('roger')
    expect(() => parseSafeGameState({ ...state(), tieBreaker: null })).toThrow(/omitted/)
    expect(() => parseSafeGameState({ ...state(), phase: 'question' })).toThrow(/invalid phase/)
  })
})
