import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { mixedDemoQuiz } from '../demo/sampleData'
import { SupabaseGameRepository } from './SupabaseGameRepository'

const userId = '123e4567-e89b-42d3-a456-426614174000'
const imageId = '223e4567-e89b-42d3-a456-426614174000'

describe('SupabaseGameRepository duplication', () => {
  it('reads an active source and creates its remapped copy through host_save_quiz', async () => {
    const source = structuredClone(mixedDemoQuiz)
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
    expect(saveInput.questions.every((question) =>
      !source.questions.some((candidate) => candidate.id === question.id)
    )).toBe(true)
    expect(saveInput.roster.every((member) =>
      !source.roster.some((candidate) => candidate.id === member.id)
    )).toBe(true)
    expect(storageFrom).not.toHaveBeenCalled()
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
