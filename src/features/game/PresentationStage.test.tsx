import { act, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GamePhase, SafeGameState } from '../../types/domain'
import { PresentationStage } from './PresentationStage'
import { PlayerQuestion } from './PlayerQuestion'

function state(phase: GamePhase): SafeGameState {
  return {
    sessionId: 'session',
    quizTitle: 'Themed quiz',
    themeId: 'arcade',
    backgroundId: 'arcade-grid',
    roomCode: '123456',
    status: 'active',
    phase,
    currentQuestion: null,
    roster: [],
    players: [],
    submittedCount: 0,
    leaderboard: [],
    reveal: null,
    questionOpenedAt: null,
    questionClosesAt: null,
  }
}

describe('PresentationStage quiz theme', () => {
  afterEach(() => vi.useRealTimers())

  it.each([false, true])('shows the server-timed Double Score intro before the question when compact is %s', async (compact) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-09T12:00:00.000Z'))
    const doubleState: SafeGameState = {
      ...state('question'),
      quizType: 'standard',
      currentQuestion: {
        id: 'double-question', type: 'true-false', prompt: 'Visible after the intro?', supportingText: '',
        timeLimitSeconds: 20, points: 1000, speedScoringEnabled: true, doubleScore: true, displayOrder: 0,
        media: { type: 'none' }, mediaVisibility: 'both', presentationChoiceVisibility: 'show',
        questionNumber: 1, totalQuestions: 1,
      },
      questionOpenedAt: '2026-08-09T12:00:05.000Z',
      questionClosesAt: '2026-08-09T12:00:25.000Z',
    }
    render(<PresentationStage state={doubleState} compact={compact} />)
    expect(screen.getByRole('heading', { name: 'DOUBLE SCORE!' })).toBeVisible()
    expect(screen.queryByText('Visible after the intro?')).not.toBeInTheDocument()

    await act(async () => vi.advanceTimersByTime(5010))
    expect(screen.getByText('Visible after the intro?')).toBeVisible()
    expect(screen.getByText('2x points')).toBeVisible()
  })

  it('holds a nine-second Double Score session intro and shows the mixed-format label only once', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-09T12:00:00.000Z'))
    const introState: SafeGameState = {
      ...state('question'), quizType: 'standard', questionPreludeKind: 'double-score',
      sessionSettings: {
        soundPackId: 'katwed', doubleScoreIntroMs: 9000, shuffleQuestionOrder: false,
        shuffleAnswerOptions: false, autoLockWhenAllAnswered: true, showPlayerAnswersToHost: true,
        questionTypeIntrosEnabled: true, answerOptionSeed: 'session',
      },
      currentQuestion: {
        id: 'double-typed', type: 'typed-answer', prompt: 'Name the ship', supportingText: '',
        timeLimitSeconds: 30, points: 1000, speedScoringEnabled: true, doubleScore: true, displayOrder: 0,
        media: { type: 'none' }, mediaVisibility: 'both', presentationChoiceVisibility: 'show',
        questionNumber: 1, totalQuestions: 3,
      },
      questionOpenedAt: '2026-08-09T12:00:09.000Z',
      questionClosesAt: '2026-08-09T12:00:39.000Z',
    }
    const first = render(<PresentationStage state={introState} />)
    expect(screen.getByRole('heading', { name: 'DOUBLE SCORE!' })).toBeVisible()
    expect(screen.getByText('TYPE YOUR ANSWER')).toBeVisible()
    expect(screen.queryByText('Name the ship')).not.toBeInTheDocument()
    await act(async () => vi.advanceTimersByTime(4500))
    first.unmount()

    render(<PresentationStage state={introState} />)
    expect(screen.getByRole('heading', { name: 'DOUBLE SCORE!' })).toBeVisible()
    await act(async () => vi.advanceTimersByTime(4490))
    expect(screen.getByRole('heading', { name: 'DOUBLE SCORE!' })).toBeVisible()
    await act(async () => vi.advanceTimersByTime(20))
    expect(screen.getByText('Name the ship')).toBeVisible()
    expect(screen.getByLabelText('30 seconds remaining')).toBeVisible()
  })

  it('shows a brief type intro only when the launched session says the quiz is mixed', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-09T12:00:00.000Z'))
    const question = {
      id: 'typed', type: 'typed-answer' as const, prompt: 'Typed prompt', supportingText: '',
      timeLimitSeconds: 20, points: 1000, speedScoringEnabled: false, doubleScore: false, displayOrder: 0,
      media: { type: 'none' as const }, mediaVisibility: 'both' as const, presentationChoiceVisibility: 'show' as const,
      questionNumber: 1, totalQuestions: 3,
    }
    const mixedState: SafeGameState = {
      ...state('question'), quizType: 'standard', currentQuestion: question,
      questionPreludeKind: 'question-type',
      questionOpenedAt: '2026-08-09T12:00:01.750Z', questionClosesAt: '2026-08-09T12:00:21.750Z',
    }
    const view = render(<PresentationStage state={mixedState} />)
    expect(screen.getByRole('heading', { name: 'TYPE YOUR ANSWER' })).toBeVisible()
    expect(screen.queryByText('Typed prompt')).not.toBeInTheDocument()
    await act(async () => vi.advanceTimersByTime(1760))
    expect(screen.getByText('Typed prompt')).toBeVisible()

    view.rerender(<PresentationStage state={{
      ...mixedState,
      questionPreludeKind: null,
      questionOpenedAt: '2026-08-09T12:00:01.760Z',
      questionClosesAt: '2026-08-09T12:00:21.760Z',
    }} />)
    expect(screen.queryByRole('heading', { name: 'TYPE YOUR ANSWER' })).not.toBeInTheDocument()
    expect(screen.getByText('Typed prompt')).toBeVisible()
  })

  it('does not add an intro to an ordinary Standard question', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-09T12:00:00.000Z'))
    render(<PresentationStage state={{
      ...state('question'), quizType: 'standard',
      currentQuestion: {
        id: 'ordinary-question', type: 'true-false', prompt: 'Ordinary question', supportingText: '',
        timeLimitSeconds: 20, points: 1000, speedScoringEnabled: true, doubleScore: false, displayOrder: 0,
        media: { type: 'none' }, mediaVisibility: 'both', presentationChoiceVisibility: 'show',
        questionNumber: 1, totalQuestions: 1,
      },
      questionOpenedAt: '2026-08-09T12:00:00.000Z', questionClosesAt: '2026-08-09T12:00:20.000Z',
    }} />)
    expect(screen.getByText('Ordinary question')).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'DOUBLE SCORE!' })).not.toBeInTheDocument()
  })

  it('keeps randomised option order and positional colours identical on player, presentation and results', () => {
    const options = [
      { id: 'paris', label: 'Paris' }, { id: 'london', label: 'London' },
      { id: 'rome', label: 'Rome' }, { id: 'berlin', label: 'Berlin' },
    ]
    const currentQuestion = {
      id: 'shared-order-question', type: 'single-choice' as const, prompt: 'Capital?', supportingText: '',
      timeLimitSeconds: 30, points: 1000, speedScoringEnabled: false, doubleScore: false, displayOrder: 0,
      media: { type: 'none' as const }, mediaVisibility: 'both' as const,
      presentationChoiceVisibility: 'show' as const, questionNumber: 1, totalQuestions: 1,
      options, randomiseOptions: false, forceRandomiseOptions: true, optionOrderSeed: 'session-answer-seed',
    }
    const customAnswerColours = ['#FFFFFF', '#071326', '#FFFF00', '#00FFFF', '#C62828', '#1565C0', '#2E7D32', '#F9A825'] as const
    const questionState = {
      ...state('question'), currentQuestion, answerPaletteId: 'custom' as const, customAnswerColours,
    }
    const presentation = render(<PresentationStage state={questionState} />)
    render(<PlayerQuestion question={currentQuestion} roster={[]} closesAt={null}
      answerPaletteId="custom" customAnswerColours={customAnswerColours} onSubmit={vi.fn()} />)

    const ids = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)].map((element) => element.dataset.optionId)
    const presentationIds = ids('.presentation-options [data-option-id]')
    expect(ids('.player-question [data-option-id]')).toEqual(presentationIds)
    expect(presentationIds).not.toEqual(options.map((option) => option.id))
    const playerTiles = [...document.querySelectorAll<HTMLElement>('.player-question [data-option-id]')]
    const presentationTiles = [...document.querySelectorAll<HTMLElement>('.presentation-options [data-option-id]')]
    expect(playerTiles.map((tile) => tile.style.backgroundColor)).toEqual(presentationTiles.map((tile) => tile.style.backgroundColor))

    presentation.rerender(<PresentationStage state={{
      ...questionState, phase: 'reveal',
      reveal: { type: 'single-choice', correctOptionId: 'paris', caption: '', optionCounts: {} },
    }} />)
    expect(ids('.presentation-reveal-grid > [data-option-id]')).toEqual(presentationIds)
    expect(options.map((option) => option.id)).toEqual(['paris', 'london', 'rome', 'berlin'])
  })

  it.each<GamePhase>(['lobby', 'question', 'locked', 'reveal', 'leaderboard', 'finished'])(
    'keeps the selected theme on the %s phase root',
    (phase) => {
      const { container } = render(<PresentationStage state={state(phase)} />)
      expect(container.querySelector('.presentation-stage')).toHaveAttribute('data-quiz-theme', 'arcade')
      expect(container.querySelector('.presentation-stage')).toHaveAttribute('data-quiz-background', 'arcade-grid')
      expect(container.querySelector('.presentation-stage')).toHaveClass('quiz-themed-surface')
    },
  )

  it('uses the same theme in the compact controller preview', () => {
    const { container } = render(<PresentationStage state={state('lobby')} compact />)
    expect(container.querySelector('.presentation-stage')).toHaveClass('presentation-stage--compact')
    expect(container.querySelector('.presentation-stage')).toHaveAttribute('data-quiz-theme', 'arcade')
    expect(container.querySelector('.presentation-stage')).toHaveAttribute('data-quiz-background', 'arcade-grid')
  })

  it('keeps Theme default free of a static background image', () => {
    const defaultState = { ...state('lobby'), backgroundId: null }
    const { container } = render(<PresentationStage state={defaultState} />)
    const stage = container.querySelector('.presentation-stage')
    expect(stage).not.toHaveAttribute('data-quiz-background')
    expect(stage?.getAttribute('style')).not.toContain('--quiz-background-image')
  })

  it('renders the standard lobby join hierarchy, QR code, player count and joined names', () => {
    const players = ['Debs', 'Roger'].map((nickname, index) => ({
      id: `player-${index}`, sessionId: 'session', nickname, connected: true,
      joinedAt: '2026-08-26T08:00:00.000Z', totalScore: 0, correctAnswerCount: 0, totalCorrectResponseMs: 0,
    }))
    const { container } = render(<PresentationStage state={{ ...state('lobby'), players }} />)

    expect(screen.getByLabelText('Room code 123456')).toHaveTextContent('123456')
    expect(container.querySelector('.presentation-qr-panel svg')).toHaveAttribute('width', '300')
    expect(screen.getByLabelText('2 players joined')).toBeVisible()
    expect(screen.getByText('Debs')).toBeVisible()
    expect(screen.getByText('Roger')).toBeVisible()
  })

  it('keeps the Head-to-Head lobby as two balanced competitor slots with status', () => {
    render(<PresentationStage state={{
      ...state('lobby'), quizType: 'head-to-head',
      headToHeadCompetitors: [
        { competitorId: 'deb', displayName: 'Deb', displayOrder: 0, claimed: true, connected: true, playerId: 'one', totalScore: 0, correctAnswerCount: 0 },
        { competitorId: 'roger', displayName: 'Roger', displayOrder: 1, claimed: false, connected: false, playerId: null, totalScore: 0, correctAnswerCount: 0 },
      ],
    }} />)

    expect(screen.getByRole('article', { name: 'Competitor 1: Deb' })).toHaveTextContent('Ready')
    expect(screen.getByRole('article', { name: 'Competitor 2: Roger' })).toHaveTextContent('Waiting')
  })

  it('keeps the full leaderboard complete while the compact monitor shows a legible top six', () => {
    const leaderboard = Array.from({ length: 9 }, (_, index) => ({
      playerId: `player-${index + 1}`,
      nickname: `Player ${index + 1}`,
      rank: index + 1,
      totalScore: 900 - (index * 50),
      correctAnswerCount: 9 - index,
      totalCorrectResponseMs: (index + 1) * 1000,
    }))
    const full = render(<PresentationStage state={{ ...state('leaderboard'), leaderboard }} />)
    expect(within(screen.getByRole('list', { name: 'Leaderboard' })).getAllByRole('listitem')).toHaveLength(9)

    full.rerender(<PresentationStage compact state={{ ...state('leaderboard'), leaderboard }} />)
    expect(within(screen.getByRole('list', { name: 'Leaderboard' })).getAllByRole('listitem')).toHaveLength(6)
    expect(screen.getByText('Player 6')).toBeVisible()
    expect(screen.queryByText('Player 7')).not.toBeInTheDocument()
  })

  it('integrates progress, timer, prompt, supporting text and submitted count in the question stage', () => {
    const players = ['Debs', 'Roger'].map((nickname, index) => ({
      id: `player-${index}`, sessionId: 'session', nickname, connected: true,
      joinedAt: '2026-08-26T08:00:00.000Z', totalScore: 0, correctAnswerCount: 0, totalCorrectResponseMs: 0,
    }))
    render(<PresentationStage state={{
      ...state('question'), players, submittedCount: 1,
      currentQuestion: {
        id: 'question', type: 'true-false', prompt: 'Is this the prompt?', supportingText: 'A quieter clue.',
        timeLimitSeconds: 30, points: 1000, speedScoringEnabled: false, doubleScore: false, displayOrder: 0,
        media: { type: 'none' }, mediaVisibility: 'both', presentationChoiceVisibility: 'show', questionNumber: 4, totalQuestions: 9,
      },
      questionClosesAt: new Date(Date.now() + 20_000).toISOString(),
    }} />)

    expect(screen.getByText('Question 4 of 9', { selector: '[aria-hidden="true"]' })).toBeVisible()
    expect(screen.getByRole('timer')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Is this the prompt?' })).toBeVisible()
    expect(screen.getByText('A quieter clue.')).toBeVisible()
    expect(screen.getByRole('status', { name: '1 of 2 answered' })).toBeVisible()
  })

  it('uses a reveal-gated Locked transition without exposing an answer', () => {
    render(<PresentationStage state={{ ...state('locked'), currentQuestion: {
      id: 'locked', type: 'typed-answer', prompt: 'Secret answer?', supportingText: '', timeLimitSeconds: 30,
      points: 1000, speedScoringEnabled: false, doubleScore: false, displayOrder: 0, media: { type: 'none' },
      mediaVisibility: 'both', presentationChoiceVisibility: 'hide', questionNumber: 2, totalQuestions: 5,
    } }} />)
    expect(screen.getByRole('heading', { name: 'Answers locked' })).toBeVisible()
    expect(screen.getByText('Ready for the reveal')).toBeVisible()
    expect(screen.queryByText(/correct answer/i)).not.toBeInTheDocument()
  })

  it('shows only the primary Typed Answer during reveal', () => {
    render(<PresentationStage state={{
      ...state('reveal'),
      currentQuestion: {
        id: 'typed-question',
        type: 'typed-answer',
        prompt: 'Name the programme.',
        supportingText: '',
        timeLimitSeconds: 30,
        points: 1000,
        speedScoringEnabled: false,
        doubleScore: false,
        displayOrder: 0,
        media: { type: 'none' },
        mediaVisibility: 'both',
        presentationChoiceVisibility: 'hide',
        questionNumber: 1,
        totalQuestions: 1,
      },
      reveal: {
        type: 'typed-answer',
        correctAnswer: 'Red Dwarf',
        caption: '',
      },
    }} />)

    expect(screen.getByRole('group', { name: 'Correct answer' })).toHaveClass('reveal-answer-card')
    expect(screen.getByRole('heading', { name: 'Red Dwarf' })).toBeVisible()
    expect(screen.queryByText('The Red Dwarf')).not.toBeInTheDocument()
  })

  it.each([false, true])('protects a Mash-up answer in the full and compact reveal when compact is %s', (compact) => {
    render(<PresentationStage compact={compact} state={{
      ...state('reveal'),
      currentQuestion: {
        id: 'mashup-question', type: 'mashup', prompt: 'Who is in the mash-up?', supportingText: '',
        timeLimitSeconds: 30, points: 1, speedScoringEnabled: false, doubleScore: false, displayOrder: 0,
        media: { type: 'image', path: '/portrait.svg', altText: 'Portrait', revealEffect: 'immediate', revealDurationSeconds: 0 },
        mediaVisibility: 'both', presentationChoiceVisibility: 'show', questionNumber: 1, totalQuestions: 1,
      },
      reveal: { type: 'mashup', correctMemberIds: ['ross', 'carol'], correctNames: ['Ross', 'Carol'], caption: '' },
    }} />)

    expect(screen.getByRole('group', { name: 'Correct answer' })).toHaveClass('reveal-answer-card')
    expect(screen.getByRole('heading', { name: 'Ross + Carol' })).toBeVisible()
  })

  it('keeps the complete Multiple Select answer structured across the reveal grid', () => {
    render(<PresentationStage state={{
      ...state('reveal'),
      currentQuestion: {
        id: 'multiple-question', type: 'multiple-select', prompt: 'Choose every colour.', supportingText: '',
        timeLimitSeconds: 30, points: 1000, speedScoringEnabled: false, doubleScore: false, displayOrder: 0,
        media: { type: 'none' }, mediaVisibility: 'both', presentationChoiceVisibility: 'show',
        questionNumber: 1, totalQuestions: 1, options: [
          { id: 'red', label: 'Red' }, { id: 'green', label: 'Green' }, { id: 'blue', label: 'Blue' },
        ], minimumSelections: 2, maximumSelections: 2, randomiseOptions: false,
      },
      reveal: { type: 'multiple-select', correctOptionIds: ['red', 'blue'], scoringMode: 'exact', caption: '', optionCounts: {} },
    }} />)

    expect(screen.getByRole('article', { name: /Red: correct answer/ })).toBeVisible()
    expect(screen.getByRole('article', { name: /Blue: correct answer/ })).toBeVisible()
    expect(screen.getByRole('article', { name: /Green: not a correct answer/ })).toBeVisible()
  })

  it.each([false, true])('shows explicit Head-to-Head reveal semantics when compact is %s', (compact) => {
    const question = {
      id: 'question', type: 'true-false' as const, assignedCompetitorId: 'ross', prompt: 'True?',
      supportingText: '', timeLimitSeconds: 30, points: 1000, speedScoringEnabled: false, doubleScore: false, displayOrder: 0,
      media: { type: 'none' as const }, mediaVisibility: 'both' as const,
      presentationChoiceVisibility: 'show' as const, questionNumber: 1, totalQuestions: 1,
    }
    const competitors = [
      { competitorId: 'ross', displayName: 'Ross', displayOrder: 0 as const, claimed: true, connected: true, playerId: 'p1', totalScore: 1, correctAnswerCount: 1 },
      { competitorId: 'jess', displayName: 'Jess', displayOrder: 1 as const, claimed: true, connected: true, playerId: 'p2', totalScore: 0, correctAnswerCount: 0 },
    ]
    const questionState: SafeGameState = {
      ...state('question'), quizType: 'head-to-head', currentQuestion: question,
      players: [], headToHeadCompetitors: competitors, headToHeadResolutions: [], headToHeadResults: [],
    }
    const { rerender } = render(<PresentationStage state={questionState} compact={compact} />)
    expect(screen.getByText('Untimed')).toBeVisible()
    expect(screen.getByText(/For/)).toHaveTextContent('Ross · 1 point')

    rerender(<PresentationStage compact={compact} state={{
      ...questionState,
      phase: 'reveal',
      reveal: { type: 'true-false', correctValue: true, caption: '', counts: { true: 1, false: 1 } },
      headToHeadResults: [
        { competitorId: 'jess', assigned: false, status: 'correct', pointsAwarded: 0 },
        { competitorId: 'ross', assigned: true, status: 'incorrect', pointsAwarded: 0 },
      ],
    }} />)
    const official = within(screen.getByRole('article', { name: 'Ross result' }))
    expect(official.getByText('Official question')).toBeVisible()
    expect(official.getByText('✕ Incorrect')).toBeVisible()
    expect(official.getByText('0 points')).toBeVisible()
    const playAlong = within(screen.getByRole('article', { name: 'Jess result' }))
    expect(playAlong.getByText('Playing along')).toBeVisible()
    expect(playAlong.getByText('✓ Correct')).toBeVisible()
    expect(playAlong.getByText('No point — play-along')).toBeVisible()
    expect(screen.queryByText(/Also got it right/i)).not.toBeInTheDocument()
  })
})

describe('PresentationStage responsive live copy', () => {
  function questionState(prompt: string, optionCount: number, withMedia = false): SafeGameState {
    return {
      ...state('question'),
      currentQuestion: {
        id: `responsive-${prompt.length}`, type: 'single-choice', prompt, supportingText: '',
        timeLimitSeconds: 30, points: 1000, speedScoringEnabled: false, doubleScore: false,
        displayOrder: 0, media: withMedia
          ? { type: 'image', path: '/demo/portrait-1.svg', altText: 'Visual clue', revealEffect: 'immediate', revealDurationSeconds: 0 }
          : { type: 'none' },
        mediaVisibility: 'both', presentationChoiceVisibility: 'show', questionNumber: 1,
        totalQuestions: 1, randomiseOptions: false,
        options: Array.from({ length: optionCount }, (_, index) => ({ id: `option-${index}`, label: `Option ${index + 1}` })),
      },
    }
  }

  it('applies all prompt tiers and compacts a visual question sooner', () => {
    const view = render(<PresentationStage state={questionState('Short prompt?', 2)} />)
    const density = () => view.container.querySelector('.presentation-question__copy')
    expect(density()).toHaveAttribute('data-question-density', 'short')

    view.rerender(<PresentationStage state={questionState('A'.repeat(100), 2)} />)
    expect(density()).toHaveAttribute('data-question-density', 'medium')
    view.rerender(<PresentationStage state={questionState('A'.repeat(180), 2)} />)
    expect(density()).toHaveAttribute('data-question-density', 'long')
    view.rerender(<PresentationStage state={questionState('A'.repeat(260), 2)} />)
    expect(density()).toHaveAttribute('data-question-density', 'extra-long')
    view.rerender(<PresentationStage state={questionState('A'.repeat(70), 2, true)} />)
    expect(density()).toHaveAttribute('data-question-density', 'medium')
  })

  it.each([2, 3, 4, 5])('keeps %s standard options as individual cards', (optionCount) => {
    const { container } = render(<PresentationStage state={questionState('Choose', optionCount)} />)
    const grid = container.querySelector('.presentation-options')
    expect(grid).toHaveAttribute('data-option-count', String(optionCount))
    expect(grid?.querySelectorAll(':scope > .answer-tile')).toHaveLength(optionCount)
  })
})
