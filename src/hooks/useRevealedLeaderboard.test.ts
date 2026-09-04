import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { currentBoard, previousBoard, roundIntroState, standingsState } from '../test/leaderboardFixtures'
import { useRevealedLeaderboard } from './useRevealedLeaderboard'

describe('revealed leaderboard memory', () => {
  it('keeps the previous board through a question-free round intro without exposing or replaying it', () => {
    const { result, rerender } = renderHook(useRevealedLeaderboard, { initialProps: standingsState('leaderboard') })
    const first = result.current.reveal!
    rerender(roundIntroState())
    act(() => result.current.settle(first.id))
    expect(result.current.reveal).toBeNull()
    rerender(standingsState('question', [], 2))
    rerender(standingsState('leaderboard', currentBoard, 2))
    expect(result.current.reveal?.previous).toEqual(previousBoard)
    expect(result.current.reveal?.entries).toEqual(currentBoard)
  })

  it('cannot invent movement after a refresh at a later round intro', () => {
    const { result, rerender } = renderHook(useRevealedLeaderboard, { initialProps: roundIntroState() })
    rerender(standingsState('question', [], 2))
    rerender(standingsState('leaderboard', currentBoard, 2))
    expect(result.current.reveal?.previous).toBeNull()
  })

  it('retains the last revealed snapshot through question, locked and reveal without exposing it there', () => {
    const { result, rerender } = renderHook(useRevealedLeaderboard, { initialProps: standingsState('leaderboard') })
    expect(result.current.reveal?.previous).toBeNull()
    act(() => result.current.settle(result.current.reveal!.id))
    for (const phase of ['question', 'locked', 'reveal'] as const) {
      rerender(standingsState(phase, currentBoard, 2))
      expect(result.current.reveal).toBeNull()
    }
    rerender(standingsState('leaderboard', currentBoard, 2))
    expect(result.current.reveal?.previous).toEqual(previousBoard)
    expect(result.current.reveal?.entries).toEqual(currentBoard)
    act(() => result.current.settle(result.current.reveal!.id))
    expect(result.current.reveal?.previous).toEqual(previousBoard)
    rerender(standingsState('question', [], 3))
    rerender(standingsState('leaderboard', previousBoard, 3))
    expect(result.current.reveal?.previous).toEqual(currentBoard)
  })

  it('does not replay identical polling copies or late settlement callbacks', () => {
    const { result, rerender } = renderHook(useRevealedLeaderboard, { initialProps: standingsState('leaderboard') })
    const first = result.current.reveal
    rerender(standingsState('leaderboard', previousBoard.map((entry) => ({ ...entry }))))
    expect(result.current.reveal).toBe(first)
    rerender(standingsState('question', [], 2))
    act(() => result.current.settle(first!.id))
    expect(result.current.reveal).toBeNull()
    rerender(standingsState('leaderboard', currentBoard, 2))
    expect(result.current.reveal?.previous).toEqual(previousBoard)
  })

  it('uses the last revealed authoritative board if the host advances before animation finishes', () => {
    const { result, rerender } = renderHook(useRevealedLeaderboard, { initialProps: standingsState('leaderboard') })
    rerender(standingsState('question', [], 2))
    rerender(standingsState('leaderboard', currentBoard, 2))
    rerender(standingsState('question', [], 3))
    rerender(standingsState('leaderboard', previousBoard, 3))
    expect(result.current.reveal?.previous).toEqual(currentBoard)
  })

  it('shows a correction to the same revealed question without replaying movement', () => {
    const { result, rerender } = renderHook(useRevealedLeaderboard, { initialProps: standingsState('leaderboard') })
    rerender(standingsState('leaderboard', currentBoard))
    expect(result.current.reveal?.previous).toBeNull()
    expect(result.current.reveal?.entries).toEqual(currentBoard)
  })

  it.each(['lobby', 'finished'] as const)('clears the baseline on %s so a restart cannot compare with the old game', (phase) => {
    const { result, rerender } = renderHook(useRevealedLeaderboard, { initialProps: standingsState('leaderboard') })
    rerender(standingsState(phase))
    rerender(standingsState('leaderboard', currentBoard))
    expect(result.current.reveal?.previous).toBeNull()
  })

  it('starts clean in a new session and after a page remount', () => {
    const view = renderHook(useRevealedLeaderboard, { initialProps: standingsState('leaderboard') })
    view.rerender({ ...standingsState('leaderboard', currentBoard), sessionId: 'another-session' })
    expect(view.result.current.reveal?.previous).toBeNull()
    view.unmount()
    const refreshed = renderHook(useRevealedLeaderboard, { initialProps: standingsState('leaderboard', currentBoard) })
    expect(refreshed.result.current.reveal?.previous).toBeNull()
  })
})
