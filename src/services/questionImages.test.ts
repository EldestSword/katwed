import { describe, expect, it, vi } from 'vitest'
import { getQuestionImageObjectPath, removeQuestionImages } from './questionImages'

const projectUrl = 'https://katwed-test.supabase.co'
const objectPath = '123e4567-e89b-42d3-a456-426614174000/2026/223e4567-e89b-42d3-a456-426614174000.webp'
const publicUrl = `${projectUrl}/storage/v1/object/public/question-images/${objectPath}`

function storageClient(error: { message: string } | null = null) {
  const remove = vi.fn().mockResolvedValue({ error })
  return {
    client: {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: '123e4567-e89b-42d3-a456-426614174000' } },
          error: null,
        }),
      },
      storage: { from: vi.fn().mockReturnValue({ remove }) },
    },
    remove,
  }
}

describe('question image lifecycle cleanup', () => {
  it('recognises only Katwed-generated objects in the configured public bucket', () => {
    expect(getQuestionImageObjectPath(publicUrl, projectUrl)).toBe(objectPath)
    expect(getQuestionImageObjectPath('https://example.com/image.webp', projectUrl)).toBeNull()
    expect(getQuestionImageObjectPath(
      `${projectUrl}/storage/v1/object/public/another-bucket/${objectPath}`,
      projectUrl,
    )).toBeNull()
    expect(getQuestionImageObjectPath('/demo/portrait-1.svg', projectUrl)).toBeNull()
  })

  it('deduplicates object paths and ignores unrelated references', async () => {
    const { client, remove } = storageClient()
    const result = await removeQuestionImages(
      [publicUrl, publicUrl, 'https://example.com/image.webp'],
      client,
      projectUrl,
    )

    expect(remove).toHaveBeenCalledOnce()
    expect(remove).toHaveBeenCalledWith([objectPath])
    expect(result).toEqual({ deletedMediaCount: 1, failedMediaCount: 0 })
  })

  it('surfaces Storage failure without turning it into a database deletion failure', async () => {
    const { client } = storageClient({ message: 'Storage unavailable' })

    await expect(removeQuestionImages([publicUrl], client, projectUrl)).resolves.toEqual({
      deletedMediaCount: 0,
      failedMediaCount: 1,
    })
  })

  it('does not attempt to remove another host folder', async () => {
    const { client, remove } = storageClient()
    const otherOwnerUrl = publicUrl.replace(
      '123e4567-e89b-42d3-a456-426614174000',
      '323e4567-e89b-42d3-a456-426614174000',
    )

    await expect(removeQuestionImages([otherOwnerUrl], client, projectUrl)).resolves.toEqual({
      deletedMediaCount: 0,
      failedMediaCount: 1,
    })
    expect(remove).not.toHaveBeenCalled()
  })
})
