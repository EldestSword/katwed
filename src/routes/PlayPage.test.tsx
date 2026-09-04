import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SafeGameState } from '../types/domain'
import { PlayPage } from './PlayPage'
import { currentBoard, previousBoard, roundIntroState, standingsState } from '../test/leaderboardFixtures'

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
  submitAnswer: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock('../hooks/useSafeGameState', () => ({ useSafeGameState: mocks.useSafeGameState }))
vi.mock('../services/repository', () => ({
  repository: {
    reconnectPlayer: mocks.reconnectPlayer,
    setPlayerPresence: mocks.setPlayerPresence,
    startHeadToHead: mocks.startHeadToHead,
    skipHeadToHead: mocks.skipHeadToHead,
    continueHeadToHead: mocks.continueHeadToHead,
    submitAnswer: mocks.submitAnswer,
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
    mocks.useSafeGameState.mockReturnValue({ state: gameState, loading: false, error: '', refresh: mocks.refresh })
    mocks.reconnectPlayer.mockResolvedValue({ player, reconnectToken: savedSession.reconnectToken })
    mocks.setPlayerPresence.mockResolvedValue(undefined)
    mocks.submitAnswer.mockResolvedValue(undefined)
    mocks.refresh.mockResolvedValue(undefined)
  })

  afterEach(() => vi.useRealTimers())

  it('updates the lobby team from safe state, then shows team standings and final honours', async () => {
    const page = () => <MemoryRouter initialEntries={['/play/123456']}><Routes><Route path="/play/:roomCode" element={<PlayPage />} /></Routes></MemoryRouter>
    const teams = [{ id: 'blue', name: 'Blue Team', sessionId: player.sessionId, displayOrder: 0 }, { id: 'red', name: 'Red Team', sessionId: player.sessionId, displayOrder: 1 }]
    const show = (phase: SafeGameState['phase'], teamId: string | null) => mocks.useSafeGameState.mockReturnValue({
      state: { ...gameState, phase, teams, sessionSettings: { playMode: 'teams', teamAssignmentMode: 'host' }, players: [{ ...player, teamId }],
        leaderboard: phase === 'leaderboard' || phase === 'finished' ? [{ playerId: player.id, nickname: player.nickname, rank: 1, totalScore: 3000, correctAnswerCount: 3, totalCorrectResponseMs: 9000 }] : [] },
      loading: false, error: '', refresh: mocks.refresh,
    })
    show('lobby', null)
    const view = render(page())
    await screen.findByText('Waiting for the host to put you on a team…')
    show('lobby', 'red')
    view.rerender(page())
    expect(screen.getByText('Red Team')).toBeVisible()
    expect(screen.queryByText('Waiting for the host to put you on a team…')).toBeNull()
    show('leaderboard', 'red')
    view.rerender(page())
    const board = screen.getByRole('list', { name: 'Leaderboard' })
    expect(board).toHaveTextContent('Red Team')
    expect(board).not.toHaveTextContent('Quizzer')
    show('finished', 'red')
    view.rerender(page())
    expect(screen.getByRole('heading', { name: 'Red Team' })).toBeVisible()
    expect(screen.getByRole('list', { name: 'Top final positions' }).querySelector('.is-current')).toHaveTextContent('Red Team')
    expect(screen.getByRole('region', { name: 'Individual honours' })).toHaveTextContent('Quizzer')
    expect(screen.queryByRole('article', { name: 'Biggest Climber' })).toBeNull()
    expect(mocks.reconnectPlayer).toHaveBeenCalledTimes(1)
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('carries personal movement and truthful final awards across a round intro without extra repository work', async () => {
    const page = () => <MemoryRouter initialEntries={['/play/123456']}><Routes><Route path="/play/:roomCode" element={<PlayPage />} /></Routes></MemoryRouter>
    const show = (phase: SafeGameState['phase'], number: number, entries = previousBoard) => mocks.useSafeGameState.mockReturnValue({
      state: { ...standingsState(phase, entries, number), sessionId: player.sessionId, players: [player],
        questionOpenedAt: '2026-09-04T10:00:00Z', leaderboard: entries.map((entry) => entry.playerId === 'jaki' ? { ...entry, playerId: player.id } : entry) },
      loading: false, error: '', refresh: mocks.refresh,
    })
    show('leaderboard', 1)
    const view = render(page())
    await screen.findByRole('heading', { name: 'Leaderboard' })
    const presenceCalls = mocks.setPlayerPresence.mock.calls.length
    mocks.useSafeGameState.mockReturnValue({
      state: { ...roundIntroState(), sessionId: player.sessionId, players: [player] },
      loading: false, error: '', refresh: mocks.refresh,
    })
    view.rerender(page())
    expect(screen.getByRole('heading', { name: 'Next round' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Lock in' })).toBeNull()
    expect(screen.queryByRole('list', { name: 'Leaderboard' })).toBeNull()
    expect(screen.queryByText(/You’re now/)).toBeNull()
    expect(screen.queryByRole('region', { name: 'Tonight’s awards' })).toBeNull()
    show('question', 2, [])
    view.rerender(page())
    expect(screen.queryByRole('region', { name: 'Tonight’s awards' })).toBeNull()
    show('leaderboard', 2, currentBoard)
    view.rerender(page())
    expect(screen.getByRole('status')).toHaveTextContent('↑ 2')
    expect(screen.getByRole('status')).toHaveTextContent('You’re now 1st')
    show('finished', 5, currentBoard)
    view.rerender(page())
    const card = screen.getByRole('article', { name: 'Biggest Climber' })
    expect(card).toHaveTextContent('3rd → 1st')
    expect(card).toHaveClass('is-current')
    expect(mocks.setPlayerPresence).toHaveBeenCalledTimes(presenceCalls)
    expect(mocks.reconnectPlayer).toHaveBeenCalledTimes(1)
    expect(mocks.refresh).not.toHaveBeenCalled()
    expect(mocks.submitAnswer).not.toHaveBeenCalled()
  })

  it('retains revealed leaderboard history for personal movement without extra repository work or hidden-phase scores', async () => {
    const page = () => <MemoryRouter initialEntries={['/play/123456']}><Routes><Route path="/play/:roomCode" element={<PlayPage />} /></Routes></MemoryRouter>
    const stateFor = (phase: SafeGameState['phase'], entries = previousBoard, questionNumber = 1): SafeGameState => ({
      ...standingsState(phase, entries, questionNumber), sessionId: player.sessionId,
      players: [player], leaderboard: phase === 'leaderboard' ? entries.map((entry) => entry.playerId === 'jaki' ? { ...entry, playerId: player.id } : entry) : [],
    })
    const show = (state: SafeGameState) => mocks.useSafeGameState.mockReturnValue({ state, loading: false, error: '', refresh: mocks.refresh })
    show(stateFor('leaderboard'))
    const view = render(page())
    await screen.findByRole('heading', { name: 'Leaderboard' })
    expect(screen.queryByText(/You’re now/)).toBeNull()
    const presenceCalls = mocks.setPlayerPresence.mock.calls.length
    for (const phase of ['question', 'locked', 'reveal'] as const) {
      show(stateFor(phase, [], 2))
      view.rerender(page())
      expect(screen.queryByRole('list', { name: 'Leaderboard' })).toBeNull()
      expect(screen.queryByText(/You’re now/)).toBeNull()
      expect(screen.queryByText('4,400 points')).toBeNull()
    }
    show(stateFor('leaderboard', currentBoard, 2))
    view.rerender(page())
    expect(screen.getByRole('status')).toHaveTextContent('↑ 2')
    expect(screen.getByRole('status')).toHaveTextContent('You’re now 1st')
    expect(screen.queryByText(/takes the lead/)).toBeNull()
    show(stateFor('leaderboard', [...currentBoard], 2))
    view.rerender(page())
    expect(screen.getByRole('status')).toHaveTextContent('↑ 2')
    expect(mocks.setPlayerPresence).toHaveBeenCalledTimes(presenceCalls)
    expect(mocks.reconnectPlayer).toHaveBeenCalledTimes(1)
    expect(mocks.refresh).not.toHaveBeenCalled()
    expect(mocks.submitAnswer).not.toHaveBeenCalled()
    view.unmount()
    render(page())
    await screen.findByRole('heading', { name: 'Leaderboard' })
    expect(screen.queryByText(/You’re now/)).toBeNull()
  })

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

  it('keeps the Standard lobby coherent without a room-wide live player count', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'You’re in, Quizzer!' })).toBeVisible()
    expect(screen.getByText('Waiting for the host to start.')).toBeVisible()
    expect(screen.queryByText(/players? in the lobby/i)).not.toBeInTheDocument()
  })

  it('uses a 30-second presence heartbeat and keeps the page-hide disconnect path', async () => {
    vi.useFakeTimers()
    renderPage()
    await act(async () => { await Promise.resolve() })
    expect(mocks.setPlayerPresence).toHaveBeenCalledWith(savedSession, true)
    const initialCalls = mocks.setPlayerPresence.mock.calls.length

    await act(async () => vi.advanceTimersByTimeAsync(29_999))
    expect(mocks.setPlayerPresence).toHaveBeenCalledTimes(initialCalls)
    await act(async () => vi.advanceTimersByTimeAsync(1))
    expect(mocks.setPlayerPresence).toHaveBeenCalledTimes(initialCalls + 1)

    await act(async () => {
      window.dispatchEvent(new Event('pagehide'))
      await Promise.resolve()
    })
    expect(mocks.setPlayerPresence).toHaveBeenLastCalledWith(expect.objectContaining(savedSession), false)
  })

  it('uses local submitted state without a Standard post-submit refresh', async () => {
    const user = userEvent.setup()
    mocks.useSafeGameState.mockReturnValue({
      state: {
        ...gameState,
        quizType: 'standard',
        phase: 'question',
        currentQuestion: {
          id: 'question', type: 'true-false', prompt: 'True?', supportingText: '', timeLimitSeconds: 30,
          points: 1000, speedScoringEnabled: false, doubleScore: false, displayOrder: 0,
          media: { type: 'none' }, mediaVisibility: 'both', presentationChoiceVisibility: 'show',
          questionNumber: 1, totalQuestions: 1,
        },
      },
      loading: false, error: '', refresh: mocks.refresh,
    })
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'True' }))
    await user.click(screen.getByRole('button', { name: 'Lock in' }))

    expect(await screen.findByRole('heading', { name: 'Answer locked' })).toBeVisible()
    expect(mocks.submitAnswer).toHaveBeenCalledTimes(1)
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('retains the Head-to-Head post-submit refresh', async () => {
    const user = userEvent.setup()
    const headToHeadPlayer = { ...player, competitorId: 'quizzer' }
    mocks.reconnectPlayer.mockResolvedValue({ player: headToHeadPlayer, reconnectToken: savedSession.reconnectToken })
    mocks.useSafeGameState.mockReturnValue({
      state: {
        ...gameState,
        quizType: 'head-to-head', players: [headToHeadPlayer], phase: 'question',
        headToHeadCompetitors: [{ competitorId: 'quizzer', displayName: 'Quizzer', displayOrder: 0, claimed: true, connected: true, playerId: player.id, totalScore: 0, correctAnswerCount: 0 }],
        headToHeadResolutions: [], headToHeadResults: [],
        currentQuestion: {
          id: 'question', type: 'true-false', assignedCompetitorId: 'quizzer', prompt: 'True?',
          supportingText: '', timeLimitSeconds: 30, points: 1000, displayOrder: 0,
          media: { type: 'none' }, mediaVisibility: 'both', presentationChoiceVisibility: 'show',
          questionNumber: 1, totalQuestions: 1,
        },
      },
      loading: false, error: '', refresh: mocks.refresh,
    })
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'True' }))
    await user.click(screen.getByRole('button', { name: 'Lock in' }))
    await screen.findByRole('heading', { name: 'Answer locked' })
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
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
