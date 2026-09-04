import { describe, expect, it } from 'vitest'
import { mixedDemoQuiz } from '../../lib/demo/sampleData'
import type { Question } from '../../types/domain'
import {
  createGameSessionSettings,
  createSessionQuestionOrder,
  orderedSessionQuestions,
  questionPreludeKind,
  quizUsesMixedQuestionTypes,
  normaliseLaunchGameSettings,
} from './launchSettings'

describe('game-session launch settings', () => {
  it('defaults private live-answer visibility on and preserves an explicit opt-out', () => {
    expect(createGameSessionSettings(undefined, mixedDemoQuiz, 'default').showPlayerAnswersToHost).toBe(true)
    expect(createGameSessionSettings({ showPlayerAnswersToHost: false }, mixedDemoQuiz, 'hidden').showPlayerAnswersToHost).toBe(false)
  })

  it('enables type intros only for quizzes containing two or more question types', () => {
    const typedQuestions = mixedDemoQuiz.questions.slice(0, 3).map((question, index) => ({
      ...question,
      id: `typed-${index}`,
      type: 'typed-answer' as const,
      correctAnswer: 'Answer',
      acceptedAnswers: [],
    })) as Question[]
    expect(quizUsesMixedQuestionTypes(typedQuestions)).toBe(false)
    expect(quizUsesMixedQuestionTypes(mixedDemoQuiz.questions)).toBe(true)

    const single = createGameSessionSettings(undefined, { ...mixedDemoQuiz, questions: typedQuestions }, 'single')
    const mixed = createGameSessionSettings(undefined, mixedDemoQuiz, 'mixed')
    expect(single.questionTypeIntrosEnabled).toBe(false)
    expect(mixed.questionTypeIntrosEnabled).toBe(true)
    expect(questionPreludeKind(typedQuestions[0], single)).toBeNull()
    expect(questionPreludeKind(mixedDemoQuiz.questions[0], mixed)).toBe('question-type')
  })

  it('lets Double Score replace rather than stack with the mixed-format intro', () => {
    const settings = createGameSessionSettings(undefined, mixedDemoQuiz, 'session')
    expect(questionPreludeKind({ doubleScore: true }, settings)).toBe('double-score')
  })

  it('enables automatic winner tie-breakers only for supported new sessions', () => {
    expect(createGameSessionSettings(undefined, mixedDemoQuiz, 'new').automaticTieBreakersEnabled).toBe(true)
    expect(normaliseLaunchGameSettings({ playMode: 'teams', automaticTieBreakersEnabled: true }, mixedDemoQuiz).automaticTieBreakersEnabled).toBe(false)
    expect(normaliseLaunchGameSettings({ automaticTieBreakersEnabled: true }, { ...mixedDemoQuiz, quizType: 'head-to-head' }).automaticTieBreakersEnabled).toBe(false)
    expect(createGameSessionSettings({ automaticTieBreakersEnabled: false }, mixedDemoQuiz, 'legacy').automaticTieBreakersEnabled).toBe(false)
  })

  it('copies the selected production pack Double Score durations into the session settings', () => {
    const settings = createGameSessionSettings({ soundPackId: 'hard-rock' }, mixedDemoQuiz, 'session')
    expect(settings.soundPackId).toBe('hard-rock')
    expect(settings.doubleScoreVariantDurationsMs).toEqual([7200, 5600])
  })

  it('creates one complete stable question order without changing authored display order', () => {
    const original = mixedDemoQuiz.questions.map((question) => [question.id, question.displayOrder])
    const order = createSessionQuestionOrder(mixedDemoQuiz.questions, true, 'session-a')
    const refreshed = createSessionQuestionOrder(mixedDemoQuiz.questions, true, 'session-a')
    expect(refreshed).toEqual(order)
    expect(new Set(order)).toEqual(new Set(mixedDemoQuiz.questions.map((question) => question.id)))
    expect(order).toHaveLength(mixedDemoQuiz.questions.length)
    expect(orderedSessionQuestions(mixedDemoQuiz.questions, order).map((question) => question.id)).toEqual(order)
    expect(mixedDemoQuiz.questions.map((question) => [question.id, question.displayOrder])).toEqual(original)
  })
})
