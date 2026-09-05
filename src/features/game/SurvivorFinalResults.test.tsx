import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import type { Player } from '../../types/domain'
import { SurvivorFinalResults } from './SurvivorFinalResults'

const player = (nickname: string, lives: number, eliminatedAt: number | null, score = 0, correct = 3): Player => ({
  id: nickname.toLowerCase(), sessionId: 'session', nickname, connected: true, joinedAt: '', totalScore: score,
  correctAnswerCount: correct, totalCorrectResponseMs: correct * 1000, survivorLivesRemaining: lives,
  survivorEliminatedAtQuestion: eliminatedAt,
})

it('crowns one survivor and retains a survival-first podium with quiz honours but no climber', () => {
  render(<SurvivorFinalResults variant="presentation" players={[
    player('Carol', 1, null, 100), player('Roger', 0, 8, 9000), player('Jaki', 0, 4, 12000),
  ]} />)
  expect(screen.getByRole('heading', { name: 'LAST PLAYER STANDING' })).toBeVisible()
  expect(screen.getAllByText('Carol').length).toBeGreaterThan(0)
  expect(screen.getByRole('list', { name: 'Top final survival positions' })).toHaveTextContent('Eliminated Q8')
  expect(screen.getByRole('article', { name: 'Most Correct' })).toBeVisible()
  expect(screen.getByRole('article', { name: 'Quickest Thinker' })).toBeVisible()
  expect(screen.queryByRole('article', { name: 'Biggest Climber' })).toBeNull()
})

it('shows total wipeout without inventing a winner and supports several natural-final survivors', () => {
  const view = render(<SurvivorFinalResults variant="player" players={[player('Carol', 0, 3), player('Roger', 0, 3)]} />)
  expect(screen.getByRole('heading', { name: 'TOTAL WIPEOUT' })).toBeVisible()
  expect(screen.getByText('Nobody survived.')).toBeVisible()
  view.rerender(<SurvivorFinalResults variant="player" players={[player('Carol', 3, null), player('Roger', 2, null)]} />)
  expect(screen.getByRole('heading', { name: 'SURVIVOR WINNER' })).toBeVisible()
  expect(screen.getAllByText('Carol').length).toBeGreaterThan(0)
})

it('keeps Total Wipeout while presenting the resolved tie-break winner first', () => {
  render(<SurvivorFinalResults variant="presentation" tieBreakerWinnerPlayerId="roger" players={[
    player('Carol', 0, 12, 200), player('Roger', 0, 12, 200), player('Jaki', 0, 10, 500),
  ]} />)
  expect(screen.getByRole('heading', { name: 'TOTAL WIPEOUT' })).toBeVisible()
  expect(screen.getByText('Roger wins the tie-breaker.')).toBeVisible()
  expect(screen.getByRole('list', { name: 'Top final survival positions' }).querySelector('[data-rank="1"]')).toHaveTextContent('Roger')
})
