import { describe, expect, it } from 'vitest'
import { sampleQuiz } from '../../lib/demo/sampleData'
import { validateQuestion, validateQuizSave } from './validation'

describe('quiz validation', () => {
  it('accepts the valid seven-person demo quiz and rosters larger than seven', () => {
    expect(validateQuizSave(sampleQuiz)).toEqual([])
    expect(validateQuizSave({
      ...sampleQuiz,
      roster: [
        ...sampleQuiz.roster,
        {
          id: 'member-eight',
          quizId: sampleQuiz.id,
          displayName: 'Harper',
          shortName: 'Harper',
          active: true,
          displayOrder: 7,
        },
      ],
    })).toEqual([])
  })

  it('rejects missing images, invalid pairs, inactive answers and timer bounds', () => {
    const base = sampleQuiz.questions[0]
    expect(validateQuestion({ ...base, imagePath: '' }, sampleQuiz.roster).messages)
      .toContain('Add a question image.')
    expect(validateQuestion(
      { ...base, correctMemberIds: ['member-alex', 'member-alex'] },
      sampleQuiz.roster,
    ).messages).toContain('Choose exactly two different correct people.')
    expect(validateQuestion(
      { ...base, correctMemberIds: ['member-alex', 'member-bailey'] },
      sampleQuiz.roster.map((member) => member.id === 'member-bailey' ? { ...member, active: false } : member),
    ).messages).toContain('Both correct people must be active.')
    expect(validateQuestion({ ...base, timeLimitSeconds: 4 }, sampleQuiz.roster).valid).toBe(false)
    expect(validateQuestion({ ...base, timeLimitSeconds: 181 }, sampleQuiz.roster).valid).toBe(false)
  })

  it('rejects empty, duplicate and overlong roster names', () => {
    expect(validateQuizSave({
      ...sampleQuiz,
      roster: sampleQuiz.roster.map((member, index) =>
        index === 0 ? { ...member, displayName: '' } : member),
    })).toContain('Every roster member needs a display name of 1–60 characters.')
    expect(validateQuizSave({
      ...sampleQuiz,
      roster: sampleQuiz.roster.map((member, index) =>
        index === 1 ? { ...member, displayName: 'aLeX' } : member),
    })).toContain('Roster names must be unique.')
    expect(validateQuizSave({
      ...sampleQuiz,
      roster: sampleQuiz.roster.map((member, index) =>
        index === 0 ? { ...member, displayName: 'A'.repeat(61) } : member),
    })).toContain('Every roster member needs a display name of 1–60 characters.')
  })
})
