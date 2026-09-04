import { describe, expect, it } from 'vitest'
import { parseSafeGameState } from './safeGameState'

const safeState = {
  sessionId: 'session',
  quizTitle: 'Quiz',
  themeId: 'midnight',
  backgroundId: 'midnight-stars',
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
  it('accepts only minimal, in-window Buzz state for an eligible current question', () => {
    const questionOpenedAt = '2026-09-04T12:00:00Z'
    const questionClosesAt = '2026-09-04T12:00:30Z'
    const buzz = { winnerPlayerId: 'player', claimedAt: '2026-09-04T12:00:05Z', answerDeadlineAt: '2026-09-04T12:00:15Z' }
    const state = {
      ...safeState, phase: 'question', reveal: null, submittedCount: 0, questionOpenedAt, questionClosesAt, buzz,
      currentQuestion: { ...safeState.currentQuestion, buzzInEnabled: true },
    }
    expect(parseSafeGameState(state).buzz).toEqual(buzz)
    expect(JSON.stringify(parseSafeGameState(state))).not.toMatch(/reconnectToken|answerPayload|correctOptionId/)
    expect(() => parseSafeGameState({ ...state, buzz: { ...buzz, winnerPlayerId: 'stranger' } })).toThrow(/not in this room/)
    expect(() => parseSafeGameState({ ...state, questionClosesAt: '2026-09-04T12:00:14Z' })).toThrow(/outside the question window/)
    expect(() => parseSafeGameState({ ...state, currentQuestion: { ...state.currentQuestion, buzzInEnabled: false } })).toThrow(/not valid in this phase/)
  })

  it('rejects Buzz-In on Head-to-Head, Connections and Progressive Reveal questions', () => {
    const base = { ...safeState, phase: 'question', reveal: null, submittedCount: 0, buzz: null }
    expect(() => parseSafeGameState({ ...base, quizType: 'head-to-head', currentQuestion: { ...safeState.currentQuestion, buzzInEnabled: true } })).toThrow(/Invalid Buzz-In/)
    expect(() => parseSafeGameState({ ...base, currentQuestion: { ...safeState.currentQuestion, type: 'connections', buzzInEnabled: true } })).toThrow(/Invalid Buzz-In/)
    expect(() => parseSafeGameState({ ...base, currentQuestion: { ...safeState.currentQuestion, buzzInEnabled: true, progressiveRevealEnabled: true } })).toThrow(/Invalid Buzz-In/)
  })

  it.each([
    { kind: 'rectangle', x: .2, y: .3, width: .4, height: .5 },
    { kind: 'polygon', points: [{ x: .1, y: .1 }, { x: .9, y: .1 }, { x: .4, y: .9 }] },
  ])('accepts a $kind target only after reveal', (target) => {
    const reveal = { type: 'pinpoint', target, caption: '', points: [] }
    expect(parseSafeGameState({ ...safeState, reveal }).reveal).toEqual(reveal)
    for (const phase of ['lobby', 'question', 'locked']) {
      expect(() => parseSafeGameState({ ...safeState, phase, reveal })).toThrow(/reveal data/)
      expect(() => parseSafeGameState({ ...safeState, phase, reveal: null, currentQuestion: { ...safeState.currentQuestion, target } })).toThrow(/answer key/)
    }
    expect(parseSafeGameState(safeState).reveal).toMatchObject({ target: { kind: 'circle', x: .5, y: .43, radius: .12 } })
  })
  it('retains supported themes and normalises unknown backend values safely', () => {
    expect(parseSafeGameState(safeState).themeId).toBe('midnight')
    expect(parseSafeGameState(safeState).backgroundId).toBe('midnight-stars')
    expect(parseSafeGameState({ ...safeState, themeId: 'future-theme' }).themeId).toBe('katwed')
    expect(parseSafeGameState({ ...safeState, backgroundId: undefined }).backgroundId).toBeNull()
    expect(parseSafeGameState({ ...safeState, backgroundId: 'future-background' }).backgroundId).toBeNull()
    expect(parseSafeGameState({ ...safeState, backgroundId: 'arcade-grid' }).backgroundId).toBeNull()
  })

  it('retains supported sound packs and defaults stale backend payloads to Katwed', () => {
    expect(parseSafeGameState({ ...safeState, soundPackId: 'none' }).soundPackId).toBe('none')
    expect(parseSafeGameState(safeState).soundPackId).toBe('katwed')
    expect(parseSafeGameState({ ...safeState, soundPackId: 'future-pack' }).soundPackId).toBe('katwed')
  })

  it('uses validated session settings as the live sound and prelude authority', () => {
    const parsed = parseSafeGameState({
      ...safeState,
      soundPackId: 'katwed',
      questionPreludeKind: 'question-type',
      sessionSettings: {
        soundPackId: 'none', doubleScoreIntroMs: 9000, shuffleQuestionOrder: true,
        shuffleAnswerOptions: true, autoLockWhenAllAnswered: false,
        questionTypeIntrosEnabled: true, answerOptionSeed: 'seed',
      },
    })
    expect(parsed.soundPackId).toBe('none')
    expect(parsed.questionPreludeKind).toBe('question-type')
    expect(parsed.sessionSettings).toMatchObject({ doubleScoreIntroMs: 9000, autoLockWhenAllAnswered: false })
  })

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
    for (const [field, answer] of [
      ['correctOptionId', 'answer'],
      ['correctOptionIds', ['answer']],
      ['correctValue', true],
      ['tolerance', 1],
      ['targetY', .5],
      ['targetRadius', .1],
      ['correctMemberIds', ['one', 'two']],
      ['correctAnswer', 'secret'],
      ['acceptedAnswers', ['secret']],
      ['answerKey', { secret: true }],
    ] as const) {
      expect(() => parseSafeGameState({
        ...safeState,
        phase: 'question',
        reveal: null,
        currentQuestion: { ...safeState.currentQuestion, [field]: answer },
      }), field).toThrow(/answer key/)
    }
  })

  it('accepts safe Head-to-Head assignment and scores but rejects early correctness results', () => {
    const headToHead = {
      ...safeState,
      quizType: 'head-to-head',
      phase: 'question',
      reveal: null,
      questionClosesAt: null,
      players: [{ ...safeState.players[0], competitorId: 'ross', totalScore: 2 }],
      currentQuestion: { ...safeState.currentQuestion, assignedCompetitorId: 'ross' },
      headToHeadCompetitors: [{
        competitorId: 'ross', displayName: 'Ross', displayOrder: 0, claimed: true,
        connected: true, playerId: 'player', totalScore: 2, correctAnswerCount: 2,
      }],
      headToHeadResolutions: [],
      headToHeadResults: [],
    }
    expect(parseSafeGameState(headToHead)).toMatchObject({ quizType: 'head-to-head', questionClosesAt: null })
    expect(() => parseSafeGameState({
      ...headToHead,
      headToHeadResults: [{ competitorId: 'ross', assigned: true, status: 'correct', pointsAwarded: 1 }],
    })).toThrow(/before the reveal/)
  })

  it('accepts a primary-only Typed Answer reveal and rejects all early answer fields', () => {
    const typed = {
      ...safeState,
      currentQuestion: { ...safeState.currentQuestion, type: 'typed-answer', media: { type: 'none' } },
      reveal: { type: 'typed-answer', correctAnswer: 'Red Dwarf', correctPlayerIds: ['player'], caption: 'Shown at reveal' },
    }
    expect(parseSafeGameState(typed).reveal).toEqual(typed.reveal)
    expect(() => parseSafeGameState({
      ...typed,
      reveal: { ...typed.reveal, acceptedAnswers: ['The Red Dwarf'] },
    })).toThrow(/reveal data/)
    for (const field of ['correctAnswer', 'acceptedAnswers']) {
      expect(() => parseSafeGameState({
        ...typed,
        phase: 'question',
        reveal: null,
        currentQuestion: { ...typed.currentQuestion, [field]: field === 'acceptedAnswers' ? [] : 'Red Dwarf' },
      })).toThrow(/answer key/)
    }
  })
})
