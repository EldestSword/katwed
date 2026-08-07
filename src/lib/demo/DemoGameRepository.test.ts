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
      coverImagePath: duplicate.coverImagePath,
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
      coverImagePath: sharedCover,
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
      coverImagePath: null,
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
      coverImagePath: null,
      roster: [],
      questions: [],
    })

    expect(created.coverImagePath).toBeNull()
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
      coverImagePath: inUsePath,
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
      coverImagePath: orphanPath,
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
      coverImagePath: null,
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
