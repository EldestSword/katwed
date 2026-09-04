import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { standingsState } from '../../test/leaderboardFixtures'
import type { GamePhase, SafeGameState } from '../../types/domain'
import { PresentationStage } from './PresentationStage'

const survivorState = (phase: GamePhase, lives: number[], questionNumber = 1): SafeGameState => ({
  ...standingsState(phase, [], questionNumber),
  questionOpenedAt: `2026-09-04T20:0${questionNumber}:00Z`,
  questionClosesAt: `2099-09-04T20:0${questionNumber}:30Z`,
  sessionSettings: {
    competitionMode: 'survivor', survivorStartingLives: 3, playMode: 'individual', soundPackId: 'none',
    shuffleQuestionOrder: false, shuffleAnswerOptions: false, autoLockWhenAllAnswered: true,
    showPlayerAnswersToHost: true, doubleScoreIntroMs: 5000, questionTypeIntrosEnabled: false, answerOptionSeed: 'seed',
  },
  players: lives.map((life, index) => ({
    id: `p${index}`, sessionId: 'standings-session', nickname: `Player ${index + 1}`, connected: true, joinedAt: '',
    totalScore: (lives.length - index) * 100, correctAnswerCount: 3, totalCorrectResponseMs: 3000,
    survivorLivesRemaining: life, survivorEliminatedAtQuestion: life ? null : questionNumber,
  })),
  survivorAliveCount: lives.filter(Boolean).length,
  eligibleResponderCount: lives.filter(Boolean).length,
})

it('shows Survivor lobby setup and a restrained remaining-player count in full and compact question views', () => {
  const view = render(<PresentationStage state={survivorState('lobby', [3, 3, 3])} />)
  expect(screen.getByText('Survivor')).toBeVisible()
  expect(screen.getByText('3 lives each')).toBeVisible()
  view.rerender(<PresentationStage compact state={survivorState('question', [2, 1, 0])} />)
  expect(screen.getByText('2 PLAYERS REMAINING')).toBeVisible()
  expect(view.container.querySelector('.presentation-stage--compact')).toBeInTheDocument()
})

it('uses the shared animated leaderboard for Survivor and prioritises elimination commentary', () => {
  const view = render(<PresentationStage state={survivorState('question', [2, 1])} />)
  view.rerender(<PresentationStage state={survivorState('reveal', [2, 1])} />)
  view.rerender(<PresentationStage state={survivorState('leaderboard', [2, 0])} />)
  expect(screen.getByText('Player 1 is the last player standing!')).toBeVisible()
  expect(screen.getByRole('list', { name: 'Leaderboard' })).toHaveTextContent('2 LIVES')
  expect(screen.getByRole('list', { name: 'Leaderboard' })).toHaveTextContent('OUT')
  expect(view.container.querySelector('.animated-leaderboard')).toBeInTheDocument()
})

it('shows total wipeout in the terminal leaderboard and final result', () => {
  const view = render(<PresentationStage state={survivorState('leaderboard', [0, 0])} />)
  expect(screen.getByRole('heading', { name: 'TOTAL WIPEOUT' })).toBeVisible()
  view.rerender(<PresentationStage state={survivorState('finished', [0, 0])} />)
  expect(screen.getByRole('heading', { name: 'TOTAL WIPEOUT' })).toBeVisible()
  expect(screen.getByText('Nobody survived.')).toBeVisible()
})
