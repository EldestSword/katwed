import { describe, expect, it } from 'vitest'
import type { Player, PlayerAnswer } from '../../types/domain'
import { eligibleResponderCount, recomputeSurvivorPlayers, survivorStandings, validateSurvivorLaunch } from './survivor'

const player = (id: string, score = 0): Player => ({ id, sessionId: 'session', nickname: id,
  connected: true, joinedAt: '', totalScore: score, correctAnswerCount: 0, totalCorrectResponseMs: 0 })
const answer = (playerId: string, questionId: string, correct: boolean): Pick<PlayerAnswer, 'playerId' | 'questionId' | 'correct'> => ({ playerId, questionId, correct })
const questions = ['q1', 'buzz', 'q3', 'q4'].map((id) => ({ id, buzzInEnabled: id === 'buzz' }))

describe('Survivor rules', () => {
  it('recomputes full-correct safety and wrong, partial or missing damage without mutating inputs', () => {
    const players = [player('Carol'), player('Roger')]
    const original = structuredClone(players)
    const result = recomputeSurvivorPlayers(players, [answer('Carol', 'q1', true), answer('Carol', 'q3', false), answer('Roger', 'q1', false)], questions, questions.map(q => q.id), 3, 3)
    expect(result.map(p => [p.id, p.survivorLivesRemaining, p.survivorEliminatedAtQuestion])).toEqual([
      ['Carol', 2, null], ['Roger', 1, null],
    ])
    expect(players).toEqual(original)
  })

  it('skips Buzz questions for the winner, non-winners and missing answers', () => {
    const result = recomputeSurvivorPlayers([player('winner'), player('other')], [answer('winner', 'buzz', false)], questions, ['buzz'], 1, 1)
    expect(result.map(p => p.survivorLivesRemaining)).toEqual([1, 1])
  })

  it('records the actual question position where damage first eliminates a player and supports resurrection', () => {
    const eliminated = recomputeSurvivorPlayers([player('p')], [answer('p', 'buzz', false)], questions, questions.map(q => q.id), 4, 3)[0]
    expect(eliminated).toMatchObject({ survivorLivesRemaining: 0, survivorEliminatedAtQuestion: 4 })
    const revived = recomputeSurvivorPlayers([eliminated], [answer('p', 'q1', true), answer('p', 'buzz', false)], questions, questions.map(q => q.id), 4, 3)[0]
    expect(revived).toMatchObject({ survivorLivesRemaining: 1, survivorEliminatedAtQuestion: null })
  })

  it('ranks survival before points with deterministic secondary rules', () => {
    const rows = survivorStandings([
      { ...player('Roger', 5000), nickname: 'Roger', survivorLivesRemaining: 1, survivorEliminatedAtQuestion: null },
      { ...player('Carol', 800), nickname: 'Carol', survivorLivesRemaining: 2, survivorEliminatedAtQuestion: null },
      { ...player('old', 9000), survivorLivesRemaining: 0, survivorEliminatedAtQuestion: 8 },
      { ...player('recent', -200), survivorLivesRemaining: 0, survivorEliminatedAtQuestion: 12 },
    ])
    expect(rows.map(row => row.playerId)).toEqual(['Carol', 'Roger', 'recent', 'old'])
    expect(rows.map(row => row.rank)).toEqual([1, 2, 3, 4])
  })

  it('uses alive players for ordinary eligibility and the winner-only Buzz rule', () => {
    const state = { currentQuestion: { buzzInEnabled: false }, buzz: null,
      sessionSettings: { competitionMode: 'survivor' as const },
      players: [{ survivorLivesRemaining: 1 }, { survivorLivesRemaining: 0 }] }
    expect(eligibleResponderCount(state as never)).toBe(1)
    expect(eligibleResponderCount({ ...state, currentQuestion: { buzzInEnabled: true } } as never)).toBe(0)
    expect(eligibleResponderCount({ ...state, currentQuestion: { buzzInEnabled: true }, buzz: {} } as never)).toBe(1)
  })

  it('rejects Team and Head-to-Head Survivor launch combinations', () => {
    expect(validateSurvivorLaunch({ competitionMode: 'survivor', playMode: 'teams' }, 'standard')).toMatch(/individual/)
    expect(validateSurvivorLaunch({ competitionMode: 'survivor' }, 'head-to-head')).toMatch(/Standard/)
    expect(validateSurvivorLaunch({ competitionMode: 'survivor', survivorStartingLives: 1 }, 'standard')).toBeNull()
  })
})
