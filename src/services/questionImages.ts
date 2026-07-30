import { config } from '../lib/config'
import { supabase } from '../lib/supabase/client'

const BUCKET = 'question-images'
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const maxUploadBytes = 8 * 1024 * 1024

async function resizeImage(file: File): Promise<Blob> {
  if (!allowedTypes.has(file.type)) throw new Error('Choose a JPEG, PNG or WebP image.')
  if (file.size > maxUploadBytes) throw new Error('Choose an image smaller than 8 MB.')
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
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
      0.86,
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

export async function uploadQuestionImage(file: File): Promise<string> {
  const blob = await resizeImage(file)
  if (config.demoMode) return saveDemoImage(blob)
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('Sign in again before uploading an image.')
  const path = `${auth.user.id}/${new Date().getUTCFullYear()}/${crypto.randomUUID()}.webp`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/webp',
    cacheControl: '31536000',
    upsert: false,
  })
  if (error) throw new Error('The image upload failed. Check the storage bucket configuration.')
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

export async function resolveQuestionImage(path: string): Promise<string> {
  if (!path.startsWith('demo-image://')) return path
  const blob = await readDemoImage(path)
  return blob ? URL.createObjectURL(blob) : ''
}
