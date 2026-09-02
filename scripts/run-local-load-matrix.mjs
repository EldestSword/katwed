import { mkdirSync, writeFileSync } from 'node:fs'
import { cpus, freemem, totalmem } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { parseLoadTestConfig, runLoadTest } from './load-live-game.mjs'
import {
  closeSession,
  createLocalLabContext,
  saveAndLaunchStandard,
} from './local-supabase-fixtures.mjs'
import { readLocalStatus, runCommand, runLocalSql } from './local-supabase-safety.mjs'

const PRIORITY_MATRIX = [
  { players: 25, spreadMs: 0 },
  { players: 50, spreadMs: 0 },
  { players: 75, spreadMs: 0 },
  { players: 100, spreadMs: 0 },
  { players: 100, spreadMs: 500 },
  { players: 100, spreadMs: 10_000 },
]

const OPTIONAL_MATRIX = [25, 50, 75].flatMap((players) => [
  { players, spreadMs: 500 },
  { players, spreadMs: 10_000 },
])

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function resourcePreflight(matrix) {
  const memoryBytes = totalmem()
  const maximumPlayers = Math.max(...matrix.map(({ players }) => players))
  if (maximumPlayers >= 100 && memoryBytes < 6 * 1024 ** 3) {
    throw new Error(
      `Refusing the 100-Player tier with only ${(memoryBytes / 1024 ** 3).toFixed(1)} GiB RAM. `
      + 'Use an included/free machine with at least 6 GiB, or set KATWED_LOCAL_MAX_PLAYERS below 100.',
    )
  }
  const dockerHealth = runCommand('docker', [
    'ps', '--filter', 'name=supabase_', '--format', '{{.Names}}|{{.Status}}',
  ]).trim().split(/\r?\n/).filter(Boolean)
  assert(dockerHealth.length > 0, 'No local Supabase containers are running.')
  assert(dockerHealth.every((line) => !/unhealthy|restarting|exited/i.test(line)),
    `A local Supabase container is unhealthy: ${dockerHealth.join(', ')}`)
  return {
    logicalCpuCount: cpus().length,
    totalMemoryMiB: Math.round(memoryBytes / 1024 ** 2),
    freeMemoryMiBBefore: Math.round(freemem() / 1024 ** 2),
    dockerHealth,
  }
}

function selectMatrix(environment) {
  const maximum = Number(environment.KATWED_LOCAL_MAX_PLAYERS ?? 100)
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > 100) {
    throw new Error('KATWED_LOCAL_MAX_PLAYERS must be an integer from 1 to 100.')
  }
  const entries = environment.KATWED_LOCAL_LOAD_FULL_MATRIX === 'YES'
    ? [...PRIORITY_MATRIX, ...OPTIONAL_MATRIX]
    : PRIORITY_MATRIX
  return entries.filter(({ players }) => players <= maximum)
}

function pgSnapshot() {
  try {
    return JSON.parse(runLocalSql(`
      select json_build_object(
        'connections', count(*),
        'active', count(*) filter (where state = 'active'),
        'lockWaiters', count(*) filter (where wait_event_type = 'Lock')
      )
      from pg_stat_activity
      where datname = current_database();
    `))
  } catch (error) {
    return { sampleError: error instanceof Error ? error.message : String(error) }
  }
}

function containerSnapshot() {
  try {
    return runCommand('docker', [
      'stats', '--no-stream', '--format', '{{json .}}',
    ]).trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
      .filter(({ Name }) => String(Name).startsWith('supabase_'))
  } catch (error) {
    return [{ sampleError: error instanceof Error ? error.message : String(error) }]
  }
}

function localServiceErrorObservations() {
  const containers = ['supabase_realtime_katwed', 'supabase_rest_katwed', 'supabase_db_katwed']
  return Object.fromEntries(containers.map((container) => {
    try {
      const result = spawnSync('docker', ['logs', '--since', '15m', '--tail', '300', container], {
        encoding: 'utf8',
      })
      if (result.status !== 0) throw new Error(result.stderr || `docker logs exited ${result.status}`)
      const logs = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
      const errorLines = logs.split(/\r?\n/).filter((line) => /error|fatal|panic|timeout/i.test(line))
      return [container, { matchingErrorLines: errorLines.length, sample: errorLines.slice(-10) }]
    } catch (error) {
      return [container, { observationError: error instanceof Error ? error.message : String(error) }]
    }
  }))
}

async function verifyDesiredPhaseBroadcast(context, session) {
  const observer = createClient(context.status.apiUrl, context.status.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  let deliveries = 0
  let subscribedResolve
  let subscribedReject
  let replicationReadyResolve
  let replicationReadyReject
  const subscribed = new Promise((resolve, reject) => {
    subscribedResolve = resolve
    subscribedReject = reject
  })
  const replicationReady = new Promise((resolve, reject) => {
    replicationReadyResolve = resolve
    replicationReadyReject = reject
  })
  const channel = observer.channel(`katwed:${session.roomCode}`, {
    config: { broadcast: { replication_ready: true } },
  })
    .on('broadcast', { event: 'game_changed' }, () => { deliveries += 1 })
    .on('system', {}, (payload) => {
      if (payload?.extension !== 'system') return
      if (payload.status === 'ok') {
        replicationReadyResolve()
      } else if (payload.status === 'error') {
        replicationReadyReject(new Error(
          `Realtime replication was not ready for phase-broadcast check: ${payload.message ?? 'unknown error'}`,
        ))
      }
    })
  channel.subscribe((status, error) => {
    if (status === 'SUBSCRIBED') {
      subscribedResolve()
    } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR' || status === 'CLOSED') {
      subscribedReject(error ?? new Error(`Phase-broadcast channel ended with ${status}.`))
    }
  })
  try {
    await Promise.race([
      subscribed,
      delay(10_000).then(() => { throw new Error('Timed out subscribing for the phase-broadcast check.') }),
    ])
    await Promise.race([
      replicationReady,
      delay(10_000).then(() => { throw new Error('Timed out waiting for Realtime replication for the phase-broadcast check.') }),
    ])
    const lockedAt = performance.now()
    const lock = await context.owner.client.rpc('host_lock_game', { p_session_id: session.id })
    if (lock.error) throw new Error(`Lock local load room: ${lock.error.message}`)
    const deadline = Date.now() + 5000
    while (deliveries === 0 && Date.now() < deadline) await delay(50)
    const state = await observer.rpc('get_player_game_state', { p_room_code: session.roomCode })
    assert(!state.error && state.data?.phase === 'locked', 'Player-safe state did not reach locked.')
    assert(deliveries > 0, 'The legitimate host lock did not produce a room game_changed delivery.')
    return { deliveries, phase: state.data.phase, refreshObservedWithinMs: Math.round(performance.now() - lockedAt) }
  } finally {
    await observer.removeChannel(channel)
  }
}

function authoritativeLoadState(sessionId) {
  return JSON.parse(runLocalSql(`
    with answer_counts as (
      select
        count(*)::integer as answer_row_count,
        (count(*) - count(distinct (player_id, question_id)))::integer as duplicate_answer_row_count
      from public.player_answers
      where game_session_id = '${sessionId}'::uuid
    )
    select json_build_object(
      'answerRowCount', ac.answer_row_count,
      'duplicateAnswerRowCount', ac.duplicate_answer_row_count,
      'phase', gs.phase
    )
    from answer_counts ac
    cross join public.game_sessions gs
    where gs.id = '${sessionId}'::uuid;
  `))
}

async function runEntry(context, entry) {
  const launched = await saveAndLaunchStandard(context, `${entry.players}-${entry.spreadMs}`)
  let sampler
  const pgSamples = []
  try {
    const config = parseLoadTestConfig({
      KATWED_LOADTEST_SUPABASE_URL: context.status.apiUrl,
      KATWED_LOADTEST_SUPABASE_KEY: context.status.anonKey,
      KATWED_LOADTEST_ROOM_CODE: launched.session.roomCode,
      KATWED_LOADTEST_DISPOSABLE_ROOM: 'YES',
      KATWED_LOADTEST_PLAYERS: String(entry.players),
      KATWED_LOADTEST_SPREAD_MS: String(entry.spreadMs),
      KATWED_LOADTEST_REQUEST_TIMEOUT_MS: '30000',
      KATWED_LOADTEST_QUESTION_WAIT_MS: '30000',
      KATWED_LOADTEST_BROADCAST_DRAIN_MS: '750',
      KATWED_LOADTEST_BROADCAST_SETTLE_MS: '750',
    })
    const result = await runLoadTest(config, {
      onPlayersReady: async ({ joinedPlayers, requestedPlayers, successfulSubscriptions }) => {
        assert(joinedPlayers === requestedPlayers,
          `Only ${joinedPlayers}/${requestedPlayers} Players joined; refusing a partial measurement.`)
        assert(successfulSubscriptions === requestedPlayers,
          `Only ${successfulSubscriptions}/${requestedPlayers} Realtime subscriptions opened.`)
        const started = await context.owner.client.rpc('host_start_game', {
          p_session_id: launched.session.id,
        })
        if (started.error) throw new Error(`Start local load room: ${started.error.message}`)
        sampler = setInterval(() => pgSamples.push(pgSnapshot()), 250)
        sampler.unref()
      },
    })
    clearInterval(sampler)

    const authoritative = authoritativeLoadState(launched.session.id)
    const phaseBroadcast = await verifyDesiredPhaseBroadcast(context, launched.session)

    return {
      ...result,
      databaseAnswerRowCount: authoritative.answerRowCount,
      duplicateAnswerRowCount: authoritative.duplicateAnswerRowCount,
      databasePhaseAfterBurst: authoritative.phase,
      phaseBroadcast,
      postgresSamples: pgSamples,
      containerResourcesAfter: containerSnapshot(),
      quizId: launched.quiz.id,
    }
  } finally {
    clearInterval(sampler)
    await closeSession(context, launched.session.id)
  }
}

export async function runLocalLoadMatrix(environment = process.env) {
  const status = readLocalStatus({ env: environment })
  const matrix = selectMatrix(environment)
  assert(matrix.length > 0, 'The selected local load matrix is empty.')
  const resources = resourcePreflight(matrix)
  const context = await createLocalLabContext(status, { withNonOwner: false })
  const results = []
  const quizIds = []
  try {
    for (const entry of matrix) {
      const result = await runEntry(context, entry)
      quizIds.push(result.quizId)
      results.push(result)
      console.log(JSON.stringify({ completed: entry, result }, null, 2))
      const errors = result.joinFailure + result.submitFailure + result.realtimeSubscriptionErrors
      assert(errors === 0, `Load entry ${entry.players}/${entry.spreadMs} completed with ${errors} errors.`)
      assert(result.roomGameChangedDeliveriesDuringAnswerBurst === 0,
        'A Standard answer burst generated a public room broadcast.')
      assert(result.databaseAnswerRowCount === entry.players && result.duplicateAnswerRowCount === 0,
        'Database answer-row verification did not match the requested Players.')
      assert(result.databasePhaseAfterBurst === 'question', 'Standard room changed phase during the answer burst.')
    }
  } finally {
    await context.cleanup(quizIds)
  }

  const report = {
    target: status.apiUrl,
    limitation: 'Local architecture/concurrency evidence only; this does not certify managed Supabase Free quotas.',
    resources: { ...resources, freeMemoryMiBAfter: Math.round(freemem() / 1024 ** 2) },
    matrix,
    results,
    serviceLogObservations: localServiceErrorObservations(),
  }
  mkdirSync(join(process.cwd(), 'artifacts', 'local-supabase'), { recursive: true })
  const outputPath = join(process.cwd(), 'artifacts', 'local-supabase', `load-${Date.now()}.json`)
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(`Local load report: ${outputPath}`)
  return report
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runLocalLoadMatrix().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
