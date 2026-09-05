import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { progressiveQuiz } from '../../test/progressiveFixtures'
import { matchingFixture } from '../../test/arrangementFixtures'
import { DemoGameRepository } from './DemoGameRepository'
import { defaultLaunchGameSettings } from '../../features/game/launchSettings'
import { parseSafeGameState } from '../supabase/safeGameState'
import { teamStandings } from '../../features/teams/teams'

beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-04T12:00:00Z')) })
afterEach(() => vi.useRealTimers())

it.each(['individual', 'teams'] as const)('scores early/late answers with safe alt, natural %s totals, no progress writes and Round 2 timing', async playMode => {
  const repo = new DemoGameRepository(), source = progressiveQuiz()
  source.rounds.push({ ...source.rounds[0], id: 'round-2', title: 'Second round', displayOrder: 1, introEnabled: true })
  source.questions.push({ ...matchingFixture(), roundId: 'round-2', progressiveRevealEnabled: true, media: source.questions[0].media, doubleScore: true })
  const quiz = await repo.saveQuiz(source), session = await repo.launchGame(quiz.id, { ...defaultLaunchGameSettings(quiz), playMode, teamNames: ['Blue', 'Red'], teamAssignmentMode: 'host', soundPackId: 'none', autoLockWhenAllAnswered: false })
  const early = await repo.joinRoom(session.roomCode, 'Early'), late = await repo.joinRoom(session.roomCode, 'Late')
  if (playMode === 'teams') for (const p of [early, late]) await repo.assignPlayerTeam(session.id, p.player.id, session.teams![0].id)
  const state = async () => parseSafeGameState(await repo.getSafeGameState(session.roomCode))
  const action = (kind: Parameters<DemoGameRepository['changePhase']>[1]) => repo.changePhase(session.id, kind)
  const submit = (p: typeof early) => repo.submitAnswer(session.roomCode, p.player.id, p.reconnectToken, { type: 'typed-answer', value: 'Alex' })
  await action('start')
  const first = await state(), start = Date.parse(first.questionOpenedAt!)
  const write = vi.spyOn(Storage.prototype, 'setItem'), fetch = vi.spyOn(repo, 'getSafeGameState')
  const before = localStorage.getItem('katwed.demo.state.v2')
  vi.setSystemTime(start + 5000)
  expect(write).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled()
  expect(localStorage.getItem('katwed.demo.state.v2')).toBe(before)
  write.mockRestore(); fetch.mockRestore()
  expect(first.currentQuestion).toMatchObject({ progressiveRevealEnabled: true, speedScoringEnabled: false, media: { altText: 'Progressively revealing question image' } })
  expect(JSON.stringify(first)).not.toMatch(/Alex is the answer|"correctAnswer"|acceptedAnswers/)
  await submit(early)
  vi.setSystemTime(start + 25000); await submit(late)
  await expect(submit(early)).rejects.toThrow(/already/)
  await action('lock')
  expect((await state()).currentQuestion?.media).toMatchObject({ altText: 'Progressively revealing question image' })
  await action('reveal')
  expect((await state()).currentQuestion?.media).toMatchObject({ altText: 'Alex is the answer' })
  await action('leaderboard')
  const board = await state()
  expect(board.leaderboard.map(p => p.totalScore)).toEqual([812, 250])
  if (playMode === 'teams') expect(teamStandings(board.teams!, board.players, board.leaderboard)[0].totalScore).toBe(1062)
  await action('next'); const intro = await state()
  expect(intro.phase).toBe('round-intro'); expect(intro.currentQuestion).toBeNull(); expect(intro.questionOpenedAt).toBeNull()
  vi.setSystemTime(start + 85000); await action('start-round')
  const second = await state(), secondStart = Date.parse(second.questionOpenedAt!)
  expect(secondStart).toBeGreaterThanOrEqual(start + 85000)
  vi.setSystemTime(secondStart + 10000)
  const match = source.questions[1]
  if (match.type !== 'matching') throw new Error('Fixture')
  const pairs = match.correctPairs.map((pair, i, all) => ({ ...pair, rightId: i < 2 ? pair.rightId : all[i === 2 ? 3 : 2].rightId }))
  await repo.submitAnswer(session.roomCode, early.player.id, early.reconnectToken, { type: 'matching', pairs })
  expect((await repo.getHostSession(session.id))!.session.answers.find(a => a.questionId === match.id)).toMatchObject({ pointsAwarded: 624, responseTimeMs: 10000 })
})

it('recalculates a typed correction from its original response time, then undoes it', async () => {
  const repo = new DemoGameRepository(), source = progressiveQuiz(); source.questions[0].doubleScore = true
  const quiz = await repo.saveQuiz(source), session = await repo.launchGame(quiz.id), p = await repo.joinRoom(session.roomCode, 'Roger')
  await repo.changePhase(session.id, 'start')
  vi.setSystemTime(Date.parse((await repo.getSafeGameState(session.roomCode))!.questionOpenedAt!) + 10000)
  await repo.submitAnswer(session.roomCode, p.player.id, p.reconnectToken, { type: 'typed-answer', value: 'Al' })
  await repo.changePhase(session.id, 'lock')
  const answer = (await repo.getHostSession(session.id))!.session.answers[0]
  vi.setSystemTime(Date.now() + 60000)
  await repo.setTypedAnswerOverride(session.id, answer.id, true)
  expect((await repo.getHostSession(session.id))!.session.answers[0]).toMatchObject({ pointsAwarded: 1250, responseTimeMs: 10000 })
  await repo.setTypedAnswerOverride(session.id, answer.id, null)
  expect((await repo.getHostSession(session.id))!.session.players[0].totalScore).toBe(0)
})
