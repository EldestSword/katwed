import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { LeaderboardReveal } from '../../hooks/useRevealedLeaderboard'
import { PlayerLeaderboard } from './PlayerLeaderboard'

const reveal = (beforeLife: number, life: number): LeaderboardReveal => ({
  id: 1,
  previous: [{ playerId: 'carol', nickname: 'Carol', rank: 2, totalScore: 100, correctAnswerCount: 1, totalCorrectResponseMs: 1000,
    survivorLivesRemaining: beforeLife, survivorEliminatedAtQuestion: beforeLife ? null : 1 }],
  entries: [{ playerId: 'carol', nickname: 'Carol', rank: 1, totalScore: 100, correctAnswerCount: 1, totalCorrectResponseMs: 1000,
    survivorLivesRemaining: life, survivorEliminatedAtQuestion: life ? null : 2 }],
})

it('gives elimination priority over ordinary rank movement and keeps spectator copy readable', () => {
  const view = render(<PlayerLeaderboard reveal={reveal(1, 0)} currentPlayerId="carol" survivor onSettled={vi.fn()} />)
  expect(screen.getByText('YOU’RE OUT')).toBeVisible()
  expect(screen.getByText('You can keep watching.')).toBeVisible()
  expect(screen.queryByText(/Up 1 place/)).toBeNull()
  view.rerender(<PlayerLeaderboard reveal={reveal(0, 0)} currentPlayerId="carol" survivor onSettled={vi.fn()} />)
  expect(screen.getByText('OUT', { selector: '.player-survivor-result strong' })).toBeVisible()
  expect(screen.getByText('Still spectating.')).toBeVisible()
})

it('shows an alive player their life count and current survival rank', () => {
  render(<PlayerLeaderboard reveal={reveal(2, 1)} currentPlayerId="carol" survivor onSettled={vi.fn()} />)
  expect(screen.getByText('1 LIFE', { selector: '.player-survivor-result strong' })).toBeVisible()
  expect(screen.getByText('You’re 1st')).toBeVisible()
})
