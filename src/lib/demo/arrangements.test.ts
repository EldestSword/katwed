import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DemoGameRepository } from './DemoGameRepository'
import { headToHeadDemoQuiz } from './sampleData'
import { arrangementQuiz, orderingFixture, matchingFixture } from '../../test/arrangementFixtures'
import { defaultLaunchGameSettings } from '../../features/game/launchSettings'
import { parseSafeGameState } from '../supabase/safeGameState'
import { teamStandings } from '../../features/teams/teams'
import type { PlayerAnswerPayload } from '../../types/domain'

beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-04T12:00:00Z')) })
afterEach(() => vi.useRealTimers())

describe('Arrangement repository, privacy, Teams and Rounds', () => {
  it.each(['individual', 'teams'] as const)('saves, reloads and plays both types through rounds in %s mode without leaking answer structure', async (playMode) => {
    const repo = new DemoGameRepository(), source = arrangementQuiz()
    source.rounds = source.questions.map((q, i) => ({ ...source.rounds[0], id: q.roundId = `round-${i}`, title: `Round ${i + 1}`, displayOrder: i, introEnabled: true }))
    const ordering = source.questions[0] as ReturnType<typeof orderingFixture>
    ordering.items[0].label = '  Alpha  '
    const quiz = await repo.saveQuiz(source)
    expect((await repo.getQuiz(quiz.id))?.questions[0]).toMatchObject({ items: [{ label: 'Alpha' }, {}, {}, {}] })
    const session = await repo.launchGame(quiz.id, { ...defaultLaunchGameSettings(quiz), playMode, teamAssignmentMode: 'balanced-random', teamNames: ['Blue', 'Red'] })
    const player = await repo.joinRoom(session.roomCode, 'Carol')
    const state = async () => parseSafeGameState(await repo.getSafeGameState(session.roomCode))
    const phase = (action: Parameters<DemoGameRepository['changePhase']>[1]) => repo.changePhase(session.id, action)
    await phase('start')
    for (const question of quiz.questions) {
      expect((await state()).phase).toBe('round-intro'); expect((await state()).currentQuestion).toBeNull()
      await phase('start-round')
      const first = await state()
      vi.setSystemTime(new Date(first.questionOpenedAt!))
      expect(first.reveal).toBeNull()
      expect(JSON.stringify(first)).not.toMatch(/correctItemIds|correctPairs/)
      expect((await state()).currentQuestion).toEqual(first.currentQuestion)
      await repo.reconnectPlayer({ playerId: player.player.id, reconnectToken: player.reconnectToken, nickname: 'Carol', roomCode: session.roomCode })
      expect((await state()).currentQuestion).toEqual(first.currentQuestion)
      // A definition/array-order change with the same IDs cannot change safe display order.
      const savedState = JSON.parse(localStorage.getItem('katwed.demo.state.v2')!)
      const stored = savedState.quizzes.find((q: { id: string }) => q.id === quiz.id).questions.find((q: { id: string }) => q.id === question.id)
      if (stored.type === 'ordering') { stored.items.reverse(); stored.correctItemIds.reverse() }
      else { stored.leftItems.reverse(); stored.rightItems.reverse(); stored.correctPairs.reverse() }
      localStorage.setItem('katwed.demo.state.v2', JSON.stringify(savedState))
      expect((await state()).currentQuestion).toEqual(first.currentQuestion)
      if (stored.type === 'ordering') stored.correctItemIds.reverse()
      localStorage.setItem('katwed.demo.state.v2', JSON.stringify(savedState))
      const answer: PlayerAnswerPayload = question.type === 'ordering' ? { type: question.type, itemIds: question.correctItemIds }
        : { type: 'matching', pairs: (question as ReturnType<typeof matchingFixture>).correctPairs }
      await repo.submitAnswer(session.roomCode, player.player.id, player.reconnectToken, answer)
      await phase('lock'); expect((await state()).reveal).toBeNull()
      await phase('reveal'); expect((await state()).reveal?.type).toBe(question.type)
      expect((await state()).leaderboard).toEqual([])
      if (question.type === 'ordering') { await phase('leaderboard'); await phase('next') }
    }
    await phase('finish')
    const final = await state()
    expect(final.leaderboard[0]).toMatchObject({ totalScore: 2000, correctAnswerCount: 2 })
    if (playMode === 'teams') expect(teamStandings(final.teams!, final.players, final.leaderboard)[0]).toMatchObject({ totalScore: 2000, correctAnswerCount: 2 })
  })
  it.each([
    ['partial fixed', false, true, 500, false], ['partial doubled', true, true, 1000, false],
    ['full timed', false, true, 750, true], ['full timed doubled', true, true, 1500, true], ['full fixed', false, false, 1000, true],
  ] as const)('uses %s Matching points in the authoritative Demo pipeline', async (_, doubleScore, speedScoringEnabled, pointsAwarded, full) => {
    const repo = new DemoGameRepository(), q = { ...matchingFixture(), doubleScore, speedScoringEnabled }, source = arrangementQuiz()
    source.questions = [q]
    const quiz = await repo.saveQuiz(source), session = await repo.launchGame(quiz.id)
    const player = await repo.joinRoom(session.roomCode, 'Carol')
    await repo.changePhase(session.id, 'start')
    const opened = (await repo.getHostSession(session.id))!.session.questionOpenedAt!
    vi.setSystemTime(new Date(opened).getTime() + 60_000)
    const pairs = q.correctPairs.map((pair, i) => ({ ...pair, rightId: q.rightItems[full || i < 2 ? i : 5 - i].id }))
    await repo.submitAnswer(session.roomCode, player.player.id, player.reconnectToken, { type: 'matching', pairs })
    expect((await repo.getHostSession(session.id))!.session.answers[0]).toMatchObject({ correct: full, pointsAwarded })
  })
  it.each(['ordering', 'matching'] as const)('keeps %s H2H untimed, assigned-only and binary', async (type) => {
    for (const full of [true, false]) {
      localStorage.clear()
      const repo = new DemoGameRepository(), source = structuredClone(headToHeadDemoQuiz)
      const q = type === 'ordering' ? orderingFixture() : matchingFixture()
      source.questions = [{ ...q, quizId: source.id, roundId: source.rounds[0].id, assignedCompetitorId: source.headToHeadCompetitors[0].id, displayOrder: 0 }]
      const quiz = await repo.saveQuiz(source), session = await repo.launchGame(quiz.id)
      const assigned = await repo.joinHeadToHeadRoom(session.roomCode, quiz.headToHeadCompetitors[0].id)
      const audience = await repo.joinHeadToHeadRoom(session.roomCode, quiz.headToHeadCompetitors[1].id)
      await repo.startHeadToHead(session.roomCode, assigned.player.id, assigned.reconnectToken)
      vi.setSystemTime(new Date((await repo.getSafeGameState(session.roomCode))!.questionOpenedAt!))
      expect((await repo.getSafeGameState(session.roomCode))?.questionClosesAt).toBeNull()
      const answer: PlayerAnswerPayload = q.type === 'ordering' ? { type, itemIds: full ? q.correctItemIds : [...q.correctItemIds].reverse() } as PlayerAnswerPayload
        : { type: 'matching', pairs: q.correctPairs.map((pair, i) => ({ ...pair, rightId: q.rightItems[full || i < 2 ? i : 5 - i].id })) }
      await repo.submitAnswer(session.roomCode, audience.player.id, audience.reconnectToken, answer)
      await repo.submitAnswer(session.roomCode, assigned.player.id, assigned.reconnectToken, answer)
      const answers = (await repo.getHostSession(session.id))!.session.answers
      expect(answers.find(a => a.playerId === assigned.player.id)?.pointsAwarded).toBe(full ? 1 : 0)
      expect(answers.find(a => a.playerId === audience.player.id)?.pointsAwarded).toBe(0)
      await repo.changePhase(session.id, 'close')
    }
  })
})
