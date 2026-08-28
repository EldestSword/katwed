import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { mixedDemoQuiz } from '../demo/sampleData'
import { SupabaseGameRepository } from './SupabaseGameRepository'

const userId = '123e4567-e89b-42d3-a456-426614174000'
const imageId = '223e4567-e89b-42d3-a456-426614174000'

describe('SupabaseGameRepository duplication', () => {
  it('defensively normalises absent, unknown and wrong-theme background values from quiz reads', async () => {
    const absent = structuredClone(mixedDemoQuiz) as unknown as Record<string, unknown>
    Reflect.deleteProperty(absent, 'backgroundId')
    const unknown = { ...structuredClone(mixedDemoQuiz), backgroundId: 'future-background' }
    const incompatible = { ...structuredClone(mixedDemoQuiz), themeId: 'paper', backgroundId: 'arcade-grid' }
    const rpc = vi.fn().mockResolvedValue({ data: [absent, unknown, incompatible], error: null })
    const repository = new SupabaseGameRepository({ rpc } as unknown as SupabaseClient)

    const quizzes = await repository.listQuizzes()

    expect(quizzes.map((quiz) => quiz.backgroundId)).toEqual([null, null, null])
  })

  it('normalises older quiz reads to Standard without exposing stale assignment data', async () => {
    const older = structuredClone(mixedDemoQuiz) as unknown as Record<string, unknown>
    delete older.quizType
    delete older.headToHeadCompetitors
    const questions = older.questions as Array<Record<string, unknown>>
    questions[0].assignedCompetitorId = 'stale'
    const rpc = vi.fn().mockResolvedValue({ data: [older], error: null })
    const repository = new SupabaseGameRepository({ rpc } as unknown as SupabaseClient)

    const quiz = (await repository.listQuizzes())[0]
    expect(quiz.quizType).toBe('standard')
    expect(quiz.headToHeadCompetitors).toEqual([])
    expect(quiz.questions.every((question) => question.assignedCompetitorId === null)).toBe(true)
  })

  it('normalises older or malformed palette reads to Classic', async () => {
    const older = structuredClone(mixedDemoQuiz) as unknown as Record<string, unknown>
    delete older.answerPaletteId
    delete older.customAnswerColours
    const malformed = { ...structuredClone(mixedDemoQuiz), answerPaletteId: 'custom', customAnswerColours: ['red'] }
    const rpc = vi.fn().mockResolvedValue({ data: [older, malformed], error: null })
    const repository = new SupabaseGameRepository({ rpc } as unknown as SupabaseClient)

    const quizzes = await repository.listQuizzes()
    expect(quizzes.map((quiz) => quiz.answerPaletteId)).toEqual(['classic', 'custom'])
    expect(quizzes.map((quiz) => quiz.customAnswerColours)).toEqual([
      mixedDemoQuiz.customAnswerColours,
      mixedDemoQuiz.customAnswerColours,
    ])
  })

  it('normalises older or malformed sound-pack reads to Katwed', async () => {
    const older = structuredClone(mixedDemoQuiz) as unknown as Record<string, unknown>
    delete older.soundPackId
    const malformed = { ...structuredClone(mixedDemoQuiz), soundPackId: 'future-pack' }
    const rpc = vi.fn().mockResolvedValue({ data: [older, malformed], error: null })
    const repository = new SupabaseGameRepository({ rpc } as unknown as SupabaseClient)
    expect((await repository.listQuizzes()).map((quiz) => quiz.soundPackId)).toEqual(['katwed', 'katwed'])
  })

  it('reads an active source and creates its remapped copy through host_save_quiz', async () => {
    const source = structuredClone(mixedDemoQuiz)
    source.coverImagePath = 'https://katwed-test.supabase.co/storage/v1/object/public/question-images/shared-cover.webp'
    source.themeId = 'arcade'
    source.backgroundId = 'arcade-grid'
    const newQuizId = '323e4567-e89b-42d3-a456-426614174000'
    const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === 'host_get_quiz') return { data: source, error: null }
      if (name === 'host_save_quiz') {
        const input = args.p_quiz as typeof source
        return {
          data: {
            ...input,
            id: newQuizId,
            archivedAt: null,
            createdAt: '2026-08-07T13:00:00.000Z',
            updatedAt: '2026-08-07T13:00:00.000Z',
          },
          error: null,
        }
      }
      throw new Error(`Unexpected RPC: ${name}`)
    })
    const storageFrom = vi.fn()
    const repository = new SupabaseGameRepository({
      rpc,
      storage: { from: storageFrom },
    } as unknown as SupabaseClient)

    const duplicate = await repository.duplicateQuiz(source.id)

    expect(duplicate).toMatchObject({ id: newQuizId, title: 'Katwed! Mixed Quiz (Copy)', archivedAt: null })
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(['host_get_quiz', 'host_save_quiz'])
    expect(rpc.mock.calls[0][1]).toEqual({ p_quiz_id: source.id })
    const saveInput = rpc.mock.calls[1][1].p_quiz as typeof source
    expect(saveInput).not.toHaveProperty('id')
    expect(saveInput.coverImagePath).toBe(source.coverImagePath)
    expect(saveInput.backgroundId).toBe('arcade-grid')
    expect(saveInput.soundPackId).toBe('katwed')
    expect(saveInput.questions.every((question) =>
      !source.questions.some((candidate) => candidate.id === question.id)
    )).toBe(true)
    expect(saveInput.roster.every((member) =>
      !source.roster.some((candidate) => candidate.id === member.id)
    )).toBe(true)
    expect(storageFrom).not.toHaveBeenCalled()
  })

  it.each([
    ['a cover', 'https://katwed-test.supabase.co/storage/v1/object/public/question-images/cover.webp'],
    ['no cover', null],
  ])('passes %s through the existing host_save_quiz contract', async (_description, coverImagePath) => {
    const input = {
      id: mixedDemoQuiz.id,
      title: mixedDemoQuiz.title,
      quizType: mixedDemoQuiz.quizType,
      headToHeadCompetitors: mixedDemoQuiz.headToHeadCompetitors,
      coverImagePath,
      themeId: mixedDemoQuiz.themeId,
      backgroundId: mixedDemoQuiz.backgroundId,
      roster: mixedDemoQuiz.roster,
      questions: mixedDemoQuiz.questions,
    }
    const saved = { ...structuredClone(mixedDemoQuiz), coverImagePath }
    const rpc = vi.fn().mockResolvedValue({ data: saved, error: null })
    const repository = new SupabaseGameRepository({ rpc } as unknown as SupabaseClient)

    await expect(repository.saveQuiz(input)).resolves.toEqual(saved)
    expect(rpc).toHaveBeenCalledWith('host_save_quiz', { p_quiz: input })
  })

  it('rejects an archived source without trying to save it', async () => {
    const source = { ...structuredClone(mixedDemoQuiz), archivedAt: '2026-08-07T12:00:00.000Z' }
    const rpc = vi.fn().mockResolvedValue({ data: source, error: null })
    const repository = new SupabaseGameRepository({ rpc } as unknown as SupabaseClient)

    await expect(repository.duplicateQuiz(source.id)).rejects.toThrow(
      'Restore this quiz before duplicating it.',
    )
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('host_get_quiz', { p_quiz_id: source.id })
  })
})

describe('SupabaseGameRepository game launch', () => {
  it('passes launch settings atomically and normalises the persisted session response', async () => {
    const settings = {
      soundPackId: 'none' as const,
      shuffleQuestionOrder: true,
      shuffleAnswerOptions: true,
      autoLockWhenAllAnswered: false,
      showPlayerAnswersToHost: false,
    }
    const rawSession = {
      id: 'session', quizId: mixedDemoQuiz.id, roomCode: '123456', status: 'active', phase: 'lobby',
      currentQuestionIndex: 0, questionOpenedAt: null, questionClosesAt: null,
      startedAt: null, endedAt: null, players: [], answers: [],
      settings: { ...settings, doubleScoreIntroMs: 9000, questionTypeIntrosEnabled: true, answerOptionSeed: 'seed' },
      questionOrder: ['question-b', 'question-a'],
    }
    const rpc = vi.fn().mockResolvedValue({ data: rawSession, error: null })
    const repository = new SupabaseGameRepository({ rpc } as unknown as SupabaseClient)

    await expect(repository.launchGame(mixedDemoQuiz.id, settings)).resolves.toMatchObject(rawSession)
    expect(rpc).toHaveBeenCalledWith('host_launch_game', {
      p_quiz_id: mixedDemoQuiz.id,
      p_settings: { ...settings, doubleScoreVariantDurationsMs: [5000] },
    })
  })

  it('uses the authenticated host override RPC and retains automatic judgement metadata', async () => {
    const rawSession = {
      id: 'session', quizId: mixedDemoQuiz.id, roomCode: '123456', status: 'active', phase: 'locked',
      currentQuestionIndex: 0, questionOpenedAt: null, questionClosesAt: null,
      startedAt: null, endedAt: null, players: [], questionOrder: [],
      settings: {
        soundPackId: 'katwed', doubleScoreIntroMs: 5000, shuffleQuestionOrder: false,
        shuffleAnswerOptions: false, autoLockWhenAllAnswered: true, showPlayerAnswersToHost: true,
        questionTypeIntrosEnabled: true, answerOptionSeed: 'seed',
      },
      answers: [{
        id: 'answer', sessionId: 'session', questionId: 'question', playerId: 'player',
        payload: { type: 'typed-answer', value: 'Near miss' }, submittedAt: '2026-08-27T12:00:00.000Z',
        responseTimeMs: 5000, correct: true, pointsAwarded: 1000, hostCorrectOverride: true,
      }],
    }
    const rpc = vi.fn().mockResolvedValueOnce({ data: { session: rawSession, quiz: mixedDemoQuiz }, error: null })
      .mockResolvedValue({ data: null, error: null })
    const repository = new SupabaseGameRepository({ rpc } as unknown as SupabaseClient)

    const bundle = await repository.getHostSession('session')
    expect(bundle?.session.answers[0]).toMatchObject({
      automaticCorrect: true,
      hostCorrectOverride: true,
    })
    await repository.setTypedAnswerOverride('session', 'answer', true)
    await repository.setTypedAnswerOverride('session', 'answer', null)
    expect(rpc.mock.calls.slice(1)).toEqual([
      ['host_set_typed_answer_override', { p_session_id: 'session', p_answer_id: 'answer', p_correct_override: true }],
      ['host_set_typed_answer_override', { p_session_id: 'session', p_answer_id: 'answer', p_correct_override: null }],
    ])
  })
})

describe('SupabaseGameRepository permanent deletion', () => {
  it('completes the database deletion before surfacing best-effort Storage failure', async () => {
    const events: string[] = []
    const remove = vi.fn(async () => {
      events.push('storage')
      return { error: { message: 'Storage unavailable' } }
    })
    const client = {
      rpc: vi.fn(async (name: string) => {
        events.push(name)
        return {
          data: {
            mediaPaths: [
              `https://katwed-test.supabase.co/storage/v1/object/public/question-images/${userId}/2026/${imageId}.webp`,
            ],
          },
          error: null,
        }
      }),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null }),
      },
      storage: { from: vi.fn().mockReturnValue({ remove }) },
    }
    const repository = new SupabaseGameRepository(
      client as unknown as SupabaseClient,
      'https://katwed-test.supabase.co',
    )

    await expect(repository.permanentlyDeleteQuiz('quiz-id')).resolves.toEqual({
      deletedMediaCount: 0,
      failedMediaCount: 1,
    })
    expect(events).toEqual(['host_permanently_delete_quiz', 'storage'])
  })
})

describe('SupabaseGameRepository Head-to-Head live play', () => {
  it('uses the dedicated safe join and player-controlled progression RPCs', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null })
    const repository = new SupabaseGameRepository({ rpc } as unknown as SupabaseClient)

    await repository.getRoomJoinInfo('123456')
    await repository.joinHeadToHeadRoom('123456', 'competitor-id')
    await repository.startHeadToHead('123456', 'player-id', 'secret-token')
    await repository.skipHeadToHead('123456', 'player-id', 'secret-token', 'question-id')
    await repository.continueHeadToHead('123456', 'player-id', 'secret-token', 'question-id')

    expect(rpc.mock.calls).toEqual([
      ['get_room_join_info', { p_room_code: '123456' }],
      ['join_head_to_head_room', { p_room_code: '123456', p_competitor_id: 'competitor-id' }],
      ['start_head_to_head_game', { p_room_code: '123456', p_player_id: 'player-id', p_reconnect_token: 'secret-token' }],
      ['skip_head_to_head_answer', { p_room_code: '123456', p_player_id: 'player-id', p_reconnect_token: 'secret-token', p_expected_question_id: 'question-id' }],
      ['continue_head_to_head_game', { p_room_code: '123456', p_player_id: 'player-id', p_reconnect_token: 'secret-token', p_expected_question_id: 'question-id' }],
    ])
  })
})
