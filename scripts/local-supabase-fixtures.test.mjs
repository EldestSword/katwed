import { describe, expect, it } from 'vitest'
import { headToHeadQuizInput, standardQuizInput } from './local-supabase-fixtures.mjs'

describe('local Supabase synthetic fixtures', () => {
  it('builds a disposable Standard True/False quiz with UUID identifiers', () => {
    const quiz = standardQuizInput('unit')
    expect(quiz).toMatchObject({ quizType: 'standard', headToHeadCompetitors: [], soundPackId: 'none' })
    expect(quiz.questions).toHaveLength(2)
    expect(quiz.questions[0]).toMatchObject({ type: 'true-false', correctValue: true, assignedCompetitorId: null })
    expect(quiz.questions[0].id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('builds exactly two Head-to-Head competitors with assigned questions', () => {
    const quiz = headToHeadQuizInput('unit')
    expect(quiz.headToHeadCompetitors).toHaveLength(2)
    expect(quiz.questions).toHaveLength(2)
    expect(new Set(quiz.questions.map(({ assignedCompetitorId }) => assignedCompetitorId)))
      .toEqual(new Set(quiz.headToHeadCompetitors.map(({ id }) => id)))
  })
})
