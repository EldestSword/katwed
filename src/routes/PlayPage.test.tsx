import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SafeGameState } from '../types/domain'
import { PlayPage } from './PlayPage'

const player = {
  id: 'player-1',
  sessionId: 'session-1',
  nickname: 'Quizzer',
  connected: true,
  joinedAt: '2026-08-07T12:00:00.000Z',
  totalScore: 0,
  correctAnswerCount: 0,
  totalCorrectResponseMs: 0,
}

const savedSession = {
  playerId: player.id,
  roomCode: '123456',
  nickname: player.nickname,
  reconnectToken: 'token',
}

const gameState: SafeGameState = {
  sessionId: 'session-1',
  quizTitle: 'Background quiz',
  themeId: 'paper',
  backgroundId: 'paper-collage',
  roomCode: '123456',
  status: 'active',
  phase: 'lobby',
  currentQuestion: null,
  roster: [],
  players: [player],
  submittedCount: 0,
  leaderboard: [],
  reveal: null,
  questionOpenedAt: null,
  questionClosesAt: null,
}

const mocks = vi.hoisted(() => ({
  useSafeGameState: vi.fn(),
  reconnectPlayer: vi.fn(),
  setPlayerPresence: vi.fn(),
  startHeadToHead: vi.fn(),
  skipHeadToHead: vi.fn(),
  continueHeadToHead: vi.fn(),
}))

vi.mock('../hooks/useSafeGameState', () => ({ useSafeGameState: mocks.useSafeGameState }))
vi.mock('../services/repository', () => ({
  repository: {
    reconnectPlayer: mocks.reconnectPlayer,
    setPlayerPresence: mocks.setPlayerPresence,
    startHeadToHead: mocks.startHeadToHead,
    skipHeadToHead: mocks.skipHeadToHead,
    continueHeadToHead: mocks.continueHeadToHead,
    submitAnswer: vi.fn(),
  },
}))
vi.mock('../services/playerSession', () => ({
  clearPlayerSession: vi.fn(),
  loadPlayerSession: () => savedSession,
  loadSubmittedAnswer: () => null,
  saveSubmittedAnswer: vi.fn(),
}))

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/play/123456']}>
      <Routes><Route path="/play/:roomCode" element={<PlayPage />} /></Routes>
    </MemoryRouter>,
  )
}

describe('PlayPage quiz background', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.useSafeGameState.mockReturnValue({ state: gameState, loading: false, error: '', refresh: vi.fn() })
    mocks.reconnectPlayer.mockResolvedValue({ player, reconnectToken: savedSession.reconnectToken })
    mocks.setPlayerPresence.mockResolvedValue(undefined)
  })

  it('shows two named slots and lets either joined competitor start once both are ready', async () => {
    const user = userEvent.setup()
    const headToHeadPlayer = { ...player, nickname: 'Ross', competitorId: 'ross' }
    mocks.reconnectPlayer.mockResolvedValue({ player: headToHeadPlayer, reconnectToken: savedSession.reconnectToken })
    mocks.startHeadToHead.mockResolvedValue(undefined)
    mocks.useSafeGameState.mockReturnValue({
      state: {
        ...gameState,
        quizType: 'head-to-head',
        players: [headToHeadPlayer, { ...player, id: 'player-2', nickname: 'Jess', competitorId: 'jess' }],
        headToHeadCompetitors: [
          { competitorId: 'ross', displayName: 'Ross', displayOrder: 0, claimed: true, connected: true, playerId: 'player-1', totalScore: 0, correctAnswerCount: 0 },
          { competitorId: 'jess', displayName: 'Jess', displayOrder: 1, claimed: true, connected: true, playerId: 'player-2', totalScore: 0, correctAnswerCount: 0 },
        ],
        headToHeadResolutions: [], headToHeadResults: [],
      },
      loading: false, error: '', refresh: vi.fn(),
    })
    renderPage()
    expect((await screen.findAllByText('Ross')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Jess').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'Start game' }))
    expect(mocks.startHeadToHead).toHaveBeenCalledWith('123456', 'player-1', 'token')
  })

  it('applies the selected decorative background to the joined-player game surface', async () => {
    const { container } = renderPage()
    await screen.findByRole('heading', { name: /You’re in, Quizzer!/ })

    const surface = container.querySelector('.player-game')
    expect(surface).toHaveAttribute('data-quiz-theme', 'paper')
    expect(surface).toHaveAttribute('data-quiz-background', 'paper-collage')
    expect(surface?.getAttribute('style')).toContain('/backgrounds/paper-collage.webp')
  })

  it('leaves Theme default without a static image', async () => {
    mocks.useSafeGameState.mockReturnValue({
      state: { ...gameState, backgroundId: null },
      loading: false,
      error: '',
    })
    const { container } = renderPage()
    await screen.findByRole('heading', { name: /You’re in, Quizzer!/ })

    const surface = container.querySelector('.player-game')
    expect(surface).not.toHaveAttribute('data-quiz-background')
    expect(surface).not.toHaveAttribute('style')
  })
})
