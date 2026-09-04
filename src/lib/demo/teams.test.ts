import { beforeEach, describe, expect, it } from 'vitest'
import { DemoGameRepository } from './DemoGameRepository'
import { headToHeadDemoQuiz, mixedDemoQuiz } from './sampleData'
import { defaultLaunchGameSettings } from '../../features/game/launchSettings'
import { parseSafeGameState } from '../supabase/safeGameState'
import { teamStandings } from '../../features/teams/teams'
import type { TeamAssignmentMode } from '../../types/domain'

beforeEach(() => localStorage.clear())
async function launch(mode: TeamAssignmentMode = 'player-choice') {
  const repo = new DemoGameRepository()
  const source = structuredClone(mixedDemoQuiz)
  source.rounds = [{ ...source.rounds[0], introEnabled: true }, { ...source.rounds[0], id: 'second', displayOrder: 1, title: 'Second round', introEnabled: true }]
  const question = source.questions.find((q) => q.type === 'true-false')!
  source.questions = [0, 1, 2].map((index) => ({ ...question, id: `team-q${index}`, displayOrder: index, roundId: index ? 'second' : source.id, speedScoringEnabled: false, doubleScore: false }))
  const quiz = await repo.saveQuiz(source)
  const session = await repo.launchGame(quiz.id, { ...defaultLaunchGameSettings(quiz), playMode: 'teams', teamAssignmentMode: mode, teamNames: ['Blue Team', 'Red Team'] })
  return { repo, quiz, session, state: async () => (await repo.getSafeGameState(session.roomCode))! }
}
describe('Demo Team sessions', () => {
  it('retains Individual launch/join and rejects H2H Teams', async () => {
    const repo = new DemoGameRepository(), session = await repo.launchGame(mixedDemoQuiz.id)
    const joined = await repo.joinRoom(session.roomCode, 'Carol')
    expect(joined.player.teamId).toBeNull()
    expect(session.settings.playMode).toBe('individual')
    const h2h = await repo.saveQuiz(structuredClone(headToHeadDemoQuiz))
    await expect(repo.launchGame(h2h.id, { ...defaultLaunchGameSettings(h2h), playMode: 'teams' })).rejects.toThrow('Head-to-Head')
  })
  it('requires a valid same-room team for player choice and preserves it on reconnect', async () => {
    const { repo, session } = await launch()
    await expect(repo.joinRoom(session.roomCode, 'Carol')).rejects.toThrow('Choose a team')
    await expect(repo.joinRoom(session.roomCode, 'Carol', 'elsewhere')).rejects.toThrow('Choose a team')
    const joined = await repo.joinRoom(session.roomCode, 'Carol', session.teams![1].id)
    expect((await repo.reconnectPlayer({ playerId: joined.player.id, roomCode: session.roomCode, nickname: 'Carol', reconnectToken: joined.reconnectToken }))?.player.teamId).toBe(session.teams![1].id)
    expect(await repo.getRoomJoinInfo(session.roomCode)).toMatchObject({ playMode: 'teams', teams: [{ memberCount: 0 }, { memberCount: 1 }] })
  })
  it('balances simultaneous joins and retains IDs/names/statistics when the host balances', async () => {
    const { repo, session, state } = await launch('balanced-random')
    const joined = await Promise.all(Array.from({ length: 21 }, (_, i) => repo.joinRoom(session.roomCode, `Player ${i}`)))
    const counts = () => state().then((s) => s.teams!.map((team) => s.players.filter((p) => p.teamId === team.id).length))
    expect(Math.abs((await counts())[0] - (await counts())[1])).toBe(1)
    await repo.assignPlayerTeam(session.id, joined[0].player.id, session.teams![0].id)
    await repo.balanceTeams(session.id)
    expect(Math.abs((await counts())[0] - (await counts())[1])).toBe(1)
    expect((await state()).players.map(({ teamId: _id, ...p }) => p)).toEqual(joined.map(({ player: { teamId: _id, ...p } }) => p))
  })
  it('blocks start until host assignment, rejects invalid references, and freezes membership after starting', async () => {
    const { repo, session, state } = await launch('host')
    await expect(repo.changePhase(session.id, 'start')).rejects.toThrow('Assign every player')
    const joined = await repo.joinRoom(session.roomCode, 'Carol')
    expect(joined.player.teamId).toBeNull()
    await expect(repo.changePhase(session.id, 'start')).rejects.toThrow('Assign every player')
    await expect(repo.assignPlayerTeam(session.id, joined.player.id, 'elsewhere')).rejects.toThrow()
    await expect(repo.assignPlayerTeam(session.id, 'elsewhere', session.teams![0].id)).rejects.toThrow()
    await repo.assignPlayerTeam(session.id, joined.player.id, session.teams![1].id)
    await repo.changePhase(session.id, 'start')
    expect((await state()).phase).toBe('round-intro')
    await expect(repo.balanceTeams(session.id)).rejects.toThrow()
    await expect(repo.assignPlayerTeam(session.id, joined.player.id, session.teams![0].id)).rejects.toThrow()
    await expect(repo.joinRoom(session.roomCode, 'Late')).rejects.toThrow()
  })
  it('preserves membership and ordinary scores across rounds, withholds reveal totals, and finishes authoritatively', async () => {
    const { repo, session, state } = await launch()
    const joined = await repo.joinRoom(session.roomCode, 'Carol', session.teams![0].id)
    const phase = (action: Parameters<DemoGameRepository['changePhase']>[1]) => repo.changePhase(session.id, action)
    await phase('start')
    for (let i = 0; i < 3; i++) {
      if ((await state()).phase === 'round-intro') await phase('start-round')
      await repo.submitAnswer(session.roomCode, joined.player.id, joined.reconnectToken, { type: 'true-false', value: true })
      await phase('lock'); await phase('reveal')
      const hidden = parseSafeGameState(await state())
      expect(hidden.leaderboard).toEqual([]); expect(hidden.players[0].totalScore).toBe(0)
      expect(hidden.players[0].teamId).toBe(session.teams![0].id)
      if (i < 2) { await phase('leaderboard'); await phase('next') }
    }
    await phase('finish')
    const final = await state()
    expect(teamStandings(final.teams!, final.players, final.leaderboard)[0]).toMatchObject({ totalScore: 3000, correctAnswerCount: 3 })
    await phase('restart')
    expect((await state()).players[0]).toMatchObject({ teamId: session.teams![0].id, totalScore: 0 })
  })
})
