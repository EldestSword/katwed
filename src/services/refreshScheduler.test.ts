import { describe, expect, it, vi } from 'vitest'
import { createRefreshScheduler } from './refreshScheduler'

describe('createRefreshScheduler', () => {
  it('coalesces a burst before starting one refresh', async () => {
    vi.useFakeTimers()
    const refresh = vi.fn().mockResolvedValue(undefined)
    const scheduler = createRefreshScheduler(refresh, 25)

    const requests = [scheduler.request(), scheduler.request(), scheduler.request()]
    await vi.advanceTimersByTimeAsync(25)
    await Promise.all(requests)

    expect(refresh).toHaveBeenCalledTimes(1)
    scheduler.dispose()
    vi.useRealTimers()
  })

  it('never overlaps and performs only one trailing refresh for in-flight requests', async () => {
    vi.useFakeTimers()
    let release: (() => void) | undefined
    let active = 0
    let maximumActive = 0
    const refresh = vi.fn(async () => {
      active += 1
      maximumActive = Math.max(maximumActive, active)
      if (refresh.mock.calls.length === 1) await new Promise<void>((resolve) => { release = resolve })
      active -= 1
    })
    const scheduler = createRefreshScheduler(refresh, 20)

    const first = scheduler.request({ immediate: true })
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
    const burst = [scheduler.request(), scheduler.request(), scheduler.request()]
    release?.()
    await vi.advanceTimersByTimeAsync(20)
    await Promise.all([first, ...burst])

    expect(refresh).toHaveBeenCalledTimes(2)
    expect(maximumActive).toBe(1)
    scheduler.dispose()
    vi.useRealTimers()
  })

  it('settles pending requests and prevents stale commits after disposal', async () => {
    let release: (() => void) | undefined
    const committed: string[] = []
    const scheduler = createRefreshScheduler(async ({ isCurrent }) => {
      await new Promise<void>((resolve) => { release = resolve })
      if (isCurrent()) committed.push('state')
    })

    const request = scheduler.request({ immediate: true })
    scheduler.dispose()
    release?.()
    await request

    expect(committed).toEqual([])
  })
})
