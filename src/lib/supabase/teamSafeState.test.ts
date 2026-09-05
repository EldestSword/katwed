import { describe, expect, it } from 'vitest'
import { standingsState } from '../../test/leaderboardFixtures'
import { parseSafeGameState } from './safeGameState'

const team = { id: 'team', name: 'Blue Team', sessionId: 'standings-session', displayOrder: 0 }
describe('safe Team data', () => {
  it('accepts safe definitions without adding totals or altering legacy state', () => {
    expect(parseSafeGameState({ ...standingsState('lobby'), teams: [team] }).teams).toEqual([team])
    expect(parseSafeGameState(standingsState('lobby')).sessionSettings?.playMode).toBe('individual')
  })
  it.each([{ ...team, totalScore: 9999 }, { ...team, sessionId: 'other' }, { ...team, name: '' }, { ...team, displayOrder: -1 }])('rejects invalid or score-bearing team metadata %j', (value) => {
    expect(() => parseSafeGameState({ ...standingsState('reveal'), teams: [value] })).toThrow('team')
  })
  it('rejects membership outside the room and all cumulative score leaks at answer reveal', () => {
    expect(() => parseSafeGameState({ ...standingsState('lobby'), teams: [team], players: [{ id: 'p', teamId: 'foreign' }] })).toThrow('membership')
    expect(() => parseSafeGameState({ ...standingsState('reveal'), teams: [team], players: [{ id: 'p', teamId: 'team', totalScore: 5 }] })).toThrow('totals')
  })
})
