import type { Quiz } from '../../types/domain'

export type StoredImageStatus = 'in-use' | 'unused' | 'protected'

export interface StoredImageInventoryObject {
  path: string
  publicUrl: string
  sizeBytes: number | null
  createdAt: string | null
}

export interface StoredImageObject extends StoredImageInventoryObject {
  status: StoredImageStatus
}

export interface StorageSummary {
  fileCount: number
  sizeBytes: number
  unknownSizeCount: number
}

export interface StorageReport {
  total: StorageSummary
  inUse: StorageSummary
  unused: StorageSummary
  protected: StorageSummary
  objects: StoredImageObject[]
}

export interface MediaPathClassification {
  referencedPaths: string[]
  unusedPaths: string[]
  ignoredPaths: string[]
}

export interface StorageCleanupResult {
  removedCount: number
  preservedCount: number
  failedCount: number
}

const statusOrder: Record<StoredImageStatus, number> = {
  unused: 0,
  'in-use': 1,
  protected: 2,
}

export function normaliseSizeBytes(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : null
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return 'Size unavailable'
  if (bytes < 1024) return `${Math.round(bytes)} ${Math.round(bytes) === 1 ? 'byte' : 'bytes'}`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 }).format(value)} ${units[unitIndex]}`
}

export function storageItemLabel(count: number, noun = 'image'): string {
  return `${count} ${count === 1 ? noun : `${noun}s`}`
}

export function cleanupButtonLabel(count: number): string {
  return `Clean up ${storageItemLabel(count, 'unused image')}`
}

export function summariseStorageObjects(objects: readonly StoredImageObject[]): StorageSummary {
  return objects.reduce<StorageSummary>((summary, object) => {
    summary.fileCount += 1
    if (object.sizeBytes === null) summary.unknownSizeCount += 1
    else summary.sizeBytes += object.sizeBytes
    return summary
  }, { fileCount: 0, sizeBytes: 0, unknownSizeCount: 0 })
}

export function buildStorageReport(
  inventory: readonly StoredImageInventoryObject[],
  classification: MediaPathClassification,
): StorageReport {
  const referenced = new Set(classification.referencedPaths)
  const unused = new Set(classification.unusedPaths)
  const objects = inventory.map<StoredImageObject>((object) => ({
    ...object,
    status: referenced.has(object.path) ? 'in-use' : unused.has(object.path) ? 'unused' : 'protected',
  })).sort((left, right) => (
    statusOrder[left.status] - statusOrder[right.status]
    || (right.createdAt ?? '').localeCompare(left.createdAt ?? '')
    || left.path.localeCompare(right.path, 'en-GB')
  ))
  return {
    total: summariseStorageObjects(objects),
    inUse: summariseStorageObjects(objects.filter((object) => object.status === 'in-use')),
    unused: summariseStorageObjects(objects.filter((object) => object.status === 'unused')),
    protected: summariseStorageObjects(objects.filter((object) => object.status === 'protected')),
    objects,
  }
}

export function collectQuizImageReferences(quizzes: readonly Quiz[]): Set<string> {
  const references = new Set<string>()
  for (const quiz of quizzes) {
    if (quiz.coverImagePath) references.add(quiz.coverImagePath)
    for (const question of quiz.questions) {
      if (question.media.type === 'image') references.add(question.media.path)
      if (question.type === 'single-choice' || question.type === 'multiple-select') {
        for (const option of question.options) {
          if (option.imagePath) references.add(option.imagePath)
        }
      }
    }
  }
  return references
}

export function classifyDemoInventory(
  inventory: readonly StoredImageInventoryObject[],
  references: ReadonlySet<string>,
): MediaPathClassification {
  const referencedPaths: string[] = []
  const unusedPaths: string[] = []
  const ignoredPaths: string[] = []
  for (const object of inventory) {
    if (!/^demo-image:\/\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(object.path)) {
      ignoredPaths.push(object.path)
    } else if (references.has(object.path)) {
      referencedPaths.push(object.path)
    } else {
      unusedPaths.push(object.path)
    }
  }
  return { referencedPaths, unusedPaths, ignoredPaths }
}

export function formatStorageDate(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}

export function cleanupResultMessage(result: StorageCleanupResult): string {
  const parts = [`${storageItemLabel(result.removedCount, 'image')} ${result.removedCount === 1 ? 'was' : 'were'} removed.`]
  if (result.preservedCount > 0) {
    parts.push(`${storageItemLabel(result.preservedCount, 'image')} had become in use and ${result.preservedCount === 1 ? 'was' : 'were'} kept.`)
  }
  if (result.failedCount > 0) {
    parts.push(`${storageItemLabel(result.failedCount, 'image')} could not be removed.`)
  }
  return parts.join(' ')
}
