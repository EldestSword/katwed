import { beforeEach, describe, expect, it, vi } from 'vitest'
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
import type { PlayerAnswerPayload, Question } from '../../types/domain'
import { headToHeadDemoQuiz, mixedDemoQuiz } from './sampleData'
import { exportQuizToPortable, parseKatwedQuizJson } from '../../features/quiz-transfer/katwedQuizFormat'

function correctAnswer(question: Question): PlayerAnswerPayload {
  switch (question.type) {
    case 'single-choice': return { type: question.type, optionId: question.correctOptionId }
    case 'multiple-select': return { type: question.type, optionIds: [...question.correctOptionIds] }
    case 'true-false': return { type: question.type, value: question.correctValue }
    case 'slider': return { type: question.type, value: question.correctValue }
    case 'pinpoint': return { type: question.type, x: question.targetX, y: question.targetY }
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

describe('DemoGameRepository multi-format game state', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    demoImageMocks.listDemoStoredImages.mockResolvedValue([])
    demoImageMocks.removeDemoStoredImages.mockImplementation(async (paths: string[]) => ({
      deletedMediaCount: paths.length,
      failedMediaCount: 0,
    }))
  })

  it('provides both the preserved mash-up quiz and a mixed quiz', async () => {
    const repository = new DemoGameRepository()
    const quizzes = await repository.listQuizzes()
    expect(quizzes.map((quiz) => quiz.id)).toEqual(['quiz-demo', 'quiz-mixed'])
    expect(new Set(quizzes[1].questions.map((question) => question.type))).toEqual(
      new Set(['single-choice', 'multiple-select', 'true-false', 'slider', 'pinpoint', 'mashup']),
    )
  })

  it('imports a Standard all-six-format definition as a fresh Active quiz and persists it across reload', async () => {
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

  it('runs a complete untimed two-player Head-to-Head game across all six question types', async () => {
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
    await expect(repository.changePhase(session.id, 'lock')).rejects.toThrow(/controlled by the competitors/i)

    for (let index = 0; index < quiz.questions.length; index += 1) {
      const question = quiz.questions[index]
      const assigned = question.assignedCompetitorId === rossSlot.competitorId ? ross : jess
      const playAlong = assigned === ross ? jess : ross
      const before = await repository.getSafeGameState(session.roomCode)
      expect(before).toMatchObject({ quizType: 'head-to-head', phase: 'question', questionClosesAt: null })
      expect(before?.currentQuestion?.assignedCompetitorId).toBe(question.assignedCompetitorId)
      expect(before?.headToHeadResults).toEqual([])
      expect(JSON.stringify(before?.currentQuestion)).not.toMatch(/correctOptionId|correctValue|correctMemberIds|targetX/)

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
    for (let questionIndex = 1; questionIndex < 4; questionIndex += 1) {
      await repository.changePhase(session.id, 'lock')
      await repository.changePhase(session.id, 'reveal')
      await repository.changePhase(session.id, 'leaderboard')
      await repository.changePhase(session.id, 'next')
    }
    const pinpointQuestion = await repository.getSafeGameState(session.roomCode)
    expect(pinpointQuestion?.currentQuestion?.type).toBe('pinpoint')
    expect(JSON.stringify(pinpointQuestion)).not.toContain('targetX')
    expect(JSON.stringify(pinpointQuestion)).not.toContain('targetY')
    expect(JSON.stringify(pinpointQuestion)).not.toContain('targetRadius')
  })

  it('skips the ordinary leaderboard after the final reveal and rejects phase skips', async () => {
    const repository = new DemoGameRepository()
    const session = await repository.launchGame('quiz-mixed')
    const player = await repository.joinRoom(session.roomCode, 'Finalist')
    await repository.changePhase(session.id, 'start')
    await repository.submitAnswer(session.roomCode, player.player.id, player.reconnectToken, { type: 'single-choice', optionId: 'mars' })

    for (let index = 0; index < 6; index += 1) {
      await repository.changePhase(session.id, 'lock')
      await repository.changePhase(session.id, 'reveal')
      if (index === 0) {
        await expect(repository.changePhase(session.id, 'finish')).rejects.toMatchObject({ code: 'invalid-phase' })
      }
      await repository.changePhase(session.id, 'leaderboard')
      await repository.changePhase(session.id, 'next')
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
})
