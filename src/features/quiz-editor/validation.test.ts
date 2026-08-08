import { describe, expect, it } from 'vitest'
import { mixedDemoQuiz, sampleQuiz } from '../../lib/demo/sampleData'
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

  it('validates Typed Answer length, meaning, limits and normalised uniqueness', () => {
    const typed = {
      ...base, type: 'typed-answer' as const, media: { type: 'none' as const },
      correctAnswer: 'Red Dwarf', acceptedAnswers: ['The Red Dwarf'],
    }
    expect(validateQuestion(typed, []).valid).toBe(true)
    expect(validateQuestion({ ...typed, correctAnswer: '---' }, []).messages)
      .toContain('Every typed answer must contain at least one letter or number.')
    expect(validateQuestion({ ...typed, acceptedAnswers: ['red-dwarf'] }, []).messages)
      .toContain('Typed answers must be different after ignoring capitals, spaces and punctuation.')
    expect(validateQuestion({ ...typed, acceptedAnswers: Array.from({ length: 20 }, (_, index) => `Answer ${index}`) }, []).messages)
      .toContain('Typed Answer supports one primary answer and up to 19 alternatives.')
    expect(validateQuestion({ ...typed, correctAnswer: 'A'.repeat(121) }, []).messages)
      .toContain('Typed answers must be 120 characters or fewer.')
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

  it('requires exactly two distinct named competitors and a valid assignment for every Head-to-Head question', () => {
    const headToHead: QuizSaveInput = {
      ...structuredClone(mixedDemoQuiz),
      quizType: 'head-to-head',
      headToHeadCompetitors: [
        { id: 'competitor-a', quizId: mixedDemoQuiz.id, displayName: 'Ross', displayOrder: 0 },
        { id: 'competitor-b', quizId: mixedDemoQuiz.id, displayName: 'Jess', displayOrder: 1 },
      ],
      questions: mixedDemoQuiz.questions.map((question, index) => ({
        ...structuredClone(question),
        assignedCompetitorId: index % 2 ? 'competitor-b' : 'competitor-a',
      })),
    }
    expect(validateQuizSave(headToHead)).toEqual([])
    expect(validateQuizSave({
      ...headToHead,
      headToHeadCompetitors: headToHead.headToHeadCompetitors.slice(0, 1),
    })).toContain('Head-to-Head quizzes need exactly two competitors.')
    expect(validateQuizSave({
      ...headToHead,
      headToHeadCompetitors: headToHead.headToHeadCompetitors.map((competitor) => ({
        ...competitor,
        displayName: ' same ',
      })),
    })).toContain('Head-to-Head competitor names must be different.')
    expect(validateQuizSave({
      ...headToHead,
      headToHeadCompetitors: headToHead.headToHeadCompetitors.map((competitor, index) => ({
        ...competitor,
        displayName: index === 0 ? '   ' : 'A'.repeat(31),
      })),
    })).toContain('Enter a name of 1-30 characters for both Head-to-Head competitors.')
    expect(validateQuizSave({
      ...headToHead,
      questions: headToHead.questions.map((question, index) => ({
        ...question,
        assignedCompetitorId: index === 0 ? null : question.assignedCompetitorId,
      })),
    })).toContain('Assign every question to a competitor.')
    expect(validateQuizSave({
      ...headToHead,
      questions: headToHead.questions.map((question, index) => ({
        ...question,
        assignedCompetitorId: index === 0 ? 'not-a-competitor' : question.assignedCompetitorId,
      })),
    })).toContain('Question 1 is assigned to an invalid competitor.')
  })

  it('keeps Standard definitions free of Head-to-Head competitors and assignments', () => {
    expect(validateQuizSave({
      ...sampleQuiz,
      headToHeadCompetitors: [
        { id: 'competitor-a', quizId: sampleQuiz.id, displayName: 'Ross', displayOrder: 0 },
      ],
      questions: sampleQuiz.questions.map((question) => ({ ...question, assignedCompetitorId: 'competitor-a' })),
    })).toEqual(expect.arrayContaining([
      'Standard quizzes cannot contain Head-to-Head competitors.',
      'Standard questions cannot be assigned to Head-to-Head competitors.',
    ]))
  })
})
