import { performance } from 'node:perf_hooks'
import { pathToFileURL } from 'node:url'
import {
  closeSession,
  createLocalLabContext,
  joinPlayers,
  saveAndLaunchStandard,
} from './local-supabase-fixtures.mjs'
import { readLocalStatus, runLocalSql } from './local-supabase-safety.mjs'

const DELAY_SECONDS = 1

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function installLocalDelayFixture() {
  runLocalSql(`
    create or replace function public.katwed_local_delay_answer()
    returns trigger language plpgsql as $$
    begin
      perform pg_sleep(${DELAY_SECONDS});
      return new;
    end;
    $$;
    drop trigger if exists katwed_local_delay_answers on public.player_answers;
    create trigger katwed_local_delay_answers
    before insert on public.player_answers
    for each row execute function public.katwed_local_delay_answer();
  `)
}

function removeLocalDelayFixture() {
  runLocalSql(`
    drop trigger if exists katwed_local_delay_answers on public.player_answers;
    drop function if exists public.katwed_local_delay_answer();
  `)
}

async function openQuestion(context, playerCount, label) {
  const launched = await saveAndLaunchStandard(context, label)
  const players = await joinPlayers(context.status, launched.session.roomCode, playerCount, label)
  const started = await context.owner.client.rpc('host_start_game', { p_session_id: launched.session.id })
  if (started.error) throw new Error(`Start ${label}: ${started.error.message}`)
  return { ...launched, players }
}

async function submit(player, roomCode) {
  return player.client.rpc('submit_answer', {
    p_room_code: roomCode,
    p_player_id: player.player.id,
    p_reconnect_token: player.reconnectToken,
    p_answer: { type: 'true-false', value: true },
  })
}

async function scenarioConcurrentSharedLocks(context) {
  const fixture = await openQuestion(context, 5, 'shared-locks')
  const startedAt = performance.now()
  const answers = await Promise.all(fixture.players.map((player) => submit(player, fixture.session.roomCode)))
  const wallTimeMs = Math.round(performance.now() - startedAt)
  assert(answers.every(({ error }) => !error), 'At least one concurrent Standard answer failed.')
  assert(wallTimeMs < 3000,
    `Five one-second answer transactions took ${wallTimeMs} ms and appear serialised.`)
  await closeSession(context, fixture.session.id)
  return { wallTimeMs, submitted: answers.length, compatibleSharedLocks: true, quizId: fixture.quiz.id }
}

async function scenarioAnswersWin(context) {
  const fixture = await openQuestion(context, 3, 'answers-win')
  const answerPromises = fixture.players.map((player) => submit(player, fixture.session.roomCode))
  await delay(150)
  const hostStartedAt = performance.now()
  const hostLockPromise = context.owner.client.rpc('host_lock_game', { p_session_id: fixture.session.id })
  await delay(100)
  const sampledLockWaiters = Number(runLocalSql(`
    select count(*) from pg_stat_activity
    where datname = current_database() and wait_event_type = 'Lock';
  `))
  const [answers, hostLock] = await Promise.all([Promise.all(answerPromises), hostLockPromise])
  const hostWaitMs = Math.round(performance.now() - hostStartedAt)
  assert(answers.every(({ error }) => !error), 'An answer failed while the host waited for shared locks.')
  assert(!hostLock.error, `Host lock failed after waiting: ${hostLock.error?.message}`)
  assert(hostWaitMs >= 500, `Host phase update did not visibly wait (${hostWaitMs} ms).`)
  const state = await fixture.players[0].client.rpc('get_player_game_state', {
    p_room_code: fixture.session.roomCode,
  })
  assert(!state.error && state.data?.phase === 'locked', 'Host did not reach the locked phase.')
  await closeSession(context, fixture.session.id)
  return { hostWaitMs, sampledLockWaiters, submitted: answers.length, phase: state.data.phase, quizId: fixture.quiz.id }
}

async function scenarioHostWins(context) {
  const fixture = await openQuestion(context, 1, 'host-wins')
  const hostLock = await context.owner.client.rpc('host_lock_game', { p_session_id: fixture.session.id })
  assert(!hostLock.error, `Host could not lock first: ${hostLock.error?.message}`)
  const lateAnswer = await submit(fixture.players[0], fixture.session.roomCode)
  assert(lateAnswer.error && /not open/i.test(lateAnswer.error.message),
    'A late answer was not rejected after the host locked the question.')
  const answerRows = await context.service
    .from('player_answers')
    .select('id', { count: 'exact', head: true })
    .eq('game_session_id', fixture.session.id)
  assert(!answerRows.error && answerRows.count === 0, 'A late answer row was written after the host lock.')
  await closeSession(context, fixture.session.id)
  return { rejected: true, databaseAnswerRows: answerRows.count, quizId: fixture.quiz.id }
}

export async function runLocalConcurrencyTests() {
  const status = readLocalStatus()
  const context = await createLocalLabContext(status, { withNonOwner: false })
  const quizIds = []
  installLocalDelayFixture()
  try {
    const sharedLocks = await scenarioConcurrentSharedLocks(context)
    quizIds.push(sharedLocks.quizId)
    const answersWin = await scenarioAnswersWin(context)
    quizIds.push(answersWin.quizId)
    const hostWins = await scenarioHostWins(context)
    quizIds.push(hostWins.quizId)
    console.log(JSON.stringify({ target: status.apiUrl, sharedLocks, answersWin, hostWins }, null, 2))
  } finally {
    removeLocalDelayFixture()
    await context.cleanup(quizIds)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runLocalConcurrencyTests().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
