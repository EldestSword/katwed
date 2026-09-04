import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultLaunchGameSettings } from '../../features/game/launchSettings'
import { recomputePlayerStreaks } from '../../features/game/streaks'
import { progressiveQuestion } from '../../test/progressiveFixtures'
import { wagerQuiz } from '../../test/wagerFixtures'
import type { LaunchGameSettings, Player, PlayerAnswer, Question } from '../../types/domain'
import { DemoGameRepository } from './DemoGameRepository'

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-04T16:00:00Z'))
})
afterEach(() => vi.useRealTimers())

function buzzQuestion(overrides: Partial<Question> = {}): Question {
  return {
    ...progressiveQuestion(),
    progressiveRevealEnabled: false,
    speedScoringEnabled: false,
    media: { type: 'none' },
    buzzInEnabled: true,
    wagerEnabled: true,
    ...overrides,
  } as Question
}

async function setup(question = buzzQuestion(), playerCount = 2, settings: Partial<LaunchGameSettings> = {}) {
  const repo = new DemoGameRepository()
  const input = wagerQuiz([question])
  const quiz = await repo.saveQuiz(input)
  const session = await repo.launchGame(quiz.id, {
    ...defaultLaunchGameSettings(quiz),
    soundPackId: 'none',
    autoLockWhenAllAnswered: false,
    ...settings,
  })
  const players = await Promise.all(Array.from({ length: playerCount }, (_, index) => repo.joinRoom(session.roomCode, `Player ${index + 1}`)))
  await repo.changePhase(session.id, 'start')
  const openedAt = Date.parse((await repo.getSafeGameState(session.roomCode))!.questionOpenedAt!)
  vi.setSystemTime(openedAt + 2_000)
  return { repo, quiz, session, players, openedAt }
}

describe('Demo Buzz-In authority', () => {
  it('atomically chooses one winner from 75 claims and gives every loser the same result', async () => {
    const game = await setup(buzzQuestion(), 75)
    const results = await Promise.all(game.players.map(player => game.repo.claimBuzz(game.session.roomCode, player.player.id, player.reconnectToken)))
    expect(results.filter(result => result.won)).toHaveLength(1)
    expect(new Set(results.map(result => result.winnerPlayerId))).toEqual(new Set([results[0].winnerPlayerId]))
    expect(Date.parse(results[0].answerDeadlineAt) - Date.parse(results[0].claimedAt)).toBe(10_000)
    expect((await game.repo.getSafeGameState(game.session.roomCode))!.buzz).toMatchObject({ winnerPlayerId: results[0].winnerPlayerId })
  })

  it('allows only the winner to answer, measures response time from question open and supports a pre-answer reset', async () => {
    const game = await setup()
    const first = await game.repo.claimBuzz(game.session.roomCode, game.players[0].player.id, game.players[0].reconnectToken)
    await expect(game.repo.submitAnswer(game.session.roomCode, game.players[1].player.id, game.players[1].reconnectToken, { type: 'typed-answer', value: 'Alex' })).rejects.toThrow(/Only the Buzz winner/)
    await game.repo.resetBuzz(game.session.id)
    expect((await game.repo.getSafeGameState(game.session.roomCode))!.buzz).toBeNull()
    const second = await game.repo.claimBuzz(game.session.roomCode, game.players[1].player.id, game.players[1].reconnectToken)
    expect(second.winnerPlayerId).not.toBe(first.winnerPlayerId)
    const reconnected = await game.repo.reconnectPlayer({ roomCode: game.session.roomCode, playerId: game.players[1].player.id, nickname: game.players[1].player.nickname, reconnectToken: game.players[1].reconnectToken })
    expect(reconnected?.player.id).toBe(second.winnerPlayerId)
    vi.setSystemTime(Date.parse(second.claimedAt) + 9_999)
    await game.repo.submitAnswer(game.session.roomCode, reconnected!.player.id, reconnected!.reconnectToken, { type: 'typed-answer', value: 'Alex', wagerPercent: 50 })
    const host = (await game.repo.getHostSession(game.session.id))!.session
    expect(host.answers[0]).toMatchObject({ playerId: game.players[1].player.id, correct: true, pointsAwarded: 1500, responseTimeMs: 11_999 })
    await expect(game.repo.resetBuzz(game.session.id)).rejects.toThrow(/after the winner has answered/)
  })

  it('rejects claims and submissions at the authoritative deadline and truncates the window to question close', async () => {
    const game = await setup(buzzQuestion({ timeLimitSeconds: 5 }))
    vi.setSystemTime(game.openedAt + 4_000)
    const claim = await game.repo.claimBuzz(game.session.roomCode, game.players[0].player.id, game.players[0].reconnectToken)
    expect(Date.parse(claim.answerDeadlineAt)).toBe(game.openedAt + 5_000)
    vi.setSystemTime(game.openedAt + 5_000)
    await expect(game.repo.submitAnswer(game.session.roomCode, game.players[0].player.id, game.players[0].reconnectToken, { type: 'typed-answer', value: 'Alex' })).rejects.toThrow(/Time is up|window has closed/)
  })

  it('locks immediately after the winner submits when auto-lock is enabled', async () => {
    const game = await setup(buzzQuestion(), 2, { autoLockWhenAllAnswered: true })
    const claim = await game.repo.claimBuzz(game.session.roomCode, game.players[0].player.id, game.players[0].reconnectToken)
    await game.repo.submitAnswer(game.session.roomCode, claim.winnerPlayerId, game.players[0].reconnectToken, { type: 'typed-answer', value: 'Alex' })
    const state = (await game.repo.getSafeGameState(game.session.roomCode))!
    expect(state.phase).toBe('locked')
    expect(Date.parse(state.buzz!.answerDeadlineAt)).toBeLessThanOrEqual(Date.parse(state.questionClosesAt!))
  })

  it.each([
    { label: 'correct', buzzCorrect: true },
    { label: 'wrong', buzzCorrect: false },
    { label: 'missing', buzzCorrect: undefined },
  ])('keeps a $label Buzz result neutral when compacting streak history', ({ buzzCorrect }) => {
    const players = [{ id: 'player' }] as Player[]
    const answers = [
      { playerId: 'player', questionId: 'ordinary-one', correct: true },
      { playerId: 'player', questionId: 'ordinary-two', correct: true },
      ...(buzzCorrect === undefined ? [] : [{ playerId: 'player', questionId: 'buzz', correct: buzzCorrect }]),
      { playerId: 'player', questionId: 'ordinary-three', correct: true },
    ] as PlayerAnswer[]
    expect(recomputePlayerStreaks(players, answers, ['ordinary-one', 'ordinary-two', 'buzz', 'ordinary-three'], new Set(['buzz']))[0]).toMatchObject({ currentCorrectStreak: 3, longestCorrectStreak: 3 })
  })

  it.each([
    ['before question', 'lobby'],
    ['after lock', 'locked'],
  ] as const)('rejects a claim %s', async (_label, phase) => {
    const game = await setup()
    if (phase === 'locked') await game.repo.changePhase(game.session.id, 'lock')
    else {
      await game.repo.changePhase(game.session.id, 'finish')
      await game.repo.changePhase(game.session.id, 'restart')
    }
    await expect(game.repo.claimBuzz(game.session.roomCode, game.players[0].player.id, game.players[0].reconnectToken)).rejects.toThrow(/not open|not active/)
  })
})
