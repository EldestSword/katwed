import { beforeEach, describe, expect, it } from 'vitest'
import { DemoGameRepository } from './DemoGameRepository'
import { mixedDemoQuiz, headToHeadDemoQuiz } from './sampleData'
import { parseSafeGameState } from '../supabase/safeGameState'
import { defaultRound } from '../../features/quiz-editor/rounds'
import type { SafeGameState } from '../../types/domain'

beforeEach(() => localStorage.clear())

async function launch(firstIntro = true, secondIntro = true) {
  const repository = new DemoGameRepository()
  const source = structuredClone(mixedDemoQuiz)
  source.rounds = [{ ...defaultRound(source.id), introEnabled: firstIntro }, { ...defaultRound(source.id), id: 'next-round', title: 'Next round', displayOrder: 1, introEnabled: secondIntro }]
  const question = source.questions.find((q) => q.type === 'true-false')!
  source.questions = [0, 1, 2].map((index) => ({ ...question, id: `round-q${index}`, displayOrder: index, roundId: index < 2 ? source.id : 'next-round' }))
  const quiz = await repository.saveQuiz(source)
  const session = await repository.launchGame(quiz.id)
  const joined = await repository.joinRoom(session.roomCode, 'Player')
  return { repository, quiz, session, joined, state: async () => (await repository.getSafeGameState(session.roomCode))! }
}

describe('Demo Core Rounds flow', () => {
  it('creates a new Standard quiz with one valid silent round', async () => {
    const repo = new DemoGameRepository()
    const quiz = await repo.saveQuiz({ ...mixedDemoQuiz, id: undefined, rounds: undefined, questions: [] })
    expect(quiz.rounds).toEqual([defaultRound(quiz.id)])
    expect((await repo.getQuiz(quiz.id))?.rounds).toEqual(quiz.rounds)
  })
  it.each([true, false])('advances round intros, numbering, explicit final reveal and restart (second intro %s)', async (secondIntro) => {
    const { repository: repo, session, state, joined } = await launch(true, secondIntro)
    const phase = (action: Parameters<DemoGameRepository['changePhase']>[1]) => repo.changePhase(session.id, action)
    await phase('start')
    const intro = await state()
    expect(intro).toMatchObject({ phase: 'round-intro', currentQuestion: null, questionOpenedAt: null, questionClosesAt: null, leaderboard: [], reveal: null, submittedCount: 0,
      currentRound: { title: 'Round 1', roundNumber: 1, totalRounds: 2, questionCount: 2 } })
    expect(parseSafeGameState(intro)).toMatchObject(intro)
    await expect(repo.submitAnswer(session.roomCode, joined.player.id, joined.reconnectToken, { type: 'true-false', value: true })).rejects.toThrow()
    for (const action of ['start', 'lock', 'reveal', 'leaderboard', 'next', 'finish'] as const) await expect(phase(action)).rejects.toThrow()
    await phase('start-round')
    await expect(phase('start-round')).rejects.toThrow()
    expect((await state()).currentQuestion).toMatchObject({ questionNumber: 1, totalQuestions: 3 })
    for (let index = 0; index < 2; index++) {
      await repo.submitAnswer(session.roomCode, joined.player.id, joined.reconnectToken, { type: 'true-false', value: true })
      await phase('lock'); await phase('reveal')
      expect(await state()).toMatchObject({ leaderboard: [], players: [{ totalScore: 0 }] })
      await phase('leaderboard'); await phase('next')
      await expect(phase('next')).rejects.toThrow()
      expect((await state()).phase).toBe(index === 1 && secondIntro ? 'round-intro' : 'question')
    }
    if (secondIntro) {
      expect(await state()).toMatchObject({ currentQuestion: null, currentRound: { roundNumber: 2 }, questionOpenedAt: null, questionClosesAt: null, leaderboard: [] })
      await phase('start-round')
    }
    expect((await state()).currentQuestion).toMatchObject({ questionNumber: 3, totalQuestions: 3 })
    await phase('lock'); await phase('reveal')
    await expect(phase('leaderboard')).rejects.toThrow()
    expect((await state()).leaderboard).toEqual([])
    await phase('finish')
    expect((await state()).leaderboard.length).toBe(1)
    await phase('restart')
    expect(await state()).toMatchObject({ phase: 'lobby', currentRound: { roundNumber: 1 }, leaderboard: [] })
    await phase('start')
    expect((await state()).phase).toBe('round-intro')
  })
  it('keeps a disabled first intro silent', async () => {
    const { repository, session, state } = await launch(false)
    await repository.changePhase(session.id, 'start')
    expect(await state()).toMatchObject({ phase: 'question', currentQuestion: { questionNumber: 1 }, currentRound: { roundNumber: 1 } })
  })
  it('saves, reloads and duplicates round metadata and membership', async () => {
    const { repository, quiz } = await launch()
    expect((await repository.getQuiz(quiz.id))?.rounds).toEqual(quiz.rounds)
    const duplicate = await repository.duplicateQuiz(quiz.id)
    expect(duplicate.rounds.map((r) => r.title)).toEqual(quiz.rounds.map((r) => r.title))
    expect(duplicate.questions.map((q) => q.roundId)).toEqual([duplicate.rounds[0].id, duplicate.rounds[0].id, duplicate.rounds[1].id])
  })
  it('leaves legacy stored quizzes and sessions playable after normalisation', async () => {
    const { repository, session, quiz } = await launch(false)
    const raw = JSON.parse(localStorage.getItem('katwed.demo.state.v2')!) as { quizzes: Array<Record<string, unknown>>; sessions: Array<Record<string, unknown>> }
    const legacy = raw.quizzes.find((q) => q.id === quiz.id)!
    delete legacy.rounds
    for (const q of legacy.questions as Array<Record<string, unknown>>) delete q.roundId
    delete raw.sessions[0].currentRoundId
    localStorage.setItem('katwed.demo.state.v2', JSON.stringify(raw))
    expect((await repository.getQuiz(quiz.id))?.rounds).toEqual([defaultRound(quiz.id)])
    await repository.changePhase(session.id, 'start')
    expect((await repository.getSafeGameState(session.roomCode))?.phase).toBe('question')
  })
  it('blocks malformed round references, multiple H2H rounds and launching empty rounds', async () => {
    const { repository, quiz } = await launch()
    await expect(repository.saveQuiz({ ...quiz, questions: quiz.questions.map((q) => ({ ...q, roundId: 'orphan' })) })).rejects.toThrow('round in this quiz')
    await expect(repository.saveQuiz({ ...headToHeadDemoQuiz, rounds: quiz.rounds })).rejects.toThrow('exactly one')
    await expect(repository.saveQuiz({ ...quiz, rounds: undefined })).rejects.toThrow('Reload the editor')
    const copy = await repository.duplicateQuiz(quiz.id)
    await expect(repository.saveQuiz({ ...copy, rounds: quiz.rounds.map((r) => ({ ...r, quizId: copy.id })),
      questions: quiz.questions.map((q) => ({ ...q, quizId: copy.id })) })).rejects.toThrow('Round belongs to another quiz')
    copy.rounds.push({ ...defaultRound(copy.id), id: 'empty', displayOrder: 2 })
    await repository.saveQuiz(copy)
    await expect(repository.launchGame(copy.id)).rejects.toThrow('Add a question to every round')
  })
  it('keeps H2H competitor progression untimed and skips intros', async () => {
    const repo = new DemoGameRepository()
    const quiz = await repo.saveQuiz({ ...headToHeadDemoQuiz, rounds: headToHeadDemoQuiz.rounds.map((r) => ({ ...r, introEnabled: true })) })
    const session = await repo.launchGame(quiz.id)
    const player = await repo.joinHeadToHeadRoom(session.roomCode, quiz.headToHeadCompetitors[0].id)
    await repo.joinHeadToHeadRoom(session.roomCode, quiz.headToHeadCompetitors[1].id)
    await repo.startHeadToHead(session.roomCode, player.player.id, player.reconnectToken)
    expect(await repo.getSafeGameState(session.roomCode)).toMatchObject({ phase: 'question', questionClosesAt: null })
    await expect(repo.changePhase(session.id, 'start-round')).rejects.toThrow('competitors')
  })
})

describe('round intro safe-state boundary', () => {
  it.each([
    (state: SafeGameState) => { state.currentQuestion = { id: 'leak' } as SafeGameState['currentQuestion'] },
    (state: SafeGameState) => { state.questionOpenedAt = new Date().toISOString() },
    (state: SafeGameState) => { state.questionClosesAt = new Date().toISOString() },
    (state: SafeGameState) => { state.players[0].totalScore = 100 },
    (state: SafeGameState) => { Object.assign(state.currentRound!, { answerKey: 'secret' }) },
  ])('rejects unexpected data during an intro %i', async (mutate) => {
    const { repository, session, state } = await launch()
    await repository.changePhase(session.id, 'start')
    const safe = await state(); mutate(safe)
    expect(() => parseSafeGameState(safe)).toThrow()
  })
})
