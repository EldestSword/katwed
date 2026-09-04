import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { defaultLaunchGameSettings } from '../../features/game/launchSettings'
import { SupabaseGameRepository } from './SupabaseGameRepository'

describe('Team repository RPC boundary', () => {
  it('retains the original join signature and adds only a selected-team RPC', async () => {
    const result = { player: { id: 'player', teamId: 'blue' }, reconnectToken: 'token' }
    const rpc = vi.fn().mockResolvedValue({ data: result, error: null })
    const repository = new SupabaseGameRepository({ rpc } as unknown as SupabaseClient)
    expect(await repository.joinRoom('123456', 'Carol')).toBe(result)
    expect(rpc).toHaveBeenLastCalledWith('join_room', { p_room_code: '123456', p_nickname: 'Carol' })
    expect(await repository.joinRoom('123456', 'Carol', 'blue')).toBe(result)
    expect(rpc).toHaveBeenLastCalledWith('join_team_room', { p_room_code: '123456', p_nickname: 'Carol', p_team_id: 'blue' })
    expect(rpc).toHaveBeenCalledTimes(2)
  })

  it('delegates owner membership operations without fetching or broadcasting', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null })
    const channel = vi.fn()
    const repository = new SupabaseGameRepository({ rpc, channel } as unknown as SupabaseClient)
    await repository.assignPlayerTeam('session', 'carol', 'red')
    await repository.balanceTeams('session')
    expect(rpc.mock.calls).toEqual([
      ['host_assign_player_team', { p_session_id: 'session', p_player_id: 'carol', p_team_id: 'red' }],
      ['host_balance_teams', { p_session_id: 'session' }],
    ])
    expect(channel).not.toHaveBeenCalled()
  })

  it('passes launch-only names and preserves canonical returned definitions', async () => {
    const settings = { ...defaultLaunchGameSettings({ soundPackId: 'none' }), playMode: 'teams' as const, teamAssignmentMode: 'host' as const, teamNames: ['Blue', 'Red'] }
    const teams = [{ id: 'blue', sessionId: 'session', name: 'Blue', displayOrder: 0 }]
    const rpc = vi.fn().mockResolvedValue({ data: { id: 'session', settings, teams, players: [{ id: 'carol', teamId: null }] }, error: null })
    const repository = new SupabaseGameRepository({ rpc } as unknown as SupabaseClient)
    const session = await repository.launchGame('quiz', settings)
    expect(rpc).toHaveBeenCalledWith('host_launch_game', { p_quiz_id: 'quiz', p_settings: expect.objectContaining(settings) })
    expect(session.teams).toBe(teams)
    expect(session.settings).toMatchObject({ playMode: 'teams', teamAssignmentMode: 'host' })
    expect(session.settings).not.toHaveProperty('teamNames')
  })

  it('surfaces membership permission failures without retrying or substituting local assignments', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: '42501', message: 'Unauthorised' } })
    const repository = new SupabaseGameRepository({ rpc } as unknown as SupabaseClient)
    await expect(repository.assignPlayerTeam('session', 'carol', 'red')).rejects.toMatchObject({ code: 'unauthorised' })
    expect(rpc).toHaveBeenCalledTimes(1)
  })
})
