import { beforeEach, describe, expect, it } from 'vitest'
import { DemoGameRepository } from './DemoGameRepository'

describe('DemoGameRepository game state', () => {
  beforeEach(() => localStorage.clear())

  it('joins a lobby, rejects invalid rooms and duplicate nicknames case-insensitively', async () => {
    const repository = new DemoGameRepository()
    await expect(repository.joinRoom('999999', 'Alex')).rejects.toMatchObject({ code: 'invalid-room' })
    const session = await repository.launchGame('quiz-demo')
    await repository.joinRoom(session.roomCode, 'Quizzer')
    await expect(repository.joinRoom(session.roomCode, 'qUiZzEr')).rejects.toMatchObject({ code: 'duplicate-nickname' })
  })

  it('moves through every explicit game phase', async () => {
    const repository = new DemoGameRepository()
    const session = await repository.launchGame('quiz-demo')
    await repository.joinRoom(session.roomCode, 'Player One')
    await repository.changePhase(session.id, 'start')
    expect((await repository.getSafeGameState(session.roomCode))?.phase).toBe('question')
    await repository.changePhase(session.id, 'lock')
    await repository.changePhase(session.id, 'reveal')
    expect((await repository.getSafeGameState(session.roomCode))?.reveal?.correctMemberIds).toEqual(['member-alex', 'member-bailey'])
    await repository.changePhase(session.id, 'leaderboard')
    await repository.changePhase(session.id, 'next')
    expect((await repository.getSafeGameState(session.roomCode))?.phase).toBe('question')
    await repository.changePhase(session.id, 'finish')
    expect((await repository.getSafeGameState(session.roomCode))?.phase).toBe('finished')
  })

  it('restores a player using the opaque reconnect token', async () => {
    const repository = new DemoGameRepository()
    const session = await repository.launchGame('quiz-demo')
    const joined = await repository.joinRoom(session.roomCode, 'Refresh Me')
    const restored = await repository.reconnectPlayer({
      playerId: joined.player.id, roomCode: session.roomCode, nickname: joined.player.nickname, reconnectToken: joined.reconnectToken,
    })
    expect(restored?.player.id).toBe(joined.player.id)
    expect(await repository.reconnectPlayer({
      playerId: joined.player.id, roomCode: session.roomCode, nickname: joined.player.nickname, reconnectToken: 'wrong',
    })).toBeNull()
  })

  it('rejects submissions outside the question phase, duplicate submissions and late submissions', async () => {
    const repository = new DemoGameRepository()
    const session = await repository.launchGame('quiz-demo')
    const joined = await repository.joinRoom(session.roomCode, 'Exact Pair')
    const submit = () => repository.submitAnswer(session.roomCode, joined.player.id, joined.reconnectToken, ['member-alex', 'member-bailey'])
    await expect(submit()).rejects.toMatchObject({ code: 'invalid-phase' })
    await repository.changePhase(session.id, 'start')
    await submit()
    await expect(submit()).rejects.toMatchObject({ code: 'duplicate-submission' })

    localStorage.clear()
    const lateRepository = new DemoGameRepository()
    const lateSession = await lateRepository.launchGame('quiz-demo')
    const latePlayer = await lateRepository.joinRoom(lateSession.roomCode, 'Late One')
    await lateRepository.changePhase(lateSession.id, 'start')
    const raw = localStorage.getItem('katwed.demo.state.v1')
    if (!raw) throw new Error('Demo state missing')
    const data = JSON.parse(raw) as { sessions: Array<{ id: string; questionClosesAt: string }> }
    const storedSession = data.sessions.find((candidate) => candidate.id === lateSession.id)
    if (!storedSession) throw new Error('Session missing')
    storedSession.questionClosesAt = new Date(Date.now() - 1000).toISOString()
    localStorage.setItem('katwed.demo.state.v1', JSON.stringify(data))
    await expect(lateRepository.submitAnswer(lateSession.roomCode, latePlayer.player.id, latePlayer.reconnectToken, ['member-alex', 'member-bailey']))
      .rejects.toMatchObject({ code: 'late-submission' })
  })

  it('updates and sorts the leaderboard after exact-pair scoring', async () => {
    const repository = new DemoGameRepository()
    const session = await repository.launchGame('quiz-demo')
    const zed = await repository.joinRoom(session.roomCode, 'Zed')
    const amy = await repository.joinRoom(session.roomCode, 'Amy')
    await repository.changePhase(session.id, 'start')
    await repository.submitAnswer(session.roomCode, zed.player.id, zed.reconnectToken, ['member-casey', 'member-alex'])
    await repository.submitAnswer(session.roomCode, amy.player.id, amy.reconnectToken, ['member-bailey', 'member-alex'])
    const state = await repository.getSafeGameState(session.roomCode)
    expect(state?.leaderboard.map((entry) => entry.nickname)).toEqual(['Amy', 'Zed'])
    expect(state?.leaderboard[0].totalScore).toBe(1)
  })
})
