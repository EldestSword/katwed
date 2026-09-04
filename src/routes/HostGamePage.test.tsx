import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mixedDemoQuiz } from '../lib/demo/sampleData'
import type { GameSession, Player, SafeGameState } from '../types/domain'
import { hostResponseRecordForAnswer } from '../features/game/hostResponses'
import { HostGamePage } from './HostGamePage'
import { connectionsFixture, safeConnections } from '../test/connectionsFixtures'

const repositoryMocks = vi.hoisted(() => ({
  getHostSession: vi.fn(),
  getHostLiveSession: vi.fn(),
  getSafeGameState: vi.fn(),
  changePhase: vi.fn(),
  revealConnectionClue: vi.fn(),
  setTypedAnswerOverride: vi.fn(),
  subscribe: vi.fn(),
}))

vi.mock('../services/repository', () => ({ repository: repositoryMocks }))

const players: Player[] = Array.from({ length: 4 }, (_, index) => ({
  id: `player-${index + 1}`, sessionId: 'session', nickname: `Player ${index + 1}`,
  connected: index !== 3, joinedAt: '2026-08-26T12:00:00.000Z', totalScore: 0,
  correctAnswerCount: 0, totalCorrectResponseMs: 0,
}))

const session: GameSession = {
  currentRoundId: null,
  id: 'session', quizId: mixedDemoQuiz.id, roomCode: '123456', status: 'active', phase: 'question',
  currentQuestionIndex: 0, questionOpenedAt: '2026-08-26T12:00:00.000Z',
  questionClosesAt: '2026-08-26T12:01:00.000Z', startedAt: '2026-08-26T12:00:00.000Z',
  endedAt: null,
  settings: {
    soundPackId: 'katwed', doubleScoreIntroMs: 5000, shuffleQuestionOrder: false,
    shuffleAnswerOptions: false, autoLockWhenAllAnswered: true, showPlayerAnswersToHost: true,
    questionTypeIntrosEnabled: true, answerOptionSeed: 'session',
  },
  questionOrder: mixedDemoQuiz.questions.map((question) => question.id),
  players, hostResponses: [], answers: [],
}

function state(overrides: Partial<SafeGameState> = {}): SafeGameState {
  return {
    sessionId: 'session', quizTitle: mixedDemoQuiz.title, quizType: 'standard', themeId: 'katwed',
    backgroundId: null, answerPaletteId: 'classic', customAnswerColours: mixedDemoQuiz.customAnswerColours,
    roomCode: '123456', status: 'active', phase: 'question', currentQuestion: {
      id: 'question', type: 'true-false', prompt: 'True?', supportingText: '', timeLimitSeconds: 60,
      points: 1000, speedScoringEnabled: false, doubleScore: false, displayOrder: 0,
      media: { type: 'none' }, mediaVisibility: 'both', presentationChoiceVisibility: 'show',
      questionNumber: 1, totalQuestions: 2,
    }, roster: [], players, submittedCount: 3, leaderboard: [], reveal: null,
    questionOpenedAt: '2026-08-26T12:00:00.000Z', questionClosesAt: '2099-08-26T12:01:00.000Z',
    ...overrides,
  }
}

function renderController(current: SafeGameState) {
  repositoryMocks.getSafeGameState.mockResolvedValue(current)
  const router = createMemoryRouter([
    { path: '/host/game/:sessionId/control', element: <HostGamePage /> },
    { path: '/host', element: <h1>Dashboard</h1> },
  ], { initialEntries: ['/host/game/session/control'] })
  return render(<RouterProvider router={router} />)
}

describe('HostGamePage Standard auto-lock', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    repositoryMocks.getHostSession.mockResolvedValue({ session, quiz: mixedDemoQuiz })
    repositoryMocks.getHostLiveSession.mockResolvedValue(session)
    repositoryMocks.changePhase.mockResolvedValue(undefined)
    repositoryMocks.revealConnectionClue.mockResolvedValue(undefined)
    repositoryMocks.setTypedAnswerOverride.mockResolvedValue(undefined)
    repositoryMocks.subscribe.mockReturnValue(() => undefined)
  })

  it('routes clue reveal to its focused host action while keeping Close answers separate', async () => {
    const definition = connectionsFixture(), user = userEvent.setup()
    repositoryMocks.getHostSession.mockResolvedValue({ session: { ...session, questionOrder: [definition.id] }, quiz: { ...mixedDemoQuiz, questions: [definition] } })
    renderController(state({ currentQuestion: safeConnections(), submittedCount: 1 }))
    const button = await screen.findByRole('button', { name: 'Reveal next clue' })
    expect(screen.getByRole('button', { name: 'Close answers now' })).toBeEnabled()
    expect(screen.getByRole('region', { name: 'Connections controls' })).toHaveTextContent('Venus')
    await user.click(button)
    expect(repositoryMocks.revealConnectionClue).toHaveBeenCalledExactlyOnceWith('session')
    expect(repositoryMocks.changePhase).not.toHaveBeenCalled()
  })

  it('does not lock at 3 of 4, including when the unanswered player is disconnected', async () => {
    renderController(state({ submittedCount: 3, players }))
    expect(await screen.findByRole('button', { name: 'Close answers now' })).toBeEnabled()
    await waitFor(() => expect(repositoryMocks.changePhase).not.toHaveBeenCalled())
  })

  it('locks once when all joined players have submitted', async () => {
    renderController(state({ submittedCount: 4 }))
    await waitFor(() => expect(repositoryMocks.changePhase).toHaveBeenCalledWith('session', 'lock'))
    await new Promise((resolve) => window.setTimeout(resolve, 20))
    expect(repositoryMocks.changePhase).toHaveBeenCalledTimes(1)
  })

  it('does not auto-lock everybody-submitted when the session setting is off', async () => {
    renderController(state({
      submittedCount: 4,
      sessionSettings: { ...session.settings, autoLockWhenAllAnswered: false },
    }))
    expect(await screen.findByRole('button', { name: 'Close answers now' })).toBeEnabled()
    await waitFor(() => expect(repositoryMocks.changePhase).not.toHaveBeenCalled())
  })

  it('shows Intro and blocks manual or automatic lock before authoritative opening', async () => {
    renderController(state({
      submittedCount: 4,
      questionPreludeKind: 'question-type',
      questionOpenedAt: '2099-08-26T12:00:00.000Z',
      sessionSettings: session.settings,
    }))
    expect(await screen.findByText('Intro')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Close answers now' })).toBeDisabled()
    expect(repositoryMocks.changePhase).not.toHaveBeenCalled()
  })

  it('never auto-locks an empty room', async () => {
    renderController(state({ submittedCount: 0, players: [] }))
    await screen.findByRole('button', { name: 'Close answers now' })
    expect(repositoryMocks.changePhase).not.toHaveBeenCalled()
  })

  it('keeps the manual close action available before everyone submits', async () => {
    const user = userEvent.setup()
    renderController(state({ submittedCount: 2 }))
    await user.click(await screen.findByRole('button', { name: 'Close answers now' }))
    expect(repositoryMocks.changePhase).toHaveBeenCalledWith('session', 'lock')
  })

  it('uses the persisted shuffled question order for Up next', async () => {
    const shuffled = [...mixedDemoQuiz.questions].reverse()
    repositoryMocks.getHostSession.mockResolvedValue({
      session: { ...session, questionOrder: shuffled.map((question) => question.id) },
      quiz: mixedDemoQuiz,
    })
    renderController(state({ currentQuestion: { ...state().currentQuestion!, questionNumber: 1 } }))
    expect(await screen.findByText(shuffled[1].prompt)).toBeVisible()
  })

  it('shows named waiting players from the private host answer bundle', async () => {
    const answers = players.slice(0, 2).map((player, index) => ({
      id: `answer-${index}`, sessionId: session.id, questionId: 'mixed-boolean', playerId: player.id,
      payload: { type: 'true-false' as const, value: index === 0 }, resolutionStatus: 'answered' as const,
      submittedAt: '2026-08-26T12:00:05.000Z', responseTimeMs: 5000,
      automaticCorrect: index === 0, hostCorrectOverride: null, correct: index === 0,
      pointsAwarded: index === 0 ? 1000 : 0,
    }))
    repositoryMocks.getHostSession.mockResolvedValue({
      session: {
        ...session,
        hostResponses: answers.map(hostResponseRecordForAnswer),
        answers,
      },
      quiz: mixedDemoQuiz,
    })
    renderController(state({
      submittedCount: 2,
      currentQuestion: { ...state().currentQuestion!, id: 'mixed-boolean' },
      sessionSettings: session.settings,
    }))
    expect(await screen.findByText('Waiting for: Player 3 · Player 4')).toBeVisible()
    expect(screen.getByText('Waiting · Disconnected')).toBeVisible()
    const responses = screen.getByRole('heading', { name: 'Live responses' }).closest('section')!
    expect(within(responses).getByText('True')).toBeVisible()
    expect(within(responses).getByText('False')).toBeVisible()
    const controls = screen.getByRole('group', { name: 'Game controls' })
    expect(controls.compareDocumentPosition(responses) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('retains timer-expiry locking', async () => {
    renderController(state({ submittedCount: 1, questionClosesAt: '2020-01-01T00:00:00.000Z' }))
    await waitFor(() => expect(repositoryMocks.changePhase).toHaveBeenCalledWith('session', 'lock'))
  })

  it('does not add host auto-locking to Head-to-Head', async () => {
    renderController(state({ quizType: 'head-to-head', submittedCount: 4, questionClosesAt: null }))
    expect(await screen.findByText(/progression is controlled by the two competitors/i)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Close answers now' })).not.toBeInTheDocument()
    expect(repositoryMocks.changePhase).not.toHaveBeenCalled()
  })

  it('controls persistent Presentation audio preferences without creating preview audio', async () => {
    const user = userEvent.setup()
    renderController(state())
    const music = await screen.findByRole('slider', { name: 'Music volume' })
    const effects = screen.getByRole('slider', { name: 'Effects volume' })
    expect(music).toHaveValue('70')
    expect(effects).toHaveValue('80')
    await user.click(screen.getByRole('button', { name: 'Mute' }))
    expect(screen.getByRole('button', { name: 'Unmute' })).toHaveAttribute('aria-pressed', 'true')
    expect(localStorage.getItem('katwed.audio.preferences.v1')).toContain('"muted":true')
    expect(document.querySelectorAll('audio')).toHaveLength(0)
  })

  it.each(['question', 'locked', 'reveal'] as const)('shows the private current answer during %s', async (phase) => {
    renderController(state({
      phase,
      currentQuestion: { ...state().currentQuestion!, id: 'mixed-boolean' },
      reveal: phase === 'reveal'
        ? { type: 'true-false', correctValue: true, caption: '', counts: { true: 0, false: 0 } }
        : null,
    }))

    const answer = await screen.findByRole('region', { name: 'Current correct answer' })
    expect(within(answer).getByText('Correct answer')).toBeVisible()
    expect(within(answer).getByText('True')).toBeVisible()
    expect(within(answer).getByText('Host only')).toBeVisible()
  })

  it.each(['leaderboard', 'finished'] as const)('hides the private current answer during %s', async (phase) => {
    renderController(state({ phase, currentQuestion: { ...state().currentQuestion!, id: 'mixed-boolean' } }))
    await screen.findByText(phase === 'leaderboard' ? 'Leaderboard' : 'Quiz complete')
    expect(screen.queryByRole('region', { name: 'Current correct answer' })).not.toBeInTheDocument()
  })

  it('changes the private answer when the authoritative current question changes', async () => {
    let notify: (() => void) | undefined
    repositoryMocks.subscribe.mockImplementation((_sessionId: string, callback: () => void) => {
      notify = callback
      return () => undefined
    })
    renderController(state({ currentQuestion: { ...state().currentQuestion!, id: 'mixed-boolean' } }))
    expect(within(await screen.findByRole('region', { name: 'Current correct answer' })).getByText('True')).toBeVisible()

    repositoryMocks.getSafeGameState.mockResolvedValue(state({
      currentQuestion: {
        ...state().currentQuestion!, id: 'mixed-slider', type: 'slider', prompt: 'How many minutes?',
        minimum: 0, maximum: 2000, step: 10, prefix: '', suffix: '', unitLabel: 'minutes',
      },
    }))
    await act(async () => notify?.())

    const answer = await screen.findByRole('region', { name: 'Current correct answer' })
    await waitFor(() => expect(within(answer).getByText('1440 minutes')).toBeVisible())
    expect(within(answer).getByText('Accepted range: 1430 minutes–1450 minutes')).toBeVisible()
  })

  it('loads the complete quiz once and uses the lightweight live-session reader thereafter', async () => {
    let notify: (() => void) | undefined
    repositoryMocks.subscribe.mockImplementation((_sessionId: string, callback: () => void) => {
      notify = callback
      return () => undefined
    })
    renderController(state())
    await screen.findByRole('button', { name: 'Close answers now' })

    await act(async () => notify?.())
    await waitFor(() => expect(repositoryMocks.getHostLiveSession).toHaveBeenCalled())
    expect(repositoryMocks.getHostSession).toHaveBeenCalledTimes(1)
    expect(repositoryMocks.getHostLiveSession).toHaveBeenCalledWith('session')
  })
})
