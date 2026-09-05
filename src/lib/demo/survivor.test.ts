import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defaultLaunchGameSettings } from '../../features/game/launchSettings'
import { progressiveQuestion } from '../../test/progressiveFixtures'
import { wagerQuiz } from '../../test/wagerFixtures'
import type { Question } from '../../types/domain'
import { DemoGameRepository } from './DemoGameRepository'

const question = (id: string, buzzInEnabled = false): Question => ({
  ...progressiveQuestion(), id, displayOrder: id === 'q1' ? 0 : 1,
  progressiveRevealEnabled: false, buzzInEnabled, wagerEnabled: !buzzInEnabled,
  speedScoringEnabled: false, media: { type: 'none' },
})

async function setup(startingLives: 1 | 3 = 1, buzzSecond = true) {
  const repo = new DemoGameRepository()
  const quiz = await repo.saveQuiz(wagerQuiz([question('q1'), question('q2', buzzSecond)]))
  const session = await repo.launchGame(quiz.id, {
    ...defaultLaunchGameSettings(quiz), competitionMode: 'survivor', survivorStartingLives: startingLives,
    autoLockWhenAllAnswered: false, soundPackId: 'none', automaticTieBreakersEnabled: false,
  })
  const carol = await repo.joinRoom(session.roomCode, 'Carol')
  const roger = await repo.joinRoom(session.roomCode, 'Roger')
  const jaki = await repo.joinRoom(session.roomCode, 'Jaki')
  const phase = (action: Parameters<DemoGameRepository['changePhase']>[1]) => repo.changePhase(session.id, action)
  const host = async () => (await repo.getHostSession(session.id))!.session
  await phase('start')
  vi.setSystemTime(new Date((await host()).questionOpenedAt!))
  return { repo, quiz, session, carol, roger, jaki, phase, host }
}

beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-04T20:00:00Z')) })
afterEach(() => vi.useRealTimers())

it('finalises at Leaderboard, gates eliminated spectators and supports Typed Answer resurrection plus Buzz neutrality', async () => {
  const g = await setup()
  await g.repo.submitAnswer(g.session.roomCode, g.carol.player.id, g.carol.reconnectToken, { type: 'typed-answer', value: 'Alex' })
  await g.repo.submitAnswer(g.session.roomCode, g.roger.player.id, g.roger.reconnectToken, { type: 'typed-answer', value: 'Wrong', wagerPercent: 100 })
  expect((await g.host()).players.map(player => player.survivorLivesRemaining)).toEqual([1, 1, 1])
  await g.phase('lock'); await g.phase('reveal')
  expect((await g.host()).players.map(player => player.survivorLivesRemaining)).toEqual([1, 1, 1])
  await g.phase('leaderboard')
  let state = (await g.repo.getSafeGameState(g.session.roomCode))!
  expect(state).toMatchObject({ survivorAliveCount: 1, eligibleResponderCount: 1 })
  expect(state.players.map(player => [player.nickname, player.survivorLivesRemaining])).toEqual([
    ['Carol', 1], ['Roger', 0], ['Jaki', 0],
  ])
  expect(state.leaderboard[0].nickname).toBe('Carol')
  await expect(g.phase('next')).rejects.toThrow(/final result/)

  const answer = (await g.host()).answers.find(candidate => candidate.playerId === g.roger.player.id)!
  await g.repo.setTypedAnswerOverride(g.session.id, answer.id, true)
  expect((await g.host()).players[1]).toMatchObject({ survivorLivesRemaining: 1, survivorEliminatedAtQuestion: null })
  await g.repo.setTypedAnswerOverride(g.session.id, answer.id, null)
  expect((await g.host()).players[1]).toMatchObject({ survivorLivesRemaining: 0, survivorEliminatedAtQuestion: 1 })
  await g.repo.setTypedAnswerOverride(g.session.id, answer.id, true)
  await g.phase('next')
  vi.setSystemTime(new Date((await g.host()).questionOpenedAt!))
  await expect(g.repo.claimBuzz(g.session.roomCode, g.jaki.player.id, g.jaki.reconnectToken)).rejects.toThrow(/Eliminated/)
  await expect(g.repo.submitAnswer(g.session.roomCode, g.jaki.player.id, g.jaki.reconnectToken, { type: 'typed-answer', value: 'Alex' })).rejects.toThrow(/spectate/)
  await g.repo.claimBuzz(g.session.roomCode, g.carol.player.id, g.carol.reconnectToken)
  await g.repo.submitAnswer(g.session.roomCode, g.carol.player.id, g.carol.reconnectToken, { type: 'typed-answer', value: 'Wrong' })
  await g.phase('lock'); await g.phase('reveal'); await g.phase('finish')
  state = (await g.repo.getSafeGameState(g.session.roomCode))!
  expect(state.players.map(player => player.survivorLivesRemaining)).toEqual([1, 1, 0])
  expect(state.phase).toBe('finished')
  expect((await g.repo.reconnectPlayer({ roomCode: g.session.roomCode, playerId: g.jaki.player.id, nickname: 'Jaki', reconnectToken: g.jaki.reconnectToken }))?.player.survivorLivesRemaining).toBe(0)
})

it('allows a zero-survivor terminal board and restores configured lives on restart', async () => {
  const g = await setup(1, false)
  for (const joined of [g.carol, g.roger]) {
    await g.repo.submitAnswer(g.session.roomCode, joined.player.id, joined.reconnectToken, { type: 'typed-answer', value: 'Wrong' })
  }
  await g.phase('lock'); await g.phase('reveal'); await g.phase('leaderboard')
  const host = await g.host()
  expect(host.players.every(player => player.survivorLivesRemaining === 0)).toBe(true)
  await g.phase('finish')
  await g.phase('restart')
  expect((await g.host()).players.every(player => player.survivorLivesRemaining === 1 && player.survivorEliminatedAtQuestion === null)).toBe(true)
})

it('excludes Locked early finish but includes Reveal early finish in three-life mode', async () => {
  const g = await setup(3, false)
  await g.repo.submitAnswer(g.session.roomCode, g.carol.player.id, g.carol.reconnectToken, { type: 'typed-answer', value: 'Wrong' })
  await g.phase('lock')
  await g.phase('finish')
  expect((await g.host()).players.every(player => player.survivorLivesRemaining === 3)).toBe(true)

  await g.phase('restart'); await g.phase('start')
  vi.setSystemTime(new Date((await g.host()).questionOpenedAt!))
  await g.repo.submitAnswer(g.session.roomCode, g.carol.player.id, g.carol.reconnectToken, { type: 'typed-answer', value: 'Wrong' })
  await g.phase('lock'); await g.phase('reveal'); await g.phase('finish')
  expect((await g.host()).players.every(player => player.survivorLivesRemaining === 2)).toBe(true)
})
