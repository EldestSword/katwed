import { describe, expect, it } from 'vitest'
import { mixedDemoQuiz } from '../../lib/demo/sampleData'
import { createHeadToHeadCompetitors, nextHeadToHeadAssignment, normaliseQuizHeadToHead } from './headToHead'

describe('Head-to-Head quiz helpers', () => {
  it('normalises older and unknown quiz types to a clean Standard definition', () => {
    const older = structuredClone(mixedDemoQuiz) as unknown as Record<string, unknown>
    delete older.quizType
    delete older.headToHeadCompetitors
    const questions = older.questions as Array<Record<string, unknown>>
    delete questions[0].assignedCompetitorId
    questions[1].assignedCompetitorId = 'stale-competitor'
    delete questions[0].speedScoringEnabled
    delete questions[0].doubleScore

    const normalised = normaliseQuizHeadToHead(older as unknown as typeof mixedDemoQuiz)

    expect(normalised.quizType).toBe('standard')
    expect(normalised.headToHeadCompetitors).toEqual([])
    expect(normalised.questions.every((question) => question.assignedCompetitorId === null)).toBe(true)
    expect(normalised.questions[0]).toMatchObject({ speedScoringEnabled: false, doubleScore: false })
    expect(normaliseQuizHeadToHead({ ...normalised, quizType: 'future' } as unknown as typeof mixedDemoQuiz).quizType)
      .toBe('standard')
  })

  it('forces malformed Standard scoring metadata off for Head-to-Head', () => {
    const headToHead = {
      ...structuredClone(mixedDemoQuiz),
      quizType: 'head-to-head' as const,
      questions: mixedDemoQuiz.questions.map((question) => ({
        ...structuredClone(question), speedScoringEnabled: true, doubleScore: true,
      })),
    }
    const normalised = normaliseQuizHeadToHead(headToHead)
    expect(normalised.questions.every((question) =>
      question.speedScoringEnabled === false && question.doubleScore === false
    )).toBe(true)
  })

  it('creates two stable ordered competitors and alternates only from a valid latest assignment', () => {
    const ids = ['competitor-a', 'competitor-b']
    const competitors = createHeadToHeadCompetitors('quiz-h2h', () => ids.shift()!)
    expect(competitors).toEqual([
      { id: 'competitor-a', quizId: 'quiz-h2h', displayName: '', displayOrder: 0 },
      { id: 'competitor-b', quizId: 'quiz-h2h', displayName: '', displayOrder: 1 },
    ])

    const quiz = {
      ...structuredClone(mixedDemoQuiz),
      quizType: 'head-to-head' as const,
      headToHeadCompetitors: competitors,
      questions: [{ ...structuredClone(mixedDemoQuiz.questions[0]), assignedCompetitorId: 'competitor-a' as string | null }],
    }
    expect(nextHeadToHeadAssignment(quiz)).toBe('competitor-b')
    quiz.questions[0].assignedCompetitorId = null
    expect(nextHeadToHeadAssignment(quiz)).toBeNull()
  })
})
