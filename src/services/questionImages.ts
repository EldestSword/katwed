import { config } from '../lib/config'
import { supabase } from '../lib/supabase/client'

export const KATWED_IMAGE_BUCKET = 'question-images'
const BUCKET = KATWED_IMAGE_BUCKET
const PUBLIC_BUCKET_PATH = `/storage/v1/object/public/${BUCKET}/`
const KATWED_OBJECT_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/\d{4}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/i
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
export const KATWED_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp'
export const KATWED_IMAGE_MAX_UPLOAD_BYTES = 8 * 1024 * 1024
export const KATWED_IMAGE_MAX_EDGE = 1600
export const KATWED_IMAGE_WEBP_QUALITY = 0.86

interface QuestionImageStorageClient {
  auth: {
    getUser(): PromiseLike<{
      data: { user: { id: string } | null }
      error: { message: string } | null
    }>
  }
  storage: {
    from(bucket: string): {
      remove(paths: string[]): PromiseLike<{ error: { message: string } | null }>
    }
  }
}

export interface QuestionImageCleanupResult {
  deletedMediaCount: number
  failedMediaCount: number
}

export interface DemoStoredImage {
  path: string
  publicUrl: string
  sizeBytes: number
  createdAt: null
}

export function isKatwedImageObjectPath(path: string): boolean {
  return KATWED_OBJECT_PATH.test(path)
}

export function getQuestionImageObjectPath(reference: string, supabaseUrl = config.supabaseUrl): string | null {
  if (!reference || !supabaseUrl) return null
  try {
    const url = new URL(reference)
    if (url.origin !== new URL(supabaseUrl).origin || !url.pathname.startsWith(PUBLIC_BUCKET_PATH)) return null
    const encodedPath = url.pathname.slice(PUBLIC_BUCKET_PATH.length)
    const path = encodedPath.split('/').map((segment) => decodeURIComponent(segment)).join('/')
    return isKatwedImageObjectPath(path) ? path : null
  } catch {
    return null
  }
}

export async function removeQuestionImages(
  references: readonly string[],
  client: QuestionImageStorageClient | null = supabase,
  supabaseUrl = config.supabaseUrl,
): Promise<QuestionImageCleanupResult> {
  const paths = [...new Set(references.flatMap((reference) => {
    const path = getQuestionImageObjectPath(reference, supabaseUrl)
    return path ? [path] : []
  }))]
  return removeStoredImagePaths(paths, client)
}

export async function removeStoredImagePaths(
  candidatePaths: readonly string[],
  client: QuestionImageStorageClient | null = supabase,
  batchSize = 100,
): Promise<QuestionImageCleanupResult> {
  const paths = [...new Set(candidatePaths)]
  if (!paths.length) return { deletedMediaCount: 0, failedMediaCount: 0 }
  if (!client) return { deletedMediaCount: 0, failedMediaCount: paths.length }
  try {
    const auth = await client.auth.getUser()
    if (auth.error || !auth.data.user) return { deletedMediaCount: 0, failedMediaCount: paths.length }
    const ownedPrefix = `${auth.data.user.id}/`
    const ownedPaths = paths.filter((path) => path.startsWith(ownedPrefix) && isKatwedImageObjectPath(path))
    const unownedCount = paths.length - ownedPaths.length
    if (!ownedPaths.length) return { deletedMediaCount: 0, failedMediaCount: unownedCount }
    let deletedMediaCount = 0
    let failedMediaCount = unownedCount
    const safeBatchSize = Math.max(1, Math.min(100, Math.floor(batchSize)))
    for (let index = 0; index < ownedPaths.length; index += safeBatchSize) {
      const batch = ownedPaths.slice(index, index + safeBatchSize)
      const { error } = await client.storage.from(BUCKET).remove(batch)
      if (error) failedMediaCount += batch.length
      else deletedMediaCount += batch.length
    }
    return { deletedMediaCount, failedMediaCount }
  } catch {
    return { deletedMediaCount: 0, failedMediaCount: paths.length }
  }
}

export async function prepareKatwedImage(file: File): Promise<Blob> {
  if (!allowedTypes.has(file.type)) throw new Error('Choose a JPEG, PNG or WebP image.')
  if (file.size > KATWED_IMAGE_MAX_UPLOAD_BYTES) throw new Error('Choose an image smaller than 8 MB.')
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, KATWED_IMAGE_MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This browser cannot prepare the image.')
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('The image could not be compressed.')),
      'image/webp',
      KATWED_IMAGE_WEBP_QUALITY,
    )
  })
}

function openDemoImageDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('katwed-demo-images', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('images')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error('Local image storage is unavailable.'))
  })
}

async function saveDemoImage(blob: Blob): Promise<string> {
  const key = crypto.randomUUID()
  const database = await openDemoImageDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction('images', 'readwrite')
    transaction.objectStore('images').put(blob, key)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(new Error('The demo image could not be saved.'))
  })
  database.close()
  return `demo-image://${key}`
}

async function readDemoImage(path: string): Promise<Blob | null> {
  const database = await openDemoImageDatabase()
  const key = path.replace('demo-image://', '')
  const blob = await new Promise<Blob | null>((resolve, reject) => {
    const request = database.transaction('images', 'readonly').objectStore('images').get(key)
    request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : null)
    request.onerror = () => reject(new Error('The demo image could not be loaded.'))
  })
  database.close()
  return blob
}

export async function listDemoStoredImages(): Promise<DemoStoredImage[]> {
  const database = await openDemoImageDatabase()
  const images = await new Promise<DemoStoredImage[]>((resolve, reject) => {
    const stored: DemoStoredImage[] = []
    const request = database.transaction('images', 'readonly').objectStore('images').openCursor()
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) {
        resolve(stored)
        return
      }
      if (typeof cursor.key === 'string' && cursor.value instanceof Blob) {
        const path = `demo-image://${cursor.key}`
        stored.push({ path, publicUrl: path, sizeBytes: cursor.value.size, createdAt: null })
      }
      cursor.continue()
    }
    request.onerror = () => reject(new Error('Local image storage could not be listed.'))
  })
  database.close()
  return images
}

export async function removeDemoStoredImages(paths: readonly string[]): Promise<QuestionImageCleanupResult> {
  const uniquePaths = [...new Set(paths)]
  const safePaths = uniquePaths.filter((path) => (
    /^demo-image:\/\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(path)
  ))
  const failedMediaCount = uniquePaths.length - safePaths.length
  if (!safePaths.length) return { deletedMediaCount: 0, failedMediaCount }
  try {
    const database = await openDemoImageDatabase()
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('images', 'readwrite')
      const store = transaction.objectStore('images')
      safePaths.forEach((path) => store.delete(path.slice('demo-image://'.length)))
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(new Error('Local images could not be removed.'))
    })
    database.close()
    return { deletedMediaCount: safePaths.length, failedMediaCount }
  } catch {
    return { deletedMediaCount: 0, failedMediaCount: failedMediaCount + safePaths.length }
  }
}

export function createKatwedImageObjectPath(
  userId: string,
  date = new Date(),
  imageId = crypto.randomUUID(),
): string {
  return `${userId}/${date.getUTCFullYear()}/${imageId}.webp`
}

export async function uploadKatwedImage(file: File): Promise<string> {
  const blob = await prepareKatwedImage(file)
  if (config.demoMode) return saveDemoImage(blob)
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('Sign in again before uploading an image.')
  const path = createKatwedImageObjectPath(auth.user.id)
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/webp',
    cacheControl: '31536000',
    upsert: false,
  })
  if (error) throw new Error('The image upload failed. Check the storage bucket configuration.')
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

export function uploadQuestionImage(file: File): Promise<string> {
  return uploadKatwedImage(file)
}

export function uploadQuizCover(file: File): Promise<string> {
  return uploadKatwedImage(file)
}

export async function resolveStoredImage(path: string): Promise<string> {
  if (!path.startsWith('demo-image://')) return path
  const blob = await readDemoImage(path)
  return blob ? URL.createObjectURL(blob) : ''
}

export const resolveQuestionImage = resolveStoredImage
