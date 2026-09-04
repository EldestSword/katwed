import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { currentBoard, previousBoard, standingsState } from '../test/leaderboardFixtures'
import type { SafeGameState } from '../types/domain'
import { useFinalAwardsHistory } from './useFinalAwardsHistory'

const state = (phase: SafeGameState['phase'], number = 1, entries = previousBoard): SafeGameState => ({
  ...standingsState(phase, entries, number), questionOpenedAt: `2026-09-04T10:0${number}:00.000Z`,
})
const original = previousBoard.map(({ playerId, rank }) => [playerId, rank])

describe('final award history', () => {
  it('records only Question 1 standings, retains them through play and exposes them only at finished', () => {
    const { result, rerender } = renderHook(useFinalAwardsHistory, { initialProps: state('leaderboard') })
    expect(result.current).toBeNull()
    for (const phase of ['question', 'locked', 'reveal', 'leaderboard'] as const) {
      rerender(state(phase, 2, currentBoard)); expect(result.current).toBeNull()
    }
    rerender(state('finished', 5, currentBoard))
    expect([...result.current!]).toEqual(original)
  })
  it('uses authoritative corrections to the first leaderboard without mutating or retaining incoming rows', () => {
    const corrected = previousBoard.map((entry) => ({ ...entry, rank: 5 - entry.rank }))
    const { result, rerender } = renderHook(useFinalAwardsHistory, { initialProps: state('leaderboard') })
    rerender(state('leaderboard', 1, corrected))
    corrected[0].rank = 99
    rerender(state('finished', 5))
    expect(result.current?.get('roger')).toBe(4)
  })
  it.each(['question', 'reveal', 'leaderboard', 'finished'] as const)('cannot invent a baseline after refreshing in later %s', (phase) => {
    const { result, rerender } = renderHook(useFinalAwardsHistory, { initialProps: state(phase, 2, currentBoard) })
    rerender(state('finished', 5, currentBoard))
    expect(result.current).toBeNull()
  })
  it.each(['question', 'reveal'] as const)('does not record hidden first-question %s scores', (phase) => {
    const hidden = { ...state(phase), leaderboard: previousBoard }
    const { result, rerender } = renderHook(useFinalAwardsHistory, { initialProps: hidden })
    rerender(state('finished', 5)); expect(result.current).toBeNull()
  })
  it.each([
    { currentQuestion: null },
    { currentQuestion: { ...state('leaderboard').currentQuestion!, totalQuestions: 1 } },
    { questionOpenedAt: null },
    { questionOpenedAt: 'invalid' },
    { leaderboard: [] },
    { quizType: 'head-to-head' as const },
  ])('requires proof of a legitimate first non-final leaderboard %j', (patch) => {
    const { result, rerender } = renderHook(useFinalAwardsHistory, { initialProps: { ...state('leaderboard'), ...patch } as SafeGameState })
    rerender(state('finished', 5)); expect(result.current).toBeNull()
  })
  it.each(['lobby', 'closed', 'session', 'null', 'new-opening'] as const)('clears old history on %s', (change) => {
    const { result, rerender } = renderHook(useFinalAwardsHistory, { initialProps: state('leaderboard') as SafeGameState | null })
    rerender(state('finished', 5))
    expect(result.current).not.toBeNull()
    const next = change === 'lobby' ? state('lobby') : change === 'closed' ? { ...state('finished', 5), status: 'closed' as const }
      : change === 'session' ? { ...state('question', 2), sessionId: 'another-session' }
      : change === 'new-opening' ? { ...state('question'), questionOpenedAt: '2026-09-04T12:00:00Z' } : null
    rerender(next); expect(result.current).toBeNull()
    rerender({ ...state('finished', 5), sessionId: next?.sessionId ?? 'standings-session' })
    expect(result.current).toBeNull()
  })
  it('recognises a restart opening even if the lobby and finished phase were missed', () => {
    const { result, rerender } = renderHook(useFinalAwardsHistory, { initialProps: state('leaderboard') })
    rerender({ ...state('question'), questionOpenedAt: '2026-09-04T12:00:00Z' })
    rerender(state('finished', 5)); expect(result.current).toBeNull()
  })
  it('never retains baseline data across unmount/refresh', () => {
    const old = renderHook(useFinalAwardsHistory, { initialProps: state('leaderboard') })
    old.unmount()
    const fresh = renderHook(useFinalAwardsHistory, { initialProps: state('finished', 5) })
    expect(fresh.result.current).toBeNull()
  })
})
