import { renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import { standingsState } from '../test/leaderboardFixtures'
import type { GamePhase, SafeGameState } from '../types/domain'
import { useSurvivorHistory } from './useSurvivorHistory'

const state = (phase: GamePhase, lives: number[], questionNumber = 1): SafeGameState => ({
  ...standingsState(phase, [], questionNumber),
  questionOpenedAt: `2026-09-04T20:0${questionNumber}:00Z`,
  sessionSettings: {
    competitionMode: 'survivor', survivorStartingLives: 3, playMode: 'individual', soundPackId: 'none',
    shuffleQuestionOrder: false, shuffleAnswerOptions: false, autoLockWhenAllAnswered: true,
    showPlayerAnswersToHost: true, doubleScoreIntroMs: 5000, questionTypeIntrosEnabled: false,
    answerOptionSeed: 'seed',
  },
  players: lives.map((life, index) => ({
    id: `p${index}`, sessionId: 'standings-session', nickname: `Player ${index + 1}`, connected: true,
    joinedAt: '', totalScore: 0, correctAnswerCount: 0, totalCorrectResponseMs: 0,
    survivorLivesRemaining: life, survivorEliminatedAtQuestion: life ? null : questionNumber,
  })),
})

it('records pre-finalisation lives across question/reveal and emits one elimination on Leaderboard', () => {
  const view = renderHook(useSurvivorHistory, { initialProps: state('question', [2, 1]) })
  view.rerender(state('locked', [2, 1])); view.rerender(state('reveal', [2, 1]))
  view.rerender(state('leaderboard', [2, 0]))
  expect(view.result.current).toMatchObject({ kind: 'last-survivor', eliminatedPlayerIds: ['p1'] })
  view.rerender(structuredClone(state('leaderboard', [2, 0])))
  expect(view.result.current).toMatchObject({ kind: 'last-survivor' })
  view.rerender(state('question', [2, 0], 2))
  expect(view.result.current).toBeNull()
})

it('does not invent an event after refresh and preserves a baseline through Round Intro', () => {
  const refreshed = renderHook(useSurvivorHistory, { initialProps: state('leaderboard', [2, 0]) })
  expect(refreshed.result.current).toBeNull()
  const view = renderHook(useSurvivorHistory, { initialProps: state('question', [3, 3]) })
  view.rerender({ ...state('round-intro', [3, 3]), currentQuestion: null, questionOpenedAt: null })
  view.rerender(state('question', [3, 3], 2))
  view.rerender(state('leaderboard', [3, 2], 2))
  expect(view.result.current).toBeNull()
})

it('clears history on restart, closed room and session change', () => {
  for (const next of [
    state('lobby', [3, 3]),
    { ...state('question', [3, 3]), status: 'closed' as const },
    { ...state('leaderboard', [3, 3]), sessionId: 'new-session' },
  ]) {
    const view = renderHook(useSurvivorHistory, { initialProps: state('question', [1, 1]) })
    view.rerender(next); view.rerender({ ...state('leaderboard', [1, 0]), sessionId: next.sessionId })
    expect(view.result.current).toBeNull()
  }
})
