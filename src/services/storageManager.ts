import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildStorageReport,
  normaliseSizeBytes,
  type MediaPathClassification,
  type StorageCleanupResult,
  type StorageReport,
  type StoredImageInventoryObject,
} from '../features/storage-manager/storageManager'
import {
  KATWED_IMAGE_BUCKET,
  isKatwedImageObjectPath,
  removeStoredImagePaths,
} from './questionImages'

const LIST_PAGE_SIZE = 100
const CLASSIFICATION_BATCH_SIZE = 200
const MAX_LISTED_FOLDERS = 1000

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function parseClassification(value: unknown, candidates: ReadonlySet<string>): MediaPathClassification {
  const record = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
  return {
    referencedPaths: stringArray(record.referencedPaths).filter((path) => candidates.has(path)),
    unusedPaths: stringArray(record.unusedPaths).filter((path) => candidates.has(path)),
    ignoredPaths: stringArray(record.ignoredPaths).filter((path) => candidates.has(path)),
  }
}

async function authenticatedUserId(client: SupabaseClient): Promise<string> {
  const { data, error } = await client.auth.getUser()
  if (error || !data.user) throw new Error('Sign in again before opening Storage.')
  return data.user.id
}

export async function classifySupabaseMediaPaths(
  client: SupabaseClient,
  paths: readonly string[],
): Promise<MediaPathClassification> {
  const uniquePaths = [...new Set(paths)]
  const combined: MediaPathClassification = { referencedPaths: [], unusedPaths: [], ignoredPaths: [] }
  for (let index = 0; index < uniquePaths.length; index += CLASSIFICATION_BATCH_SIZE) {
    const batch = uniquePaths.slice(index, index + CLASSIFICATION_BATCH_SIZE)
    const result = await client.rpc('host_classify_media_paths', { p_paths: batch }) as {
      data: unknown
      error: { message: string } | null
    }
    if (result.error) throw new Error('Stored image references could not be checked. Nothing was removed.')
    const parsed = parseClassification(result.data, new Set(batch))
    combined.referencedPaths.push(...parsed.referencedPaths)
    combined.unusedPaths.push(...parsed.unusedPaths)
    combined.ignoredPaths.push(...parsed.ignoredPaths)
  }
  return combined
}

export async function listSupabaseStoredImages(
  client: SupabaseClient,
): Promise<{ userId: string; objects: StoredImageInventoryObject[] }> {
  const userId = await authenticatedUserId(client)
  const bucket = client.storage.from(KATWED_IMAGE_BUCKET)
  const queue = [userId]
  const visited = new Set<string>()
  const objects: StoredImageInventoryObject[] = []

  while (queue.length) {
    const prefix = queue.shift()!
    if (visited.has(prefix)) continue
    visited.add(prefix)
    if (visited.size > MAX_LISTED_FOLDERS) throw new Error('Storage contains too many folders to review safely.')

    for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
      const { data, error } = await bucket.list(prefix, {
        limit: LIST_PAGE_SIZE,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      })
      if (error) throw new Error('Stored images could not be listed.')
      const entries = data ?? []
      for (const entry of entries) {
        if (!entry.name || entry.name === '.' || entry.name === '..' || entry.name.includes('/')) continue
        const path = `${prefix}/${entry.name}`
        if (entry.id === null) {
          queue.push(path)
          continue
        }
        objects.push({
          path,
          publicUrl: bucket.getPublicUrl(path).data.publicUrl,
          sizeBytes: normaliseSizeBytes(entry.metadata?.size),
          createdAt: typeof entry.created_at === 'string' ? entry.created_at : null,
        })
      }
      if (entries.length < LIST_PAGE_SIZE) break
    }
  }

  return { userId, objects }
}

export async function loadSupabaseStorageReport(client: SupabaseClient): Promise<StorageReport> {
  const { userId, objects } = await listSupabaseStoredImages(client)
  const safePaths = objects
    .map((object) => object.path)
    .filter((path) => path.startsWith(`${userId}/`) && isKatwedImageObjectPath(path))
  const classification = await classifySupabaseMediaPaths(client, safePaths)
  return buildStorageReport(objects, classification)
}

export async function cleanupSupabaseUnusedImages(
  client: SupabaseClient,
  candidatePaths: readonly string[],
): Promise<StorageCleanupResult> {
  const userId = await authenticatedUserId(client)
  const uniquePaths = [...new Set(candidatePaths)]
  const safePaths = uniquePaths.filter((path) => (
    path.startsWith(`${userId}/`) && isKatwedImageObjectPath(path)
  ))
  const rejectedCount = uniquePaths.length - safePaths.length

  // This is deliberately a fresh authoritative check immediately before the
  // Storage API call. A path newly referenced since the report was loaded is kept.
  const classification = await classifySupabaseMediaPaths(client, safePaths)
  const stillUnused = [...new Set(classification.unusedPaths)]
  const ignoredCount = classification.ignoredPaths.length
  const preservedCount = classification.referencedPaths.length
  const classifiedPaths = new Set([
    ...classification.referencedPaths,
    ...classification.unusedPaths,
    ...classification.ignoredPaths,
  ])
  const unclassifiedCount = safePaths.filter((path) => !classifiedPaths.has(path)).length
  const removal = await removeStoredImagePaths(stillUnused, client)
  return {
    removedCount: removal.deletedMediaCount,
    preservedCount,
    failedCount: rejectedCount + ignoredCount + unclassifiedCount + removal.failedMediaCount,
  }
}
