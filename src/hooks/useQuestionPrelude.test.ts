import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useQuestionPrelude } from './useQuestionPrelude'

describe('useQuestionPrelude recovery', () => {
  afterEach(() => vi.useRealTimers())

  it.each([
    ['double-score' as const, 9000, 4500],
    ['question-type' as const, 1750, 800],
  ])('resumes a %s prelude from the authoritative remaining time after remount', async (kind, durationMs, elapsedBeforeRefreshMs) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-27T19:00:00.000Z'))
    const openedAt = new Date(Date.now() + durationMs).toISOString()

    const first = renderHook(() => useQuestionPrelude(kind, openedAt))
    expect(first.result.current).toBe(kind)
    await act(async () => { vi.advanceTimersByTime(elapsedBeforeRefreshMs) })
    first.unmount()

    const recovered = renderHook(() => useQuestionPrelude(kind, openedAt))
    expect(recovered.result.current).toBe(kind)
    await act(async () => { vi.advanceTimersByTime(durationMs - elapsedBeforeRefreshMs - 1) })
    expect(recovered.result.current).toBe(kind)
    await act(async () => { vi.advanceTimersByTime(11) })
    expect(recovered.result.current).toBeNull()
  })
})
