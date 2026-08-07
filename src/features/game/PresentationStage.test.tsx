import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { GamePhase, SafeGameState } from '../../types/domain'
import { PresentationStage } from './PresentationStage'

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
    expect(stage).not.toHaveAttribute('style')
  })

  it('shows Head-to-Head assignment, untimed state and both reveal results', () => {
    const question = {
      id: 'question', type: 'true-false' as const, assignedCompetitorId: 'ross', prompt: 'True?',
      supportingText: '', timeLimitSeconds: 30, points: 1000, displayOrder: 0,
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
    const { rerender } = render(<PresentationStage state={questionState} />)
    expect(screen.getByText('Untimed')).toBeVisible()
    expect(screen.getByText(/For/)).toHaveTextContent('Ross · 1 point')

    rerender(<PresentationStage state={{
      ...questionState,
      phase: 'reveal',
      reveal: { type: 'true-false', correctValue: true, caption: '', counts: { true: 1, false: 1 } },
      headToHeadResults: [
        { competitorId: 'ross', assigned: true, status: 'correct', pointsAwarded: 1 },
        { competitorId: 'jess', assigned: false, status: 'incorrect', pointsAwarded: 0 },
      ],
    }} />)
    expect(screen.getByText('Correct · 1 point')).toBeVisible()
    expect(screen.getByText('Incorrect · 0 points')).toBeVisible()
  })
})
