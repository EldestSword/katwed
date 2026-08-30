import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

  afterEach(() => vi.useRealTimers())

  it('keeps the player question hidden until the authoritative Double Score opening', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-09T12:00:00.000Z'))
    mocks.useSafeGameState.mockReturnValue({
      state: {
        ...gameState,
        quizType: 'standard',
        phase: 'question',
        currentQuestion: {
          id: 'double-question', type: 'true-false', prompt: 'Player question', supportingText: '',
          timeLimitSeconds: 20, points: 1000, speedScoringEnabled: true, doubleScore: true, displayOrder: 0,
          media: { type: 'none' }, mediaVisibility: 'both', presentationChoiceVisibility: 'show',
          questionNumber: 1, totalQuestions: 1,
        },
        questionPreludeKind: 'double-score',
        sessionSettings: {
          soundPackId: 'katwed', doubleScoreIntroMs: 9000, shuffleQuestionOrder: false,
          shuffleAnswerOptions: false, autoLockWhenAllAnswered: true, showPlayerAnswersToHost: true,
          questionTypeIntrosEnabled: true, answerOptionSeed: 'session',
        },
        questionOpenedAt: '2026-08-09T12:00:09.000Z',
        questionClosesAt: '2026-08-09T12:00:29.000Z',
      },
      loading: false,
      error: '',
      refresh: vi.fn(),
    })
    const first = renderPage()
    await act(async () => { await Promise.resolve() })
    expect(screen.getByRole('heading', { name: 'DOUBLE SCORE!' })).toBeVisible()
    expect(screen.queryByText('Player question')).not.toBeInTheDocument()

    await act(async () => vi.advanceTimersByTime(4500))
    first.unmount()
    renderPage()
    await act(async () => { await Promise.resolve() })
    expect(screen.getByRole('heading', { name: 'DOUBLE SCORE!' })).toBeVisible()
    await act(async () => vi.advanceTimersByTime(4510))
    expect(screen.getByText('Player question')).toBeVisible()
    expect(screen.getByText('2x points')).toBeVisible()
    expect(screen.getByLabelText('20 seconds remaining')).toBeVisible()
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
    expect(surface?.getAttribute('style')).not.toContain('--quiz-background-image')
  })

  it('shows explicit official and play-along result semantics', async () => {
    const headToHeadPlayer = { ...player, nickname: 'Jess', competitorId: 'jess' }
    mocks.reconnectPlayer.mockResolvedValue({ player: headToHeadPlayer, reconnectToken: savedSession.reconnectToken })
    mocks.useSafeGameState.mockReturnValue({
      state: {
        ...gameState,
        quizType: 'head-to-head',
        phase: 'reveal',
        currentQuestion: {
          id: 'question', type: 'true-false', assignedCompetitorId: 'jess', prompt: 'True?',
          supportingText: '', timeLimitSeconds: 30, points: 1000, displayOrder: 0,
          media: { type: 'none' }, mediaVisibility: 'both', presentationChoiceVisibility: 'show',
          questionNumber: 1, totalQuestions: 1,
        },
        players: [headToHeadPlayer, { ...player, id: 'player-2', nickname: 'Ross', competitorId: 'ross' }],
        headToHeadCompetitors: [
          { competitorId: 'jess', displayName: 'Jess', displayOrder: 0, claimed: true, connected: true, playerId: 'player-1', totalScore: 0, correctAnswerCount: 0 },
          { competitorId: 'ross', displayName: 'Ross', displayOrder: 1, claimed: true, connected: true, playerId: 'player-2', totalScore: 0, correctAnswerCount: 0 },
        ],
        headToHeadResolutions: [],
        headToHeadResults: [
          { competitorId: 'ross', assigned: false, status: 'correct', pointsAwarded: 0 },
          { competitorId: 'jess', assigned: true, status: 'incorrect', pointsAwarded: 0 },
        ],
        reveal: { type: 'true-false', correctValue: true, caption: '', counts: { true: 1, false: 1 } },
      },
      loading: false, error: '', refresh: vi.fn(),
    })
    renderPage()

    const official = within(await screen.findByRole('article', { name: 'Jess result' }))
    expect(official.getByText('Official question')).toBeVisible()
    expect(official.getByText('✕ Incorrect')).toBeVisible()
    expect(official.getByText('0 points')).toBeVisible()
    const playAlong = within(screen.getByRole('article', { name: 'Ross result' }))
    expect(playAlong.getByText('Playing along')).toBeVisible()
    expect(playAlong.getByText('✓ Correct')).toBeVisible()
    expect(playAlong.getByText('No point — play-along')).toBeVisible()
    expect(screen.queryByText(/Also got it right/i)).not.toBeInTheDocument()
  })
})
