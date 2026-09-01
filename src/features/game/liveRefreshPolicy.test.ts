import { describe, expect, it } from 'vitest'
import { liveViewPollInterval } from './liveRefreshPolicy'

describe('liveViewPollInterval', () => {
  it('keeps live controller and presentation views responsive without per-player broadcasts', () => {
    expect(liveViewPollInterval('controller', 'lobby')).toBe(1_000)
    expect(liveViewPollInterval('controller', 'question')).toBe(750)
    expect(liveViewPollInterval('presentation', 'question')).toBe(1_000)
  })

  it('uses a slower safety poll outside active play', () => {
    expect(liveViewPollInterval('controller', 'locked')).toBe(5_000)
    expect(liveViewPollInterval('presentation', 'finished')).toBe(5_000)
  })
})
