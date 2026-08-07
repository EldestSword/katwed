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
