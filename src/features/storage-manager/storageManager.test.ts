import { describe, expect, it } from 'vitest'
import { sampleQuiz } from '../../lib/demo/sampleData'
import {
  buildStorageReport,
  classifyDemoInventory,
  cleanupButtonLabel,
  cleanupResultMessage,
  collectQuizImageReferences,
  formatBytes,
  formatStorageDate,
  normaliseSizeBytes,
  type StoredImageInventoryObject,
} from './storageManager'

const inUsePath = 'demo-image://123e4567-e89b-42d3-a456-426614174000'
const unusedPath = 'demo-image://223e4567-e89b-42d3-a456-426614174000'
const protectedPath = 'demo-image://legacy-file'

const inventory: StoredImageInventoryObject[] = [
  { path: protectedPath, publicUrl: protectedPath, sizeBytes: null, createdAt: null },
  { path: inUsePath, publicUrl: inUsePath, sizeBytes: 1024, createdAt: '2026-08-06T12:00:00.000Z' },
  { path: unusedPath, publicUrl: unusedPath, sizeBytes: 1536, createdAt: '2026-08-07T12:00:00.000Z' },
]

describe('Storage Manager helpers', () => {
  it('formats bytes with safe British-readable units and rejects invalid values', () => {
    expect(formatBytes(0)).toBe('0 bytes')
    expect(formatBytes(1)).toBe('1 byte')
    expect(formatBytes(824 * 1024)).toBe('824 KB')
    expect(formatBytes(18.6 * 1024 * 1024)).toBe('18.6 MB')
    expect(formatBytes(Number.NaN)).toBe('Size unavailable')
    expect(normaliseSizeBytes(123.7)).toBe(124)
    expect(normaliseSizeBytes(-1)).toBeNull()
    expect(normaliseSizeBytes('123')).toBeNull()
  })

  it('aggregates total, in-use, unused and protected files without mutating inventory', () => {
    const before = structuredClone(inventory)
    const report = buildStorageReport(inventory, {
      referencedPaths: [inUsePath],
      unusedPaths: [unusedPath],
      ignoredPaths: [protectedPath],
    })

    expect(report.total).toEqual({ fileCount: 3, sizeBytes: 2560, unknownSizeCount: 1 })
    expect(report.inUse).toEqual({ fileCount: 1, sizeBytes: 1024, unknownSizeCount: 0 })
    expect(report.unused).toEqual({ fileCount: 1, sizeBytes: 1536, unknownSizeCount: 0 })
    expect(report.protected).toEqual({ fileCount: 1, sizeBytes: 0, unknownSizeCount: 1 })
    expect(report.objects.map((object) => object.path)).toEqual([unusedPath, inUsePath, protectedPath])
    expect(inventory).toEqual(before)
  })

  it('classifies Demo blobs from all quiz media locations and protects unmanaged keys', () => {
    const quiz = structuredClone(sampleQuiz)
    quiz.coverImagePath = inUsePath
    const optionPath = 'demo-image://323e4567-e89b-42d3-a456-426614174000'
    quiz.questions = [{
      ...quiz.questions[0],
      type: 'single-choice',
      media: { type: 'image', path: inUsePath, altText: '', revealEffect: 'immediate', revealDurationSeconds: 0 },
      options: [{ id: 'option', label: 'Option', imagePath: optionPath }],
      correctOptionId: 'option',
      randomiseOptions: false,
    }]
    const objects = [
      ...inventory,
      { path: optionPath, publicUrl: optionPath, sizeBytes: 200, createdAt: null },
    ]
    const classification = classifyDemoInventory(objects, collectQuizImageReferences([quiz]))

    expect(classification.referencedPaths).toEqual([inUsePath, optionPath])
    expect(classification.unusedPaths).toEqual([unusedPath])
    expect(classification.ignoredPaths).toEqual([protectedPath])
  })

  it('uses deterministic grammar, cleanup result wording and safe British dates', () => {
    expect(cleanupButtonLabel(1)).toBe('Clean up 1 unused image')
    expect(cleanupButtonLabel(6)).toBe('Clean up 6 unused images')
    expect(cleanupResultMessage({ removedCount: 4, preservedCount: 1, failedCount: 1 })).toBe(
      '4 images were removed. 1 image had become in use and was kept. 1 image could not be removed.',
    )
    expect(formatStorageDate('2026-08-07T12:00:00.000Z')).toBe('7 Aug 2026')
    expect(formatStorageDate('not-a-date')).toBeNull()
  })
})
