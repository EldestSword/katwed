import { describe, expect, it } from 'vitest'
import { parseSafeGameState } from './safeGameState'

const safeState = {
  sessionId: 'session',
  quizTitle: 'Quiz',
  roomCode: '123456',
  status: 'active',
  phase: 'reveal',
  currentQuestion: {
    id: 'pinpoint',
    type: 'pinpoint',
    prompt: 'Choose',
    supportingText: '',
    timeLimitSeconds: 30,
    points: 1000,
    displayOrder: 0,
    media: { type: 'image', path: '/target.svg', altText: 'Target', revealEffect: 'immediate', revealDurationSeconds: 0 },
    mediaVisibility: 'both',
    presentationChoiceVisibility: 'hide',
    questionNumber: 1,
    totalQuestions: 1,
  },
  roster: [],
  players: [{
    id: 'player', sessionId: 'session', nickname: 'Player', connected: true,
    joinedAt: '', totalScore: 0, correctAnswerCount: 0, totalCorrectResponseMs: 0,
  }],
  submittedCount: 1,
  leaderboard: [],
  reveal: {
    type: 'pinpoint',
    targetX: .5,
    targetY: .43,
    targetRadius: .12,
    caption: 'Here',
    points: [{ x: .25, y: .75 }],
  },
  questionOpenedAt: '',
  questionClosesAt: '',
}

describe('parseSafeGameState', () => {
  it('accepts normalised pinpoint reveal data only in a reveal-capable phase', () => {
    expect(parseSafeGameState(safeState).reveal).toMatchObject({ type: 'pinpoint', targetX: .5 })
    expect(() => parseSafeGameState({ ...safeState, phase: 'question' })).toThrow(/reveal data/)
    expect(() => parseSafeGameState({
      ...safeState,
      reveal: { ...safeState.reveal, targetX: 1.5 },
    })).toThrow(/reveal data/)
  })

  it('rejects early totals, leaderboards and answer keys', () => {
    expect(() => parseSafeGameState({
      ...safeState,
      phase: 'question',
      reveal: null,
      leaderboard: [{ playerId: 'player', nickname: 'Player', totalScore: 1000, rank: 1 }],
    })).toThrow(/leaderboard data/)
    expect(() => parseSafeGameState({
      ...safeState,
      phase: 'question',
      reveal: null,
      players: [{ ...safeState.players[0], totalScore: 1000 }],
    })).toThrow(/player totals/)
    expect(() => parseSafeGameState({
      ...safeState,
      phase: 'question',
      reveal: null,
      currentQuestion: { ...safeState.currentQuestion, targetX: .5 },
    })).toThrow(/answer key/)
  })
})
