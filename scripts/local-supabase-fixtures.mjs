import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
}

function trueFalseQuestion(assignedCompetitorId = null, displayOrder = 0) {
  return {
    id: randomUUID(),
    assignedCompetitorId,
    type: 'true-false',
    prompt: `Local concurrency question ${displayOrder + 1}`,
    supportingText: 'Disposable local test data only.',
    media: { type: 'none' },
    mediaVisibility: 'both',
    presentationChoiceVisibility: 'show',
    correctValue: true,
    timeLimitSeconds: 120,
    points: 1000,
    speedScoringEnabled: false,
    doubleScore: false,
    displayOrder,
    revealCaption: 'Local test answer.',
  }
}

export function standardQuizInput(runLabel = randomUUID()) {
  return {
    title: `Local scaling lab ${runLabel}`.slice(0, 120),
    quizType: 'standard',
    headToHeadCompetitors: [],
    coverImagePath: null,
    themeId: 'katwed',
    backgroundId: null,
    answerPaletteId: 'classic',
    soundPackId: 'none',
    roster: [],
    questions: [trueFalseQuestion(null, 0), trueFalseQuestion(null, 1)],
  }
}

export function headToHeadQuizInput(runLabel = randomUUID()) {
  const competitors = [
    { id: randomUUID(), displayName: 'Local Red', displayOrder: 0 },
    { id: randomUUID(), displayName: 'Local Blue', displayOrder: 1 },
  ]
  return {
    title: `Local Head-to-Head lab ${runLabel}`.slice(0, 120),
    quizType: 'head-to-head',
    headToHeadCompetitors: competitors,
    coverImagePath: null,
    themeId: 'katwed',
    backgroundId: null,
    answerPaletteId: 'classic',
    soundPackId: 'none',
    roster: [],
    questions: competitors.map((competitor, index) => trueFalseQuestion(competitor.id, index)),
  }
}

function unwrap(result, operation) {
  if (result.error) throw new Error(`${operation}: ${result.error.message}`)
  return result.data
}

export async function createLocalLabContext(status, options = {}) {
  const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`
  const password = `Local-only-${randomUUID()}!aA1`
  const service = createClient(status.apiUrl, status.serviceRoleKey, clientOptions)
  const anon = createClient(status.apiUrl, status.anonKey, clientOptions)
  const users = []

  async function createSignedInUser(label) {
    const email = `katwed-local-${label}-${runId}@example.invalid`
    const created = unwrap(await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    }), `Create local ${label} user`)
    users.push(created.user.id)
    const client = createClient(status.apiUrl, status.anonKey, clientOptions)
    unwrap(await client.auth.signInWithPassword({ email, password }), `Sign in local ${label} user`)
    return { client, id: created.user.id }
  }

  const owner = await createSignedInUser('owner')
  const nonOwner = options.withNonOwner === false ? null : await createSignedInUser('non-owner')

  return {
    anon,
    nonOwner,
    owner,
    runId,
    service,
    status,
    async cleanup(quizIds = []) {
      for (const quizId of quizIds) {
        await service.from('quizzes').delete().eq('id', quizId)
      }
      for (const userId of users.reverse()) {
        await service.auth.admin.deleteUser(userId)
      }
    },
  }
}

export async function saveAndLaunchStandard(context, label = context.runId) {
  const quiz = unwrap(await context.owner.client.rpc('host_save_quiz', {
    p_quiz: standardQuizInput(label),
  }), 'Save local Standard quiz')
  const session = unwrap(await context.owner.client.rpc('host_launch_game', {
    p_quiz_id: quiz.id,
    p_settings: { autoLockWhenAllAnswered: false },
  }), 'Launch local Standard quiz')
  return { quiz, session }
}

export async function joinPlayers(status, roomCode, count, label = 'Probe') {
  return Promise.all(Array.from({ length: count }, async (_, index) => {
    const client = createClient(status.apiUrl, status.anonKey, clientOptions)
    const joined = unwrap(await client.rpc('join_room', {
      p_room_code: roomCode,
      p_nickname: `${label} ${index + 1}`.slice(0, 30),
    }), `Join local Player ${index + 1}`)
    return { client, ...joined }
  }))
}

export async function closeSession(context, sessionId) {
  const result = await context.owner.client.rpc('host_close_game', { p_session_id: sessionId })
  if (result.error && !/closed|not active/i.test(result.error.message)) {
    throw new Error(`Close local session: ${result.error.message}`)
  }
}
