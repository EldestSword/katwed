import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import {
  closeSession,
  createLocalLabContext,
  headToHeadQuizInput,
  joinPlayers,
  saveAndLaunchStandard,
} from './local-supabase-fixtures.mjs'
import { readLocalStatus, runLocalSql, runSupabase } from './local-supabase-safety.mjs'

const FORBIDDEN_PLAYER_KEYS = new Set([
  'acceptedAnswers', 'answerKey', 'answers', 'correctAnswer', 'correctMemberIds',
  'correctOptionId', 'correctOptionIds', 'correctValue', 'playerAnswers', 'reconnectToken',
  'targetRadius', 'targetX', 'targetY', 'tolerance',
])

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function unwrap(result, operation) {
  if (result.error) throw new Error(`${operation}: ${result.error.message}`)
  return result.data
}

async function subscribeToRoom(client, roomCode) {
  let deliveries = 0
  let resolveSubscribed
  let rejectSubscribed
  let resolveReplicationReady
  let rejectReplicationReady
  const subscribed = new Promise((resolve, reject) => {
    resolveSubscribed = resolve
    rejectSubscribed = reject
  })
  const replicationReady = new Promise((resolve, reject) => {
    resolveReplicationReady = resolve
    rejectReplicationReady = reject
  })
  const channel = client.channel(`katwed:${roomCode}`, {
    config: { broadcast: { replication_ready: true } },
  })
    .on('broadcast', { event: 'game_changed' }, () => { deliveries += 1 })
    .on('system', {}, (payload) => {
      if (payload?.extension !== 'system') return
      if (payload.status === 'ok') {
        resolveReplicationReady()
      } else if (payload.status === 'error') {
        rejectReplicationReady(new Error(
          `Realtime replication was not ready for local room ${roomCode}: ${payload.message ?? 'unknown error'}`,
        ))
      }
    })
  channel.subscribe((status, error) => {
    if (status === 'SUBSCRIBED') {
      resolveSubscribed()
    } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR' || status === 'CLOSED') {
      rejectSubscribed(error ?? new Error(`Realtime channel ${roomCode} ended with ${status}.`))
    }
  })
  await Promise.race([
    subscribed,
    delay(10_000).then(() => { throw new Error(`Timed out subscribing to local room ${roomCode}.`) }),
  ])
  await Promise.race([
    replicationReady,
    delay(10_000).then(() => { throw new Error(`Timed out waiting for local Realtime replication for room ${roomCode}.`) }),
  ])
  return {
    channel,
    deliveries: () => deliveries,
    reset: () => { deliveries = 0 },
  }
}

async function waitFor(description, predicate, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return
    await delay(50)
  }
  throw new Error(`Timed out waiting for ${description}.`)
}

function findForbiddenKeys(value, path = '$', findings = []) {
  if (!value || typeof value !== 'object') return findings
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`
    if (FORBIDDEN_PLAYER_KEYS.has(key)) findings.push(childPath)
    findForbiddenKeys(child, childPath, findings)
  }
  return findings
}

async function assertApiSecurity(context, session) {
  const anonHostRead = await context.anon.rpc('host_get_live_session', { p_session_id: session.id })
  assert(anonHostRead.error, 'Anon unexpectedly executed host_get_live_session.')

  const nonOwnerHostRead = await context.nonOwner.client.rpc('host_get_live_session', { p_session_id: session.id })
  assert(!nonOwnerHostRead.error && nonOwnerHostRead.data === null,
    'An authenticated non-owner unexpectedly read the live session.')

  const ownerHostRead = await context.owner.client.rpc('host_get_live_session', { p_session_id: session.id })
  assert(!ownerHostRead.error && ownerHostRead.data?.id === session.id,
    'The owning host could not read the lightweight live session.')

  const directPlayers = await context.anon.from('players').select('id').limit(1)
  const directAnswers = await context.anon.from('player_answers').select('id').limit(1)
  assert(directPlayers.error, 'Anon unexpectedly selected directly from players.')
  assert(directAnswers.error, 'Anon unexpectedly selected directly from player_answers.')

  await joinPlayers(context.status, session.roomCode, 1, 'Security')
  const started = await context.owner.client.rpc('host_start_game', { p_session_id: session.id })
  assert(!started.error, `Could not start local security fixture: ${started.error?.message}`)
  const safeState = await context.anon.rpc('get_player_game_state', { p_room_code: session.roomCode })
  assert(!safeState.error, `Could not read Player-safe state: ${safeState.error?.message}`)
  assert(safeState.data?.phase === 'question', 'Expected Player-safe state in the Question phase.')
  const forbidden = findForbiddenKeys(safeState.data)
  assert(forbidden.length === 0, `Player-safe state exposed forbidden fields: ${forbidden.join(', ')}`)
  assert(Array.isArray(safeState.data.leaderboard) && safeState.data.leaderboard.length === 0,
    'Player-safe state exposed leaderboard rows before the permitted phase.')
  assert((safeState.data.players ?? []).every((player) =>
    player.totalScore === 0 && player.correctAnswerCount === 0 && player.totalCorrectResponseMs === 0),
  'Player-safe state exposed cumulative totals before the permitted phase.')
  return {
    anonHostRpcDenied: true,
    nonOwnerHostRpcReturnedNull: true,
    ownerHostRpcSucceeded: true,
    anonDirectTableReadsDenied: true,
    playerStateAnswerKeysWithheld: true,
  }
}

async function runStandardFlow(context) {
  const { quiz, session } = await saveAndLaunchStandard(context, 'standard-flow')
  const players = await joinPlayers(context.status, session.roomCode, 3, 'Standard')
  const controllerLobby = unwrap(await context.owner.client.rpc('host_get_live_session', {
    p_session_id: session.id,
  }), 'Read Standard controller lobby')
  const presentationLobby = unwrap(await context.anon.rpc('get_player_game_state', {
    p_room_code: session.roomCode,
  }), 'Read Standard presentation lobby')
  assert(controllerLobby.players?.length === 3, 'The controller did not see all Standard Players.')
  assert((presentationLobby.players ?? []).length === 3, 'The presentation state did not see all Standard Players.')

  const room = await subscribeToRoom(players[0].client, session.roomCode)
  try {
    unwrap(await context.owner.client.rpc('host_start_game', { p_session_id: session.id }), 'Start Standard game')
    await waitFor('Standard question broadcast', async () => room.deliveries() > 0)
    const question = unwrap(await players[0].client.rpc('get_player_game_state', {
      p_room_code: session.roomCode,
    }), 'Read Standard question')
    assert(question.phase === 'question' && question.currentQuestion, 'Standard question did not open.')

    await delay(250)
    room.reset()
    const answers = await Promise.all(players.map((player) => player.client.rpc('submit_answer', {
      p_room_code: session.roomCode,
      p_player_id: player.player.id,
      p_reconnect_token: player.reconnectToken,
      p_answer: { type: 'true-false', value: true },
    })))
    assert(answers.every(({ error }) => !error), 'A Standard Player answer failed.')
    await delay(500)
    assert(room.deliveries() === 0, 'Standard answers generated a room-wide Realtime refresh.')

    const controllerQuestion = unwrap(await context.owner.client.rpc('host_get_live_session', {
      p_session_id: session.id,
    }), 'Refresh Standard controller count')
    const presentationQuestion = unwrap(await context.anon.rpc('get_player_game_state', {
      p_room_code: session.roomCode,
    }), 'Refresh Standard presentation count')
    assert(controllerQuestion.answers?.length === 3, 'The controller did not see all Standard answers.')
    assert(presentationQuestion.submittedCount === 3, 'The presentation count did not reach three.')

    room.reset()
    unwrap(await context.owner.client.rpc('host_lock_game', { p_session_id: session.id }), 'Lock Standard game')
    await waitFor('Standard lock broadcast', async () => room.deliveries() > 0)
    const locked = unwrap(await players[0].client.rpc('get_player_game_state', {
      p_room_code: session.roomCode,
    }), 'Refresh locked Standard state')
    assert(locked.phase === 'locked', 'Standard Player did not reach locked phase.')

    unwrap(await context.owner.client.rpc('host_reveal_game', { p_session_id: session.id }), 'Reveal Standard answer')
    unwrap(await context.owner.client.rpc('host_leaderboard_game', { p_session_id: session.id }), 'Show Standard leaderboard')
    unwrap(await context.owner.client.rpc('host_next_game', { p_session_id: session.id }), 'Open next Standard question')
    unwrap(await context.owner.client.rpc('host_finish_game', { p_session_id: session.id }), 'Reveal final Standard results')
    const finished = unwrap(await context.anon.rpc('get_player_game_state', {
      p_room_code: session.roomCode,
    }), 'Read final Standard results')
    assert(finished.phase === 'finished', 'Standard flow did not reach final results.')
  } finally {
    await players[0].client.removeChannel(room.channel)
    await closeSession(context, session.id)
  }
  return { quizId: quiz.id, players: 3, answerBurstRoomEvents: 0, finalPhase: 'finished' }
}

async function runHeadToHeadFlow(context) {
  const quiz = unwrap(await context.owner.client.rpc('host_save_quiz', {
    p_quiz: headToHeadQuizInput('flow'),
  }), 'Save local Head-to-Head quiz')
  const session = unwrap(await context.owner.client.rpc('host_launch_game', {
    p_quiz_id: quiz.id,
    p_settings: { autoLockWhenAllAnswered: false },
  }), 'Launch local Head-to-Head quiz')
  const observer = createClient(context.status.apiUrl, context.status.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const room = await subscribeToRoom(observer, session.roomCode)
  const competitors = []
  try {
    for (const competitor of quiz.headToHeadCompetitors) {
      const client = createClient(context.status.apiUrl, context.status.anonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      })
      const joined = unwrap(await client.rpc('join_head_to_head_room', {
        p_room_code: session.roomCode,
        p_competitor_id: competitor.id,
      }), `Join Head-to-Head competitor ${competitor.displayName}`)
      competitors.push({ client, ...joined })
    }
    await waitFor('Head-to-Head readiness broadcasts', async () => room.deliveries() >= 2)
    unwrap(await competitors[0].client.rpc('start_head_to_head_game', {
      p_room_code: session.roomCode,
      p_player_id: competitors[0].player.id,
      p_reconnect_token: competitors[0].reconnectToken,
    }), 'Start Head-to-Head game')

    const first = unwrap(await observer.rpc('get_player_game_state', { p_room_code: session.roomCode }),
      'Read first Head-to-Head question')
    assert(first.phase === 'question' && first.currentQuestion?.id, 'First Head-to-Head question did not open.')
    const assignedIndex = competitors.findIndex(({ player }) =>
      player.competitorId === first.currentQuestion.assignedCompetitorId)
    const playAlongIndex = assignedIndex === 0 ? 1 : 0
    const firstResolution = await Promise.all([
      competitors[assignedIndex].client.rpc('submit_answer', {
        p_room_code: session.roomCode,
        p_player_id: competitors[assignedIndex].player.id,
        p_reconnect_token: competitors[assignedIndex].reconnectToken,
        p_answer: { type: 'true-false', value: true },
      }),
      competitors[playAlongIndex].client.rpc('skip_head_to_head_answer', {
        p_room_code: session.roomCode,
        p_player_id: competitors[playAlongIndex].player.id,
        p_reconnect_token: competitors[playAlongIndex].reconnectToken,
        p_expected_question_id: first.currentQuestion.id,
      }),
    ])
    assert(firstResolution.every(({ error }) => !error), 'First Head-to-Head resolution failed or deadlocked.')
    const firstReveal = unwrap(await observer.rpc('get_player_game_state', { p_room_code: session.roomCode }),
      'Read first Head-to-Head reveal')
    assert(firstReveal.phase === 'reveal', 'Head-to-Head did not reveal after answer plus skip.')

    unwrap(await competitors[0].client.rpc('continue_head_to_head_game', {
      p_room_code: session.roomCode,
      p_player_id: competitors[0].player.id,
      p_reconnect_token: competitors[0].reconnectToken,
      p_expected_question_id: first.currentQuestion.id,
    }), 'Continue Head-to-Head game')
    const second = unwrap(await observer.rpc('get_player_game_state', { p_room_code: session.roomCode }),
      'Read second Head-to-Head question')
    assert(second.phase === 'question' && second.currentQuestion?.id !== first.currentQuestion.id,
      'Second Head-to-Head question did not open.')
    const secondResolution = await Promise.all(competitors.map((competitor) => competitor.client.rpc('submit_answer', {
      p_room_code: session.roomCode,
      p_player_id: competitor.player.id,
      p_reconnect_token: competitor.reconnectToken,
      p_answer: { type: 'true-false', value: true },
    })))
    assert(secondResolution.every(({ error }) => !error), 'Second Head-to-Head resolution failed or deadlocked.')
    const secondReveal = unwrap(await observer.rpc('get_player_game_state', { p_room_code: session.roomCode }),
      'Read second Head-to-Head reveal')
    assert(secondReveal.phase === 'reveal', 'Second Head-to-Head question did not reveal.')
    unwrap(await competitors[1].client.rpc('continue_head_to_head_game', {
      p_room_code: session.roomCode,
      p_player_id: competitors[1].player.id,
      p_reconnect_token: competitors[1].reconnectToken,
      p_expected_question_id: second.currentQuestion.id,
    }), 'Finish Head-to-Head game')
    const finished = unwrap(await observer.rpc('get_player_game_state', { p_room_code: session.roomCode }),
      'Read final Head-to-Head results')
    assert(finished.phase === 'finished', 'Head-to-Head did not reach final results.')
    const reconnected = unwrap(await competitors[0].client.rpc('reconnect_player', {
      p_room_code: session.roomCode,
      p_player_id: competitors[0].player.id,
      p_reconnect_token: competitors[0].reconnectToken,
    }), 'Reconnect Head-to-Head competitor')
    assert(reconnected.player.id === competitors[0].player.id, 'Head-to-Head reconnect returned the wrong Player.')
  } finally {
    await observer.removeChannel(room.channel)
    await closeSession(context, session.id)
  }
  return {
    quizId: quiz.id,
    competitors: competitors.length,
    playerChangeBroadcastsObserved: room.deliveries(),
    answerAndSkipResolved: true,
    reconnectSucceeded: true,
    finalPhase: 'finished',
  }
}

export async function runLocalSupabaseTests() {
  const status = readLocalStatus()
  runSupabase(['migration', 'list', '--local'], { stdio: 'inherit' })
  runSupabase(['test', 'db', '--local', 'supabase/tests/realtime_scaling_test.sql'], { stdio: 'inherit' })
  runSupabase(['db', 'lint', '--local', '--schema', 'public', '--level', 'warning', '--fail-on', 'error'], {
    stdio: 'inherit',
  })
  const resultingSchema = JSON.parse(runLocalSql(`
    select json_build_object(
      'triggers', (
        select json_agg(json_build_object(
          'name', t.tgname,
          'definition', pg_get_triggerdef(t.oid, true)
        ) order by t.tgname)
        from pg_trigger t
        where not t.tgisinternal and t.tgname in (
          'players_broadcast_refresh',
          'player_answers_broadcast_refresh',
          'game_sessions_broadcast_refresh',
          'head_to_head_players_broadcast_refresh'
        )
      ),
      'submitFunctions', (
        select json_agg(json_build_object(
          'signature', p.oid::regprocedure::text,
          'definition', pg_get_functiondef(p.oid)
        ) order by p.oid::regprocedure::text)
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('submit_answer', 'submit_answer_without_session_prelude')
      ),
      'hostGetLiveSession', json_build_object(
        'definition', pg_get_functiondef('public.host_get_live_session(uuid)'::regprocedure),
        'anonExecute', has_function_privilege('anon', 'public.host_get_live_session(uuid)', 'EXECUTE'),
        'authenticatedExecute', has_function_privilege('authenticated', 'public.host_get_live_session(uuid)', 'EXECUTE')
      ),
      'anonTableSelect', json_build_object(
        'players', has_table_privilege('anon', 'public.players', 'SELECT'),
        'playerAnswers', has_table_privilege('anon', 'public.player_answers', 'SELECT')
      )
    );
  `))

  const context = await createLocalLabContext(status)
  const quizIds = []
  let session
  try {
    const launched = await saveAndLaunchStandard(context, 'security')
    quizIds.push(launched.quiz.id)
    session = launched.session
    const security = await assertApiSecurity(context, session)
    await closeSession(context, session.id)
    session = null
    const standardFlow = await runStandardFlow(context)
    quizIds.push(standardFlow.quizId)
    const headToHeadFlow = await runHeadToHeadFlow(context)
    quizIds.push(headToHeadFlow.quizId)
    console.log(JSON.stringify({
      target: status.apiUrl,
      schemaRegression: 'passed',
      databaseLint: 'passed with no errors',
      resultingSchema,
      security,
      standardFlow,
      headToHeadFlow,
    }, null, 2))
  } finally {
    if (session) await closeSession(context, session.id)
    await context.cleanup(quizIds)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runLocalSupabaseTests().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
