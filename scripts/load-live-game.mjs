import { createClient } from '@supabase/supabase-js'
import { pathToFileURL } from 'node:url'

const KNOWN_PRODUCTION_REF = 'gekkvhsnykknmklqinkb'
const DANGEROUS_OPT_IN = 'I_UNDERSTAND_THIS_TARGETS_PRODUCTION'

export function percentile(values, percentage) {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.ceil((percentage / 100) * sorted.length) - 1
  return sorted[Math.max(0, index)]
}

export function decodeJwtRole(key) {
  const parts = key.split('.')
  if (parts.length !== 3) return null
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    return typeof payload.role === 'string' ? payload.role : null
  } catch {
    return null
  }
}

export function isForbiddenCredential(key) {
  return key.startsWith('sb_secret_') || decodeJwtRole(key) === 'service_role'
}

export function isKnownProductionTarget(rawUrl) {
  try {
    const target = new URL(rawUrl)
    return target.hostname === 'katwed.co.uk'
      || target.hostname.endsWith('.katwed.co.uk')
      || target.hostname.includes(KNOWN_PRODUCTION_REF)
  } catch {
    return false
  }
}

function positiveInteger(value, name, fallback) {
  const candidate = value === undefined ? fallback : Number(value)
  if (!Number.isInteger(candidate) || candidate <= 0) throw new Error(`${name} must be a positive integer.`)
  return candidate
}

function nonNegativeInteger(value, name, fallback) {
  const candidate = value === undefined ? fallback : Number(value)
  if (!Number.isInteger(candidate) || candidate < 0) throw new Error(`${name} must be a non-negative integer.`)
  return candidate
}

export function parseLoadTestConfig(environment) {
  const url = environment.KATWED_LOADTEST_SUPABASE_URL
  const key = environment.KATWED_LOADTEST_SUPABASE_KEY
  const roomCode = environment.KATWED_LOADTEST_ROOM_CODE?.replace(/\D/g, '')
  if (!url || !key || !roomCode) {
    throw new Error('Set KATWED_LOADTEST_SUPABASE_URL, KATWED_LOADTEST_SUPABASE_KEY and KATWED_LOADTEST_ROOM_CODE.')
  }
  if (roomCode.length !== 6) throw new Error('KATWED_LOADTEST_ROOM_CODE must contain six digits.')
  if (environment.KATWED_LOADTEST_DISPOSABLE_ROOM !== 'YES') {
    throw new Error('Set KATWED_LOADTEST_DISPOSABLE_ROOM=YES to confirm that this is a disposable test room.')
  }
  if (isForbiddenCredential(key)) throw new Error('Secret/service-role credentials are forbidden; use an anon or publishable key.')
  const production = isKnownProductionTarget(url)
  if (production && environment.KATWED_LOADTEST_ALLOW_PRODUCTION !== DANGEROUS_OPT_IN) {
    throw new Error('Refusing the known production target without the explicit dangerous production opt-in.')
  }
  return {
    url: new URL(url).toString(),
    key,
    roomCode,
    players: positiveInteger(environment.KATWED_LOADTEST_PLAYERS, 'KATWED_LOADTEST_PLAYERS', 25),
    spreadMs: nonNegativeInteger(environment.KATWED_LOADTEST_SPREAD_MS, 'KATWED_LOADTEST_SPREAD_MS', 0),
    requestTimeoutMs: positiveInteger(environment.KATWED_LOADTEST_REQUEST_TIMEOUT_MS, 'KATWED_LOADTEST_REQUEST_TIMEOUT_MS', 15_000),
    questionWaitMs: positiveInteger(environment.KATWED_LOADTEST_QUESTION_WAIT_MS, 'KATWED_LOADTEST_QUESTION_WAIT_MS', 120_000),
    production,
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function withTimeout(operation, timeoutMs, label) {
  let timer
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs} ms.`)), timeoutMs)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

function answerFor(question) {
  if (question?.type === 'true-false') return { type: 'true-false', value: true }
  if (question?.type === 'single-choice' && question.options?.[0]?.id) {
    return { type: 'single-choice', optionId: question.options[0].id }
  }
  throw new Error('The disposable room must have an open True/False or Single Choice question.')
}

async function waitForQuestion(client, config) {
  const deadline = Date.now() + config.questionWaitMs
  while (Date.now() < deadline) {
    const { data, error } = await client.rpc('get_player_game_state', { p_room_code: config.roomCode })
    if (error) throw error
    if (data?.phase === 'question' && data.currentQuestion) return data.currentQuestion
    await delay(500)
  }
  throw new Error(`No open supported question appeared within ${config.questionWaitMs} ms.`)
}

function summaryFor(values) {
  return {
    p50Ms: percentile(values, 50),
    p95Ms: percentile(values, 95),
    p99Ms: values.length >= 100 ? percentile(values, 99) : null,
    maxMs: values.length ? Math.max(...values) : null,
  }
}

export async function runLoadTest(config) {
  const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  const clients = Array.from({ length: config.players }, () => createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }))
  const joined = []
  const joinFailures = []
  const submitFailures = []
  const latencies = []
  const realtimeErrors = []
  let burstDeliveries = 0
  let recordingBurst = false
  let monitoringSubscriptions = true
  const channels = []

  console.warn(`REMOTE LOAD TEST: ${config.players} simulated Players will use disposable room ${config.roomCode} at ${config.url}`)
  if (config.production) console.warn('DANGER: the explicit production override is active.')

  try {
    await Promise.all(clients.map(async (client, index) => {
      const nickname = `Load ${runId}-${index + 1}`.slice(0, 30)
      try {
        const { data, error } = await withTimeout(
          client.rpc('join_room', { p_room_code: config.roomCode, p_nickname: nickname }),
          config.requestTimeoutMs,
          `Join ${index + 1}`,
        )
        if (error) throw error
        joined.push({ client, index, player: data.player, reconnectToken: data.reconnectToken })
      } catch (error) {
        joinFailures.push({ index: index + 1, message: error instanceof Error ? error.message : String(error) })
      }
    }))

    await Promise.all(joined.map(({ client, index }) => new Promise((resolve) => {
      const channel = client.channel(`katwed:${config.roomCode}`)
        .on('broadcast', { event: 'game_changed' }, () => {
          if (recordingBurst) burstDeliveries += 1
        })
      channels.push({ client, channel })
      const timer = setTimeout(() => {
        realtimeErrors.push({ index: index + 1, status: 'SUBSCRIBE_TIMEOUT' })
        resolve()
      }, config.requestTimeoutMs)
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timer)
          resolve()
        } else if (monitoringSubscriptions && ['TIMED_OUT', 'CLOSED', 'CHANNEL_ERROR'].includes(status)) {
          realtimeErrors.push({ index: index + 1, status })
          clearTimeout(timer)
          resolve()
        }
      })
    })))

    if (joined.length === 0) throw new Error('No Players joined; no answer test can run.')
    console.warn(`${joined.length} Players joined and subscribed. Open the disposable test question now.`)
    const question = await waitForQuestion(joined[0].client, config)
    const payload = answerFor(question)
    // Let the legitimate question-open broadcast drain before measuring only
    // the answer burst's event deliveries.
    await delay(750)
    burstDeliveries = 0
    recordingBurst = true
    const burstStartedAt = performance.now()

    await Promise.all(joined.map(async ({ client, index, player, reconnectToken }, order) => {
      if (config.spreadMs > 0 && joined.length > 1) {
        await delay(Math.round((order / (joined.length - 1)) * config.spreadMs))
      }
      const startedAt = performance.now()
      try {
        const { error } = await withTimeout(client.rpc('submit_answer', {
          p_room_code: config.roomCode,
          p_player_id: player.id,
          p_reconnect_token: reconnectToken,
          p_answer: payload,
        }), config.requestTimeoutMs, `Submit ${index + 1}`)
        if (error) throw error
        latencies.push(performance.now() - startedAt)
      } catch (error) {
        submitFailures.push({ index: index + 1, message: error instanceof Error ? error.message : String(error) })
      }
    }))
    await delay(750)
    recordingBurst = false

    const timeoutCount = [...joinFailures, ...submitFailures]
      .filter(({ message }) => /timed out/i.test(message)).length
    return {
      target: config.url,
      roomCode: config.roomCode,
      requestedPlayers: config.players,
      answerSpreadMs: config.spreadMs,
      joinSuccess: joined.length,
      joinFailure: joinFailures.length,
      submitSuccess: latencies.length,
      submitFailure: submitFailures.length,
      timeoutCount,
      realtimeSubscriptionErrors: realtimeErrors.length,
      roomGameChangedDeliveriesDuringAnswerBurst: burstDeliveries,
      burstWallTimeMs: Math.round(performance.now() - burstStartedAt),
      submissionLatency: summaryFor(latencies.map(Math.round)),
      failures: { joins: joinFailures, submissions: submitFailures, realtime: realtimeErrors },
    }
  } finally {
    recordingBurst = false
    monitoringSubscriptions = false
    await Promise.all(channels.map(({ client, channel }) => client.removeChannel(channel)))
  }
}

function printHelp() {
  console.log(`Katwed live-game load harness

Required environment variables:
  KATWED_LOADTEST_SUPABASE_URL
  KATWED_LOADTEST_SUPABASE_KEY          anon or publishable key only
  KATWED_LOADTEST_ROOM_CODE             disposable Standard lobby
  KATWED_LOADTEST_DISPOSABLE_ROOM=YES

Optional:
  KATWED_LOADTEST_PLAYERS=25             suggested: 25, 50, 75, 100
  KATWED_LOADTEST_SPREAD_MS=0            try 0, 500, 2000, 10000
  KATWED_LOADTEST_REQUEST_TIMEOUT_MS=15000
  KATWED_LOADTEST_QUESTION_WAIT_MS=120000

The harness joins first, subscribes, then waits for the host to open a supported
True/False or Single Choice question. It never creates or closes the room.`)
}

async function main() {
  if (process.argv.includes('--help')) {
    printHelp()
    return
  }
  const config = parseLoadTestConfig(process.env)
  const result = await runLoadTest(config)
  console.log(JSON.stringify(result, null, 2))
  if (result.joinFailure || result.submitFailure || result.realtimeSubscriptionErrors || result.roomGameChangedDeliveriesDuringAnswerBurst) {
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
