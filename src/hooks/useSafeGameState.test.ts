import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RealtimeStatusCallback } from '../services/gameRepository'
import { HEALTHY_SANITY_REFRESH_MS, UNHEALTHY_FALLBACK_REFRESH_MS, useSafeGameState } from './useSafeGameState'

const mocks = vi.hoisted(() => ({
  getSafeGameState: vi.fn(),
  subscribe: vi.fn(),
}))

vi.mock('../services/repository', () => ({ repository: mocks }))

describe('useSafeGameState connection-aware refresh', () => {
  let reportStatus: RealtimeStatusCallback

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    mocks.getSafeGameState.mockResolvedValue(null)
    mocks.subscribe.mockImplementation((_subject: string, _callback: () => void, onStatus: RealtimeStatusCallback) => {
      reportStatus = onStatus
      return () => undefined
    })
  })

  afterEach(() => vi.useRealTimers())

  async function settleInitialRefresh() {
    await act(async () => { await Promise.resolve() })
    expect(mocks.getSafeGameState).toHaveBeenCalledTimes(1)
  }

  it('has no five-second polling tax while realtime is healthy', async () => {
    renderHook(() => useSafeGameState('123456'))
    await settleInitialRefresh()
    act(() => reportStatus('SUBSCRIBED'))

    await act(async () => vi.advanceTimersByTimeAsync(5_000))
    expect(mocks.getSafeGameState).toHaveBeenCalledTimes(1)
    await act(async () => vi.advanceTimersByTimeAsync(HEALTHY_SANITY_REFRESH_MS - 5_000 + 40))
    expect(mocks.getSafeGameState).toHaveBeenCalledTimes(2)
  })

  it('starts a fast fallback on failure and returns to the sanity interval on recovery', async () => {
    renderHook(() => useSafeGameState('123456'))
    await settleInitialRefresh()
    act(() => reportStatus('CHANNEL_ERROR'))
    await act(async () => vi.advanceTimersByTimeAsync(UNHEALTHY_FALLBACK_REFRESH_MS + 40))
    expect(mocks.getSafeGameState).toHaveBeenCalledTimes(2)

    act(() => reportStatus('SUBSCRIBED'))
    await act(async () => vi.advanceTimersByTimeAsync(UNHEALTHY_FALLBACK_REFRESH_MS + 40))
    expect(mocks.getSafeGameState).toHaveBeenCalledTimes(2)
  })

  it.each(['focus', 'online'] as const)('refreshes when the window reports %s recovery', async (eventName) => {
    renderHook(() => useSafeGameState('123456'))
    await settleInitialRefresh()
    await act(async () => {
      window.dispatchEvent(new Event(eventName))
      await Promise.resolve()
    })
    expect(mocks.getSafeGameState).toHaveBeenCalledTimes(2)
  })

  it('refreshes when the document becomes visible', async () => {
    renderHook(() => useSafeGameState('123456'))
    await settleInitialRefresh()
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await Promise.resolve()
    })
    expect(mocks.getSafeGameState).toHaveBeenCalledTimes(2)
  })
})
