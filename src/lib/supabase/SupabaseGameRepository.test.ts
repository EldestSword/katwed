import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { SupabaseGameRepository } from './SupabaseGameRepository'

const userId = '123e4567-e89b-42d3-a456-426614174000'
const imageId = '223e4567-e89b-42d3-a456-426614174000'

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
