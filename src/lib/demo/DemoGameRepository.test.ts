import { beforeEach, describe, expect, it } from 'vitest'
import { DemoGameRepository } from './DemoGameRepository'

describe('DemoGameRepository multi-format game state', () => {
  beforeEach(() => localStorage.clear())

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
