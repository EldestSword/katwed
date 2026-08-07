import { describe, expect, it } from 'vitest'
import { mixedDemoQuiz } from '../../lib/demo/sampleData'
import type { Quiz } from '../../types/domain'
import { createDuplicateQuizInput } from './duplicateQuiz'

function sequentialIds() {
  let next = 0
  return () => `00000000-0000-4000-8000-${String(++next).padStart(12, '0')}`
}

describe('createDuplicateQuizInput', () => {
  it('creates an independent, fully remapped save input for every current question type', () => {
    const source: Quiz = structuredClone(mixedDemoQuiz)
    source.title = 'Original'
    source.coverImagePath = 'https://media.example/shared-cover.webp'
    source.themeId = 'arcade'
    source.archivedAt = '2026-08-07T12:00:00.000Z'

    const single = source.questions.find((question) => question.type === 'single-choice')
    if (!single || single.type !== 'single-choice') throw new Error('Single-choice fixture missing')
    single.media = { type: 'youtube', videoId: 'dQw4w9WgXcQ', startSeconds: 12, endSeconds: 34 }
    single.mediaVisibility = 'presentation'
    single.presentationChoiceVisibility = 'after-lock'
    single.randomiseOptions = true
    single.options[0].imagePath = 'https://media.example/shared-choice.webp'
    single.options[0].imageAlt = 'Shared answer artwork'

    const multiple = source.questions.find((question) => question.type === 'multiple-select')
    if (!multiple || multiple.type !== 'multiple-select') throw new Error('Multiple-select fixture missing')
    multiple.scoringMode = 'partial-wipeout'
    multiple.randomiseOptions = true

    const sourceSnapshot = structuredClone(source)
    const input = createDuplicateQuizInput(source, sequentialIds())

    expect(input).toMatchObject({
      title: 'Original (Copy)',
      coverImagePath: 'https://media.example/shared-cover.webp',
      themeId: 'arcade',
    })
    expect(input.coverImagePath).toBe(source.coverImagePath)
    expect(input).not.toHaveProperty('id')
    expect(input).not.toHaveProperty('archivedAt')
    expect(source).toEqual(sourceSnapshot)
    expect(new Set(input.questions.map((question) => question.type))).toEqual(
      new Set(['single-choice', 'multiple-select', 'true-false', 'slider', 'pinpoint', 'mashup']),
    )

    const sourceMemberIds = new Set(source.roster.map((member) => member.id))
    const duplicateMemberIds = new Set(input.roster.map((member) => member.id))
    expect(duplicateMemberIds.size).toBe(source.roster.length)
    expect([...duplicateMemberIds].some((id) => sourceMemberIds.has(id))).toBe(false)

    const sourceQuestionIds = new Set(source.questions.map((question) => question.id))
    expect(input.questions).toHaveLength(source.questions.length)
    expect(input.questions.every((question) => !sourceQuestionIds.has(question.id))).toBe(true)
    input.questions.forEach((question, index) => {
      expect(question.media).toEqual(source.questions[index].media)
      expect(question.media).not.toBe(source.questions[index].media)
    })

    const copiedSingle = input.questions.find((question) => question.type === 'single-choice')
    if (!copiedSingle || copiedSingle.type !== 'single-choice') throw new Error('Copied single-choice question missing')
    const sourceSingleOptionIds = new Set(single.options.map((option) => option.id))
    expect(copiedSingle.options.every((option) => !sourceSingleOptionIds.has(option.id))).toBe(true)
    expect(copiedSingle.options.find((option) => option.label === 'Mars')?.id).toBe(copiedSingle.correctOptionId)
    expect(copiedSingle.options[0]).toMatchObject({
      imagePath: 'https://media.example/shared-choice.webp',
      imageAlt: 'Shared answer artwork',
    })
    expect(copiedSingle.media).toEqual(single.media)
    expect(copiedSingle).toMatchObject({
      mediaVisibility: 'presentation',
      presentationChoiceVisibility: 'after-lock',
      randomiseOptions: true,
    })

    const copiedMultiple = input.questions.find((question) => question.type === 'multiple-select')
    if (!copiedMultiple || copiedMultiple.type !== 'multiple-select') throw new Error('Copied multiple-select question missing')
    const sourceMultipleOptionIds = new Set(multiple.options.map((option) => option.id))
    expect(copiedMultiple.options.every((option) => !sourceMultipleOptionIds.has(option.id))).toBe(true)
    expect(copiedMultiple.correctOptionIds.map((id) =>
      copiedMultiple.options.find((option) => option.id === id)?.label,
    )).toEqual(['Red', 'Green', 'Blue'])
    expect(copiedMultiple).toMatchObject({
      minimumSelections: 3,
      maximumSelections: 3,
      scoringMode: 'partial-wipeout',
      randomiseOptions: true,
    })

    const sourceMashup = source.questions.find((question) => question.type === 'mashup')
    const copiedMashup = input.questions.find((question) => question.type === 'mashup')
    if (!sourceMashup || sourceMashup.type !== 'mashup' || !copiedMashup || copiedMashup.type !== 'mashup') {
      throw new Error('Mash-up fixture missing')
    }
    expect(copiedMashup.correctMemberIds.every((id) => duplicateMemberIds.has(id))).toBe(true)
    expect(copiedMashup.correctMemberIds.some((id) => sourceMemberIds.has(id))).toBe(false)
    expect(copiedMashup.correctMemberIds.map(
      (id) => input.roster.find((member) => member.id === id)?.displayName,
    )).toEqual(sourceMashup.correctMemberIds.map(
      (id) => source.roster.find((member) => member.id === id)?.displayName,
    ))
    expect(copiedMashup.media.path).toBe(sourceMashup.media.path)

    const sourceSlider = source.questions.find((question) => question.type === 'slider')
    const copiedSlider = input.questions.find((question) => question.type === 'slider')
    if (!sourceSlider || sourceSlider.type !== 'slider' || !copiedSlider || copiedSlider.type !== 'slider') {
      throw new Error('Slider fixture missing')
    }
    expect(copiedSlider).toMatchObject({
      minimum: sourceSlider.minimum,
      maximum: sourceSlider.maximum,
      step: sourceSlider.step,
      correctValue: sourceSlider.correctValue,
      tolerance: sourceSlider.tolerance,
      prefix: sourceSlider.prefix,
      suffix: sourceSlider.suffix,
      unitLabel: sourceSlider.unitLabel,
    })
    expect(copiedSlider?.id).not.toBe(sourceSlider?.id)

    const sourcePinpoint = source.questions.find((question) => question.type === 'pinpoint')
    const copiedPinpoint = input.questions.find((question) => question.type === 'pinpoint')
    if (!sourcePinpoint || sourcePinpoint.type !== 'pinpoint' || !copiedPinpoint || copiedPinpoint.type !== 'pinpoint') {
      throw new Error('Pinpoint fixture missing')
    }
    expect(copiedPinpoint).toMatchObject({
      targetX: sourcePinpoint.targetX,
      targetY: sourcePinpoint.targetY,
      targetRadius: sourcePinpoint.targetRadius,
    })
    expect(copiedPinpoint.media.path).toBe(sourcePinpoint.media.path)

    copiedSingle.options[0].label = 'Changed copy'
    expect(single.options[0].label).toBe('Mars')
  })

  it('retains the copy suffix within the existing title limit', () => {
    const source = { ...structuredClone(mixedDemoQuiz), title: 'A'.repeat(120) }
    const input = createDuplicateQuizInput(source, sequentialIds())

    expect(input.title).toHaveLength(120)
    expect(input.title).toBe(`${'A'.repeat(113)} (Copy)`)
  })
})
