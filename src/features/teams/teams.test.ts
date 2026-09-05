import { describe, expect, it } from 'vitest'
import { mixedDemoQuiz } from '../../lib/demo/sampleData'
import { board, standingsState } from '../../test/leaderboardFixtures'
import { createGameSessionSettings, normaliseLaunchGameSettings } from '../game/launchSettings'
import { competitionState, normalisePlayMode, smallestTeam, teamStandings, validateTeamLaunch } from './teams'

const teams = ['Blue Team', 'Red Team'].map((name, displayOrder) => ({ id: `t${displayOrder}`, sessionId: 's', name, displayOrder }))
const players = [{ id: 'carol', teamId: 't0' }, { id: 'jaki', teamId: 't1' }, { id: 'roger', teamId: 't1' }, { id: 'ross', teamId: null }]

describe('session-only Team settings', () => {
  it.each([undefined, null, '', 'unknown', false])('defaults malformed or missing %s play mode to Individual', (value) => expect(normalisePlayMode(value)).toBe('individual'))
  it('retains only session configuration, never launch names or quiz mutations', () => {
    const original = structuredClone(mixedDemoQuiz)
    const settings = { playMode: 'teams' as const, teamAssignmentMode: 'host' as const, teamNames: [' Blue Team ', 'Red Team'] }
    expect(normaliseLaunchGameSettings(settings, mixedDemoQuiz).teamNames).toEqual(['Blue Team', 'Red Team'])
    expect(createGameSessionSettings(settings, mixedDemoQuiz, 's')).toMatchObject({ playMode: 'teams', teamAssignmentMode: 'host' })
    expect(createGameSessionSettings(settings, mixedDemoQuiz, 's')).not.toHaveProperty('teamNames')
    expect(mixedDemoQuiz).toEqual(original)
    expect(createGameSessionSettings(undefined, mixedDemoQuiz, 's').playMode).toBe('individual')
  })
  it.each([[], ['One'], Array.from({ length: 9 }, (_, i) => `Team ${i}`), ['', 'Two'], ['   ', 'Two'], ['x'.repeat(31), 'Two'], [' BLUE ', 'blue']].map((teamNames) => ({ teamNames })))('rejects invalid teams $teamNames', ({ teamNames }) => expect(validateTeamLaunch({ playMode: 'teams', teamNames }, 'standard')).not.toBeNull())
  it.each([2, 8])('accepts %s teams only for Standard', (length) => {
    const settings = { playMode: 'teams' as const, teamNames: Array.from({ length }, (_, i) => `Team ${i}`) }
    expect(validateTeamLaunch(settings, 'standard')).toBeNull()
    expect(validateTeamLaunch(settings, 'head-to-head')).toBe('Head-to-Head cannot use Teams.')
  })
  it('rejects an unknown assignment mode', () => expect(validateTeamLaunch({ playMode: 'teams', teamAssignmentMode: 'bad' as 'host' }, 'standard')).not.toBeNull())
})

describe('derived Team standings', () => {
  it('sums only assigned members’ visible statistics without mutating any source', () => {
    const entries = board(['Carol', 'Jaki', 'Roger', 'Ross'], [1000, 700, 500, 9000])
    const original = structuredClone(entries)
    const result = teamStandings(teams, players, entries)
    expect(result[0]).toMatchObject({ teamId: 't1', name: 'Red Team', rank: 1, memberCount: 2, totalScore: 1200, correctAnswerCount: 2, totalCorrectResponseMs: 2000 })
    expect(result[1].totalScore).toBe(1000)
    expect(entries).toEqual(original)
    expect(teamStandings(teams, players.map((p) => ({ ...p, teamId: 't0' })), entries)[0].totalScore).toBe(11200)
  })
  it('breaks score ties by correct count, correct response time, then authored order', () => {
    const entries = board(['Carol', 'Jaki'], [1000, 1000])
    entries[1].correctAnswerCount = 2
    expect(teamStandings(teams, players, entries)[0].teamId).toBe('t1')
    entries[1].correctAnswerCount = 1; entries[1].totalCorrectResponseMs = 900
    expect(teamStandings(teams, players, entries)[0].teamId).toBe('t1')
    entries[1].totalCorrectResponseMs = 1000
    expect(teamStandings([...teams].reverse(), players, entries)[0].teamId).toBe('t0')
  })
  it.each(['lobby', 'question', 'locked', 'reveal', 'round-intro'] as const)('never derives a visible board during %s, even with hidden totals supplied', (phase) => {
    const state = { ...standingsState(phase), teams, sessionSettings: createGameSessionSettings({ playMode: 'teams' }, mixedDemoQuiz, 's'), leaderboard: board(['Carol'], [9999]) }
    expect(competitionState(state)?.leaderboard).toEqual([])
  })
  it('uses team IDs, preserves Individual input and chooses fairly among equal smallest teams', () => {
    const state = standingsState('leaderboard')
    expect(competitionState(state)).toBe(state)
    expect(smallestTeam(teams, [], () => 0)).toBe('t0')
    expect(smallestTeam(teams, [], () => .9)).toBe('t1')
    expect(smallestTeam(teams, [{ teamId: 't0' }], () => 0)).toBe('t1')
  })
  it('aggregates 100 players across eight teams synchronously', () => {
    const manyTeams = Array.from({ length: 8 }, (_, i) => ({ ...teams[0], id: `team${i}`, displayOrder: i }))
    const entries = board(Array.from({ length: 100 }, (_, i) => `P${i}`), Array(100).fill(1000))
    const members = entries.map((entry, i) => ({ id: entry.playerId, teamId: manyTeams[i % 8].id }))
    expect(teamStandings(manyTeams, members, entries).reduce((sum, team) => sum + team.totalScore, 0)).toBe(100000)
  })
})
