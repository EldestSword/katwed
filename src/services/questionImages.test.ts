import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  KATWED_IMAGE_MAX_EDGE,
  KATWED_IMAGE_MAX_UPLOAD_BYTES,
  KATWED_IMAGE_WEBP_QUALITY,
  createKatwedImageObjectPath,
  getQuestionImageObjectPath,
  prepareKatwedImage,
  removeQuestionImages,
  uploadQuestionImage,
  uploadQuizCover,
} from './questionImages'

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

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function imagePreparation(width = 3200, height = 800) {
  const close = vi.fn()
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width, height, close }))
  const drawImage = vi.fn()
  const toBlob = vi.fn((callback: BlobCallback, type?: string, quality?: number) => {
    callback(new Blob(['prepared'], { type }))
    return quality
  })
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn().mockReturnValue({ drawImage }),
    toBlob,
  }
  vi.spyOn(document, 'createElement').mockReturnValue(canvas as unknown as HTMLCanvasElement)
  return { canvas, close, drawImage, toBlob }
}

describe('Katwed image preparation', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp'])('accepts and converts %s through the shared pipeline', async (type) => {
    const prepared = imagePreparation(800, 600)
    const result = await prepareKatwedImage(new File(['image'], 'cover', { type }))

    expect(result.type).toBe('image/webp')
    expect(prepared.canvas).toMatchObject({ width: 800, height: 600 })
    expect(prepared.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/webp', KATWED_IMAGE_WEBP_QUALITY)
    expect(prepared.close).toHaveBeenCalledOnce()
  })

  it('rejects unsupported files and source images over 8 MB', async () => {
    await expect(prepareKatwedImage(new File(['text'], 'cover.gif', { type: 'image/gif' }))).rejects.toThrow(
      'Choose a JPEG, PNG or WebP image.',
    )
    await expect(prepareKatwedImage(new File(
      [new Uint8Array(KATWED_IMAGE_MAX_UPLOAD_BYTES + 1)],
      'large.jpg',
      { type: 'image/jpeg' },
    ))).rejects.toThrow('Choose an image smaller than 8 MB.')
  })

  it('resizes without upscaling so the longest edge is at most 1600 pixels', async () => {
    const prepared = imagePreparation(3200, 800)
    await prepareKatwedImage(new File(['image'], 'wide.png', { type: 'image/png' }))

    expect(KATWED_IMAGE_MAX_EDGE).toBe(1600)
    expect(prepared.canvas).toMatchObject({ width: 1600, height: 400 })
    expect(prepared.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 400)
  })

  it('uses the same authenticated owner/year/UUID WebP path for questions and covers', () => {
    expect(uploadQuestionImage).toBeTypeOf('function')
    expect(uploadQuizCover).toBeTypeOf('function')
    expect(createKatwedImageObjectPath(
      '123e4567-e89b-42d3-a456-426614174000',
      new Date('2026-08-07T12:00:00.000Z'),
      '223e4567-e89b-42d3-a456-426614174000',
    )).toBe(objectPath)
  })
})

describe('question image lifecycle cleanup', () => {
  it('recognises only Katwed-generated objects in the configured public bucket', () => {
    expect(getQuestionImageObjectPath(publicUrl, projectUrl)).toBe(objectPath)
    expect(getQuestionImageObjectPath(
      publicUrl.replace('katwed-test.supabase.co', 'another-project.supabase.co'),
      projectUrl,
    )).toBeNull()
    expect(getQuestionImageObjectPath('https://example.com/image.webp', projectUrl)).toBeNull()
    expect(getQuestionImageObjectPath(
      `${projectUrl}/storage/v1/object/public/another-bucket/${objectPath}`,
      projectUrl,
    )).toBeNull()
    expect(getQuestionImageObjectPath('/demo/portrait-1.svg', projectUrl)).toBeNull()
    expect(getQuestionImageObjectPath(publicUrl.replace(/\.webp$/, '.png'), projectUrl)).toBeNull()
    expect(getQuestionImageObjectPath(
      `${projectUrl}/storage/v1/object/public/question-images/not-a-generated-path.webp`,
      projectUrl,
    )).toBeNull()
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
