import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as QuestionImages from '../../services/questionImages'

const demoImageMocks = vi.hoisted(() => ({
  listDemoStoredImages: vi.fn(),
  removeDemoStoredImages: vi.fn(),
}))

vi.mock('../../services/questionImages', async () => ({
  ...await vi.importActual<typeof QuestionImages>('../../services/questionImages'),
  listDemoStoredImages: demoImageMocks.listDemoStoredImages,
  removeDemoStoredImages: demoImageMocks.removeDemoStoredImages,
}))

import { DemoGameRepository } from './DemoGameRepository'
import type { PlayerAnswerPayload, Question, Quiz } from '../../types/domain'
import { headToHeadDemoQuiz, mixedDemoQuiz } from './sampleData'
import { exportQuizToPortable, parseKatwedQuizJson } from '../../features/quiz-transfer/katwedQuizFormat'

function correctAnswer(question: Question): PlayerAnswerPayload {
  switch (question.type) {
    case 'ordering': return { type: question.type, itemIds: question.correctItemIds }
    case 'matching': return { type: question.type, pairs: question.correctPairs }
    case 'single-choice': return { type: question.type, optionId: question.correctOptionId }
    case 'multiple-select': return { type: question.type, optionIds: [...question.correctOptionIds] }
    case 'true-false': return { type: question.type, value: question.correctValue }
    case 'slider': return { type: question.type, value: question.correctValue }
    case 'pinpoint': {
      if (question.target?.kind !== 'circle') throw new Error('Expected the demo circle')
      return { type: question.type, x: question.target.x, y: question.target.y }
    }
    case 'connections':
    case 'typed-answer': return { type: question.type, value: question.correctAnswer }
    case 'mashup': return { type: question.type, memberIds: question.correctMemberIds }
  }
}

function saveHeadToHeadFixture(repository: DemoGameRepository) {
  return repository.saveQuiz({
    title: headToHeadDemoQuiz.title,
    quizType: headToHeadDemoQuiz.quizType,
    headToHeadCompetitors: headToHeadDemoQuiz.headToHeadCompetitors,
    coverImagePath: headToHeadDemoQuiz.coverImagePath,
    themeId: headToHeadDemoQuiz.themeId,
    backgroundId: headToHeadDemoQuiz.backgroundId,
    roster: headToHeadDemoQuiz.roster,
    questions: headToHeadDemoQuiz.questions,
  })
}

async function reachQuestionOpening(repository: DemoGameRepository, sessionId: string) {
  const openedAt = (await repository.getHostSession(sessionId))?.session.questionOpenedAt
  if (openedAt) vi.setSystemTime(new Date(openedAt))
}

describe('DemoGameRepository multi-format game state', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-27T12:00:00.000Z'))
    localStorage.clear()
    vi.clearAllMocks()
    demoImageMocks.listDemoStoredImages.mockResolvedValue([])
    demoImageMocks.removeDemoStoredImages.mockImplementation(async (paths: string[]) => ({
      deletedMediaCount: paths.length,
      failedMediaCount: 0,
    }))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses authoritative Demo timing for fixed and speed-scored Standard answers', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-09T12:00:00.000Z'))
    const repository = new DemoGameRepository()
    const source = (await repository.getQuiz('quiz-mixed'))!
    const baseQuestion = source.questions[0]
    const saved = await repository.saveQuiz({
      id: source.id,
      title: source.title,
      quizType: 'standard',
      headToHeadCompetitors: [],
      coverImagePath: source.coverImagePath,
      themeId: source.themeId,
      backgroundId: source.backgroundId,
      roster: source.roster,
      questions: [{ ...baseQuestion, timeLimitSeconds: 20, speedScoringEnabled: true, doubleScore: false }],
    })
    const session = await repository.launchGame(saved.id)
    const joined = await repository.joinRoom(session.roomCode, 'Speed Player')
    await repository.changePhase(session.id, 'start')
    vi.setSystemTime(new Date('2026-08-09T12:00:10.000Z'))
    await repository.submitAnswer(
      session.roomCode,
      joined.player.id,
      joined.reconnectToken,
      correctAnswer(baseQuestion),
    )
    expect((await repository.getHostSession(session.id))?.session.answers[0]).toMatchObject({
      responseTimeMs: 10_000,
      pointsAwarded: 750,
      correct: true,
    })
  })

  it('protects the Double Score intro and gives the question its full duration', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-09T12:00:00.000Z'))
    const repository = new DemoGameRepository()
    const source = (await repository.getQuiz('quiz-mixed'))!
    const question = { ...source.questions[0], timeLimitSeconds: 20, speedScoringEnabled: true, doubleScore: true }
    const saved = await repository.saveQuiz({
      id: source.id,
      title: source.title,
      quizType: 'standard',
      headToHeadCompetitors: [],
      coverImagePath: source.coverImagePath,
      themeId: source.themeId,
      backgroundId: source.backgroundId,
      roster: source.roster,
      questions: [question],
    })
    const session = await repository.launchGame(saved.id)
    const joined = await repository.joinRoom(session.roomCode, 'Double Player')
    await repository.changePhase(session.id, 'start')
    const opened = (await repository.getHostSession(session.id))!.session
    expect(opened.questionOpenedAt).toBe('2026-08-09T12:00:05.000Z')
    expect(opened.questionClosesAt).toBe('2026-08-09T12:00:25.000Z')
    await expect(repository.submitAnswer(
      session.roomCode, joined.player.id, joined.reconnectToken, correctAnswer(question),
    )).rejects.toThrow('Wait for the question to open.')
    await expect(repository.changePhase(session.id, 'lock')).rejects.toThrow('Wait for the Double Score intro to finish.')

    vi.setSystemTime(new Date('2026-08-09T12:00:05.000Z'))
    await repository.submitAnswer(
      session.roomCode, joined.player.id, joined.reconnectToken, correctAnswer(question),
    )
    expect((await repository.getHostSession(session.id))?.session.answers[0]).toMatchObject({
      responseTimeMs: 0,
      pointsAwarded: 2000,
    })
  })

  it('persists and consumes the selected pack Double Score variants authoritatively', async () => {
    const repository = new DemoGameRepository()
    const source = (await repository.getQuiz('quiz-mixed'))!
    const questions = source.questions.slice(0, 2).map((question, displayOrder) => ({
      ...question, displayOrder, doubleScore: true, timeLimitSeconds: 20,
    }))
    const quiz = await repository.saveQuiz({
      id: source.id, title: source.title, quizType: 'standard', headToHeadCompetitors: [],
      coverImagePath: source.coverImagePath, themeId: source.themeId, backgroundId: source.backgroundId,
      roster: source.roster, questions,
    })
    const session = await repository.launchGame(quiz.id, {
      soundPackId: 'hard-rock', shuffleQuestionOrder: false, shuffleAnswerOptions: false,
      autoLockWhenAllAnswered: true, showPlayerAnswersToHost: true,
    })

    await repository.changePhase(session.id, 'start')
    const first = (await repository.getHostSession(session.id))!.session
    const firstDuration = new Date(first.questionOpenedAt!).getTime() - Date.now()
    expect([5600, 7200]).toContain(firstDuration)
    expect(first.settings.doubleScoreVariantDurationsMs).toEqual([7200, 5600])
    expect((await repository.getSafeGameState(session.roomCode))?.doubleScoreVariantIndex)
      .toBe(first.currentDoubleScoreVariantIndex)

    vi.setSystemTime(new Date(first.questionOpenedAt!))
    await repository.changePhase(session.id, 'lock')
    await repository.changePhase(session.id, 'reveal')
    await repository.changePhase(session.id, 'leaderboard')
    const secondTransition = Date.now()
    await repository.changePhase(session.id, 'next')
    const second = (await repository.getHostSession(session.id))!.session
    const secondDuration = new Date(second.questionOpenedAt!).getTime() - secondTransition
    expect([5600, 7200]).toContain(secondDuration)
    expect(secondDuration).not.toBe(firstDuration)
    expect(second.currentDoubleScoreVariantIndex).not.toBe(first.currentDoubleScoreVariantIndex)
    expect((await repository.getSafeGameState(session.roomCode))?.doubleScoreVariantIndex)
      .toBe(second.currentDoubleScoreVariantIndex)
    expect(new Date(second.questionClosesAt!).getTime() - new Date(second.questionOpenedAt!).getTime()).toBe(20_000)
  })

  it.each([
    ['fixed scoring', false, false, 1000],
    ['Double Score', true, false, 2000],
    ['Speed Scoring', false, true, 750],
    ['Double Score with Speed Scoring', true, true, 1500],
  ])('applies and undoes a Typed Answer host override with %s', async (_label, doubleScore, speedScoringEnabled, expectedPoints) => {
    vi.setSystemTime(new Date('2026-08-27T12:00:00.000Z'))
    const repository = new DemoGameRepository()
    const source = (await repository.getQuiz('quiz-mixed'))!
    const typed = source.questions.find((question) => question.type === 'typed-answer')!
    const question = {
      ...typed,
      correctAnswer: 'House of the Rising Sun',
      acceptedAnswers: ['The House of the Rising Sun'],
      timeLimitSeconds: 20,
      points: 1000,
      doubleScore,
      speedScoringEnabled,
      displayOrder: 0,
    }
    const quiz = await repository.saveQuiz({
      id: source.id, title: source.title, quizType: 'standard', headToHeadCompetitors: [],
      coverImagePath: source.coverImagePath, themeId: source.themeId, backgroundId: source.backgroundId,
      roster: source.roster, questions: [question],
    })
    const session = await repository.launchGame(quiz.id)
    const joined = await repository.joinRoom(session.roomCode, 'Roger')
    await repository.changePhase(session.id, 'start')
    const openedAt = new Date((await repository.getHostSession(session.id))!.session.questionOpenedAt!).getTime()
    vi.setSystemTime(openedAt + 10_000)
    await repository.submitAnswer(session.roomCode, joined.player.id, joined.reconnectToken, {
      type: 'typed-answer', value: 'House Rising Sun',
    })
    await repository.changePhase(session.id, 'lock')
    let bundle = (await repository.getHostSession(session.id))!
    const answer = bundle.session.answers[0]
    expect(answer).toMatchObject({ automaticCorrect: false, hostCorrectOverride: null, correct: false, pointsAwarded: 0, responseTimeMs: 10_000 })

    await repository.setTypedAnswerOverride(session.id, answer.id, true)
    await repository.setTypedAnswerOverride(session.id, answer.id, true)
    bundle = (await repository.getHostSession(session.id))!
    expect(bundle.session.answers[0]).toMatchObject({
      automaticCorrect: false, hostCorrectOverride: true, correct: true, pointsAwarded: expectedPoints,
    })
    expect(bundle.session.players[0]).toMatchObject({
      totalScore: expectedPoints, correctAnswerCount: 1, totalCorrectResponseMs: 10_000,
    })

    await repository.changePhase(session.id, 'reveal')
    const acceptedReveal = await repository.getSafeGameState(session.roomCode)
    expect(acceptedReveal?.reveal).toMatchObject({
      type: 'typed-answer', correctAnswer: 'House of the Rising Sun', correctPlayerIds: [joined.player.id],
    })
    expect(JSON.stringify(acceptedReveal)).not.toContain('The House of the Rising Sun')

    await repository.setTypedAnswerOverride(session.id, answer.id, null)
    bundle = (await repository.getHostSession(session.id))!
    expect(bundle.session.answers[0]).toMatchObject({
      automaticCorrect: false, hostCorrectOverride: null, correct: false, pointsAwarded: 0,
    })
    expect(bundle.session.players[0]).toMatchObject({
      totalScore: 0, correctAnswerCount: 0, totalCorrectResponseMs: 0,
    })
    expect((await repository.getSafeGameState(session.roomCode))?.reveal).toMatchObject({ correctPlayerIds: [] })
  })

  it('preserves an accepted Typed Answer alternative as an automatic correct judgement', async () => {
    const repository = new DemoGameRepository()
    const source = (await repository.getQuiz('quiz-mixed'))!
    const typed = source.questions.find((question) => question.type === 'typed-answer')!
    const quiz = await repository.saveQuiz({
      id: source.id, title: source.title, quizType: 'standard', headToHeadCompetitors: [],
      coverImagePath: source.coverImagePath, themeId: source.themeId, backgroundId: source.backgroundId,
      roster: source.roster, questions: [{ ...typed, displayOrder: 0 }],
    })
    const session = await repository.launchGame(quiz.id)
    const joined = await repository.joinRoom(session.roomCode, 'Alternative')
    await repository.changePhase(session.id, 'start')
    await repository.submitAnswer(session.roomCode, joined.player.id, joined.reconnectToken, {
      type: 'typed-answer', value: typed.acceptedAnswers[0],
    })
    expect((await repository.getHostSession(session.id))?.session.answers[0]).toMatchObject({
      automaticCorrect: true, hostCorrectOverride: null, correct: true, pointsAwarded: 1000,
    })
  })

  it('provides both the preserved mash-up quiz and a mixed quiz', async () => {
    const repository = new DemoGameRepository()
    const quizzes = await repository.listQuizzes()
    expect(quizzes.map((quiz) => quiz.id)).toEqual(['quiz-demo', 'quiz-mixed'])
    expect(new Set(quizzes[1].questions.map((question) => question.type))).toEqual(
      new Set(['single-choice', 'multiple-select', 'true-false', 'slider', 'pinpoint', 'typed-answer', 'mashup']),
    )
  })

  it('imports a Standard all-seven-format definition as a fresh Active quiz and persists it across reload', async () => {
    const repository = new DemoGameRepository()
    const parsed = parseKatwedQuizJson(JSON.stringify(exportQuizToPortable(mixedDemoQuiz)))
    const imported = await repository.saveQuiz(parsed.input)
    const reloaded = await new DemoGameRepository().getQuiz(imported.id)

    expect(imported.id).not.toBe(mixedDemoQuiz.id)
    expect(imported.archivedAt).toBeNull()
    expect(imported.questions.map((question) => question.type)).toEqual(mixedDemoQuiz.questions.map((question) => question.type))
    expect(imported.questions.every((question) => !mixedDemoQuiz.questions.some((source) => source.id === question.id))).toBe(true)
    expect(imported.roster.every((member) => !mixedDemoQuiz.roster.some((source) => source.id === member.id))).toBe(true)
    expect(reloaded).toEqual(imported)
    expect(await repository.getActiveSessionForQuiz(imported.id)).toBeNull()
  })

  it('persists custom answer palettes through save, safe state and reload', async () => {
    const repository = new DemoGameRepository()
    const source = (await repository.getQuiz('quiz-mixed'))!
    const customAnswerColours = [
      '#102030', '#203040', '#304050', '#405060',
      '#506070', '#607080', '#708090', '#8090A0',
    ] as const
    const saved = await repository.saveQuiz({
      id: source.id,
      title: source.title,
      quizType: source.quizType,
      headToHeadCompetitors: source.headToHeadCompetitors,
      coverImagePath: source.coverImagePath,
      themeId: source.themeId,
      backgroundId: source.backgroundId,
      answerPaletteId: 'custom',
      customAnswerColours,
      roster: source.roster,
      questions: source.questions,
    })
    const session = await repository.launchGame(saved.id)

    expect(await new DemoGameRepository().getQuiz(saved.id)).toMatchObject({
      answerPaletteId: 'custom', customAnswerColours,
    })
    expect(await repository.getSafeGameState(session.roomCode)).toMatchObject({
      answerPaletteId: 'custom', customAnswerColours,
    })
  })

  it('persists the selected sound pack through save, safe state and reload', async () => {
    const repository = new DemoGameRepository()
    const source = (await repository.getQuiz('quiz-mixed'))!
    const saved = await repository.saveQuiz({
      id: source.id,
      title: source.title,
      quizType: source.quizType,
      headToHeadCompetitors: source.headToHeadCompetitors,
      coverImagePath: source.coverImagePath,
      themeId: source.themeId,
      backgroundId: source.backgroundId,
      soundPackId: 'none',
      roster: source.roster,
      questions: source.questions,
    })
    const session = await repository.launchGame(saved.id)
    expect((await new DemoGameRepository().getQuiz(saved.id))?.soundPackId).toBe('none')
    expect((await repository.getSafeGameState(session.roomCode))?.soundPackId).toBe('none')
  })

  it('persists launch settings, shuffled order and answer seed on the room without changing the quiz', async () => {
    const repository = new DemoGameRepository()
    const quizBefore = (await repository.getQuiz('quiz-mixed'))!
    const authoredOrder = quizBefore.questions.map((question) => question.id)
    const session = await repository.launchGame(quizBefore.id, {
      soundPackId: 'none',
      shuffleQuestionOrder: true,
      shuffleAnswerOptions: true,
      autoLockWhenAllAnswered: false,
      showPlayerAnswersToHost: false,
    })

    expect(session.settings).toMatchObject({
      soundPackId: 'none', doubleScoreIntroMs: 5000, shuffleQuestionOrder: true,
      shuffleAnswerOptions: true, autoLockWhenAllAnswered: false, showPlayerAnswersToHost: false,
      questionTypeIntrosEnabled: true,
    })
    expect(new Set(session.questionOrder)).toEqual(new Set(authoredOrder))
    expect(session.questionOrder).toHaveLength(authoredOrder.length)
    expect((await repository.getActiveSessionForQuiz(quizBefore.id))?.questionOrder).toEqual(session.questionOrder)
    expect((await new DemoGameRepository().getHostSession(session.id))?.session.settings).toEqual(session.settings)
    expect((await repository.getQuiz(quizBefore.id))?.questions.map((question) => question.id)).toEqual(authoredOrder)

    await repository.changePhase(session.id, 'start')
    const safe = await repository.getSafeGameState(session.roomCode)
    expect(safe).toMatchObject({
      soundPackId: 'none', sessionSettings: session.settings,
    })
    expect(safe?.currentQuestion).toMatchObject({ forceRandomiseOptions: true })

    await reachQuestionOpening(repository, session.id)
    await repository.changePhase(session.id, 'finish')
    await repository.changePhase(session.id, 'restart')
    const restarted = (await repository.getHostSession(session.id))!.session
    expect(restarted.questionOrder).toEqual(session.questionOrder)
    expect(restarted.settings).toEqual(session.settings)

    const resumed = await repository.launchGame(quizBefore.id, {
      soundPackId: 'katwed', shuffleQuestionOrder: false,
      shuffleAnswerOptions: false, autoLockWhenAllAnswered: true, showPlayerAnswersToHost: true,
    })
    expect(resumed.id).toBe(session.id)
    expect(resumed.settings).toEqual(session.settings)
  })

  it('returns named current-question response status without raw payloads when host detail is disabled', async () => {
    const repository = new DemoGameRepository()
    const source = (await repository.getQuiz('quiz-mixed'))!
    const question = source.questions[0]
    const quiz = await repository.saveQuiz({
      id: source.id, title: source.title, quizType: 'standard', headToHeadCompetitors: [],
      coverImagePath: source.coverImagePath, themeId: source.themeId, backgroundId: source.backgroundId,
      roster: source.roster, questions: [question],
    })
    const session = await repository.launchGame(quiz.id, {
      soundPackId: 'katwed',
      shuffleQuestionOrder: false,
      shuffleAnswerOptions: false,
      autoLockWhenAllAnswered: true,
      showPlayerAnswersToHost: false,
    })
    const joined = await repository.joinRoom(session.roomCode, 'Private response')
    await repository.changePhase(session.id, 'start')
    await repository.submitAnswer(
      session.roomCode,
      joined.player.id,
      joined.reconnectToken,
      correctAnswer(question),
    )

    const host = (await repository.getHostSession(session.id))!.session
    expect(host.answers).toEqual([])
    expect(host.hostResponses).toEqual([expect.objectContaining({
      questionId: question.id,
      playerId: joined.player.id,
    })])
    expect(JSON.stringify(host.hostResponses)).not.toContain('payload')
  })

  it('returns raw detail for only the current question without accumulating answer history', async () => {
    const repository = new DemoGameRepository()
    const source = (await repository.getQuiz('quiz-mixed'))!
    const questions = source.questions.slice(0, 2)
    const quiz = await repository.saveQuiz({
      id: source.id, title: source.title, quizType: 'standard', headToHeadCompetitors: [],
      coverImagePath: source.coverImagePath, themeId: source.themeId, backgroundId: source.backgroundId,
      roster: source.roster, questions,
    })
    const session = await repository.launchGame(quiz.id)
    const joined = await repository.joinRoom(session.roomCode, 'Current only')
    await repository.changePhase(session.id, 'start')
    await reachQuestionOpening(repository, session.id)
    await repository.submitAnswer(session.roomCode, joined.player.id, joined.reconnectToken, correctAnswer(questions[0]))
    await repository.changePhase(session.id, 'lock')
    await repository.changePhase(session.id, 'reveal')
    await repository.changePhase(session.id, 'leaderboard')
    await repository.changePhase(session.id, 'next')
    await reachQuestionOpening(repository, session.id)
    await repository.submitAnswer(session.roomCode, joined.player.id, joined.reconnectToken, correctAnswer(questions[1]))

    const host = (await repository.getHostSession(session.id))!.session
    expect(host.answers).toHaveLength(1)
    expect(host.answers[0].questionId).toBe(questions[1].id)
    expect(host.hostResponses).toHaveLength(1)
    expect(host.hostResponses[0].questionId).toBe(questions[1].id)
  })

  it('omits raw detail above the 15-player limit while retaining submitted-player status', async () => {
    const repository = new DemoGameRepository()
    const source = (await repository.getQuiz('quiz-mixed'))!
    const question = source.questions[0]
    const quiz = await repository.saveQuiz({
      id: source.id, title: source.title, quizType: 'standard', headToHeadCompetitors: [],
      coverImagePath: source.coverImagePath, themeId: source.themeId, backgroundId: source.backgroundId,
      roster: source.roster, questions: [question],
    })
    const session = await repository.launchGame(quiz.id)
    const joined = await Promise.all(Array.from(
      { length: 16 },
      (_, index) => repository.joinRoom(session.roomCode, `Player ${index + 1}`),
    ))
    await repository.changePhase(session.id, 'start')
    await repository.submitAnswer(
      session.roomCode,
      joined[0].player.id,
      joined[0].reconnectToken,
      correctAnswer(question),
    )

    const host = (await repository.getHostSession(session.id))!.session
    expect(host.answers).toEqual([])
    expect(host.hostResponses).toEqual([expect.objectContaining({ playerId: joined[0].player.id })])
  })

  it('imports a Head-to-Head definition with fresh competitors and remapped assignments', async () => {
    const repository = new DemoGameRepository()
    const parsed = parseKatwedQuizJson(JSON.stringify(exportQuizToPortable(headToHeadDemoQuiz)))
    const imported = await repository.saveQuiz(parsed.input)
    const competitorIds = imported.headToHeadCompetitors.map((competitor) => competitor.id)

    expect(imported.quizType).toBe('head-to-head')
    expect(imported.id).not.toBe(headToHeadDemoQuiz.id)
    expect(competitorIds).not.toEqual(headToHeadDemoQuiz.headToHeadCompetitors.map((competitor) => competitor.id))
    expect(imported.questions.every((question) => competitorIds.includes(question.assignedCompetitorId ?? ''))).toBe(true)
    expect((await new DemoGameRepository().getQuiz(imported.id))?.questions).toEqual(imported.questions)
    expect(await repository.getActiveSessionForQuiz(imported.id)).toBeNull()
  })

  it('normalises absent, unknown and wrong-theme backgrounds in older Demo state', async () => {
    const repository = new DemoGameRepository()
    await repository.listQuizzes()
    const state = JSON.parse(localStorage.getItem('katwed.demo.state.v2') ?? '{}') as {
      quizzes: Array<Record<string, unknown>>
    }
    delete state.quizzes[0].backgroundId
    state.quizzes[1].themeId = 'katwed'
    state.quizzes[1].backgroundId = 'arcade-grid'
    localStorage.setItem('katwed.demo.state.v2', JSON.stringify(state))

    const quizzes = await new DemoGameRepository().listQuizzes()
    expect(quizzes[0].backgroundId).toBeNull()
    expect(quizzes[1].backgroundId).toBeNull()
  })

  it('normalises legacy Pinpoint targets persisted in demo storage', async () => {
    await new DemoGameRepository().listQuizzes()
    const state = JSON.parse(localStorage.getItem('katwed.demo.state.v2')!) as { quizzes: Quiz[] }
    const question = state.quizzes.flatMap((quiz) => quiz.questions).find((q) => q.type === 'pinpoint')!
    Reflect.deleteProperty(question, 'target')
    Object.assign(question, { targetX: .5, targetY: .43, targetRadius: .12 })
    localStorage.setItem('katwed.demo.state.v2', JSON.stringify(state))
    const loaded = (await new DemoGameRepository().listQuizzes()).flatMap((q) => q.questions).find((q) => q.type === 'pinpoint')
    expect(loaded).toMatchObject({ target: { kind: 'circle', x: .5, y: .43, radius: .12 } })
    expect(loaded).not.toHaveProperty('targetRadius')
  })

  it('normalises older Demo quizzes to Standard without stale assignments', async () => {
    const repository = new DemoGameRepository()
    await repository.listQuizzes()
    const state = JSON.parse(localStorage.getItem('katwed.demo.state.v2') ?? '{}') as {
      quizzes: Array<Record<string, unknown>>
    }
    delete state.quizzes[0].quizType
    delete state.quizzes[0].headToHeadCompetitors
    const questions = state.quizzes[0].questions as Array<Record<string, unknown>>
    delete questions[0].assignedCompetitorId
    localStorage.setItem('katwed.demo.state.v2', JSON.stringify(state))

    const quiz = (await new DemoGameRepository().listQuizzes())[0]
    expect(quiz.quizType).toBe('standard')
    expect(quiz.headToHeadCompetitors).toEqual([])
    expect(quiz.questions.every((question) => question.assignedCompetitorId === null)).toBe(true)
  })

  it('persists, duplicates and launches valid Head-to-Head definitions', async () => {
    const repository = new DemoGameRepository()
    const source = await repository.getQuiz('quiz-mixed')
    if (!source) throw new Error('Demo quiz missing')
    const competitors = [
      { id: 'competitor-a', quizId: source.id, displayName: 'Ross', displayOrder: 0 as const },
      { id: 'competitor-b', quizId: source.id, displayName: 'Jess', displayOrder: 1 as const },
    ]
    const saved = await repository.saveQuiz({
      id: source.id,
      title: source.title,
      quizType: 'head-to-head',
      headToHeadCompetitors: competitors,
      coverImagePath: source.coverImagePath,
      themeId: source.themeId,
      backgroundId: source.backgroundId,
      roster: source.roster,
      questions: source.questions.map((question, index) => ({
        ...question,
        assignedCompetitorId: competitors[index % 2].id,
      })),
    })

    expect(saved.quizType).toBe('head-to-head')
    expect(saved.headToHeadCompetitors.map((competitor) => competitor.displayName)).toEqual(['Ross', 'Jess'])
    expect(saved.coverImagePath).toBe(source.coverImagePath)
    expect(saved.themeId).toBe(source.themeId)
    expect(saved.backgroundId).toBe(source.backgroundId)
    expect((await new DemoGameRepository().getQuiz(saved.id))?.headToHeadCompetitors).toEqual(saved.headToHeadCompetitors)
    const session = await repository.launchGame(saved.id)
    expect(session).toMatchObject({ quizId: saved.id, phase: 'lobby', questionClosesAt: null })
    await repository.changePhase(session.id, 'close')

    const duplicate = await repository.duplicateQuiz(saved.id)
    expect(duplicate.headToHeadCompetitors.every((competitor) =>
      !saved.headToHeadCompetitors.some((sourceCompetitor) => sourceCompetitor.id === competitor.id)
    )).toBe(true)
    expect(duplicate.questions.every((question) =>
      duplicate.headToHeadCompetitors.some((competitor) => competitor.id === question.assignedCompetitorId)
    )).toBe(true)
    await repository.archiveQuiz(duplicate.id)
    expect((await repository.getQuiz(duplicate.id))?.quizType).toBe('head-to-head')
    await repository.restoreQuiz(duplicate.id)
    expect((await repository.getQuiz(duplicate.id))?.headToHeadCompetitors.map((competitor) => competitor.displayName))
      .toEqual(['Ross', 'Jess'])
  })

  it('moves an intact quiz between active and archived libraries', async () => {
    const repository = new DemoGameRepository()
    const original = await repository.getQuiz('quiz-demo')

    await repository.archiveQuiz('quiz-demo')

    expect((await repository.listQuizzes()).map((quiz) => quiz.id)).not.toContain('quiz-demo')
    expect((await repository.listArchivedQuizzes()).map((quiz) => quiz.id)).toContain('quiz-demo')
    expect((await repository.getQuiz('quiz-demo'))?.questions).toEqual(original?.questions)
    await expect(repository.launchGame('quiz-demo')).rejects.toThrow('Restore this quiz before launching it.')

    await repository.restoreQuiz('quiz-demo')
    expect((await repository.listQuizzes()).map((quiz) => quiz.id)).toContain('quiz-demo')
    expect(await repository.listArchivedQuizzes()).toEqual([])
  })

  it('requires rooms to close before archive and archive before permanent deletion', async () => {
    const repository = new DemoGameRepository()
    await expect(repository.permanentlyDeleteQuiz('quiz-demo')).rejects.toThrow(
      'Archive this quiz before permanently deleting it.',
    )

    const session = await repository.launchGame('quiz-demo')
    await expect(repository.archiveQuiz('quiz-demo')).rejects.toThrow(
      'Close the active game before archiving this quiz.',
    )
    await repository.changePhase(session.id, 'close')
    await repository.archiveQuiz('quiz-demo')
    expect(await repository.permanentlyDeleteQuiz('quiz-demo')).toEqual({
      deletedMediaCount: 0,
      failedMediaCount: 0,
    })
    expect(await repository.getQuiz('quiz-demo')).toBeNull()
    expect(await repository.getHostSession(session.id)).toBeNull()
  })

  it('duplicates an active quiz independently without copying or disturbing its active room', async () => {
    const repository = new DemoGameRepository()
    const sourceBefore = await repository.getQuiz('quiz-mixed')
    const session = await repository.launchGame('quiz-mixed')
    const player = await repository.joinRoom(session.roomCode, 'Copy Witness')
    await repository.changePhase(session.id, 'start')
    await reachQuestionOpening(repository, session.id)
    await repository.submitAnswer(
      session.roomCode,
      player.player.id,
      player.reconnectToken,
      { type: 'single-choice', optionId: 'mars' },
    )
    const sourceRoomBefore = await repository.getHostSession(session.id)

    const duplicate = await repository.duplicateQuiz('quiz-mixed')

    expect(duplicate.id).not.toBe('quiz-mixed')
    expect(duplicate.title).toBe('Katwed! Mixed Quiz (Copy)')
    expect(duplicate.archivedAt).toBeNull()
    expect(duplicate.createdAt).not.toBe(sourceBefore?.createdAt)
    expect(duplicate.updatedAt).toBe(duplicate.createdAt)
    expect((await repository.listQuizzes()).map((quiz) => quiz.id)).toContain(duplicate.id)
    expect(await repository.getActiveSessionForQuiz(duplicate.id)).toBeNull()
    expect(await repository.getHostSession(session.id)).toEqual(sourceRoomBefore)
    expect(await repository.getQuiz('quiz-mixed')).toEqual(sourceBefore)

    await repository.saveQuiz({
      id: duplicate.id,
      title: 'Edited copy',
      quizType: duplicate.quizType,
      headToHeadCompetitors: duplicate.headToHeadCompetitors,
      coverImagePath: duplicate.coverImagePath,
      themeId: duplicate.themeId,
      backgroundId: duplicate.backgroundId,
      roster: duplicate.roster,
      questions: duplicate.questions,
    })
    expect((await repository.getQuiz('quiz-mixed'))?.title).toBe('Katwed! Mixed Quiz')
    expect((await repository.getQuiz('quiz-mixed'))?.questions).toEqual(sourceBefore?.questions)

    const sharedPath = sourceBefore?.questions.find((question) => question.media.type === 'image')?.media
    await repository.archiveQuiz(duplicate.id)
    expect(await repository.permanentlyDeleteQuiz(duplicate.id)).toEqual({
      deletedMediaCount: 0,
      failedMediaCount: 0,
    })
    const retainedSource = await repository.getQuiz('quiz-mixed')
    expect(retainedSource?.questions.find((question) => question.media.type === 'image')?.media).toEqual(sharedPath)
  })

  it('persists optional covers through save, reload, duplication, archive and restore', async () => {
    const repository = new DemoGameRepository()
    const source = await repository.getQuiz('quiz-mixed')
    if (!source) throw new Error('Demo quiz missing')
    const sharedCover = 'demo-image://shared-cover'

    const covered = await repository.saveQuiz({
      id: source.id,
      title: source.title,
      quizType: source.quizType,
      headToHeadCompetitors: source.headToHeadCompetitors,
      coverImagePath: sharedCover,
      themeId: source.themeId,
      backgroundId: source.backgroundId,
      roster: source.roster,
      questions: source.questions,
    })
    expect(covered.coverImagePath).toBe(sharedCover)
    expect((await new DemoGameRepository().getQuiz(source.id))?.coverImagePath).toBe(sharedCover)

    const duplicate = await repository.duplicateQuiz(source.id)
    expect(duplicate.coverImagePath).toBe(sharedCover)
    expect(await repository.getActiveSessionForQuiz(duplicate.id)).toBeNull()

    await repository.archiveQuiz(source.id)
    expect((await repository.listArchivedQuizzes()).find((quiz) => quiz.id === source.id)?.coverImagePath).toBe(sharedCover)
    await repository.restoreQuiz(source.id)
    expect((await repository.getQuiz(source.id))?.coverImagePath).toBe(sharedCover)

    const uncovered = await repository.saveQuiz({
      id: duplicate.id,
      title: duplicate.title,
      quizType: duplicate.quizType,
      headToHeadCompetitors: duplicate.headToHeadCompetitors,
      coverImagePath: null,
      themeId: duplicate.themeId,
      backgroundId: duplicate.backgroundId,
      roster: duplicate.roster,
      questions: duplicate.questions,
    })
    expect(uncovered.coverImagePath).toBeNull()
    expect((await repository.getQuiz(source.id))?.coverImagePath).toBe(sharedCover)
    await expect(repository.launchGame(duplicate.id)).resolves.toMatchObject({ quizId: duplicate.id })
  })

  it('creates a quiz without requiring a cover', async () => {
    const repository = new DemoGameRepository()
    const created = await repository.saveQuiz({
      title: 'No-cover quiz',
      quizType: 'standard',
      headToHeadCompetitors: [],
      coverImagePath: null,
      themeId: 'katwed',
      backgroundId: null,
      roster: [],
      questions: [],
    })

    expect(created.coverImagePath).toBeNull()
  })

  it('persists themes through reload, duplication, archive, restore and safe game state', async () => {
    const repository = new DemoGameRepository()
    const source = await repository.getQuiz('quiz-demo')
    if (!source) throw new Error('Demo quiz missing')

    const themed = await repository.saveQuiz({
      id: source.id,
      title: source.title,
      quizType: source.quizType,
      headToHeadCompetitors: source.headToHeadCompetitors,
      coverImagePath: source.coverImagePath,
      themeId: 'arcade',
      backgroundId: 'arcade-grid',
      roster: source.roster,
      questions: source.questions,
    })
    expect(themed.themeId).toBe('arcade')
    expect(themed.backgroundId).toBe('arcade-grid')
    expect((await new DemoGameRepository().getQuiz(source.id))?.themeId).toBe('arcade')
    expect((await new DemoGameRepository().getQuiz(source.id))?.backgroundId).toBe('arcade-grid')

    const duplicate = await repository.duplicateQuiz(source.id)
    expect(duplicate.themeId).toBe('arcade')
    expect(duplicate.backgroundId).toBe('arcade-grid')
    await repository.archiveQuiz(duplicate.id)
    expect((await repository.listArchivedQuizzes()).find((quiz) => quiz.id === duplicate.id)?.themeId).toBe('arcade')
    expect((await repository.listArchivedQuizzes()).find((quiz) => quiz.id === duplicate.id)?.backgroundId).toBe('arcade-grid')
    await repository.restoreQuiz(duplicate.id)
    expect((await repository.getQuiz(duplicate.id))?.themeId).toBe('arcade')
    expect((await repository.getQuiz(duplicate.id))?.backgroundId).toBe('arcade-grid')

    const session = await repository.launchGame(duplicate.id)
    expect((await repository.getSafeGameState(session.roomCode))?.themeId).toBe('arcade')
    expect((await repository.getSafeGameState(session.roomCode))?.backgroundId).toBe('arcade-grid')
  })

  it('reports and cleans Demo IndexedDB orphans while preserving current and newly shared references', async () => {
    const repository = new DemoGameRepository()
    const inUsePath = 'demo-image://123e4567-e89b-42d3-a456-426614174000'
    const orphanPath = 'demo-image://223e4567-e89b-42d3-a456-426614174000'
    demoImageMocks.listDemoStoredImages.mockResolvedValue([
      { path: inUsePath, publicUrl: inUsePath, sizeBytes: 1000, createdAt: null },
      { path: orphanPath, publicUrl: orphanPath, sizeBytes: 2000, createdAt: null },
    ])
    const source = await repository.getQuiz('quiz-mixed')
    if (!source) throw new Error('Demo quiz missing')
    await repository.saveQuiz({
      id: source.id,
      title: source.title,
      quizType: source.quizType,
      headToHeadCompetitors: source.headToHeadCompetitors,
      coverImagePath: inUsePath,
      themeId: source.themeId,
      backgroundId: source.backgroundId,
      roster: source.roster,
      questions: source.questions,
    })

    const initial = await repository.getStorageReport()
    expect(initial.total).toEqual({ fileCount: 2, sizeBytes: 3000, unknownSizeCount: 0 })
    expect(initial.inUse.fileCount).toBe(1)
    expect(initial.unused.fileCount).toBe(1)
    await expect(repository.cleanupUnusedImages([orphanPath])).resolves.toEqual({
      removedCount: 1,
      preservedCount: 0,
      failedCount: 0,
    })
    expect(demoImageMocks.removeDemoStoredImages).toHaveBeenCalledWith([orphanPath])

    demoImageMocks.removeDemoStoredImages.mockClear()
    const other = await repository.getQuiz('quiz-demo')
    if (!other) throw new Error('Second Demo quiz missing')
    await repository.saveQuiz({
      id: other.id,
      title: other.title,
      quizType: other.quizType,
      headToHeadCompetitors: other.headToHeadCompetitors,
      coverImagePath: orphanPath,
      themeId: other.themeId,
      backgroundId: other.backgroundId,
      roster: other.roster,
      questions: other.questions,
    })

    await expect(repository.cleanupUnusedImages([orphanPath])).resolves.toEqual({
      removedCount: 0,
      preservedCount: 1,
      failedCount: 0,
    })
    expect(demoImageMocks.removeDemoStoredImages).not.toHaveBeenCalled()

    await repository.saveQuiz({
      id: other.id,
      title: other.title,
      quizType: other.quizType,
      headToHeadCompetitors: other.headToHeadCompetitors,
      coverImagePath: null,
      themeId: other.themeId,
      backgroundId: other.backgroundId,
      roster: other.roster,
      questions: other.questions,
    })
    expect((await repository.getStorageReport()).unused.fileCount).toBe(1)
  })

  it('rejects duplication of an archived quiz', async () => {
    const repository = new DemoGameRepository()
    await repository.archiveQuiz('quiz-demo')
    await expect(repository.duplicateQuiz('quiz-demo')).rejects.toThrow(
      'Restore this quiz before duplicating it.',
    )
    expect(await repository.listQuizzes()).toHaveLength(1)
  })

  it('joins, reconnects and rejects duplicate nicknames', async () => {
    const repository = new DemoGameRepository()
    const session = await repository.launchGame('quiz-demo')
    const joined = await repository.joinRoom(session.roomCode, 'Quizzer')
    await expect(repository.joinRoom(session.roomCode, 'qUiZzEr')).rejects.toMatchObject({ code: 'duplicate-nickname' })
    expect((await repository.reconnectPlayer({
      playerId: joined.player.id, roomCode: session.roomCode, nickname: joined.player.nickname,
      reconnectToken: joined.reconnectToken,
    }))?.player.id).toBe(joined.player.id)
  })

  it('runs a complete untimed two-player Head-to-Head game across all seven question types', async () => {
    const repository = new DemoGameRepository()
    const quiz = await saveHeadToHeadFixture(repository)
    const session = await repository.launchGame(quiz.id)
    const [rossSlot, jessSlot] = (await repository.getRoomJoinInfo(session.roomCode))!.headToHeadCompetitors

    await expect(repository.joinRoom(session.roomCode, 'Nickname')).rejects.toThrow(/competitors/i)
    const ross = await repository.joinHeadToHeadRoom(session.roomCode, rossSlot.competitorId)
    await expect(repository.joinHeadToHeadRoom(session.roomCode, rossSlot.competitorId)).rejects.toMatchObject({ code: 'duplicate-nickname' })
    await expect(repository.startHeadToHead(session.roomCode, ross.player.id, ross.reconnectToken)).rejects.toThrow(/Both competitors/i)
    const jess = await repository.joinHeadToHeadRoom(session.roomCode, jessSlot.competitorId)
    expect((await repository.reconnectPlayer({
      playerId: jess.player.id,
      roomCode: session.roomCode,
      nickname: jess.player.nickname,
      competitorId: jess.player.competitorId,
      reconnectToken: jess.reconnectToken,
    }))?.player.competitorId).toBe(jessSlot.competitorId)

    await repository.startHeadToHead(session.roomCode, ross.player.id, ross.reconnectToken)
    await reachQuestionOpening(repository, session.id)
    await expect(repository.changePhase(session.id, 'lock')).rejects.toThrow(/controlled by the competitors/i)

    for (let index = 0; index < quiz.questions.length; index += 1) {
      const question = quiz.questions[index]
      const assigned = question.assignedCompetitorId === rossSlot.competitorId ? ross : jess
      const playAlong = assigned === ross ? jess : ross
      const before = await repository.getSafeGameState(session.roomCode)
      expect(before).toMatchObject({ quizType: 'head-to-head', phase: 'question', questionClosesAt: null })
      expect(before?.currentQuestion?.assignedCompetitorId).toBe(question.assignedCompetitorId)
      expect(before?.headToHeadResults).toEqual([])
      expect(JSON.stringify(before?.currentQuestion)).not.toMatch(/correctOptionId|correctValue|correctMemberIds|correctAnswer|acceptedAnswers|targetX/)

      await repository.submitAnswer(session.roomCode, assigned.player.id, assigned.reconnectToken, correctAnswer(question))
      expect((await repository.getSafeGameState(session.roomCode))?.phase).toBe('question')
      if (index === 0) {
        await repository.submitAnswer(session.roomCode, playAlong.player.id, playAlong.reconnectToken, correctAnswer(question))
      } else {
        await repository.skipHeadToHead(session.roomCode, playAlong.player.id, playAlong.reconnectToken, question.id)
      }

      const reveal = await repository.getSafeGameState(session.roomCode)
      expect(reveal?.phase).toBe('reveal')
      expect(reveal?.headToHeadResults).toHaveLength(2)
      expect(reveal?.headToHeadResults?.find((result) => result.competitorId === assigned.player.competitorId))
        .toMatchObject({ assigned: true, status: 'correct', pointsAwarded: 1 })
      if (index === 0) {
        expect(reveal?.headToHeadResults?.find((result) => result.competitorId === playAlong.player.competitorId))
          .toMatchObject({ assigned: false, status: 'correct', pointsAwarded: 0 })
      }

      await repository.continueHeadToHead(session.roomCode, playAlong.player.id, playAlong.reconnectToken, question.id)
      await repository.continueHeadToHead(session.roomCode, assigned.player.id, assigned.reconnectToken, question.id)
      if (index + 1 < quiz.questions.length) await reachQuestionOpening(repository, session.id)
    }

    const finished = await repository.getSafeGameState(session.roomCode)
    expect(finished?.phase).toBe('finished')
    expect(finished?.leaderboard).toEqual([])
    expect(finished?.headToHeadCompetitors?.reduce((total, competitor) => total + competitor.totalScore, 0))
      .toBe(quiz.questions.length)
  })

  it('awards no point for an assigned wrong answer and forbids the assigned competitor from skipping', async () => {
    const repository = new DemoGameRepository()
    const quiz = await saveHeadToHeadFixture(repository)
    if (quiz.questions[0].type !== 'single-choice') throw new Error('Head-to-Head fixture changed')
    const question = quiz.questions[0]
    const session = await repository.launchGame(quiz.id)
    const [firstSlot, secondSlot] = (await repository.getRoomJoinInfo(session.roomCode))!.headToHeadCompetitors
    const first = await repository.joinHeadToHeadRoom(session.roomCode, firstSlot.competitorId)
    const second = await repository.joinHeadToHeadRoom(session.roomCode, secondSlot.competitorId)
    await repository.startHeadToHead(session.roomCode, first.player.id, first.reconnectToken)
    await reachQuestionOpening(repository, session.id)
    const assigned = question.assignedCompetitorId === firstSlot.competitorId ? first : second
    const playAlong = assigned === first ? second : first
    await expect(repository.skipHeadToHead(session.roomCode, assigned.player.id, assigned.reconnectToken, question.id))
      .rejects.toThrow(/must answer/i)
    await repository.submitAnswer(session.roomCode, assigned.player.id, assigned.reconnectToken, {
      type: 'single-choice', optionId: question.options.find((option) => option.id !== question.correctOptionId)!.id,
    })
    await repository.skipHeadToHead(session.roomCode, playAlong.player.id, playAlong.reconnectToken, question.id)
    expect((await repository.getSafeGameState(session.roomCode))?.headToHeadResults?.find((result) => result.assigned))
      .toMatchObject({ status: 'incorrect', pointsAwarded: 0 })
  })

  it('does not convert Standard multiple-select partial credit into a Head-to-Head point', async () => {
    const repository = new DemoGameRepository()
    const source = structuredClone(headToHeadDemoQuiz)
    const multiple = source.questions.find((question) => question.type === 'multiple-select')
    if (!multiple) throw new Error('Multiple-select fixture missing')
    multiple.scoringMode = 'partial-wipeout'
    multiple.minimumSelections = 1
    source.questions = [multiple]
    const quiz = await repository.saveQuiz({
      title: source.title, quizType: source.quizType, headToHeadCompetitors: source.headToHeadCompetitors,
      coverImagePath: null, themeId: source.themeId, backgroundId: source.backgroundId,
      roster: source.roster, questions: source.questions,
    })
    const session = await repository.launchGame(quiz.id)
    const [firstSlot, secondSlot] = (await repository.getRoomJoinInfo(session.roomCode))!.headToHeadCompetitors
    const first = await repository.joinHeadToHeadRoom(session.roomCode, firstSlot.competitorId)
    const second = await repository.joinHeadToHeadRoom(session.roomCode, secondSlot.competitorId)
    await repository.startHeadToHead(session.roomCode, first.player.id, first.reconnectToken)
    const assigned = multiple.assignedCompetitorId === firstSlot.competitorId ? first : second
    const playAlong = assigned === first ? second : first
    await repository.submitAnswer(session.roomCode, assigned.player.id, assigned.reconnectToken, {
      type: 'multiple-select', optionIds: [multiple.correctOptionIds[0]],
    })
    await repository.skipHeadToHead(session.roomCode, playAlong.player.id, playAlong.reconnectToken, multiple.id)
    expect((await repository.getSafeGameState(session.roomCode))?.headToHeadResults?.find((result) => result.assigned))
      .toMatchObject({ status: 'incorrect', pointsAwarded: 0 })
  })

  it('does not expose any answer key before reveal', async () => {
    const repository = new DemoGameRepository()
    const session = await repository.launchGame('quiz-mixed')
    await repository.changePhase(session.id, 'start')
    const state = await repository.getSafeGameState(session.roomCode)
    const serialised = JSON.stringify(state?.currentQuestion)
    expect(state?.reveal).toBeNull()
    expect(serialised).not.toContain('correctOptionId')
    expect(serialised).not.toContain('revealCaption')
  })

  it('preserves exact-pair, no-partial-credit mash-up scoring', async () => {
    const repository = new DemoGameRepository()
    const session = await repository.launchGame('quiz-demo')
    const wrong = await repository.joinRoom(session.roomCode, 'Wrong')
    const right = await repository.joinRoom(session.roomCode, 'Right')
    await repository.changePhase(session.id, 'start')
    await repository.submitAnswer(session.roomCode, wrong.player.id, wrong.reconnectToken, { type: 'mashup', memberIds: ['member-alex', 'member-casey'] })
    await repository.submitAnswer(session.roomCode, right.player.id, right.reconnectToken, { type: 'mashup', memberIds: ['member-bailey', 'member-alex'] })
    await repository.changePhase(session.id, 'lock')
    await repository.changePhase(session.id, 'reveal')
    expect((await repository.getSafeGameState(session.roomCode))?.leaderboard).toEqual([])
    await repository.changePhase(session.id, 'leaderboard')
    const state = await repository.getSafeGameState(session.roomCode)
    expect(state?.leaderboard.map((entry) => [entry.nickname, entry.totalScore])).toEqual([['Right', 1], ['Wrong', 0]])
  })

  it('scores typed questions and prevents duplicate submissions', async () => {
    const repository = new DemoGameRepository()
    const session = await repository.launchGame('quiz-mixed')
    const player = await repository.joinRoom(session.roomCode, 'Mars Fan')
    await repository.changePhase(session.id, 'start')
    await reachQuestionOpening(repository, session.id)
    const submit = () => repository.submitAnswer(session.roomCode, player.player.id, player.reconnectToken, { type: 'single-choice', optionId: 'mars' })
    await submit()
    await expect(submit()).rejects.toMatchObject({ code: 'duplicate-submission' })
    const questionState = await repository.getSafeGameState(session.roomCode)
    expect(questionState?.leaderboard).toEqual([])
    expect(questionState?.players[0].totalScore).toBe(0)
    await repository.changePhase(session.id, 'lock')
    await repository.changePhase(session.id, 'reveal')
    expect((await repository.getSafeGameState(session.roomCode))?.leaderboard).toEqual([])
    await repository.changePhase(session.id, 'leaderboard')
    expect((await repository.getSafeGameState(session.roomCode))?.leaderboard[0].totalScore).toBe(1000)
  })

  it('moves through phases and reveals only after lock', async () => {
    const repository = new DemoGameRepository()
    const session = await repository.launchGame('quiz-demo')
    await repository.changePhase(session.id, 'start')
    await repository.changePhase(session.id, 'lock')
    await repository.changePhase(session.id, 'reveal')
    const reveal = (await repository.getSafeGameState(session.roomCode))?.reveal
    expect(reveal?.type).toBe('mashup')
    if (reveal?.type === 'mashup') expect(reveal.correctMemberIds).toEqual(['member-alex', 'member-bailey'])
    await repository.changePhase(session.id, 'leaderboard')
    await repository.changePhase(session.id, 'next')
    expect((await repository.getSafeGameState(session.roomCode))?.phase).toBe('question')
  })

  it('withholds target coordinates and totals until their permitted phases', async () => {
    const repository = new DemoGameRepository()
    const session = await repository.launchGame('quiz-mixed')
    const player = await repository.joinRoom(session.roomCode, 'Safe Player')
    await repository.changePhase(session.id, 'start')
    await reachQuestionOpening(repository, session.id)
    await repository.submitAnswer(session.roomCode, player.player.id, player.reconnectToken, { type: 'single-choice', optionId: 'mars' })

    const beforeReveal = await repository.getSafeGameState(session.roomCode)
    expect(JSON.stringify(beforeReveal)).not.toContain('targetX')
    expect(beforeReveal?.leaderboard).toEqual([])
    expect(beforeReveal?.players[0].totalScore).toBe(0)
    expect((await repository.reconnectPlayer({
      playerId: player.player.id,
      roomCode: session.roomCode,
      nickname: player.player.nickname,
      reconnectToken: player.reconnectToken,
    }))?.player.totalScore).toBe(0)

    await repository.changePhase(session.id, 'lock')
    await repository.changePhase(session.id, 'reveal')
    const reveal = await repository.getSafeGameState(session.roomCode)
    expect(reveal?.reveal?.type).toBe('single-choice')
    expect(reveal?.leaderboard).toEqual([])
    expect(reveal?.players[0].totalScore).toBe(0)

    await repository.changePhase(session.id, 'leaderboard')
    expect((await repository.reconnectPlayer({
      playerId: player.player.id,
      roomCode: session.roomCode,
      nickname: player.player.nickname,
      reconnectToken: player.reconnectToken,
    }))?.player.totalScore).toBe(1000)
    await repository.changePhase(session.id, 'next')
    await reachQuestionOpening(repository, session.id)
    for (let questionIndex = 1; questionIndex < 4; questionIndex += 1) {
      await repository.changePhase(session.id, 'lock')
      await repository.changePhase(session.id, 'reveal')
      await repository.changePhase(session.id, 'leaderboard')
      await repository.changePhase(session.id, 'next')
      await reachQuestionOpening(repository, session.id)
    }
    const pinpointQuestion = await repository.getSafeGameState(session.roomCode)
    expect(pinpointQuestion?.currentQuestion?.type).toBe('pinpoint')
    expect(pinpointQuestion?.currentQuestion).not.toHaveProperty('target')
    expect(JSON.stringify(pinpointQuestion)).not.toContain('targetX')
    expect(JSON.stringify(pinpointQuestion)).not.toContain('targetY')
    expect(JSON.stringify(pinpointQuestion)).not.toContain('targetRadius')
  })

  it('skips the ordinary leaderboard after the final reveal and rejects phase skips', async () => {
    const repository = new DemoGameRepository()
    const session = await repository.launchGame('quiz-mixed')
    const player = await repository.joinRoom(session.roomCode, 'Finalist')
    await repository.changePhase(session.id, 'start')
    await reachQuestionOpening(repository, session.id)
    await repository.submitAnswer(session.roomCode, player.player.id, player.reconnectToken, { type: 'single-choice', optionId: 'mars' })

    for (let index = 0; index < 7; index += 1) {
      await repository.changePhase(session.id, 'lock')
      await repository.changePhase(session.id, 'reveal')
      if (index === 0) {
        await expect(repository.changePhase(session.id, 'finish')).rejects.toMatchObject({ code: 'invalid-phase' })
      }
      await repository.changePhase(session.id, 'leaderboard')
      await repository.changePhase(session.id, 'next')
      await reachQuestionOpening(repository, session.id)
    }

    await repository.changePhase(session.id, 'lock')
    await repository.changePhase(session.id, 'reveal')
    const finalReveal = await repository.getSafeGameState(session.roomCode)
    expect(finalReveal?.leaderboard).toEqual([])
    expect(finalReveal?.players[0].totalScore).toBe(0)
    await expect(repository.changePhase(session.id, 'leaderboard')).rejects.toMatchObject({ code: 'invalid-phase' })

    await repository.changePhase(session.id, 'finish')
    const finished = await repository.getSafeGameState(session.roomCode)
    expect(finished?.phase).toBe('finished')
    expect(finished?.leaderboard[0]).toMatchObject({ nickname: 'Finalist', totalScore: 1000 })
    await expect(repository.changePhase(session.id, 'finish')).rejects.toMatchObject({ code: 'invalid-phase' })
  })

  it('does not broadcast Standard joins, presence, or answers but still broadcasts phase changes', async () => {
    const repository = new DemoGameRepository()
    const observer = new DemoGameRepository()
    const session = await repository.launchGame('quiz-mixed')
    const onRoomChange = vi.fn()
    const unsubscribe = observer.subscribe(session.roomCode, onRoomChange)

    const joined = await repository.joinRoom(session.roomCode, 'Quiet Player')
    expect(onRoomChange).not.toHaveBeenCalled()
    await repository.setPlayerPresence({
      playerId: joined.player.id,
      roomCode: session.roomCode,
      nickname: joined.player.nickname,
      reconnectToken: joined.reconnectToken,
    }, false)
    expect(onRoomChange).not.toHaveBeenCalled()

    await repository.changePhase(session.id, 'start')
    expect(onRoomChange).toHaveBeenCalledTimes(1)
    onRoomChange.mockClear()
    await reachQuestionOpening(repository, session.id)
    const quiz = (await repository.getQuiz('quiz-mixed'))!
    await repository.submitAnswer(
      session.roomCode,
      joined.player.id,
      joined.reconnectToken,
      correctAnswer(quiz.questions[0]),
    )
    expect(onRoomChange).not.toHaveBeenCalled()

    const liveSession = await repository.getHostLiveSession(session.id)
    expect(liveSession?.players).toHaveLength(1)
    expect(liveSession?.hostResponses).toHaveLength(1)
    expect((await repository.getSafeGameState(session.roomCode))?.submittedCount).toBe(1)
    unsubscribe()
  })

  it('accepts a simulated 100-Player Standard answer burst without losing submissions', async () => {
    const repository = new DemoGameRepository()
    const session = await repository.launchGame('quiz-mixed')
    const players = await Promise.all(Array.from(
      { length: 100 },
      (_, index) => repository.joinRoom(session.roomCode, `Burst ${index + 1}`),
    ))
    await repository.changePhase(session.id, 'start')
    await reachQuestionOpening(repository, session.id)
    const quiz = (await repository.getQuiz('quiz-mixed'))!

    await Promise.all(players.map((joined) => repository.submitAnswer(
      session.roomCode,
      joined.player.id,
      joined.reconnectToken,
      correctAnswer(quiz.questions[0]),
    )))

    expect((await repository.getSafeGameState(session.roomCode))?.submittedCount).toBe(100)
    expect((await repository.getHostLiveSession(session.id))?.hostResponses).toHaveLength(100)
  })
})
