import { describe, expect, it } from 'vitest'
import { sampleQuiz } from '../../lib/demo/sampleData'
import type { MashupQuestion } from '../../types/domain'
import type { QuizSaveInput } from '../../services/gameRepository'
import { validateQuestion, validateQuizSave } from './validation'

const base = sampleQuiz.questions[0] as MashupQuestion

describe('quiz validation', () => {
  it('accepts the valid seven-person demo quiz and empty people banks for general quizzes', () => {
    expect(validateQuizSave(sampleQuiz)).toEqual([])
  })

  it('rejects missing images, invalid mash-up pairs, inactive answers and timer bounds', () => {
    expect(validateQuestion({ ...base, media: { ...base.media, path: '' } }, sampleQuiz.roster).messages)
      .toContain('Add a question image.')
    expect(validateQuestion({ ...base, correctMemberIds: ['member-alex', 'member-alex'] }, sampleQuiz.roster).messages)
      .toContain('Choose exactly two different correct people.')
    expect(validateQuestion(base, sampleQuiz.roster.map((member) => member.id === 'member-bailey' ? { ...member, active: false } : member)).messages)
      .toContain('Both correct people must be active.')
    expect(validateQuestion({ ...base, timeLimitSeconds: 4 }, sampleQuiz.roster).valid).toBe(false)
  })

  it('validates slider ranges and multiple-select limits', () => {
    const slider = {
      ...base,
      type: 'slider' as const,
      media: { type: 'none' as const },
      minimum: 10, maximum: 5, step: 1, correctValue: 7, tolerance: -1,
      prefix: '', suffix: '', unitLabel: '',
    }
    expect(validateQuestion(slider, []).valid).toBe(false)
  })

  it('accepts Theme default and compatible backgrounds but rejects unknown or wrong-theme values', () => {
    expect(validateQuizSave({ ...sampleQuiz, themeId: 'arcade', backgroundId: null })).toEqual([])
    expect(validateQuizSave({ ...sampleQuiz, themeId: 'arcade', backgroundId: 'arcade-grid' })).toEqual([])
    expect(validateQuizSave({
      ...sampleQuiz,
      backgroundId: 'future-background',
    } as unknown as QuizSaveInput)).toContain('Choose a supported quiz background.')
    expect(validateQuizSave({
      ...sampleQuiz,
      themeId: 'paper',
      backgroundId: 'arcade-grid',
    })).toContain('Choose a background that belongs to the selected quiz theme.')
  })
})
