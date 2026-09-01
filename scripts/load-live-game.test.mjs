import { describe, expect, it } from 'vitest'
import { decodeJwtRole, isForbiddenCredential, isKnownProductionTarget, parseLoadTestConfig, percentile } from './load-live-game.mjs'

const base = {
  KATWED_LOADTEST_SUPABASE_URL: 'https://disposable-test.supabase.co',
  KATWED_LOADTEST_SUPABASE_KEY: 'sb_publishable_test',
  KATWED_LOADTEST_ROOM_CODE: '123456',
  KATWED_LOADTEST_DISPOSABLE_ROOM: 'YES',
}

describe('live-game load harness safety', () => {
  it('requires explicit target credentials and disposable-room confirmation', () => {
    expect(() => parseLoadTestConfig({})).toThrow(/SUPABASE_URL/i)
    expect(() => parseLoadTestConfig({ ...base, KATWED_LOADTEST_DISPOSABLE_ROOM: 'NO' })).toThrow(/disposable/i)
  })

  it('refuses the known production project unless the exact dangerous opt-in is supplied', () => {
    const production = { ...base, KATWED_LOADTEST_SUPABASE_URL: 'https://gekkvhsnykknmklqinkb.supabase.co' }
    expect(isKnownProductionTarget(production.KATWED_LOADTEST_SUPABASE_URL)).toBe(true)
    expect(() => parseLoadTestConfig(production)).toThrow(/production/i)
    expect(parseLoadTestConfig({
      ...production,
      KATWED_LOADTEST_ALLOW_PRODUCTION: 'I_UNDERSTAND_THIS_TARGETS_PRODUCTION',
    }).production).toBe(true)
  })

  it('rejects service-role JWTs and accepts configurable safe test sizes', () => {
    const payload = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')
    const key = `header.${payload}.signature`
    expect(decodeJwtRole(key)).toBe('service_role')
    expect(isForbiddenCredential('sb_secret_test')).toBe(true)
    expect(() => parseLoadTestConfig({ ...base, KATWED_LOADTEST_SUPABASE_KEY: key })).toThrow(/service-role/i)
    expect(() => parseLoadTestConfig({ ...base, KATWED_LOADTEST_SUPABASE_KEY: 'sb_secret_test' })).toThrow(/Secret/i)
    expect(parseLoadTestConfig({ ...base, KATWED_LOADTEST_PLAYERS: '100', KATWED_LOADTEST_SPREAD_MS: '2000' }))
      .toMatchObject({ players: 100, spreadMs: 2000 })
  })

  it('calculates nearest-rank latency percentiles', () => {
    expect(percentile([10, 20, 30, 40], 50)).toBe(20)
    expect(percentile([10, 20, 30, 40], 95)).toBe(40)
    expect(percentile([], 50)).toBeNull()
  })
})
