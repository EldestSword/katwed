import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { JoinPage } from './JoinPage'

const mocks = vi.hoisted(() => ({
  getRoomJoinInfo: vi.fn(),
  joinRoom: vi.fn(),
  joinHeadToHeadRoom: vi.fn(),
  reconnectPlayer: vi.fn(),
}))

vi.mock('../services/repository', () => ({ repository: mocks }))

function renderJoin(initialEntry = '/join?room=123456') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/join" element={<JoinPage />} />
        <Route path="/play/:roomCode" element={<h1>Playing</h1>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('JoinPage room modes', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it.each(['player-choice', 'balanced-random', 'host'])('joins a %s Team room with only the required selection', async (assignment) => {
    const user = userEvent.setup()
    mocks.getRoomJoinInfo.mockResolvedValue({
      roomCode: '123456', quizTitle: 'Team quiz', quizType: 'standard', status: 'active', phase: 'lobby',
      playMode: 'teams', teamAssignmentMode: assignment,
      teams: [{ id: 'blue', name: 'Blue Team', displayOrder: 0, memberCount: 2 }, { id: 'red', name: 'Red Team', displayOrder: 1, memberCount: 1 }],
    })
    mocks.joinRoom.mockResolvedValue({ player: { id: 'carol', nickname: 'Carol', teamId: assignment === 'host' ? null : 'red' }, reconnectToken: 'token' })
    renderJoin()
    await screen.findByText('Room found')
    await user.type(screen.getByLabelText('Nickname'), 'Carol')
    if (assignment === 'player-choice') {
      await user.click(screen.getByRole('button', { name: 'Join game' }))
      expect(screen.getByRole('alert')).toHaveTextContent('Choose your team.')
      expect(mocks.joinRoom).not.toHaveBeenCalled()
      const choice = screen.getByRole('button', { name: /Red Team/ })
      expect(choice).toHaveTextContent('1')
      choice.focus()
      await user.keyboard('{Enter}')
      expect(choice).toHaveAttribute('aria-pressed', 'true')
    } else {
      expect(screen.queryByRole('button', { name: /Red Team/ })).toBeNull()
    }
    await user.click(screen.getByRole('button', { name: 'Join game' }))
    expect(await screen.findByRole('heading', { name: 'Playing' })).toBeVisible()
    expect(mocks.joinRoom).toHaveBeenCalledWith('123456', 'Carol', assignment === 'player-choice' ? 'red' : undefined)
  })

  it('shows safe competitor choices instead of a nickname for Head-to-Head', async () => {
    mocks.getRoomJoinInfo.mockResolvedValue({
      roomCode: '123456', quizTitle: 'Ross vs Jess', quizType: 'head-to-head', status: 'active', phase: 'lobby',
      headToHeadCompetitors: [
        { competitorId: 'ross', displayName: 'Ross', displayOrder: 0, claimed: true, connected: true },
        { competitorId: 'jess', displayName: 'Jess', displayOrder: 1, claimed: false, connected: false },
      ],
    })
    renderJoin()
    expect(await screen.findByRole('group', { name: 'Who are you?' })).toBeVisible()
    expect(screen.queryByLabelText('Nickname')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Ross — joined/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Jess' })).toBeEnabled()
  })

  it('claims a competitor and persists the reconnect identity', async () => {
    const user = userEvent.setup()
    mocks.getRoomJoinInfo.mockResolvedValue({
      roomCode: '123456', quizTitle: 'Ross vs Jess', quizType: 'head-to-head', status: 'active', phase: 'lobby',
      headToHeadCompetitors: [{ competitorId: 'jess', displayName: 'Jess', displayOrder: 1, claimed: false, connected: false }],
    })
    mocks.joinHeadToHeadRoom.mockResolvedValue({
      player: { id: 'player-jess', sessionId: 'session', nickname: 'Jess', competitorId: 'jess', connected: true, joinedAt: '', totalScore: 0, correctAnswerCount: 0, totalCorrectResponseMs: 0 },
      reconnectToken: 'secret-token',
    })
    renderJoin()
    await user.click(await screen.findByRole('button', { name: 'Jess' }))
    expect(await screen.findByRole('heading', { name: 'Playing' })).toBeVisible()
    expect(mocks.joinHeadToHeadRoom).toHaveBeenCalledWith('123456', 'jess')
    expect(JSON.parse(localStorage.getItem('katwed.player.123456') ?? '{}')).toMatchObject({
      playerId: 'player-jess', nickname: 'Jess', competitorId: 'jess', reconnectToken: 'secret-token',
    })
  })

  it('retains ordinary nickname joining for Standard rooms', async () => {
    mocks.getRoomJoinInfo.mockResolvedValue({
      roomCode: '123456', quizTitle: 'Standard', quizType: 'standard', status: 'active', phase: 'lobby', headToHeadCompetitors: [],
    })
    renderJoin()
    await waitFor(() => expect(mocks.getRoomJoinInfo).toHaveBeenCalledWith('123456'))
    expect(screen.getByRole('status')).toHaveTextContent('Room foundStandard')
    expect(screen.getByLabelText('Nickname')).toBeVisible()
    expect(screen.getByLabelText('Nickname')).toHaveAccessibleDescription('Up to 30 characters.')
    expect(screen.getByRole('button', { name: 'Join game' })).toBeVisible()
    expect(screen.queryByRole('group', { name: 'Who are you?' })).not.toBeInTheDocument()
  })

  it('explains an invalid room before a player submits and keeps the code tied to the error', async () => {
    mocks.getRoomJoinInfo.mockResolvedValue(null)
    renderJoin('/join?room=999999')

    const error = await screen.findByRole('alert')
    expect(error).toHaveTextContent('We could not find an open room with that code.')
    expect(screen.getByLabelText('Room code')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Room code')).toHaveAccessibleDescription(error.textContent ?? '')
    expect(screen.getByRole('button', { name: 'Join game' })).toBeDisabled()
  })

  it('associates nickname validation with the nickname field', async () => {
    const user = userEvent.setup()
    mocks.getRoomJoinInfo.mockResolvedValue({
      roomCode: '123456', quizTitle: 'Standard', quizType: 'standard', status: 'active', phase: 'lobby', headToHeadCompetitors: [],
    })
    renderJoin()
    await screen.findByText('Room found')
    await user.click(screen.getByRole('button', { name: 'Join game' }))

    const nickname = screen.getByLabelText('Nickname')
    expect(nickname).toHaveAttribute('aria-invalid', 'true')
    expect(nickname).toHaveAccessibleDescription(/Up to 30 characters.*Enter the nickname/)
  })
})
