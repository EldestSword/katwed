import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultLaunchGameSettings } from '../../features/game/launchSettings'
import { progressiveQuestion } from '../../test/progressiveFixtures'
import { wagerQuiz } from '../../test/wagerFixtures'
import { DemoGameRepository } from './DemoGameRepository'

async function setup() {
  const repo = new DemoGameRepository()
  const question = { ...progressiveQuestion(), progressiveRevealEnabled: false, speedScoringEnabled: false, wagerEnabled: true, media: { type: 'none' as const } }
  const quiz = await repo.saveQuiz(wagerQuiz([question]))
  const session = await repo.launchGame(quiz.id, { ...defaultLaunchGameSettings(quiz), soundPackId: 'none', autoLockWhenAllAnswered: false })
  const carol = await repo.joinRoom(session.roomCode, 'Carol')
  const roger = await repo.joinRoom(session.roomCode, 'Roger')
  const jaki = await repo.joinRoom(session.roomCode, 'Jaki')
  await repo.changePhase(session.id, 'start')
  vi.setSystemTime(new Date((await repo.getHostLiveSession(session.id))!.questionOpenedAt!))
  await repo.submitAnswer(session.roomCode, jaki.player.id, jaki.reconnectToken, { type: 'typed-answer', value: 'Wrong', wagerPercent: 100 })
  await repo.changePhase(session.id, 'lock'); await repo.changePhase(session.id, 'reveal'); await repo.changePhase(session.id, 'finish')
  return { repo, session, carol, roger, jaki }
}

function privateAnswer(): string {
  const stored = JSON.parse(localStorage.getItem('katwed.demo.state.v2')!) as unknown as {
    sessions: Array<{ tieBreakerQuestion: { answer: string } }>
  }
  return stored.sessions[0].tieBreakerQuestion.answer
}

beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-04T20:00:00Z')) })
afterEach(() => vi.useRealTimers())

describe('Demo automatic tie-breaker flow', () => {
  it('diverts only the tied points leaders, reconnects locked, and preserves every quiz statistic', async () => {
    const game = await setup()
    let safe = (await game.repo.getSafeGameState(game.session.roomCode))!
    expect(safe).toMatchObject({ phase: 'tiebreaker', submittedCount: 0, eligibleResponderCount: 2 })
    expect(safe.tieBreaker?.contenderPlayerIds).toEqual(expect.arrayContaining([game.carol.player.id, game.roger.player.id]))
    expect(safe.tieBreaker?.contenderPlayerIds).not.toContain(game.jaki.player.id)
    expect(JSON.stringify(safe.tieBreaker)).not.toMatch(/correctAnswer|sourceUrl|sourceNote/)
    const before = (await game.repo.getHostLiveSession(game.session.id))!.players.map((player) => ({ ...player }))
    const answer = privateAnswer()
    await game.repo.submitTieBreakerAnswer(game.session.roomCode, game.carol.player.id, game.carol.reconnectToken, answer)
    const reconnect = await game.repo.reconnectPlayer({ ...game.carol.player, playerId: game.carol.player.id, roomCode: game.session.roomCode, reconnectToken: game.carol.reconnectToken })
    expect(reconnect?.tieBreakerSubmission).toMatchObject({ round: 1, questionId: safe.tieBreaker?.questionId })
    await expect(game.repo.submitTieBreakerAnswer(game.session.roomCode, game.carol.player.id, game.carol.reconnectToken, answer)).rejects.toThrow(/already answered/)
    vi.setSystemTime(new Date(Date.now() + 1))
    await game.repo.submitTieBreakerAnswer(game.session.roomCode, game.roger.player.id, game.roger.reconnectToken, String(Number(answer) + 10))
    safe = (await game.repo.getSafeGameState(game.session.roomCode))!
    expect(safe).toMatchObject({ phase: 'tiebreaker-result', tieBreaker: { winnerPlayerId: game.carol.player.id } })
    await game.repo.revealTieBreakerFinal(game.session.id)
    safe = (await game.repo.getSafeGameState(game.session.roomCode))!
    expect(safe.leaderboard[0].playerId).toBe(game.carol.player.id)
    const after = (await game.repo.getHostLiveSession(game.session.id))!.players
    expect(after.map(({ totalScore, correctAnswerCount, totalCorrectResponseMs, currentCorrectStreak, longestCorrectStreak }) =>
      ({ totalScore, correctAnswerCount, totalCorrectResponseMs, currentCorrectStreak, longestCorrectStreak }))).toEqual(
      before.map(({ totalScore, correctAnswerCount, totalCorrectResponseMs, currentCorrectStreak, longestCorrectStreak }) =>
        ({ totalScore, correctAnswerCount, totalCorrectResponseMs, currentCorrectStreak, longestCorrectStreak })),
    )
  })

  it('continues an exact secondary tie with an unused question and clears all history on restart', async () => {
    const game = await setup()
    const first = (await game.repo.getSafeGameState(game.session.roomCode))!.tieBreaker!
    const answer = privateAnswer()
    await game.repo.submitTieBreakerAnswer(game.session.roomCode, game.carol.player.id, game.carol.reconnectToken, answer)
    await game.repo.submitTieBreakerAnswer(game.session.roomCode, game.roger.player.id, game.roger.reconnectToken, answer)
    expect((await game.repo.getSafeGameState(game.session.roomCode))!.tieBreaker).toMatchObject({ winnerPlayerId: null })
    await game.repo.nextTieBreaker(game.session.id)
    const second = (await game.repo.getSafeGameState(game.session.roomCode))!.tieBreaker!
    expect(second.round).toBe(2)
    expect(second.questionId).not.toBe(first.questionId)
    expect(second.category).not.toBe(first.category)
    await game.repo.resolveTieBreaker(game.session.id)
    await game.repo.nextTieBreaker(game.session.id)
    const thirdAnswer = privateAnswer()
    await game.repo.submitTieBreakerAnswer(game.session.roomCode, game.carol.player.id, game.carol.reconnectToken, thirdAnswer)
    await game.repo.resolveTieBreaker(game.session.id)
    await game.repo.revealTieBreakerFinal(game.session.id)
    await game.repo.changePhase(game.session.id, 'restart')
    const host = (await game.repo.getHostLiveSession(game.session.id))!
    expect(host).toMatchObject({ phase: 'lobby', tieBreaker: null })
  })

  it('keeps early aborts, Teams and Head-to-Head out of the tie-breaker flow', async () => {
    const repo = new DemoGameRepository()
    const source = wagerQuiz([{ ...progressiveQuestion(), progressiveRevealEnabled: false, media: { type: 'none' as const } }])
    const quiz = await repo.saveQuiz(source)
    const early = await repo.launchGame(quiz.id, defaultLaunchGameSettings(quiz))
    await repo.joinRoom(early.roomCode, 'A'); await repo.joinRoom(early.roomCode, 'B'); await repo.changePhase(early.id, 'start'); await repo.changePhase(early.id, 'finish')
    expect((await repo.getSafeGameState(early.roomCode))?.phase).toBe('finished')
    await repo.changePhase(early.id, 'restart'); await repo.changePhase(early.id, 'close')
    const teams = await repo.launchGame(quiz.id, { ...defaultLaunchGameSettings(quiz), playMode: 'teams', teamAssignmentMode: 'balanced-random', teamNames: ['Blue', 'Red'] })
    expect(teams.settings.automaticTieBreakersEnabled).toBe(false)
  })
})
