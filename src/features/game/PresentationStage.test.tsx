import { render } from '@testing-library/react'
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
})
