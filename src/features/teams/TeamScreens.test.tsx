import { act, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useRevealedLeaderboard } from '../../hooks/useRevealedLeaderboard'
import { board, roundIntroState, standingsState } from '../../test/leaderboardFixtures'
import { mixedDemoQuiz } from '../../lib/demo/sampleData'
import { createGameSessionSettings, defaultLaunchGameSettings } from '../game/launchSettings'
import { PresentationStage } from '../game/PresentationStage'
import { TeamFinalResults } from './TeamFinalResults'
import { TeamSetup } from './TeamSetup'
import { TeamLobby } from './TeamLobby'
import { competitionState } from './teams'
import type { SafeGameState } from '../../types/domain'

const teams = ['Blue Team', 'Red Team'].map((name, displayOrder) => ({ id: `t${displayOrder}`, sessionId: 'standings-session', name, displayOrder }))
function state(phase: SafeGameState['phase'], second = false): SafeGameState {
  const entries = board(['Carol', 'Jaki'], second ? [1000, 2000] : [1000, 500]).map((entry) => ({ ...entry, correctAnswerCount: 3, totalCorrectResponseMs: 6000 }))
  return { ...(phase === 'round-intro' ? roundIntroState() : standingsState(phase, entries, second ? 2 : 1)), teams,
    players: entries.map((entry, i) => ({ id: entry.playerId, sessionId: 'standings-session', nickname: entry.nickname, teamId: teams[i].id, connected: true, joinedAt: '', totalScore: 0, correctAnswerCount: 0, totalCorrectResponseMs: 0 })),
    sessionSettings: createGameSessionSettings({ playMode: 'teams' }, mixedDemoQuiz, 's') }
}
afterEach(() => vi.useRealTimers())
describe('Team presentation and history', () => {
  it.each([false, true])('groups teams, retains animation through Round Intro and crowns a team (compact %s)', async (compact) => {
    vi.useFakeTimers()
    const view = render(<PresentationStage state={state('lobby')} compact={compact} />)
    expect(screen.getByRole('region', { name: 'Blue Team members' })).toHaveTextContent('Carol')
    expect(screen.queryByRole('combobox')).toBeNull()
    view.rerender(<PresentationStage state={state('leaderboard')} compact={compact} />)
    view.rerender(<PresentationStage state={state('round-intro')} compact={compact} />)
    expect(screen.getByRole('heading', { name: 'Next round' })).toBeVisible()
    expect(view.container.querySelector('.animated-leaderboard')).toBeNull()
    view.rerender(<PresentationStage state={state('question', true)} compact={compact} />)
    view.rerender(<PresentationStage state={state('leaderboard', true)} compact={compact} />)
    expect(view.container.querySelector('.animated-leaderboard')).toHaveAttribute('data-reveal-stage', 'holding')
    await act(async () => { vi.advanceTimersByTime(2600) })
    expect(screen.getByRole('status')).toHaveTextContent('Red Team takes the lead!')
    view.rerender(<PresentationStage state={state('finished', true)} compact={compact} />)
    expect(screen.getByRole('heading', { name: 'Red Team' })).toBeVisible()
    expect(screen.getByText('Team winners')).toBeVisible()
    expect(screen.getByRole('region', { name: 'Individual honours' })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'Biggest Climber' })).toBeNull()
  })
  it('uses only stat honours, highlighting the current team and individual achievement independently', () => {
    const { container } = render(<TeamFinalResults state={state('finished', true)} currentPlayerId="jaki" variant="player" />)
    expect(container.querySelector('.final-podium .is-current')).toHaveTextContent('Red Team')
    expect(screen.getByRole('article', { name: 'Most Correct' })).toHaveTextContent('Carol & Jaki')
    expect(screen.getByRole('article', { name: 'Quickest Thinker' })).toHaveTextContent('2.0s average each')
    expect(screen.queryByText('Biggest Climber')).toBeNull()
  })
  it('does not invent positions after refresh and resets when switching competition identity', () => {
    const { result, rerender } = renderHook((s: SafeGameState) => useRevealedLeaderboard(competitionState(s)), { initialProps: state('round-intro') })
    rerender(state('leaderboard', true)); expect(result.current.reveal?.previous).toBeNull()
    rerender(standingsState('leaderboard')); expect(result.current.reveal?.previous).toBeNull()
  })
  it('shows unassigned players with labelled host-only movement controls', async () => {
    const onAssign = vi.fn(), s = state('lobby')
    s.players[0].teamId = null
    render(<TeamLobby teams={teams} players={s.players} onAssign={onAssign} />)
    expect(screen.getByRole('region', { name: 'Unassigned members' })).toHaveTextContent('Carol')
    await userEvent.setup().selectOptions(screen.getByLabelText('Team for Carol'), 't1')
    expect(onAssign).toHaveBeenCalledWith('carol', 't1')
  })
  it('offers session-only modes and keyboard-accessible names and bounds', async () => {
    const onChange = vi.fn(), settings = defaultLaunchGameSettings(mixedDemoQuiz)
    const view = render(<TeamSetup settings={settings} onChange={onChange} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Teams' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ playMode: 'teams' }))
    view.rerender(<TeamSetup settings={{ ...settings, playMode: 'teams', teamNames: [' Blue ', 'blue'] }} onChange={onChange} />)
    expect(screen.getByRole('alert')).toHaveTextContent('unique')
    expect(screen.getByLabelText('Team 1 name')).toHaveAttribute('maxlength', '30')
    expect(screen.getByRole('button', { name: 'Remove team 1' })).toBeDisabled()
  })
})
