import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import {
  classifySupabaseMediaPaths,
  cleanupSupabaseUnusedImages,
  listSupabaseStoredImages,
  loadSupabaseStorageReport,
} from './storageManager'

const userId = '123e4567-e89b-42d3-a456-426614174000'
const firstId = '223e4567-e89b-42d3-a456-426614174000'
const secondId = '323e4567-e89b-42d3-a456-426614174000'
const firstPath = `${userId}/2026/${firstId}.webp`
const secondPath = `${userId}/2026/${secondId}.webp`

function folder(name: string) {
  return { name, id: null, updated_at: null, created_at: null, last_accessed_at: null, metadata: null }
}

function file(name: string, size: unknown = 1024) {
  return {
    name,
    id: `file-${name}`,
    updated_at: '2026-08-07T12:00:00.000Z',
    created_at: '2026-08-07T12:00:00.000Z',
    last_accessed_at: null,
    metadata: { size },
  }
}

function clientWith(options: {
  list?: ReturnType<typeof vi.fn>
  rpc?: ReturnType<typeof vi.fn>
  remove?: ReturnType<typeof vi.fn>
}) {
  const list = options.list ?? vi.fn().mockResolvedValue({ data: [], error: null })
  const rpc = options.rpc ?? vi.fn().mockResolvedValue({
    data: { referencedPaths: [], unusedPaths: [], ignoredPaths: [] },
    error: null,
  })
  const remove = options.remove ?? vi.fn().mockResolvedValue({ data: [], error: null })
  const getPublicUrl = vi.fn((path: string) => ({ data: { publicUrl: `https://media.example/${path}` } }))
  const from = vi.fn().mockReturnValue({ list, remove, getPublicUrl })
  return {
    client: {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null }) },
      storage: { from },
      rpc,
    } as unknown as SupabaseClient,
    from,
    getPublicUrl,
    list,
    remove,
    rpc,
  }
}

describe('Supabase Storage Manager client', () => {
  it('lists only the authenticated prefix, follows folders, paginates and ignores folder rows', async () => {
    const pageOne = Array.from({ length: 100 }, (_, index) => file(
      `${String(index).padStart(8, '0')}-e89b-42d3-a456-426614174000.webp`,
      index === 0 ? 'missing' : 1024,
    ))
    const list = vi.fn(async (prefix: string, options: { offset: number }) => {
      if (prefix === userId) return { data: [folder('2026')], error: null }
      if (prefix === `${userId}/2026` && options.offset === 0) return { data: pageOne, error: null }
      if (prefix === `${userId}/2026` && options.offset === 100) return { data: [file(`${firstId}.webp`, 2048)], error: null }
      throw new Error(`Unexpected list request: ${prefix} ${options.offset}`)
    })
    const mock = clientWith({ list })

    const result = await listSupabaseStoredImages(mock.client)

    expect(result.userId).toBe(userId)
    expect(result.objects).toHaveLength(101)
    expect(result.objects[0].sizeBytes).toBeNull()
    expect(result.objects.at(-1)).toMatchObject({ path: firstPath, sizeBytes: 2048 })
    expect(list.mock.calls.map(([prefix]) => prefix)).toEqual([userId, `${userId}/2026`, `${userId}/2026`])
    expect(mock.from).toHaveBeenCalledWith('question-images')
    expect(mock.getPublicUrl).toHaveBeenCalledTimes(101)
  })

  it('batches classification, parses only requested paths and blocks on a database error', async () => {
    const paths = Array.from({ length: 201 }, (_, index) => `path-${index}`)
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: { referencedPaths: ['path-0', 'not-requested'], unusedPaths: [], ignoredPaths: [] }, error: null })
      .mockResolvedValueOnce({ data: { referencedPaths: [], unusedPaths: ['path-200'], ignoredPaths: [] }, error: null })
    const mock = clientWith({ rpc })

    await expect(classifySupabaseMediaPaths(mock.client, paths)).resolves.toEqual({
      referencedPaths: ['path-0'],
      unusedPaths: ['path-200'],
      ignoredPaths: [],
    })
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(rpc.mock.calls[0][1].p_paths).toHaveLength(200)

    rpc.mockReset().mockResolvedValue({ data: null, error: { message: 'database unavailable' } })
    await expect(classifySupabaseMediaPaths(mock.client, [firstPath])).rejects.toThrow(
      'Stored image references could not be checked. Nothing was removed.',
    )
  })

  it('builds a report with referenced, unused and protected objects', async () => {
    const list = vi.fn(async (prefix: string) => prefix === userId
      ? { data: [folder('2026'), file('legacy.png', 300)], error: null }
      : { data: [file(`${firstId}.webp`, 1000), file(`${secondId}.webp`, 2000)], error: null })
    const rpc = vi.fn().mockResolvedValue({
      data: { referencedPaths: [firstPath], unusedPaths: [secondPath], ignoredPaths: [] },
      error: null,
    })
    const mock = clientWith({ list, rpc })

    const report = await loadSupabaseStorageReport(mock.client)

    expect(report.total).toEqual({ fileCount: 3, sizeBytes: 3300, unknownSizeCount: 0 })
    expect(report.inUse.fileCount).toBe(1)
    expect(report.unused.fileCount).toBe(1)
    expect(report.protected.fileCount).toBe(1)
    expect(rpc).toHaveBeenCalledWith('host_classify_media_paths', { p_paths: [firstPath, secondPath] })
  })

  it('keeps a path that becomes referenced between the report and cleanup', async () => {
    const list = vi.fn(async (prefix: string) => prefix === userId
      ? { data: [folder('2026')], error: null }
      : { data: [file(`${firstId}.webp`)], error: null })
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: { referencedPaths: [], unusedPaths: [firstPath], ignoredPaths: [] }, error: null })
      .mockResolvedValueOnce({ data: { referencedPaths: [firstPath], unusedPaths: [], ignoredPaths: [] }, error: null })
    const mock = clientWith({ list, rpc })

    expect((await loadSupabaseStorageReport(mock.client)).unused.fileCount).toBe(1)
    await expect(cleanupSupabaseUnusedImages(mock.client, [firstPath])).resolves.toEqual({
      removedCount: 0,
      preservedCount: 1,
      failedCount: 0,
    })
    expect(mock.remove).not.toHaveBeenCalled()
  })

  it('removes only the subset still unused and reports rejected paths honestly', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { referencedPaths: [firstPath], unusedPaths: [secondPath], ignoredPaths: [] },
      error: null,
    })
    const mock = clientWith({ rpc })

    await expect(cleanupSupabaseUnusedImages(mock.client, [firstPath, secondPath, 'https://example.com/image.webp']))
      .resolves.toEqual({ removedCount: 1, preservedCount: 1, failedCount: 1 })
    expect(mock.remove).toHaveBeenCalledWith([secondPath])
  })

  it('does not call Storage removal when the mandatory revalidation fails', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'offline' } })
    const mock = clientWith({ rpc })

    await expect(cleanupSupabaseUnusedImages(mock.client, [firstPath])).rejects.toThrow(
      'Stored image references could not be checked. Nothing was removed.',
    )
    expect(mock.remove).not.toHaveBeenCalled()
  })
})
