import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DemoGameRepository } from './DemoGameRepository'
import { allWagerQuestions, correctPayload, wagerQuiz } from '../../test/wagerFixtures'
import { progressiveQuestion } from '../../test/progressiveFixtures'
import { matchingFixture } from '../../test/arrangementFixtures'
import { connectionsFixture } from '../../test/connectionsFixtures'
import { defaultLaunchGameSettings } from '../../features/game/launchSettings'
import { teamStandings } from '../../features/teams/teams'
import { parseSafeGameState } from '../supabase/safeGameState'
import type { PlayerAnswerPayload, Question } from '../../types/domain'

beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-04T14:00:00Z')) })
afterEach(() => vi.useRealTimers())
async function game(question: Question, teams = false) {
  const repo = new DemoGameRepository(), quiz = await repo.saveQuiz(wagerQuiz([question]))
  const session = await repo.launchGame(quiz.id, { ...defaultLaunchGameSettings(quiz), soundPackId: 'none', autoLockWhenAllAnswered: false, playMode: teams ? 'teams' : 'individual', teamNames: ['Blue','Red'], teamAssignmentMode: 'host' })
  const player = await repo.joinRoom(session.roomCode,'Carol')
  if (teams) await repo.assignPlayerTeam(session.id, player.player.id, session.teams![0].id)
  const action = (kind: Parameters<DemoGameRepository['changePhase']>[1]) => repo.changePhase(session.id,kind)
  await action('start')
  const opened = Date.parse((await repo.getSafeGameState(session.roomCode))!.questionOpenedAt!)
  vi.setSystemTime(opened + 10000)
  return { repo, quiz, session, player, action, opened, submit: (payload: PlayerAnswerPayload) => repo.submitAnswer(session.roomCode,player.player.id,player.reconnectToken,payload) }
}
it.each(allWagerQuestions().map(q => [q.type,q] as const))('%s scores a fully correct 50%% wager and preserves metrics', async (_type,q) => {
  if (q.type === 'pinpoint') q.target = { kind: 'circle', x: .5, y: .5, radius: .1 }
  const g = await game(q)
  await g.submit({ ...correctPayload(q), wagerPercent: 50 })
  const host = (await g.repo.getHostSession(g.session.id))!.session
  expect(host.answers[0]).toMatchObject({ correct: true, pointsAwarded: 1500, wagerPercent: 50, responseTimeMs: 10000 })
  expect(host.answers[0].payload).not.toHaveProperty('wagerPercent')
  expect(host.players[0]).toMatchObject({ totalScore: 1500, correctAnswerCount: 1, totalCorrectResponseMs: 10000 })
  const safe = parseSafeGameState(await g.repo.getSafeGameState(g.session.roomCode))
  expect(safe.currentQuestion?.wagerEnabled).toBe(true)
  expect(safe.leaderboard).toEqual([])
  expect(JSON.stringify(safe)).not.toMatch(/wagerPercent|1500/)
  await expect(g.submit({ ...correctPayload(q), wagerPercent: 100 })).rejects.toThrow(/already/)
})
it.each([
  ['Speed + Double', { ...progressiveQuestion(), progressiveRevealEnabled: false, timeLimitSeconds: 100, doubleScore: true }, 2400],
  ['Progressive + Double', { ...progressiveQuestion(), doubleScore: true }, 1750],
  ['Connections stage + Double', { ...connectionsFixture(), doubleScore: true }, 2500],
] as const)('%s adds a base-value stake after ordinary scoring', async (_name,q,expected) => {
  const g = await game(q)
  await g.submit({ ...correctPayload(q), wagerPercent: 50 })
  expect((await g.repo.getHostSession(g.session.id))!.session.answers[0].pointsAwarded).toBe(expected)
})
it('partial Matching loses the stake after Progressive and Double', async () => {
  const q = { ...matchingFixture(), scoringMode: 'partial' as const, speedScoringEnabled: true, progressiveRevealEnabled: true, media: progressiveQuestion().media, doubleScore: true }
  const g = await game(q)
  const pairs = q.correctPairs.map((p,i,a) => ({ ...p, rightId: i < 2 ? p.rightId : a[i === 2 ? 3 : 2].rightId }))
  await g.submit({ type: 'matching', pairs, wagerPercent: 100 })
  expect((await g.repo.getHostSession(g.session.id))!.session.answers[0]).toMatchObject({ correct: false, pointsAwarded: -376 })
})
it('partial Multiple Select loses its wager without fabricating correctness', async () => {
  const q = allWagerQuestions().find(q => q.type === 'multiple-select')!
  if (q.type !== 'multiple-select') throw Error('fixture')
  q.scoringMode = 'partial-wipeout'; q.minimumSelections = 1
  const g = await game(q)
  await g.submit({ type: q.type, optionIds: [q.correctOptionIds[0]], wagerPercent: 100 })
  expect((await g.repo.getHostSession(g.session.id))!.session.answers[0]).toMatchObject({ correct: false, pointsAwarded: Math.floor(1000 / q.correctOptionIds.length) - 1000 })
})
it.each([false,true])('Typed override accept/undo uses the persisted wager and original time; progressive=%s', async progressive => {
  const q = { ...progressiveQuestion(), progressiveRevealEnabled: progressive, speedScoringEnabled: false, doubleScore: progressive }
  const g = await game(q), host = async () => (await g.repo.getHostSession(g.session.id))!.session
  await g.submit({ type: 'typed-answer', value: 'Almost', wagerPercent: 50 }); await g.action('lock')
  expect((await host()).answers[0].pointsAwarded).toBe(-500)
  const id = (await host()).answers[0].id
  vi.setSystemTime(Date.now() + 60000)
  await g.repo.setTypedAnswerOverride(g.session.id,id,true)
  expect((await host()).players[0]).toMatchObject({ totalScore: progressive ? 1750 : 1500, correctAnswerCount: 1, totalCorrectResponseMs: 10000 })
  await g.repo.setTypedAnswerOverride(g.session.id,id,null)
  expect((await host()).players[0]).toMatchObject({ totalScore: -500, correctAnswerCount: 0, totalCorrectResponseMs: 0 })
})
it('keeps negative player/Team totals, carries losses across rounds and clears answers on restart', async () => {
  const q = { ...progressiveQuestion(), progressiveRevealEnabled: false, speedScoringEnabled: false }
  const repo = new DemoGameRepository(), source = wagerQuiz([q])
  source.rounds.push({ ...source.rounds[0], id: 'second', title: 'Second', displayOrder: 1, introEnabled: true })
  source.questions.push({ ...source.questions[0], id: 'next', roundId: 'second', displayOrder: 1, points: 500, wagerEnabled: false })
  const quiz = await repo.saveQuiz(source), session = await repo.launchGame(quiz.id,{ ...defaultLaunchGameSettings(quiz), playMode: 'teams', teamNames: ['Blue','Red'], teamAssignmentMode: 'host', autoLockWhenAllAnswered: false })
  const p = await repo.joinRoom(session.roomCode,'Ross'); await repo.assignPlayerTeam(session.id,p.player.id,session.teams![0].id)
  const action = (kind: Parameters<DemoGameRepository['changePhase']>[1]) => repo.changePhase(session.id,kind)
  await action('start')
  await repo.submitAnswer(session.roomCode,p.player.id,p.reconnectToken,{type:'typed-answer',value:'Wrong',wagerPercent:100})
  const board = async () => { await action('lock'); await action('reveal'); await action('leaderboard'); return (await repo.getSafeGameState(session.roomCode))! }
  let state = await board()
  expect(state.leaderboard[0].totalScore).toBe(-1000)
  expect(teamStandings(state.teams!,state.players,state.leaderboard).find(t => t.teamId === session.teams![0].id)!.totalScore).toBe(-1000)
  await action('next'); expect((await repo.getSafeGameState(session.roomCode))?.currentQuestion).toBeNull()
  await action('start-round')
  await repo.submitAnswer(session.roomCode,p.player.id,p.reconnectToken,{type:'typed-answer',value:'Alex'})
  await action('lock'); await action('reveal'); await action('finish')
  state = (await repo.getSafeGameState(session.roomCode))!; expect(state.leaderboard[0].totalScore).toBe(-500)
  await action('restart')
  const reset = (await repo.getHostSession(session.id))!.session
  expect(reset.answers).toEqual([]); expect(reset.hostResponses).toEqual([]); expect(reset.players[0].totalScore).toBe(0)
})
