import { describe, expect, it, vi } from 'vitest'
import {
  AUTO_LOCK_ENABLED_ERROR,
  decodeJwtRole,
  isForbiddenCredential,
  isKnownProductionTarget,
  parseLoadTestConfig,
  percentile,
  runLoadTest,
  validateMeasuredQuestionState,
} from './load-live-game.mjs'

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

  it('accepts only an open Standard question with Auto-lock when all answered explicitly disabled', () => {
    expect(validateMeasuredQuestionState(questionState(false))).toMatchObject({
      quizType: 'standard', phase: 'question', submittedCount: 0,
    })
  })

  it('refuses Auto-lock when all answered before submitting', async () => {
    const fixture = loadClientFixture(questionState(true))
    await expect(runLoadTest(loadConfig(), { createClient: () => fixture.client, delay: async () => {} }))
      .rejects.toThrow(AUTO_LOCK_ENABLED_ERROR)
    expect(fixture.submitAnswer).not.toHaveBeenCalled()
  })

  it.each([
    ['absent session settings', { ...questionState(false), sessionSettings: undefined }],
    ['absent setting', { ...questionState(false), sessionSettings: {} }],
    ['invalid setting', { ...questionState(false), sessionSettings: { autoLockWhenAllAnswered: 'false' } }],
  ])('fails safely for %s before submitting', async (_label, state) => {
    const fixture = loadClientFixture(state)
    await expect(runLoadTest(loadConfig(), { createClient: () => fixture.client, delay: async () => {} }))
      .rejects.toThrow(/could not verify the Auto-lock/i)
    expect(fixture.submitAnswer).not.toHaveBeenCalled()
  })

  it('bounds the broadcast window and verifies the authoritative Answered count afterwards', async () => {
    const fixture = loadClientFixture(questionState(false), questionState(false, { submittedCount: 1 }))
    const result = await runLoadTest(loadConfig(), { createClient: () => fixture.client, delay: async () => {} })
    expect(fixture.submitAnswer).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({
      realtimeSubscriptionSuccess: 1,
      submitSuccess: 1,
      roomGameChangedDeliveriesDuringAnswerBurst: 0,
      broadcastMeasurement: { drainMs: 1, settleMs: 1 },
      authoritativeState: {
        phaseAfterBurst: 'question', submittedCountBefore: 0, submittedCountAfter: 1,
        expectedSubmittedCount: 1, submissionCountMatches: true,
      },
      failures: { verification: [] },
    })
  })
})

function questionState(autoLockWhenAllAnswered, overrides = {}) {
  return {
    quizType: 'standard',
    phase: 'question',
    currentQuestion: { id: 'question-1', type: 'true-false' },
    sessionSettings: { autoLockWhenAllAnswered },
    submittedCount: 0,
    ...overrides,
  }
}

function loadConfig() {
  return parseLoadTestConfig({
    ...base,
    KATWED_LOADTEST_PLAYERS: '1',
    KATWED_LOADTEST_REQUEST_TIMEOUT_MS: '1000',
    KATWED_LOADTEST_QUESTION_WAIT_MS: '1000',
    KATWED_LOADTEST_BROADCAST_DRAIN_MS: '1',
    KATWED_LOADTEST_BROADCAST_SETTLE_MS: '1',
  })
}

function loadClientFixture(stateBefore, stateAfter = stateBefore) {
  let stateReads = 0
  const submitAnswer = vi.fn(async () => ({ error: null }))
  const channel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn((callback) => {
      callback('SUBSCRIBED')
      return channel
    }),
  }
  const client = {
    rpc: vi.fn(async (name) => {
      if (name === 'join_room') {
        return { data: { player: { id: 'player-1' }, reconnectToken: 'token' }, error: null }
      }
      if (name === 'get_player_game_state') {
        const data = stateReads === 0 ? stateBefore : stateAfter
        stateReads += 1
        return { data, error: null }
      }
      if (name === 'submit_answer') return submitAnswer()
      throw new Error(`Unexpected RPC ${name}`)
    }),
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(async () => 'ok'),
  }
  return { client, submitAnswer }
}
