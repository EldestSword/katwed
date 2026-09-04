import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mixedDemoQuiz } from '../lib/demo/sampleData'
import type { GameSession } from '../types/domain'
import { GameSetupPage } from './GameSetupPage'

const repositoryMocks = vi.hoisted(() => ({
  getQuiz: vi.fn(),
  getActiveSessionForQuiz: vi.fn(),
  launchGame: vi.fn(),
}))

vi.mock('../services/repository', () => ({ repository: repositoryMocks }))

const session: GameSession = {
  currentRoundId: null,
  id: 'session-new', quizId: mixedDemoQuiz.id, roomCode: '123456', status: 'active', phase: 'lobby',
  currentQuestionIndex: 0, questionOpenedAt: null, questionClosesAt: null, startedAt: null, endedAt: null,
  settings: {
    competitionMode: 'points', survivorStartingLives: null,
    soundPackId: 'none', doubleScoreIntroMs: 5000, shuffleQuestionOrder: true,
    shuffleAnswerOptions: true, autoLockWhenAllAnswered: false, showPlayerAnswersToHost: false,
    questionTypeIntrosEnabled: true, answerOptionSeed: 'answer-seed',
  },
  questionOrder: mixedDemoQuiz.questions.map((question) => question.id), players: [], hostResponses: [], answers: [],
}

function Destination() {
  return <h1>Controller {useParams().sessionId}</h1>
}

function renderSetup() {
  return render(
    <MemoryRouter initialEntries={[`/host/quizzes/${mixedDemoQuiz.id}/setup`]}>
      <Routes>
        <Route path="/host/quizzes/:quizId/setup" element={<GameSetupPage />} />
        <Route path="/host/game/:sessionId/control" element={<Destination />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('GameSetupPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    repositoryMocks.getQuiz.mockResolvedValue(structuredClone(mixedDemoQuiz))
    repositoryMocks.getActiveSessionForQuiz.mockResolvedValue(null)
    repositoryMocks.launchGame.mockResolvedValue(session)
  })

  it('creates no session until Start lobby and passes every chosen launch setting', async () => {
    const user = userEvent.setup()
    renderSetup()

    expect(await screen.findByRole('heading', { name: 'Set up tonight’s game' })).toBeVisible()
    expect(screen.getByText('Mixed format')).toBeVisible()
    expect(screen.getByText('A brief format intro will appear before ordinary questions.')).toBeVisible()
    expect(repositoryMocks.launchGame).not.toHaveBeenCalled()

    const music = screen.getByRole('group', { name: 'Music theme' })
    expect(within(music).getByRole('button', { name: /Hard Rock/ })).toBeVisible()
    await user.click(within(music).getByRole('button', { name: /None/ }))
    await user.click(screen.getByRole('checkbox', { name: /Shuffle question order/ }))
    await user.click(screen.getByRole('checkbox', { name: /Shuffle all answer choices/ }))
    const autoLock = screen.getByRole('checkbox', { name: /Auto-close answers/ })
    expect(screen.getByRole('checkbox', { name: /Give every player three one-use Power-Ups/ })).not.toBeChecked()
    expect(autoLock).toBeChecked()
    await user.click(autoLock)
    const liveAnswers = screen.getByRole('checkbox', { name: /Show live player answers/ })
    expect(liveAnswers).toBeChecked()
    await user.click(liveAnswers)
    await user.click(screen.getByRole('button', { name: 'Start lobby' }))

    expect(repositoryMocks.launchGame).toHaveBeenCalledWith(mixedDemoQuiz.id, {
      powerUpsEnabled: false,
      automaticTieBreakersEnabled: true,
      competitionMode: 'points',
      survivorStartingLives: 3,
      playMode: 'individual',
      soundPackId: 'none',
      shuffleQuestionOrder: true,
      shuffleAnswerOptions: true,
      autoLockWhenAllAnswered: false,
      showPlayerAnswersToHost: false,
    })
    expect(await screen.findByRole('heading', { name: 'Controller session-new' })).toBeVisible()
  })

  it('returns an existing active room to its controller without creating a duplicate', async () => {
    repositoryMocks.getActiveSessionForQuiz.mockResolvedValue({ ...session, id: 'session-existing' })
    renderSetup()
    expect(await screen.findByRole('heading', { name: 'Controller session-existing' })).toBeVisible()
    expect(repositoryMocks.launchGame).not.toHaveBeenCalled()
  })

  it('can enable personal Power-Ups when launching Teams', async () => {
    const user = userEvent.setup()
    renderSetup()
    await user.click(await screen.findByRole('button', { name: 'Teams' }))
    await user.click(screen.getByRole('checkbox', { name: /Give every player three one-use Power-Ups/ }))
    await user.click(screen.getByRole('button', { name: 'Start lobby' }))
    expect(repositoryMocks.launchGame).toHaveBeenCalledWith(mixedDemoQuiz.id, expect.objectContaining({ playMode: 'teams', powerUpsEnabled: true }))
  })

  it('defaults to Points and launches an individual one-life Survivor without allowing Teams', async () => {
    const user = userEvent.setup()
    renderSetup()
    expect(await screen.findByRole('button', { name: 'Points' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Survivor' }))
    expect(screen.getByRole('button', { name: '3 lives' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Teams' })).toBeDisabled()
    expect(screen.getByText('Survivor V1 is for individual play.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '1 life' }))
    await user.click(screen.getByRole('checkbox', { name: /Give every player three one-use Power-Ups/ }))
    await user.click(screen.getByRole('button', { name: 'Start lobby' }))
    expect(repositoryMocks.launchGame).toHaveBeenCalledWith(mixedDemoQuiz.id, expect.objectContaining({
      competitionMode: 'survivor', survivorStartingLives: 1, playMode: 'individual', powerUpsEnabled: true,
    }))
  })

  it('shows and safely selects every newly imported sound pack', async () => {
    renderSetup()

    const music = await screen.findByRole('group', { name: 'Music theme' })
    const newPackNames = [
      '90s Rave', 'Bluegrass', 'Chiptune', 'Christmas', 'Disco', 'French', 'Grand Orchestra',
      'Greek', 'Halloween', 'Hip-Hop', 'Italian', 'Medieval', 'Pirate', 'Retro Game Show',
      'Rocksteady', 'Sci-Fi', 'Ska', 'Soul', 'Spy Noir', 'Synthwave', 'Western',
    ]
    const buttons = Array.from(music.querySelectorAll('button'))
    for (const name of newPackNames) {
      const button = buttons.find((candidate) => candidate.textContent?.includes(name))
      expect(button).toBeDefined()
      expect(button).toBeVisible()
      fireEvent.click(button!)
      expect(button).toHaveAttribute('aria-pressed', 'true')
    }
  }, 10_000)

  it('keeps a long, covered single-format quiz legible and omits Standard-only controls for Head-to-Head', async () => {
    repositoryMocks.getQuiz.mockResolvedValue({
      ...mixedDemoQuiz,
      title: 'A deliberately long single-format quiz title for the projector desk',
      quizType: 'head-to-head',
      coverImagePath: '/demo/portrait-1.svg',
      questions: mixedDemoQuiz.questions
        .filter((question) => question.type === 'typed-answer')
        .map((question, index) => ({ ...question, displayOrder: index })),
    })
    renderSetup()

    expect(await screen.findByRole('heading', { name: 'A deliberately long single-format quiz title for the projector desk' })).toBeVisible()
    expect(screen.getByText('Head to Head')).toBeVisible()
    expect(screen.queryByText('Automatic · On')).not.toBeInTheDocument()
    expect(screen.getByText('Single format')).toBeVisible()
    expect(screen.getByText('No question-type intros are needed for this quiz.')).toBeVisible()
    expect(document.querySelector('.game-setup-summary__cover img')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /Auto-close answers/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Teams' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Survivor' })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /Give every player three one-use Power-Ups/ })).not.toBeInTheDocument()
  })
})
