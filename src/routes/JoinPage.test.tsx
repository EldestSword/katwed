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

function renderJoin() {
  return render(
    <MemoryRouter initialEntries={['/join?room=123456']}>
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
    expect(screen.getByLabelText('Nickname')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Join game' })).toBeVisible()
    expect(screen.queryByRole('group', { name: 'Who are you?' })).not.toBeInTheDocument()
  })
})
